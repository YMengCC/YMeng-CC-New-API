package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/siteupdate"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testConfig(t *testing.T) updateConfig {
	t.Helper()
	key, _, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	return updateConfig{
		token:           "test-token-with-at-least-32-characters-long",
		key:             key,
		currentVersion:  "v1.0.0",
		platform:        "linux/amd64",
		database:        "postgres",
		stateFile:       filepath.Join(t.TempDir(), "state.json"),
		activeContainer: "new-api",
		internalPort:    3001,
	}
}

func TestControllerRequiresExactBearerToken(t *testing.T) {
	config := testConfig(t)
	controller := &controller{config: config, status: siteupdate.Status{Supported: true, State: "ready"}}
	server := httptest.NewServer(http.HandlerFunc(controller.serve))
	defer server.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/v1/status", nil)
	require.NoError(t, err)
	request.Header.Set("Authorization", "Bearer wrong-token")
	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, response.StatusCode)
	require.NoError(t, response.Body.Close())

	request, err = http.NewRequest(http.MethodGet, server.URL+"/v1/status", nil)
	require.NoError(t, err)
	request.Header.Set("Authorization", "Bearer "+config.token)
	response, err = http.DefaultClient.Do(request)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, response.StatusCode)
	require.NoError(t, response.Body.Close())
}

func TestSignedCompatibilityManifestRequiresMatchingDigestAndTag(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	manifest := siteupdate.Compatibility{
		Version:               "v1.1.0",
		Image:                 siteupdate.ImageRepository + "@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		FromVersions:          []string{"v1.0.0"},
		SchemaUnchanged:       true,
		SharedStateCompatible: true,
		Platforms:             []string{"linux/amd64"},
		Databases:             []string{"postgres"},
	}
	data, err := common.Marshal(manifest)
	require.NoError(t, err)
	signature := ed25519.Sign(privateKey, data)
	verified, err := verifyCompatibilityManifest(publicKey, "v1.1.0", data, signature)
	require.NoError(t, err)
	assert.Equal(t, manifest.Image, verified.Image)

	_, err = verifyCompatibilityManifest(publicKey, "v1.2.0", data, signature)
	assert.Error(t, err)
	_, err = verifyCompatibilityManifest(publicKey, "v1.1.0", data, []byte(base64.StdEncoding.EncodeToString(signature)))
	assert.Error(t, err)
}

func TestCompatibilityRequiresAllSignedDeploymentDimensions(t *testing.T) {
	config := testConfig(t)
	controller := &controller{config: config}
	manifest := siteupdate.Compatibility{
		Version:               "v1.1.0",
		Image:                 siteupdate.ImageRepository + "@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		FromVersions:          []string{"v1.0.0"},
		SchemaUnchanged:       true,
		SharedStateCompatible: true,
		Platforms:             []string{"linux/amd64"},
		Databases:             []string{"postgres"},
	}
	compatible, reason := controller.compatibility(manifest, "v1.0.0")
	require.True(t, compatible)
	assert.Empty(t, reason)

	manifest.Databases = []string{"mysql"}
	compatible, reason = controller.compatibility(manifest, "v1.0.0")
	assert.False(t, compatible)
	assert.NotEmpty(t, reason)
}

func TestHAProxyMapEntryReplacementPreservesOtherBackends(t *testing.T) {
	content := "# managed map\napi old:3000\nother other:3000\n"
	updated, err := replaceHAProxyMapEntry(content, "api", "new:3000")
	require.NoError(t, err)
	assert.Equal(t, "# managed map\napi new:3000\nother other:3000\n", updated)

	updated, err = replaceHAProxyMapEntry(content, "new", "new:3000")
	require.NoError(t, err)
	assert.Contains(t, updated, "new new:3000\n")
	_, err = replaceHAProxyMapEntry("api old:3000\napi old:3001\n", "api", "new:3000")
	assert.Error(t, err)
}

func TestStateStoreSaveIsReadableAfterAtomicReplace(t *testing.T) {
	store := stateStore{path: filepath.Join(t.TempDir(), "nested", "state.json")}
	want := persistedState{
		Status: siteupdate.Status{
			Supported:      true,
			State:          "draining",
			CurrentVersion: "v1.0.0",
			OperationID:    "operation-1",
			Draining:       true,
		},
		ActiveContainer:   "new-api-update-1",
		DrainingContainer: "new-api",
	}
	require.NoError(t, store.save(want))
	got, err := store.load()
	require.NoError(t, err)
	assert.Equal(t, want, got)
}

type cleanupEngine struct {
	containers             map[string]dockerContainer
	stopCalls, removeCalls []string
	force                  bool
	stopError, removeError error
	keepAfterRemove        bool
}

func (e *cleanupEngine) Pull(context.Context, string) error { return nil }

func (e *cleanupEngine) Inspect(_ context.Context, id string) (dockerContainer, error) {
	for key, container := range e.containers {
		if key == id || container.Name == id {
			return container, nil
		}
	}
	return dockerContainer{}, &dockerHTTPError{StatusCode: 404}
}
func (e *cleanupEngine) Create(context.Context, string, string, dockerContainer) (string, error) {
	return "", errors.New("not used")
}
func (e *cleanupEngine) Start(context.Context, string) error { return errors.New("not used") }
func (e *cleanupEngine) Stop(_ context.Context, id string) error {
	e.stopCalls = append(e.stopCalls, id)
	container := e.containers[id]
	container.State = dockerState{Status: "exited"}
	container.NetworkSettings.Networks = map[string]dockerNetworkEndpoint{"managed": {NetworkID: "network-1", IPAddress: ""}}
	e.containers[id] = container
	return e.stopError
}
func (e *cleanupEngine) Remove(_ context.Context, id string, force bool) error {
	e.removeCalls = append(e.removeCalls, id)
	e.force = force
	if !e.keepAfterRemove {
		delete(e.containers, id)
	}
	return e.removeError
}

type cleanupProxy struct {
	target string
	err    error
}

func (p *cleanupProxy) Target(context.Context, string, string) (string, error) {
	return p.target, p.err
}
func (p *cleanupProxy) Select(_ context.Context, _, _, target string) error {
	p.target = target
	return p.err
}

type lifecycleTransport struct {
	safe        bool
	ready       bool
	notDraining bool
	drainCalls  int
}

func (p *lifecycleTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	life := common.UpdateLifecycleSnapshot{Protocol: 1, Ready: p.ready}
	if r.URL.Hostname() == "10.0.0.2" {
		life.Ready = true
		if r.Method == http.MethodPost {
			p.notDraining = false
			p.drainCalls++
		}
		life.Draining = !p.notDraining
		life.SafeToStop = p.safe && life.Draining
		if !p.safe {
			life.ActiveRequests = 1
		}
	}
	body, err := common.Marshal(life)
	if err != nil {
		return nil, err
	}
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(body))), Header: make(http.Header)}, nil
}

func cleanupFixture(t *testing.T) (*controller, *cleanupEngine, *cleanupProxy, *lifecycleTransport) {
	t.Helper()
	config := testConfig(t)
	config.haproxyMap = filepath.Join(t.TempDir(), "update.map")
	config.haproxyMapKey = "active"
	config.operationTimeout = time.Second
	require.NoError(t, os.WriteFile(config.haproxyMap, []byte("active 10.0.0.3\n"), 0600))
	old := dockerContainer{ID: strings.Repeat("a", 64), Name: "old", Labels: map[string]string{managedLabel: "true", activeLabel: "true"}, State: dockerState{Running: true, Status: "running"}, NetworkSettings: dockerNetworkSettings{Networks: map[string]dockerNetworkEndpoint{"managed": {NetworkID: "network-1", IPAddress: "10.0.0.2"}}}}
	active := dockerContainer{ID: strings.Repeat("b", 64), Name: "active", Labels: map[string]string{managedLabel: "true", activeLabel: "true"}, State: dockerState{Running: true, Status: "running"}, NetworkSettings: dockerNetworkSettings{Networks: map[string]dockerNetworkEndpoint{"managed": {NetworkID: "network-1", IPAddress: "10.0.0.3"}}}}
	engine := &cleanupEngine{containers: map[string]dockerContainer{old.ID: old, active.ID: active}}
	proxy := &cleanupProxy{target: "10.0.0.3"}
	transport := &lifecycleTransport{safe: true, ready: true}
	activeRef := containerRef{ID: active.ID, Name: active.Name, NetworkID: "network-1"}
	oldRef := containerRef{ID: old.ID, Name: old.Name, NetworkID: "network-1"}
	u := &controller{config: config, store: stateStore{path: config.stateFile}, engine: engine, proxy: proxy, client: &http.Client{Transport: transport}, active: active.Name, activeRef: &activeRef, drainingContainer: old.Name, cleanup: &cleanupRecord{CleanupID: strings.Repeat("c", 32), Active: activeRef, Old: oldRef, Phase: cleanupRetained}, status: siteupdate.Status{Supported: true, State: "completed", CurrentVersion: "v1.2.1"}}
	require.NoError(t, u.persist())
	return u, engine, proxy, transport
}

func TestCleanupCompletesAndAllowsNextUpdate(t *testing.T) {
	u, engine, _, _ := cleanupFixture(t)
	id := u.cleanup.CleanupID
	status, start, err := u.reserveCleanup(id)
	require.NoError(t, err)
	require.True(t, start)
	assert.False(t, *status.CanUpdate)
	_, start, err = u.reserveCleanup(id)
	require.NoError(t, err)
	assert.False(t, start)
	_, _, err = u.reserve("v1.2.2")
	assert.Error(t, err)
	u.runCleanup(id)
	assert.Equal(t, []string{strings.Repeat("a", 64)}, engine.stopCalls)
	assert.Equal(t, engine.stopCalls, engine.removeCalls)
	assert.False(t, engine.force)
	status = u.snapshot()
	assert.Equal(t, "ready", status.State)
	assert.True(t, *status.CanUpdate)
	assert.Nil(t, status.Cleanup)
	_, start, err = u.reserveCleanup(id)
	require.NoError(t, err)
	assert.False(t, start)
	state, err := u.store.load()
	require.NoError(t, err)
	assert.Empty(t, state.DrainingContainer)
	assert.Equal(t, id, state.LastCleanupID)
	_, _, err = u.reserve("v1.2.2")
	require.NoError(t, err)
}

func TestCleanupRefusesUnsafeContainersWithoutDockerMutations(t *testing.T) {
	for _, scenario := range []string{"requests", "active-unready", "runtime-route", "disk-route", "identity", "network", "restarting"} {
		t.Run(scenario, func(t *testing.T) {
			u, engine, proxy, life := cleanupFixture(t)
			switch scenario {
			case "requests":
				life.safe = false
			case "active-unready":
				life.ready = false
			case "runtime-route":
				proxy.target = "10.0.0.2"
			case "disk-route":
				require.NoError(t, os.WriteFile(u.config.haproxyMap, []byte("active 10.0.0.2\n"), 0600))
			case "identity":
				c := engine.containers[u.cleanup.Old.ID]
				c.Labels = map[string]string{}
				engine.containers[c.ID] = c
			case "network":
				c := engine.containers[u.cleanup.Old.ID]
				c.NetworkSettings.Networks = map[string]dockerNetworkEndpoint{}
				engine.containers[c.ID] = c
			case "restarting":
				c := engine.containers[u.cleanup.Old.ID]
				c.State = dockerState{Restarting: true, Status: "restarting"}
				engine.containers[c.ID] = c
			}
			id := u.cleanup.CleanupID
			_, _, err := u.reserveCleanup(id)
			require.NoError(t, err)
			u.runCleanup(id)
			assert.Empty(t, engine.stopCalls)
			assert.Empty(t, engine.removeCalls)
			assert.False(t, *u.snapshot().CanUpdate)
			assert.True(t, u.snapshot().CanCleanup)
		})
	}
}

func TestCleanupPersistenceFailureBeforeAcceptanceHasNoSideEffects(t *testing.T) {
	u, engine, _, _ := cleanupFixture(t)
	u.store.saveOverride = func(persistedState) error { return errors.New("disk full") }
	_, start, err := u.reserveCleanup(u.cleanup.CleanupID)
	require.Error(t, err)
	assert.False(t, start)
	assert.Empty(t, engine.stopCalls)
	assert.Empty(t, engine.removeCalls)
	assert.False(t, *u.snapshot().CanUpdate)
}

func TestCleanupRetriesFinalSaveAfterDeleteAndRestart(t *testing.T) {
	u, engine, proxy, life := cleanupFixture(t)
	id := u.cleanup.CleanupID
	store := u.store
	u.store.saveOverride = func(state persistedState) error {
		if state.Cleanup == nil {
			return errors.New("disk full")
		}
		return store.save(state)
	}
	_, _, err := u.reserveCleanup(id)
	require.NoError(t, err)
	u.runCleanup(id)
	require.Nil(t, engine.containers[strings.Repeat("a", 64)].Labels)
	assert.False(t, *u.snapshot().CanUpdate)
	assert.NotNil(t, u.cleanup)
	state, err := store.load()
	require.NoError(t, err)
	require.Equal(t, cleanupRemoveRequested, state.Cleanup.Phase)
	restored := &controller{config: u.config, store: store, engine: engine, proxy: proxy, client: &http.Client{Transport: life}, status: state.Status, active: state.ActiveContainer, activeRef: state.ActiveRef, drainingContainer: state.DrainingContainer, cleanup: state.Cleanup}
	restored.runCleanup(id)
	assert.True(t, *restored.snapshot().CanUpdate)
	assert.Len(t, engine.removeCalls, 1)
}

func TestCleanupResumesBoundStoppedContainerButRejectsUnknownMissingName(t *testing.T) {
	u, engine, _, _ := cleanupFixture(t)
	id := u.cleanup.CleanupID
	u.cleanup.Phase = cleanupStopRequested
	old := engine.containers[u.cleanup.Old.ID]
	old.State = dockerState{Status: "exited"}
	old.NetworkSettings.Networks = map[string]dockerNetworkEndpoint{}
	engine.containers[old.ID] = old
	u.runCleanup(id)
	assert.Empty(t, engine.stopCalls)
	assert.Len(t, engine.removeCalls, 1)
	assert.True(t, *u.snapshot().CanUpdate)
	legacy, legacyEngine, _, _ := cleanupFixture(t)
	delete(legacyEngine.containers, legacy.cleanup.Old.ID)
	legacy.cleanup = nil
	err := legacy.prepareRetainedCleanup(context.Background())
	assert.Error(t, err)
	assert.False(t, *legacy.snapshot().CanUpdate)
}

func TestCleanupDoesNotDeleteAReplacementWithTheSameName(t *testing.T) {
	u, engine, _, _ := cleanupFixture(t)
	id := u.cleanup.CleanupID
	u.cleanup.Phase = cleanupRemoveRequested
	replacement := engine.containers[u.cleanup.Old.ID]
	delete(engine.containers, u.cleanup.Old.ID)
	replacement.ID = strings.Repeat("d", 64)
	engine.containers[replacement.ID] = replacement
	u.runCleanup(id)
	assert.Contains(t, engine.containers, replacement.ID)
	assert.Empty(t, engine.removeCalls)
}

func TestCleanupReservationSerializesConcurrentRequests(t *testing.T) {
	u, _, _, _ := cleanupFixture(t)
	id := u.cleanup.CleanupID
	var group sync.WaitGroup
	starts := make(chan bool, 2)
	for range 2 {
		group.Go(func() { _, start, err := u.reserveCleanup(id); assert.NoError(t, err); starts <- start })
	}
	group.Wait()
	close(starts)
	count := 0
	for start := range starts {
		if start {
			count++
		}
	}
	assert.Equal(t, 1, count)
}

func TestHAProxyReadRequiresUniqueExactKey(t *testing.T) {
	for _, fixture := range []struct {
		content string
		runtime bool
		valid   bool
	}{
		{"active 10.0.0.3\nother 10.0.0.2\n", false, true},
		{"0x123 active 10.0.0.3\n", true, true},
		{"active 10.0.0.3\nactive 10.0.0.2\n", false, false},
		{"0x1 active 10.0.0.3\n0x2 active 10.0.0.2\n", true, false},
		{"other 10.0.0.3\n", false, false},
		{"active old-container\n", false, false},
	} {
		target, err := parseHAProxyTarget(fixture.content, "active", fixture.runtime)
		if fixture.valid {
			require.NoError(t, err)
			assert.Equal(t, "10.0.0.3", target)
		} else {
			assert.Error(t, err)
		}
	}
}

func TestDockerCleanupUsesInfiniteGracefulStopAndNonForceRemoval(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.RequestURI())
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	client := &dockerHTTPClient{client: server.Client(), baseURL: server.URL}
	require.NoError(t, client.Stop(context.Background(), strings.Repeat("a", 64)))
	require.NoError(t, client.Remove(context.Background(), strings.Repeat("a", 64), false))
	assert.Equal(t, []string{"POST /v1.41/containers/" + strings.Repeat("a", 64) + "/stop?t=-1", "DELETE /v1.41/containers/" + strings.Repeat("a", 64) + "?force=false"}, paths)
}

func TestLegacyDrainCanBindIDsBeforeDrainRequestWasSent(t *testing.T) {
	u, engine, _, life := cleanupFixture(t)
	u.cleanup = nil
	u.status.State = "draining"
	u.status.Draining = true
	u.status.TargetVersion = "v1.2.1"
	life.notDraining = true
	require.NoError(t, u.prepareRetainedCleanup(context.Background()))
	require.NotNil(t, u.cleanup)
	assert.False(t, u.snapshot().CanCleanup)
	u.resumeDrain()
	assert.Equal(t, 1, life.drainCalls)
	assert.Equal(t, "completed", u.snapshot().State)
	assert.True(t, u.snapshot().CanCleanup)
	assert.Empty(t, engine.stopCalls)
}

func TestSwitchRecoveryReadsActualRouteBeforeChangingActive(t *testing.T) {
	for _, target := range []string{"10.0.0.3", "10.0.0.2", "10.0.0.99"} {
		t.Run(target, func(t *testing.T) {
			u, engine, proxy, _ := cleanupFixture(t)
			from, to := u.cleanup.Old, u.cleanup.Active
			u.active, u.activeRef, u.cleanup, u.drainingContainer = from.Name, &from, nil, ""
			u.switchIntent = &switchIntent{From: from, To: to, TargetVersion: "v1.2.1"}
			u.status.State, u.status.OperationID = "operation", "switch-operation"
			proxy.target = target
			if target == "10.0.0.2" {
				// The old app is still receiving requests: it is not draining.
				u.client = &http.Client{Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) {
					return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"protocol":1,"ready":true,"draining":false}`)), Header: make(http.Header)}, nil
				})}
				require.NoError(t, os.WriteFile(u.config.haproxyMap, []byte("active 10.0.0.2\n"), 0600))
			}
			err := u.reconcileSwitch(context.Background())
			switch target {
			case "10.0.0.3":
				require.NoError(t, err)
				assert.Equal(t, to.ID, u.activeRef.ID)
				require.NotNil(t, u.cleanup)
				assert.Equal(t, from.ID, u.cleanup.Old.ID)
				assert.Equal(t, "draining", u.status.State)
			case "10.0.0.2":
				require.NoError(t, err)
				assert.Equal(t, from.ID, u.activeRef.ID)
				assert.Nil(t, u.switchIntent)
			default:
				assert.Error(t, err)
				assert.NotNil(t, u.switchIntent)
				assert.False(t, *u.snapshot().CanUpdate)
			}
			assert.Empty(t, engine.removeCalls)
		})
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCleanupAPIRejectsStaleIDAndExtraFields(t *testing.T) {
	u, engine, _, _ := cleanupFixture(t)
	for _, body := range []string{`{"cleanup_id":"dddddddddddddddddddddddddddddddd"}`, `{"cleanup_id":"cccccccccccccccccccccccccccccccc","force":true}`} {
		request := httptest.NewRequest(http.MethodPost, "/v1/cleanup", strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer "+u.config.token)
		response := httptest.NewRecorder()
		u.serve(response, request)
		assert.Contains(t, []int{http.StatusBadRequest, http.StatusConflict}, response.Code)
	}
	assert.Empty(t, engine.stopCalls)
	assert.Empty(t, engine.removeCalls)
}

func TestCleanupCannotStopBeforeSafetyProgressWasSaved(t *testing.T) {
	u, engine, _, _ := cleanupFixture(t)
	id := u.cleanup.CleanupID
	_, _, err := u.reserveCleanup(id)
	require.NoError(t, err)
	store := u.store
	u.store.saveOverride = func(state persistedState) error {
		if state.Cleanup.Phase == cleanupStopRequested {
			return errors.New("disk full")
		}
		return store.save(state)
	}
	u.runCleanup(id)
	assert.Empty(t, engine.stopCalls)
	assert.Empty(t, engine.removeCalls)
	assert.False(t, *u.snapshot().CanUpdate)
}

func TestCleanupRetriesDeleteWithoutRequiringStoppedIPAddress(t *testing.T) {
	u, engine, _, _ := cleanupFixture(t)
	id := u.cleanup.CleanupID
	engine.keepAfterRemove = true
	engine.removeError = &dockerHTTPError{StatusCode: 409}
	_, _, err := u.reserveCleanup(id)
	require.NoError(t, err)
	u.runCleanup(id)
	assert.Equal(t, "cleanup_failed", u.status.State)
	assert.False(t, *u.snapshot().CanUpdate)
	assert.Equal(t, cleanupRemoveRequested, u.cleanup.Phase)
	engine.keepAfterRemove = false
	_, _, err = u.reserveCleanup(id)
	require.NoError(t, err)
	u.runCleanup(id)
	assert.Len(t, engine.stopCalls, 1)
	assert.Len(t, engine.removeCalls, 2)
	assert.True(t, *u.snapshot().CanUpdate)
}

func TestCleanupReconcilesUnknownDockerResponses(t *testing.T) {
	u, engine, _, _ := cleanupFixture(t)
	engine.stopError = context.DeadlineExceeded
	engine.removeError = context.DeadlineExceeded
	id := u.cleanup.CleanupID
	_, _, err := u.reserveCleanup(id)
	require.NoError(t, err)
	u.runCleanup(id)
	assert.True(t, *u.snapshot().CanUpdate)
	assert.False(t, engine.force)
}

func TestCleanupMapReadUsesActualRuntimeSocket(t *testing.T) {
	directory, err := os.MkdirTemp("", "ymux-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(directory) })
	socketPath := filepath.Join(directory, "p.sock")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Skipf("Unix domain sockets unavailable: %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	received := make(chan string, 1)
	done := make(chan error, 1)
	go func() {
		connection, err := listener.Accept()
		if err != nil {
			done <- err
			return
		}
		defer connection.Close()
		_ = connection.SetDeadline(time.Now().Add(5 * time.Second))
		command := make([]byte, 1024)
		n, err := connection.Read(command)
		if err != nil {
			done <- err
			return
		}
		received <- string(command[:n])
		_, err = io.WriteString(connection, "0x123 active 10.0.0.3\n\n")
		done <- err
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	target, err := (haproxySocket{path: socketPath}).Target(ctx, "/etc/haproxy/update/update.map", "active")
	require.NoError(t, err)
	assert.Equal(t, "10.0.0.3", target)
	assert.Equal(t, "show map /etc/haproxy/update/update.map\n", <-received)
	require.NoError(t, <-done)
}

func TestCleanupRejectsAmbiguousSharedNetwork(t *testing.T) {
	u, engine, _, _ := cleanupFixture(t)
	active, old := engine.containers[u.cleanup.Active.ID], engine.containers[u.cleanup.Old.ID]
	active.NetworkSettings.Networks["second"] = dockerNetworkEndpoint{NetworkID: "network-2", IPAddress: "10.1.0.3"}
	old.NetworkSettings.Networks["second"] = dockerNetworkEndpoint{NetworkID: "network-2", IPAddress: "10.1.0.2"}
	_, _, err := u.sharedContainerRefs(active, old)
	assert.Error(t, err)
	u.config.dockerNetwork = "network-1"
	activeRef, oldRef, err := u.sharedContainerRefs(active, old)
	require.NoError(t, err)
	assert.Equal(t, "network-1", activeRef.NetworkID)
	assert.Equal(t, activeRef.NetworkID, oldRef.NetworkID)
}
