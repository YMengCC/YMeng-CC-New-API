package local

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/textmask"
)

const (
	errorUnsupported   = "text_masking_unsupported"
	errorFailed        = "text_masking_failed"
	errorNotConnected  = "safehouse_not_connected"
	errorUpstreamError = "safehouse_upstream_unreachable"

	messageUnsupported = "萌萌的安全小屋无法在本机安全处理此请求，已拦截，未发送给站点。函数工具、工具调用和工具结果已支持；图片、音频、服务端会话状态、原生/服务端工具或签名推理仍不支持。 (Mengmeng's Safe House cannot safely mask this request on this computer. It was blocked and not sent to the site. Function tools, tool calls and tool results are supported; images, audio, server-side state, native/server tools and signed reasoning are still unsupported.)"
	messageFailed      = "萌萌的安全小屋无法在本机安全还原站点的回复。 (Mengmeng's Safe House could not safely restore the site's reply on this computer.)"
	messageNotPaired   = "萌萌的安全小屋还没有连接站点，请先在控制面板里连接。 (Mengmeng's Safe House is not connected to a site yet. Connect one in the control panel first.)"
	messageUnreachable = "萌萌的安全小屋无法连接站点。 (Mengmeng's Safe House could not reach the site.)"
)

// Only protocol headers travel to the selected site. Cookies, browser headers,
// and client-specific metadata are not part of the relay contract.
var upstreamHeaders = []string{
	"Authorization", "X-Api-Key", "X-Goog-Api-Key", "Anthropic-Version", "Accept",
}

func newUpstreamClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.ResponseHeaderTimeout = 10 * time.Minute
	return &http.Client{
		Transport: transport,
		// A redirect could carry the API key or masked text to another host.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

func (s *Server) serveProxy(w http.ResponseWriter, r *http.Request) {
	allowBrowserClients(w, r)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	upstream := s.config.upstream()
	if upstream == "" {
		writeProxyError(w, http.StatusServiceUnavailable, "invalid_request_error", errorNotConnected, messageNotPaired)
		return
	}
	if r.Header.Get("Upgrade") != "" {
		s.reject(w)
		return
	}
	protocol, maskable := textmask.ProtocolForRoute(r.Method, r.URL.Path)
	if maskable && protocol != "playground" {
		s.forwardMasked(w, r, upstream, protocol)
		return
	}
	if isModelListing(r) {
		s.forwardPlain(w, r, upstream)
		return
	}
	s.reject(w)
}

// isModelListing allows the body-less model catalogue reads clients make
// before chatting; they carry no user text.
func isModelListing(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	if r.ContentLength > 0 || len(r.TransferEncoding) > 0 {
		return false
	}
	path := r.URL.Path
	return path == "/v1/models" || strings.HasPrefix(path, "/v1/models/") ||
		path == "/v1beta/models" || strings.HasPrefix(path, "/v1beta/models/")
}

func (s *Server) reject(w http.ResponseWriter) {
	s.stats.rejected.Add(1)
	writeProxyError(w, http.StatusBadRequest, "invalid_request_error", errorUnsupported, messageUnsupported)
}

func (s *Server) forwardMasked(w http.ResponseWriter, r *http.Request, upstream, protocol string) {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") || r.Body == nil {
		s.reject(w)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, textmask.MaxRequestBytes+1))
	if err != nil || len(body) > textmask.MaxRequestBytes {
		s.reject(w)
		return
	}
	session, err := textmask.NewWithMarker(textmask.LocalMarker)
	if err != nil {
		s.reject(w)
		return
	}
	defer session.Close()
	masked, err := session.MaskJSON(body, protocol)
	clear(body)
	if err != nil {
		s.reject(w)
		return
	}
	response, ok := s.send(w, r, upstream, masked)
	if !ok {
		return
	}
	defer response.Body.Close()
	s.stats.requests.Add(1)
	s.stats.maskedEntities.Add(int64(session.MaskedCount()))
	if strings.Contains(strings.ToLower(response.Header.Get("Content-Type")), "text/event-stream") {
		w.Header().Set("Content-Type", "text/event-stream")
		s.restoreStream(w, response, session)
		return
	}
	reply, err := io.ReadAll(io.LimitReader(response.Body, textmask.MaxResponseBytes+1))
	if err != nil || len(reply) > textmask.MaxResponseBytes {
		s.fail(w)
		return
	}
	if len(reply) == 0 {
		w.WriteHeader(response.StatusCode)
		return
	}
	restored, err := session.RestoreJSON(reply)
	if err != nil {
		s.fail(w)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Length", strconv.Itoa(len(restored)))
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write(restored)
}

func (s *Server) restoreStream(w http.ResponseWriter, response *http.Response, session *textmask.Session) {
	flusher, _ := w.(http.Flusher)
	w.WriteHeader(response.StatusCode)
	restorer := session.NewStreamRestorer(textmask.MaxEventBytes)
	emit := func(event []byte) error {
		if _, err := w.Write(event); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
		return nil
	}
	buffer := make([]byte, 32<<10)
	for {
		n, readErr := response.Body.Read(buffer)
		if n > 0 {
			if err := restorer.Write(buffer[:n], emit); err != nil {
				s.failStream(w)
				return
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			s.failStream(w)
			return
		}
	}
	if restorer.Close() != nil {
		s.failStream(w)
	}
}

func (s *Server) forwardPlain(w http.ResponseWriter, r *http.Request, upstream string) {
	response, ok := s.send(w, r, upstream, nil)
	if !ok {
		return
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, textmask.MaxResponseBytes+1))
	if err != nil || len(data) > textmask.MaxResponseBytes || (r.Method != http.MethodHead && !json.Valid(data)) {
		s.fail(w)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write(data)
}

// send forwards the request; on failure it has already answered the client.
func (s *Server) send(w http.ResponseWriter, r *http.Request, upstream string, body []byte) (*http.Response, bool) {
	target := upstream + r.URL.EscapedPath()
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	outbound, err := http.NewRequestWithContext(r.Context(), r.Method, target, reader)
	if err != nil {
		s.fail(w)
		return nil, false
	}
	for _, name := range upstreamHeaders {
		for _, value := range r.Header.Values(name) {
			outbound.Header.Add(name, value)
		}
	}
	if body != nil {
		outbound.Header.Set("Content-Type", "application/json")
	}
	if body != nil {
		outbound.ContentLength = int64(len(body))
	}
	response, err := s.client.Do(outbound)
	if err != nil {
		s.stats.failed.Add(1)
		if r.Context().Err() == nil {
			s.logger.Printf("upstream request failed: %s", describeNetError(err))
		}
		writeProxyError(w, http.StatusBadGateway, "server_error", errorUpstreamError, messageUnreachable)
		return nil, false
	}
	if response.StatusCode >= 300 && response.StatusCode < 400 {
		_ = response.Body.Close()
		s.stats.failed.Add(1)
		writeProxyError(w, http.StatusBadGateway, "server_error", errorUpstreamError, messageUnreachable)
		return nil, false
	}
	return response, true
}

// describeNetError keeps the log free of URLs, which may carry ?key=.
func describeNetError(err error) string {
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return opErr.Op + ": " + opErr.Err.Error()
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "timeout"
	}
	return "network error"
}

func (s *Server) fail(w http.ResponseWriter) {
	s.stats.failed.Add(1)
	w.Header().Del("Content-Length")
	writeProxyError(w, http.StatusBadGateway, "server_error", errorFailed, messageFailed)
}

func (s *Server) failStream(w http.ResponseWriter) {
	s.stats.failed.Add(1)
	body, _ := json.Marshal(map[string]any{
		"type":  "error",
		"error": map[string]string{"message": messageFailed, "type": "server_error", "code": errorFailed},
	})
	_, _ = w.Write(append(append([]byte("event: error\ndata: "), body...), '\n', '\n'))
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}

func writeProxyError(w http.ResponseWriter, status int, kind, code, message string) {
	body, _ := json.Marshal(map[string]any{
		"error": map[string]string{"message": message, "type": kind, "code": code},
	})
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// allowBrowserClients supports API-key clients running in a browser. It does
// not allow credentials, and cookies are never copied to the upstream site.
func allowBrowserClients(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Add("Vary", "Origin")
	if r.Method != http.MethodOptions {
		return
	}
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS")
	if requested := r.Header.Get("Access-Control-Request-Headers"); requested != "" {
		w.Header().Set("Access-Control-Allow-Headers", requested)
	}
	if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
	}
	w.Header().Set("Access-Control-Max-Age", "600")
}
