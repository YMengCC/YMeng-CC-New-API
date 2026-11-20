package middleware

import (
	"bytes"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/common/textmask"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
)

const (
	maxTextMaskRequestBytes  = 8 << 20
	maxTextMaskResponseBytes = 16 << 20
	maxTextMaskEventBytes    = 1 << 20
)

func TextMasking() gin.HandlerFunc {
	return func(c *gin.Context) {
		setting, ok := common.GetContextKeyType[dto.UserSetting](c, constant.ContextKeyUserSetting)
		if !ok {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error": gin.H{
					"message": i18n.T(c, i18n.MsgPrivacySettingsUnavailable),
					"type":    "server_error",
					"code":    "text_masking_settings_unavailable",
				},
			})
			return
		}
		if !setting.TextMaskingEnabled {
			c.Next()
			return
		}
		protocol, supported := textMaskProtocol(c.Request.Method, c.Request.URL.Path)
		if !supported || !strings.HasPrefix(strings.ToLower(c.GetHeader("Content-Type")), "application/json") {
			abortTextMaskRequest(c)
			return
		}
		if c.Request.Body == nil {
			abortTextMaskRequest(c)
			return
		}
		body, err := io.ReadAll(io.LimitReader(c.Request.Body, maxTextMaskRequestBytes+1))
		_ = c.Request.Body.Close()
		if err != nil || len(body) > maxTextMaskRequestBytes {
			abortTextMaskRequest(c)
			return
		}
		session, err := textmask.New()
		if err != nil {
			abortTextMaskRequest(c)
			return
		}
		defer session.Close()
		masked, err := session.MaskJSON(body, protocol)
		if err != nil {
			abortTextMaskRequest(c)
			return
		}
		// Every parser and passthrough/retry reader must replay the masked body.
		common.ReplaceRequestBody(c, masked)
		writer := &textMaskResponseWriter{
			ResponseWriter: c.Writer,
			session:        session,
			failureMessage: i18n.T(c, i18n.MsgPrivacyResponseFailed),
		}
		c.Writer = writer
		c.Next()
		if err := writer.complete(); err != nil {
			c.Set("text_masking_response_error", true)
		}
	}
}

// TextMaskingTaskGuard runs after shared-endpoint ownership is resolved and
// before plugin hooks. Durable tasks outlive the request-local reverse mapping.
func TextMaskingTaskGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		setting, _ := common.GetContextKeyType[dto.UserSetting](c, constant.ContextKeyUserSetting)
		if setting.TextMaskingEnabled {
			if _, pinned := c.Get(pluginruntime.ContextKeyPinnedEndpoint); pinned {
				abortTextMaskRequest(c)
				return
			}
		}
		c.Next()
	}
}

func textMaskProtocol(method, path string) (string, bool) {
	if method != http.MethodPost {
		return "", false
	}
	switch path {
	case "/v1/chat/completions":
		return "chat", true
	case "/pg/chat/completions":
		return "playground", true
	case "/v1/completions":
		return "completions", true
	case "/v1/responses":
		return "responses", true
	case "/v1/messages":
		return "claude", true
	}
	if strings.HasPrefix(path, "/v1beta/models/") &&
		(strings.HasSuffix(path, ":generateContent") || strings.HasSuffix(path, ":streamGenerateContent")) {
		return "gemini", true
	}
	return "", false
}

func abortTextMaskRequest(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
		"error": gin.H{
			"message": i18n.T(c, i18n.MsgPrivacyUnsupportedRequest),
			"type":    "invalid_request_error",
			"code":    "text_masking_unsupported",
		},
	})
}

type textMaskResponseWriter struct {
	gin.ResponseWriter
	session        *textmask.Session
	failureMessage string
	status         int
	size           int
	stream         bool
	streamStarted  bool
	failed         bool
	buffer         []byte
	streamBuffer   []byte
	writeErr       error
}

func (w *textMaskResponseWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
}

func (w *textMaskResponseWriter) WriteHeaderNow() {
	if w.isEventStream() {
		w.startStream()
	}
}

func (w *textMaskResponseWriter) Status() int {
	if w.status != 0 {
		return w.status
	}
	return w.ResponseWriter.Status()
}

func (w *textMaskResponseWriter) Size() int { return w.size }

func (w *textMaskResponseWriter) Written() bool {
	return w.streamStarted || w.ResponseWriter.Written()
}

func (w *textMaskResponseWriter) Write(data []byte) (int, error) {
	if w.failed {
		if w.writeErr != nil {
			return 0, w.writeErr
		}
		return 0, textmask.ErrUnsupported
	}
	if w.isEventStream() {
		return w.writeEventStream(data)
	}
	if len(w.buffer)+len(data) > maxTextMaskResponseBytes {
		w.failed = true
		w.writeErr = textmask.ErrUnsupported
		return 0, w.writeErr
	}
	w.buffer = append(w.buffer, data...)
	return len(data), nil
}

func (w *textMaskResponseWriter) WriteString(data string) (int, error) { return w.Write([]byte(data)) }

func (w *textMaskResponseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *textMaskResponseWriter) FlushError() error {
	if w.writeErr != nil {
		return w.writeErr
	}
	if writer, ok := w.ResponseWriter.(interface{ FlushError() error }); ok {
		return writer.FlushError()
	}
	return nil
}

func (w *textMaskResponseWriter) Flush() {
	if w.isEventStream() {
		w.startStream()
		w.ResponseWriter.Flush()
	}
}

func (w *textMaskResponseWriter) isEventStream() bool {
	return w.stream || strings.Contains(strings.ToLower(w.Header().Get("Content-Type")), "text/event-stream")
}

func (w *textMaskResponseWriter) startStream() {
	if w.streamStarted {
		return
	}
	w.stream = true
	w.streamStarted = true
	w.Header().Del("Content-Length")
	w.ResponseWriter.WriteHeader(w.statusOrOK())
	w.ResponseWriter.WriteHeaderNow()
}

func (w *textMaskResponseWriter) statusOrOK() int {
	if w.status == 0 {
		return http.StatusOK
	}
	return w.status
}

func (w *textMaskResponseWriter) writeEventStream(data []byte) (int, error) {
	w.streamBuffer = append(w.streamBuffer, data...)
	w.startStream()
	for {
		boundary, width := sseBoundary(w.streamBuffer)
		if boundary < 0 {
			break
		}
		if boundary > maxTextMaskEventBytes {
			w.failed = true
			w.writeErr = textmask.ErrUnsupported
			return 0, w.writeErr
		}
		event := w.streamBuffer[:boundary]
		w.streamBuffer = w.streamBuffer[boundary+width:]
		restored, err := w.restoreSSEEvent(event)
		if err != nil {
			w.failed = true
			w.writeErr = err
			return 0, err
		}
		if _, err = w.ResponseWriter.Write(restored); err != nil {
			w.failed = true
			w.writeErr = err
			return 0, err
		}
		w.size += len(restored)
	}
	if len(w.streamBuffer) > maxTextMaskEventBytes {
		w.failed = true
		w.writeErr = textmask.ErrUnsupported
		return 0, w.writeErr
	}
	return len(data), nil
}

func sseBoundary(data []byte) (int, int) {
	lf := bytes.Index(data, []byte("\n\n"))
	crlf := bytes.Index(data, []byte("\r\n\r\n"))
	if crlf >= 0 && (lf < 0 || crlf < lf) {
		return crlf, 4
	}
	if lf >= 0 {
		return lf, 2
	}
	return -1, 0
}

func (w *textMaskResponseWriter) restoreSSEEvent(event []byte) ([]byte, error) {
	lines := bytes.Split(event, []byte("\n"))
	dataLines := make([]string, 0, 1)
	output := make([]string, 0, len(lines)+1)
	for _, rawLine := range lines {
		line := strings.TrimSuffix(string(rawLine), "\r")
		if strings.HasPrefix(line, "data:") {
			value := strings.TrimPrefix(line, "data:")
			value = strings.TrimPrefix(value, " ")
			dataLines = append(dataLines, value)
			continue
		}
		output = append(output, line)
	}
	if len(dataLines) == 0 {
		return []byte(strings.Join(output, "\n") + "\n\n"), nil
	}
	data := strings.Join(dataLines, "\n")
	if strings.TrimSpace(data) == "" {
		return []byte(strings.Join(output, "\n") + "\ndata:\n\n"), nil
	}
	restored, err := w.session.RestoreEvent([]byte(data))
	if err != nil {
		return nil, err
	}
	output = append(output, "data: "+string(restored))
	return []byte(strings.Join(output, "\n") + "\n\n"), nil
}

func (w *textMaskResponseWriter) complete() error {
	if w.failed {
		return w.failClosed()
	}
	if w.isEventStream() {
		if len(w.streamBuffer) != 0 || w.session.Finish() != nil {
			return w.failClosed()
		}
		if !w.streamStarted {
			w.startStream()
		}
		return nil
	}
	if len(w.buffer) == 0 && !w.ResponseWriter.Written() {
		w.ResponseWriter.WriteHeader(w.statusOrOK())
		return nil
	}
	restored, err := w.session.RestoreJSON(w.buffer)
	if err != nil {
		return w.failClosed()
	}
	w.Header().Del("Content-Length")
	w.Header().Set("Content-Type", "application/json")
	w.ResponseWriter.WriteHeader(w.statusOrOK())
	w.ResponseWriter.WriteHeaderNow()
	n, err := w.ResponseWriter.Write(restored)
	w.size += n
	return err
}

func (w *textMaskResponseWriter) failClosed() error {
	w.failed = true
	w.buffer = nil
	w.streamBuffer = nil
	body, _ := common.Marshal(gin.H{
		"type": "error",
		"error": gin.H{
			"message": w.failureMessage,
			"type":    "server_error",
			"code":    "text_masking_failed",
		},
	})
	if w.streamStarted {
		_, _ = w.ResponseWriter.Write(append(append([]byte("event: error\ndata: "), body...), '\n', '\n'))
		w.ResponseWriter.Flush()
		return textmask.ErrUnsupported
	}
	if w.ResponseWriter.Written() {
		return textmask.ErrUnsupported
	}
	w.Header().Del("Content-Length")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.status = http.StatusBadGateway
	w.ResponseWriter.WriteHeader(w.status)
	w.ResponseWriter.WriteHeaderNow()
	n, err := w.ResponseWriter.Write(body)
	w.size += n
	if err != nil {
		return err
	}
	return textmask.ErrUnsupported
}
