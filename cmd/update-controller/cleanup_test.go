package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/pkg/siteupdate"
	"github.com/stretchr/testify/require"
)

type cleanupEngine struct {
	calls              []string
	stopErr, removeErr error
}

func (e *cleanupEngine) Inspect(context.Context, string) (dockerContainer, error) {
	return dockerContainer{Name: "new", State: dockerState{Running: true}, NetworkSettings: dockerNetworkSettings{Networks: map[string]dockerNetworkEndpoint{"managed": {IPAddress: "192.0.2.2"}}}}, nil
}
func (e *cleanupEngine) Create(context.Context, string, string, dockerContainer) (string, error) {
	return "", fmt.Errorf("unused")
}
func (e *cleanupEngine) Start(context.Context, string) error { return fmt.Errorf("unused") }
func (e *cleanupEngine) Stop(context.Context, string) error {
	e.calls = append(e.calls, "stop")
	return e.stopErr
}
func (e *cleanupEngine) Remove(_ context.Context, _ string, force bool) error {
	if force {
		return fmt.Errorf("forced deletion not allowed")
	}
	e.calls = append(e.calls, "remove")
	return e.removeErr
}

type cleanupTransport func(*http.Request) (*http.Response, error)

func (f cleanupTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestDrainedCleanupSafetyAndPersistence(t *testing.T) {
	for _, scenario := range []string{"success", "busy", "active", "stop failure", "remove failure", "active unhealthy", "already removed"} {
		t.Run(scenario, func(t *testing.T) {
			dir := t.TempDir()
			listener, err := net.Listen("unix", filepath.Join(dir, "admin.sock"))
			require.NoError(t, err)
			t.Cleanup(func() { listener.Close() })
			go func() {
				for {
					c, err := listener.Accept()
					if err != nil {
						return
					}
					go func() { defer c.Close(); buf := make([]byte, 4096); _, _ = c.Read(buf); _, _ = c.Write([]byte("\n")) }()
				}
			}()
			mapFile := filepath.Join(dir, "update.map")
			require.NoError(t, os.WriteFile(mapFile, []byte("active 192.0.2.2\n"), 0600))
			engine := &cleanupEngine{}
			if scenario == "stop failure" {
				engine.stopErr = fmt.Errorf("stop failed")
			}
			if scenario == "remove failure" {
				engine.removeErr = fmt.Errorf("remove failed")
			}
			if scenario == "already removed" {
				engine.removeErr = errDockerNotFound
			}
			u := &controller{engine: engine, active: "new", drainingContainer: "old", store: stateStore{path: filepath.Join(dir, "state.json")}, config: updateConfig{haproxyMap: mapFile, haproxyMapKey: "active", haproxySocket: filepath.Join(dir, "admin.sock"), internalPort: 3001}, status: siteupdate.Status{Supported: true, State: "draining", CurrentVersion: "v1.2.0", TargetVersion: "v1.2.1", OperationID: "test", Draining: true}}
			u.client = &http.Client{Transport: cleanupTransport(func(r *http.Request) (*http.Response, error) {
				body := `{"protocol":1,"ready":true,"draining":false}`
				if r.URL.Hostname() == "192.0.2.1" {
					body = `{"protocol":1,"ready":true,"draining":true,"safe_to_stop":true,"active_requests":0,"pending_writes":0}`
					if scenario == "busy" {
						body = `{"protocol":1,"ready":true,"draining":true,"safe_to_stop":false,"active_requests":1}`
					}
				}
				if scenario == "active unhealthy" && r.URL.Hostname() == "192.0.2.2" {
					body = `{"protocol":1,"ready":false}`
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
			})}
			old := dockerContainer{ID: "old-id", Name: "old", State: dockerState{Running: true}, NetworkSettings: dockerNetworkSettings{Networks: map[string]dockerNetworkEndpoint{"managed": {IPAddress: "192.0.2.1"}}}}
			if scenario == "active" {
				old.Name = "new"
			}
			if scenario == "already removed" {
				old.State.Running = false
			}
			err = u.finishDrained(context.Background(), old, "v1.2.1")
			switch scenario {
			case "success", "already removed":
				require.NoError(t, err)
				require.Empty(t, u.drainingContainer)
				require.Equal(t, "completed", u.status.State)
				require.Equal(t, "v1.2.1", u.status.CurrentVersion)
				state, err := u.store.load()
				require.NoError(t, err)
				require.Empty(t, state.DrainingContainer)
			default:
				require.Error(t, err)
				require.Equal(t, "old", u.drainingContainer)
			}
			switch scenario {
			case "success":
				require.Equal(t, []string{"stop", "remove"}, engine.calls)
			case "stop failure":
				require.Equal(t, []string{"stop"}, engine.calls)
			case "remove failure":
				require.Equal(t, []string{"stop", "remove"}, engine.calls)
			case "already removed":
				require.Equal(t, []string{"remove"}, engine.calls)
			default:
				require.Empty(t, engine.calls)
			}
		})
	}
}
