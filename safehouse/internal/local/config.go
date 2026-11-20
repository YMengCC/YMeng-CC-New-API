package local

import (
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const appDirName = "mengmeng-safehouse"

// Config is the only state kept on disk: the site requests are forwarded to.
// API keys, request bodies and counters are never persisted.
type Config struct {
	Upstream string `json:"upstream"`
}

type configStore struct {
	mu   sync.Mutex
	path string
	data Config
}

// ConfigDir is where the safe house keeps its config and log file.
func ConfigDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, appDirName), nil
}

func loadConfig(path string) *configStore {
	store := &configStore{path: path}
	if path == "" {
		return store
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return store
	}
	var data Config
	if json.Unmarshal(raw, &data) != nil {
		return store
	}
	// A hand-edited or stale file must pass the same check as the panel.
	if origin, err := normalizeUpstream(data.Upstream, ""); err == nil {
		store.data.Upstream = origin
	}
	return store
}

func (c *configStore) upstream() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.data.Upstream
}

func (c *configStore) setUpstream(origin string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	next := c.data
	next.Upstream = origin
	if c.path != "" {
		if err := os.MkdirAll(filepath.Dir(c.path), 0o700); err != nil {
			return err
		}
		raw, err := json.MarshalIndent(next, "", "  ")
		if err != nil {
			return err
		}
		if err = os.WriteFile(c.path, raw, 0o600); err != nil {
			return err
		}
	}
	c.data = next
	return nil
}

var errInvalidUpstream = errors.New("invalid upstream")

// normalizeUpstream accepts a bare site origin. Plain http is allowed only for
// loopback hosts so API keys and masked text never cross a network in clear.
// self is the safe house's own host:port, which must not become a loop.
func normalizeUpstream(raw, self string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Opaque != "" {
		return "", errInvalidUpstream
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return "", errInvalidUpstream
	}
	scheme := strings.ToLower(parsed.Scheme)
	host := strings.ToLower(parsed.Host)
	switch scheme {
	case "https":
	case "http":
		if !isLoopbackHost(parsed.Hostname()) {
			return "", errInvalidUpstream
		}
	default:
		return "", errInvalidUpstream
	}
	if self != "" && (host == self || host == strings.Replace(self, "127.0.0.1", "localhost", 1)) {
		return "", errInvalidUpstream
	}
	return scheme + "://" + host, nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
