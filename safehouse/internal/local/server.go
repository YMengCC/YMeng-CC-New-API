// Package local implements the 萌萌的安全小屋 (Mengmeng's Safe House) local
// proxy: requests are masked on the user's machine before they reach the
// site, and the placeholders in the reply are restored on the same machine.
package local

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
)

// Autostart toggles launching the safe house at sign-in. Platforms without
// support return Supported() == false.
type Autostart interface {
	Supported() bool
	Enabled() bool
	SetEnabled(enabled bool) error
}

type Options struct {
	// Addr is the listen address, always 127.0.0.1:<port>.
	Addr       string
	ConfigPath string
	Version    string
	Autostart  Autostart
	// Quit is called after the panel asks the program to exit.
	Quit   func()
	Logger *log.Logger
	// Client overrides the upstream HTTP client in tests.
	Client *http.Client
}

type Server struct {
	addr      string
	hosts     []string
	origins   []string
	token     string
	version   string
	config    *configStore
	autostart Autostart
	quit      func()
	logger    *log.Logger
	client    *http.Client
	stats     stats
}

type stats struct {
	requests       atomic.Int64
	maskedEntities atomic.Int64
	rejected       atomic.Int64
	failed         atomic.Int64
}

func NewServer(options Options) (*Server, error) {
	var secret [16]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return nil, err
	}
	_, port, _ := strings.Cut(options.Addr, ":")
	hosts := []string{"127.0.0.1:" + port, "localhost:" + port}
	server := &Server{
		addr:      options.Addr,
		hosts:     hosts,
		origins:   []string{"http://" + hosts[0], "http://" + hosts[1]},
		token:     hex.EncodeToString(secret[:]),
		version:   options.Version,
		config:    loadConfig(options.ConfigPath),
		autostart: options.Autostart,
		quit:      options.Quit,
		logger:    options.Logger,
		client:    options.Client,
	}
	if server.autostart == nil {
		server.autostart = unsupportedAutostart{}
	}
	if server.logger == nil {
		server.logger = log.Default()
	}
	if server.client == nil {
		server.client = newUpstreamClient()
	}
	return server, nil
}

// PanelURL is the address the browser opens to show the control panel.
func (s *Server) PanelURL() string { return "http://" + s.hosts[0] + "/" }

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/", s.serveProxy)
	mux.HandleFunc("/v1beta/", s.serveProxy)
	mux.HandleFunc("GET /api/ping", s.servePing)
	mux.HandleFunc("GET /api/state", s.control(s.serveState))
	mux.HandleFunc("POST /api/pair", s.control(s.servePair))
	mux.HandleFunc("POST /api/autostart", s.control(s.serveAutostart))
	mux.HandleFunc("POST /api/try", s.control(s.serveTry))
	mux.HandleFunc("POST /api/quit", s.control(s.serveQuit))
	mux.HandleFunc("GET /{$}", s.servePanel)
	mux.HandleFunc("GET /panel.css", s.serveAsset)
	mux.HandleFunc("GET /panel.js", s.serveAsset)
	mux.HandleFunc("GET /icon.png", s.serveIcon)
	return s.guardHost(mux)
}

// guardHost rejects requests whose Host is not this loopback listener, so a
// DNS-rebinding page cannot reach the panel or the proxy under its own name.
func (s *Server) guardHost(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := strings.ToLower(r.Host)
		if host != s.hosts[0] && host != s.hosts[1] {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type unsupportedAutostart struct{}

func (unsupportedAutostart) Supported() bool         { return false }
func (unsupportedAutostart) Enabled() bool           { return false }
func (unsupportedAutostart) SetEnabled(_ bool) error { return errAutostartUnsupported }
