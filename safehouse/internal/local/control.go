package local

import (
	"crypto/subtle"
	"embed"
	"encoding/json"
	"errors"
	"html"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/textmask"
)

//go:embed panel
var panelFiles embed.FS

const (
	appName            = "mengmeng-safehouse"
	tokenHeader        = "X-Safehouse-Token"
	maxControlBody     = 64 << 10
	panelTokenTemplate = "{{SAFEHOUSE_TOKEN}}"
	panelSecurity      = "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)

var errAutostartUnsupported = errors.New("autostart is not supported on this system")

type stateResponse struct {
	App       string            `json:"app"`
	Version   string            `json:"version"`
	Upstream  string            `json:"upstream"`
	BaseURLs  map[string]string `json:"base_urls"`
	Stats     statsResponse     `json:"stats"`
	Autostart autostartResponse `json:"autostart"`
}

type statsResponse struct {
	Requests       int64 `json:"requests"`
	MaskedEntities int64 `json:"masked_entities"`
	Rejected       int64 `json:"rejected"`
	Failed         int64 `json:"failed"`
}

type autostartResponse struct {
	Supported bool `json:"supported"`
	Enabled   bool `json:"enabled"`
}

func (s *Server) servePing(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"app": appName, "version": s.version})
}

// control guards panel endpoints: the per-launch token proves the caller read
// the panel page, and the Origin check rejects cross-site form posts. No CORS
// headers are ever sent here, so other sites cannot read the answers.
func (s *Server) control(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		token := r.Header.Get(tokenHeader)
		if subtle.ConstantTimeCompare([]byte(token), []byte(s.token)) != 1 {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		if r.Method != http.MethodGet {
			origin := r.Header.Get("Origin")
			if origin != s.origins[0] && origin != s.origins[1] {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
			if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
				writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "json required"})
				return
			}
		}
		next(w, r)
	}
}

func (s *Server) serveState(w http.ResponseWriter, _ *http.Request) {
	base := "http://" + s.hosts[0]
	writeJSON(w, http.StatusOK, stateResponse{
		App:      appName,
		Version:  s.version,
		Upstream: s.config.upstream(),
		BaseURLs: map[string]string{
			"openai": base + "/v1",
			"claude": base,
			"gemini": base,
		},
		Stats: statsResponse{
			Requests:       s.stats.requests.Load(),
			MaskedEntities: s.stats.maskedEntities.Load(),
			Rejected:       s.stats.rejected.Load(),
			Failed:         s.stats.failed.Load(),
		},
		Autostart: autostartResponse{Supported: s.autostart.Supported(), Enabled: s.autostart.Enabled()},
	})
}

func (s *Server) servePair(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Upstream string `json:"upstream"`
	}
	if decodeControl(r, &request) != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	origin, err := normalizeUpstream(request.Upstream, s.hosts[0])
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid upstream"})
		return
	}
	if err = s.config.setUpstream(origin); err != nil {
		s.logger.Printf("saving config failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save failed"})
		return
	}
	s.logger.Printf("connected to %s", origin)
	writeJSON(w, http.StatusOK, map[string]string{"upstream": origin})
}

func (s *Server) serveAutostart(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Enabled *bool `json:"enabled"`
	}
	if decodeControl(r, &request) != nil || request.Enabled == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	if err := s.autostart.SetEnabled(*request.Enabled); err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, autostartResponse{Supported: true, Enabled: s.autostart.Enabled()})
}

// serveTry runs the real detector on text typed into the panel. The text
// stays on this machine; only the masked form is returned to the page.
func (s *Server) serveTry(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Text string `json:"text"`
	}
	if decodeControl(r, &request) != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	session, err := textmask.NewWithMarker(textmask.LocalMarker)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unavailable"})
		return
	}
	defer session.Close()
	masked, err := session.MaskText(request.Text)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"masked": masked, "count": session.MaskedCount()})
}

func (s *Server) serveQuit(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
	if s.quit != nil {
		go s.quit()
	}
}

func (s *Server) servePanel(w http.ResponseWriter, _ *http.Request) {
	page, err := panelFiles.ReadFile("panel/index.html")
	if err != nil {
		http.Error(w, "panel unavailable", http.StatusInternalServerError)
		return
	}
	body := strings.Replace(string(page), panelTokenTemplate, html.EscapeString(s.token), 1)
	header := w.Header()
	header.Set("Content-Type", "text/html; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	header.Set("Content-Security-Policy", panelSecurity)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Referrer-Policy", "no-referrer")
	_, _ = io.WriteString(w, body)
}

func (s *Server) serveAsset(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/")
	content, err := panelFiles.ReadFile("panel/" + name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	contentType := "text/css; charset=utf-8"
	if strings.HasSuffix(name, ".js") {
		contentType = "text/javascript; charset=utf-8"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(content)
}

func (s *Server) serveIcon(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(IconPNG())
}

func decodeControl(r *http.Request, value any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxControlBody))
	decoder.DisallowUnknownFields()
	return decoder.Decode(value)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	body, _ := json.Marshal(value)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
