package textmask

import (
	"bytes"
	"net/http"
	"strings"
)

// ProtocolForRoute maps an HTTP route to the masking protocol it carries.
// Only these POST routes can be masked; every other route must be rejected by
// a caller that has masking enabled.
func ProtocolForRoute(method, path string) (string, bool) {
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

// StreamRestorer reframes an SSE byte stream into events and restores the
// placeholders in each event's data payload. It is transport agnostic so the
// gateway middleware and the local proxy share one implementation.
type StreamRestorer struct {
	session       *Session
	maxEventBytes int
	buffer        []byte
}

func (s *Session) NewStreamRestorer(maxEventBytes int) *StreamRestorer {
	return &StreamRestorer{session: s, maxEventBytes: maxEventBytes}
}

// Write consumes a chunk and calls emit once per complete restored event.
func (r *StreamRestorer) Write(chunk []byte, emit func(event []byte) error) error {
	r.buffer = append(r.buffer, chunk...)
	for {
		boundary, width := sseBoundary(r.buffer)
		if boundary < 0 {
			break
		}
		if boundary > r.maxEventBytes {
			return ErrUnsupported
		}
		event := r.buffer[:boundary]
		r.buffer = r.buffer[boundary+width:]
		restored, err := r.restoreEvent(event)
		if err != nil {
			return err
		}
		if err = emit(restored); err != nil {
			return err
		}
	}
	if len(r.buffer) > r.maxEventBytes {
		return ErrUnsupported
	}
	return nil
}

// Close fails when a partial event or an unfinished placeholder remains.
func (r *StreamRestorer) Close() error {
	if len(r.buffer) != 0 {
		return ErrIncomplete
	}
	return r.session.Finish()
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

func (r *StreamRestorer) restoreEvent(event []byte) ([]byte, error) {
	lines := bytes.Split(event, []byte("\n"))
	dataLines := make([]string, 0, 1)
	output := make([]string, 0, len(lines)+1)
	for _, rawLine := range lines {
		line := strings.TrimSuffix(string(rawLine), "\r")
		if value, ok := strings.CutPrefix(line, "data:"); ok {
			dataLines = append(dataLines, strings.TrimPrefix(value, " "))
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
	restored, err := r.session.RestoreEvent([]byte(data))
	if err != nil {
		return nil, err
	}
	output = append(output, "data: "+string(restored))
	return []byte(strings.Join(output, "\n") + "\n\n"), nil
}
