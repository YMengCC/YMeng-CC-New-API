package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/siteupdate"
)

const (
	managedLabel       = "com.ymeng.update.managed"
	activeLabel        = "com.ymeng.update.active"
	candidateLabel     = "com.ymeng.update.candidate"
	lifecycleProtocol  = 1
	defaultControlPort = 3001
)

type updateConfig struct {
	token            string
	key              ed25519.PublicKey
	currentVersion   string
	platform         string
	database         string
	dockerSocket     string
	stateFile        string
	activeContainer  string
	haproxySocket    string
	haproxyMap       string
	haproxyMapKey    string
	internalPort     int
	operationTimeout time.Duration
	dockerNetwork    string
}

func loadConfig() (updateConfig, error) {
	config := updateConfig{
		token:            os.Getenv("UPDATE_CONTROL_TOKEN"),
		currentVersion:   strings.TrimSpace(os.Getenv("UPDATE_CURRENT_VERSION")),
		platform:         strings.TrimSpace(os.Getenv("UPDATE_PLATFORM")),
		database:         strings.TrimSpace(os.Getenv("UPDATE_DATABASE")),
		dockerSocket:     strings.TrimSpace(os.Getenv("UPDATE_DOCKER_SOCKET")),
		stateFile:        strings.TrimSpace(os.Getenv("UPDATE_STATE_FILE")),
		activeContainer:  strings.TrimSpace(os.Getenv("UPDATE_ACTIVE_CONTAINER")),
		haproxySocket:    strings.TrimSpace(os.Getenv("UPDATE_HAPROXY_SOCKET")),
		haproxyMap:       strings.TrimSpace(os.Getenv("UPDATE_HAPROXY_MAP")),
		haproxyMapKey:    strings.TrimSpace(os.Getenv("UPDATE_HAPROXY_MAP_KEY")),
		internalPort:     defaultControlPort,
		operationTimeout: 3 * time.Minute,
		dockerNetwork:    strings.TrimSpace(os.Getenv("UPDATE_DOCKER_NETWORK")),
	}
	missing := make([]string, 0)
	for name, value := range map[string]string{
		"UPDATE_CONTROL_TOKEN":    config.token,
		"UPDATE_CURRENT_VERSION":  config.currentVersion,
		"UPDATE_PLATFORM":         config.platform,
		"UPDATE_DATABASE":         config.database,
		"UPDATE_DOCKER_SOCKET":    config.dockerSocket,
		"UPDATE_STATE_FILE":       config.stateFile,
		"UPDATE_ACTIVE_CONTAINER": config.activeContainer,
		"UPDATE_HAPROXY_SOCKET":   config.haproxySocket,
		"UPDATE_HAPROXY_MAP":      config.haproxyMap,
		"UPDATE_HAPROXY_MAP_KEY":  config.haproxyMapKey,
	} {
		if value == "" {
			missing = append(missing, name)
		}
	}
	if len(config.token) < 32 {
		missing = append(missing, "UPDATE_CONTROL_TOKEN (at least 32 characters)")
	}
	publicKey, err := base64.StdEncoding.DecodeString(strings.TrimSpace(os.Getenv("UPDATE_RELEASE_PUBLIC_KEY")))
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		missing = append(missing, "UPDATE_RELEASE_PUBLIC_KEY (base64 Ed25519 public key)")
	} else {
		config.key = ed25519.PublicKey(publicKey)
	}
	for name, target := range map[string]*int{
		"UPDATE_INTERNAL_PORT": &config.internalPort,
	} {
		value := strings.TrimSpace(os.Getenv(name))
		if value == "" {
			continue
		}
		parsed, parseErr := strconv.Atoi(value)
		if parseErr != nil || parsed < 1 || parsed > 65535 {
			missing = append(missing, name+" (valid TCP port)")
			continue
		}
		*target = parsed
	}
	if value := strings.TrimSpace(os.Getenv("UPDATE_READINESS_TIMEOUT_SECONDS")); value != "" {
		seconds, parseErr := strconv.Atoi(value)
		if parseErr != nil || seconds < 10 || seconds > 3600 {
			missing = append(missing, "UPDATE_READINESS_TIMEOUT_SECONDS (10..3600)")
		} else {
			config.operationTimeout = time.Duration(seconds) * time.Second
		}
	}
	if len(missing) > 0 {
		slices.Sort(missing)
		return updateConfig{}, fmt.Errorf("missing or invalid managed update configuration: %s", strings.Join(missing, ", "))
	}
	return config, nil
}

type controller struct {
	mu                sync.Mutex
	config            updateConfig
	store             stateStore
	engine            dockerEngine
	client            *http.Client
	status            siteupdate.Status
	active            string
	drainingContainer string
	activeRef         *containerRef
	cleanup           *cleanupRecord
	switchIntent      *switchIntent
	lastCleanupID     string
	persistenceFailed bool
	workerRunning     bool
	nextReconcile     time.Time
	proxy             proxyRuntime
}

type githubRelease struct {
	Tag        string `json:"tag_name"`
	Name       string `json:"name"`
	Published  string `json:"published_at"`
	URL        string `json:"html_url"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
	Assets     []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

func newController(config updateConfig, engine dockerEngine, client *http.Client) (*controller, error) {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 5 || request.URL.Scheme != "https" {
				return fmt.Errorf("refusing release download redirect")
			}
			return nil
		}}
	}
	controller := &controller{
		config: config,
		store:  stateStore{path: config.stateFile},
		engine: engine,
		client: client,
		active: config.activeContainer,
		proxy:  haproxySocket{path: config.haproxySocket},
		status: siteupdate.Status{
			Supported:      true,
			CurrentVersion: config.currentVersion,
			State:          "ready",
			Reason:         "Managed update controller is ready.",
		},
	}
	state, err := controller.store.load()
	if err != nil {
		controller.status = siteupdate.Status{State: "unconfigured", Reason: "Cannot read managed update state: " + err.Error()}
		return controller, nil
	}
	if state.ActiveContainer != "" {
		controller.active = state.ActiveContainer
	}
	if state.Status.CurrentVersion != "" {
		controller.status.CurrentVersion = state.Status.CurrentVersion
	}
	if state.Status.State != "" {
		controller.status = state.Status
		controller.status.Supported = true
	}
	controller.drainingContainer = state.DrainingContainer
	controller.activeRef = state.ActiveRef
	controller.cleanup = state.Cleanup
	controller.switchIntent = state.SwitchIntent
	controller.lastCleanupID = state.LastCleanupID
	if engine != nil && (controller.cleanup != nil || controller.switchIntent != nil || controller.drainingContainer != "") {
		// The background worker reconciles retained state before any cleanup.
		return controller, nil
	}
	if controller.status.OperationID != "" && controller.status.State != "draining" {
		controller.status.State = "failed"
		controller.status.Reason = "Controller restarted during an update; existing containers were retained and no automatic rollback was attempted."
		controller.status.OperationID = ""
		controller.status.TargetVersion = ""
		controller.status.Draining = false
		controller.drainingContainer = ""
		if err := controller.persist(); err != nil {
			return controller, err
		}
	}
	if engine != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		var restoreErr error
		for {
			restoreErr = restoreHAProxyMap(ctx, controller)
			if restoreErr == nil {
				break
			}
			select {
			case <-ctx.Done():
				cancel()
				common.SysError("managed update HAProxy restore failed: " + restoreErr.Error())
				controller.status.State = "blocked"
				controller.status.Reason = "Persisted active container could not restore the HAProxy map: " + restoreErr.Error()
				controller.status.OperationID = ""
				controller.status.TargetVersion = ""
				controller.status.Draining = false
				_ = controller.persist()
				return controller, nil
			case <-time.After(2 * time.Second):
			}
		}
		cancel()
		if controller.drainingContainer == "" {
			controller.status.State = "ready"
			controller.status.Reason = "Managed update controller is ready."
			controller.status.OperationID = ""
			controller.status.TargetVersion = ""
			controller.status.Draining = false
		} else {
			controller.status.State = "draining"
			controller.status.Draining = true
		}
		if err := controller.persist(); err != nil {
			return controller, err
		}
	}
	return controller, nil
}

func (u *controller) persist() error {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.persistLocked()
}

func (u *controller) persistLocked() error {
	err := u.store.save(u.persistedLocked())
	u.persistenceFailed = err != nil
	return err
}

func (u *controller) snapshot() siteupdate.Status {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.snapshotLocked()
}

func (u *controller) setStatus(update func(*siteupdate.Status)) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	update(&u.status)
	return u.persistLocked()
}

func (u *controller) get(ctx context.Context, address string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	response, err := u.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("release source returned HTTP %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if len(data) > 1<<20 {
		return nil, fmt.Errorf("release response too large")
	}
	return data, err
}

func (u *controller) releases(ctx context.Context) (siteupdate.ReleaseList, error) {
	data, err := u.get(ctx, "https://api.github.com/repos/"+siteupdate.Repository+"/releases?per_page=30")
	if err != nil {
		return siteupdate.ReleaseList{}, err
	}
	var published []githubRelease
	if err := common.Unmarshal(data, &published); err != nil {
		return siteupdate.ReleaseList{}, err
	}
	current := u.snapshot().CurrentVersion
	list := siteupdate.ReleaseList{Releases: []siteupdate.Release{}}
	for _, release := range published {
		if release.Draft || release.Prerelease {
			continue
		}
		item := siteupdate.Release{
			Tag:         release.Tag,
			Name:        release.Name,
			PublishedAt: release.Published,
			URL:         release.URL,
			Reason:      "This release has no verified online-update compatibility manifest.",
		}
		manifestURL, signatureURL := "", ""
		prefix := "https://github.com/" + siteupdate.Repository + "/releases/download/"
		for _, asset := range release.Assets {
			if !strings.HasPrefix(asset.URL, prefix) {
				continue
			}
			switch asset.Name {
			case "update-manifest.json":
				manifestURL = asset.URL
			case "update-manifest.sig":
				signatureURL = asset.URL
			}
		}
		if manifestURL == "" || signatureURL == "" {
			list.Releases = append(list.Releases, item)
			continue
		}
		manifest, manifestErr := u.get(ctx, manifestURL)
		signature, signatureErr := u.get(ctx, signatureURL)
		if manifestErr != nil || signatureErr != nil {
			common.SysError("managed update manifest download failed for " + release.Tag)
			list.Releases = append(list.Releases, item)
			continue
		}
		decoded, decodeErr := base64.StdEncoding.DecodeString(strings.TrimSpace(string(signature)))
		if decodeErr != nil {
			list.Releases = append(list.Releases, item)
			continue
		}
		compatibility, verifyErr := verifyCompatibilityManifest(u.config.key, release.Tag, manifest, decoded)
		if verifyErr != nil {
			common.SysError("managed update manifest verification failed for " + release.Tag + ": " + verifyErr.Error())
			list.Releases = append(list.Releases, item)
			continue
		}
		item.Image = compatibility.Image
		item.Compatible, item.Reason = u.compatibility(compatibility, current)
		list.Releases = append(list.Releases, item)
	}
	return list, nil
}

func verifyCompatibilityManifest(key ed25519.PublicKey, tag string, manifest, signature []byte) (siteupdate.Compatibility, error) {
	if len(key) != ed25519.PublicKeySize || !ed25519.Verify(key, manifest, signature) {
		return siteupdate.Compatibility{}, fmt.Errorf("compatibility manifest signature is invalid")
	}
	var compatibility siteupdate.Compatibility
	if err := common.Unmarshal(manifest, &compatibility); err != nil {
		return siteupdate.Compatibility{}, fmt.Errorf("compatibility manifest is invalid: %w", err)
	}
	if compatibility.Version != tag || !validImageDigest(compatibility.Image) {
		return siteupdate.Compatibility{}, fmt.Errorf("compatibility manifest does not match the release")
	}
	return compatibility, nil
}

func (u *controller) compatibility(manifest siteupdate.Compatibility, current string) (bool, string) {
	if !manifest.SchemaUnchanged || !manifest.SharedStateCompatible {
		return false, "Release compatibility has not approved schema or shared-state migration."
	}
	// Sources are signed and retained for audit, but any older release may
	// update straight to this version; only downgrades are refused.
	if comparison, ok := compareReleaseVersions(manifest.Version, current); ok && comparison < 0 {
		return false, "Release is older than the current version."
	}
	if !slices.Contains(manifest.Platforms, u.config.platform) {
		return false, "Release is not approved for this platform."
	}
	if !slices.Contains(manifest.Databases, u.config.database) {
		return false, "Release is not approved for this database."
	}
	return true, ""
}

// compareReleaseVersions compares numeric release tags such as v1.2.17. Build
// metadata is ignored and the leading v is optional; unparsable values report
// ok=false so the caller can skip the ordering check.
func compareReleaseVersions(left, right string) (int, bool) {
	a, ok := parseReleaseVersion(left)
	if !ok {
		return 0, false
	}
	b, ok := parseReleaseVersion(right)
	if !ok {
		return 0, false
	}
	for i := range max(len(a), len(b)) {
		leftPart, rightPart := int64(0), int64(0)
		if i < len(a) {
			leftPart = a[i]
		}
		if i < len(b) {
			rightPart = b[i]
		}
		if leftPart != rightPart {
			if leftPart < rightPart {
				return -1, true
			}
			return 1, true
		}
	}
	return 0, true
}

func parseReleaseVersion(value string) ([]int64, bool) {
	value = strings.TrimPrefix(strings.TrimSpace(value), "v")
	if base, _, found := strings.Cut(value, "+"); found {
		value = base
	}
	parts := strings.Split(value, ".")
	if len(parts) < 3 {
		return nil, false
	}
	numbers := make([]int64, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			return nil, false
		}
		number, err := strconv.ParseInt(part, 10, 64)
		if err != nil || number < 0 {
			return nil, false
		}
		numbers = append(numbers, number)
	}
	return numbers, true
}

func validImageDigest(image string) bool {
	prefix := siteupdate.ImageRepository + "@sha256:"
	digest, ok := strings.CutPrefix(image, prefix)
	if !ok || len(digest) != 64 {
		return false
	}
	for _, character := range digest {
		if !((character >= '0' && character <= '9') || (character >= 'a' && character <= 'f')) {
			return false
		}
	}
	return true
}

func (u *controller) compatibleRelease(ctx context.Context, tag string) (siteupdate.Release, error) {
	list, err := u.releases(ctx)
	if err != nil {
		return siteupdate.Release{}, err
	}
	for _, release := range list.Releases {
		if release.Tag == tag {
			if !release.Compatible || !validImageDigest(release.Image) {
				return siteupdate.Release{}, fmt.Errorf("requested release is not verified compatible")
			}
			return release, nil
		}
	}
	return siteupdate.Release{}, fmt.Errorf("requested release was not found")
}

func (u *controller) reserve(tag string) (string, siteupdate.Status, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if !u.status.Supported {
		return "", u.status, fmt.Errorf("managed update controller is not configured")
	}
	if u.status.OperationID != "" || u.workerRunning {
		return "", u.snapshotLocked(), fmt.Errorf("an update operation is already in progress")
	}
	if !u.canUpdateLocked() {
		return "", u.snapshotLocked(), fmt.Errorf("the controller is not ready for another update")
	}
	if u.drainingContainer != "" {
		return "", u.status, fmt.Errorf("the previous container is retained; manual cleanup is required before another update")
	}
	operationID, err := newOperationID()
	if err != nil {
		return "", u.status, err
	}
	u.status.State = "operation"
	u.status.Reason = "Verifying the signed release and active container."
	u.status.TargetVersion = tag
	u.status.OperationID = operationID
	u.status.Draining = false
	if err := u.persistLocked(); err != nil {
		u.status.OperationID = ""
		u.status.TargetVersion = ""
		u.status.State = "failed"
		return "", u.status, err
	}
	u.workerRunning = true
	return operationID, u.snapshotLocked(), nil
}

func newOperationID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(value[:]), nil
}

func (u *controller) startUpdate(ctx context.Context, tag string) (siteupdate.Status, error) {
	operationID, status, err := u.reserve(tag)
	if err != nil {
		return status, err
	}
	go u.runUpdate(operationID, tag)
	return status, nil
}

func (u *controller) runUpdate(operationID, tag string) {
	defer func() {
		u.releaseWorker(operationID)
		u.reconcileRetainedState(context.Background())
	}()
	ctx, cancel := context.WithTimeout(context.Background(), u.config.operationTimeout)
	defer cancel()
	fail := func(reason string, _ string) {
		_ = u.setStatus(func(status *siteupdate.Status) {
			status.State = "failed"
			status.Reason = reason
			status.OperationID = ""
			status.TargetVersion = ""
			status.Draining = false
		})
		u.mu.Lock()
		u.drainingContainer = ""
		_ = u.persistLocked()
		u.mu.Unlock()
	}

	release, err := u.compatibleRelease(ctx, tag)
	if err != nil {
		fail("Update refused: "+err.Error(), "")
		return
	}
	if err := u.engine.Pull(ctx, release.Image); err != nil {
		fail("Cannot pull the verified candidate image: "+err.Error(), "")
		return
	}
	activeName := u.currentContainer()
	u.mu.Lock()
	activeID := activeName
	if u.activeRef != nil {
		activeID = u.activeRef.ID
	}
	u.mu.Unlock()
	active, err := u.engine.Inspect(ctx, activeID)
	if err != nil {
		fail("Cannot inspect the configured active container.", "")
		return
	}
	if !active.State.Running || active.Labels[managedLabel] != "true" || active.Labels[activeLabel] != "true" {
		fail("The configured active container is not a running labeled managed application.", "")
		return
	}
	oldAddress, err := u.containerAddress(active)
	if err != nil {
		fail("The active container has no reachable Docker network address.", "")
		return
	}
	oldLifecycle, err := u.lifecycle(ctx, oldAddress, http.MethodGet)
	if err != nil || oldLifecycle.Protocol != lifecycleProtocol || !oldLifecycle.Ready || oldLifecycle.Draining {
		fail("The active application did not pass the readiness check.", "")
		return
	}

	candidateName := activeName + "-update-" + operationID[:8]
	candidateID, err := u.engine.Create(ctx, candidateName, release.Image, active)
	if err != nil {
		fail("Cannot create the candidate container from the labeled active application.", "")
		return
	}
	trafficSwitched := false
	intentSaved := false
	defer func() {
		if !trafficSwitched && !intentSaved {
			_ = u.engine.Remove(context.Background(), candidateID, true)
		}
	}()
	if err := u.engine.Start(ctx, candidateID); err != nil {
		fail("Candidate container failed to start.", candidateID)
		return
	}
	candidate, err := u.engine.Inspect(ctx, candidateID)
	if err != nil {
		fail("Cannot inspect the started candidate container.", candidateID)
		return
	}
	candidateAddress, err := u.containerAddress(candidate)
	if err != nil {
		fail("The candidate container has no reachable Docker network address.", candidateID)
		return
	}
	if err := u.waitReady(ctx, candidateAddress); err != nil {
		fail("Candidate readiness was not proven before switching traffic.", candidateID)
		return
	}
	toRef, fromRef, err := u.sharedContainerRefs(candidate, active)
	if err != nil {
		fail("Container identities or the shared network could not be verified.", candidateID)
		return
	}
	if err := u.verifyProxyTarget(ctx, oldAddress.host); err != nil {
		fail("The active proxy route could not be verified before updating.", candidateID)
		return
	}
	if err := u.prepareSwitch(fromRef, toRef, tag); err != nil {
		fail("Traffic switch intent could not be persisted.", candidateID)
		return
	}
	intentSaved = true
	if err := u.proxy.Select(ctx, u.config.haproxyMap, u.config.haproxyMapKey, candidateAddress.host); err != nil {
		_ = u.setStatus(func(status *siteupdate.Status) {
			status.State = "blocked"
			status.OperationID = ""
			status.Reason = "Traffic switch result is uncertain. Both instances were retained for recovery."
		})
		return
	}
	trafficSwitched = true
	if err := persistHAProxyMap(u.config.haproxyMap, u.config.haproxyMapKey, candidateAddress.host); err != nil {
		_ = u.setStatus(func(status *siteupdate.Status) {
			status.State = "blocked"
			status.OperationID = ""
			status.Reason = "Traffic switched, but the proxy route could not be persisted. Both instances were retained."
		})
		return
	}
	if err := u.verifyProxyTarget(ctx, candidateAddress.host); err != nil {
		_ = u.setStatus(func(status *siteupdate.Status) {
			status.State = "blocked"
			status.OperationID = ""
			status.Reason = "Traffic switch could not be verified. Both instances were retained."
		})
		return
	}
	if err := u.commitSwitch(); err != nil {
		common.SysError("managed update state persistence failed after traffic switch")
		return
	}
}

type containerAddressInfo struct {
	host string
}

func (u *controller) currentContainer() string {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.active
}

func (u *controller) containerAddress(container dockerContainer) (containerAddressInfo, error) {
	var selected *containerAddressInfo
	for name, endpoint := range container.NetworkSettings.Networks {
		if u.config.dockerNetwork != "" && name != u.config.dockerNetwork && endpoint.NetworkID != u.config.dockerNetwork {
			continue
		}
		if endpoint.IPAddress == "" {
			continue
		}
		if selected != nil {
			return containerAddressInfo{}, fmt.Errorf("container network is ambiguous; configure UPDATE_DOCKER_NETWORK")
		}
		address := containerAddressInfo{host: endpoint.IPAddress}
		selected = &address
	}
	if selected == nil {
		return containerAddressInfo{}, fmt.Errorf("container has no network address")
	}
	return *selected, nil
}

func (u *controller) lifecycle(ctx context.Context, address containerAddressInfo, method string) (common.UpdateLifecycleSnapshot, error) {
	controlAddress := "http://" + net.JoinHostPort(address.host, strconv.Itoa(u.config.internalPort)) + "/internal/update/status"
	if method == http.MethodPost {
		controlAddress = "http://" + net.JoinHostPort(address.host, strconv.Itoa(u.config.internalPort)) + "/internal/update/drain"
	}
	request, err := http.NewRequestWithContext(ctx, method, controlAddress, nil)
	if err != nil {
		return common.UpdateLifecycleSnapshot{}, err
	}
	request.Header.Set("Authorization", "Bearer "+u.config.token)
	response, err := u.client.Do(request)
	if err != nil {
		return common.UpdateLifecycleSnapshot{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return common.UpdateLifecycleSnapshot{}, fmt.Errorf("application lifecycle returned HTTP %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if err != nil {
		return common.UpdateLifecycleSnapshot{}, err
	}
	var snapshot common.UpdateLifecycleSnapshot
	if err := common.Unmarshal(data, &snapshot); err != nil {
		return common.UpdateLifecycleSnapshot{}, err
	}
	return snapshot, nil
}

func (u *controller) waitReady(ctx context.Context, address containerAddressInfo) error {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		snapshot, err := u.lifecycle(ctx, address, http.MethodGet)
		if err == nil && snapshot.Protocol == lifecycleProtocol && snapshot.Ready && !snapshot.Draining {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (u *controller) waitDrained(ctx context.Context, address containerAddressInfo) error {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		snapshot, err := u.lifecycle(ctx, address, http.MethodGet)
		if err == nil && snapshot.Protocol == lifecycleProtocol && snapshot.Ready && snapshot.Draining &&
			snapshot.SafeToStop && snapshot.ActiveRequests == 0 && snapshot.PendingWrites == 0 {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (u *controller) resumeDrain(ctx context.Context) error {
	u.mu.Lock()
	if u.cleanup == nil {
		u.mu.Unlock()
		return fmt.Errorf("cleanup_identity_mismatch")
	}
	record := *u.cleanup
	u.mu.Unlock()
	if err := u.validateCleanupActive(ctx, record); err != nil {
		return err
	}
	container, err := u.engine.Inspect(ctx, record.Old.ID)
	if err != nil {
		if dockerNotFound(err) {
			return fmt.Errorf("cleanup_identity_mismatch")
		}
		return fmt.Errorf("cleanup_engine_unavailable")
	}
	if container.ID != record.Old.ID || container.Labels[managedLabel] != "true" || !container.State.Running || container.State.Restarting || container.State.Dead {
		return fmt.Errorf("cleanup_identity_mismatch")
	}
	address, err := addressOnNetwork(container, record.Old.NetworkID)
	if err != nil {
		return fmt.Errorf("cleanup_identity_mismatch")
	}
	// Repeating drain is safe only after verifying the committed active route.
	if _, err := u.lifecycle(ctx, address, http.MethodPost); err != nil {
		return fmt.Errorf("cleanup_not_drained")
	}
	if err := u.waitDrained(ctx, address); err != nil {
		return fmt.Errorf("cleanup_not_drained")
	}
	if err := u.setStatus(func(status *siteupdate.Status) {
		status.State = "cleaning"
		if status.TargetVersion != "" {
			status.CurrentVersion = status.TargetVersion
		}
		status.TargetVersion = ""
		status.OperationID = ""
		status.Draining = false
		status.ReasonCode = ""
		status.Reason = "Cleaning up the previous instance. The active service remains available."
	}); err != nil {
		return fmt.Errorf("cleanup_persistence_failed")
	}
	return nil
}

func switchHAProxyMap(ctx context.Context, socketPath, mapPath, key, target string) error {
	for _, value := range []string{socketPath, mapPath, key, target} {
		if value == "" || strings.ContainsAny(value, "\r\n \t") {
			return fmt.Errorf("invalid HAProxy runtime-map argument")
		}
	}
	dialer := net.Dialer{}
	connection, err := dialer.DialContext(ctx, "unix", socketPath)
	if err != nil {
		return err
	}
	defer connection.Close()
	_ = connection.SetDeadline(time.Now().Add(10 * time.Second))
	command := "set map " + mapPath + " " + key + " " + target + "\n"
	written, err := connection.Write([]byte(command))
	if err != nil {
		return err
	}
	if written != len(command) {
		return fmt.Errorf("HAProxy runtime-map command was only partially written")
	}
	response, err := io.ReadAll(io.LimitReader(connection, 64<<10))
	if err != nil {
		return err
	}
	if message := strings.TrimSpace(strings.Trim(string(response), "\x00")); message != "" {
		return fmt.Errorf("HAProxy rejected runtime-map switch: %s", message)
	}
	return nil
}

func (u *controller) serve(w http.ResponseWriter, r *http.Request) {
	supplied, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || subtle.ConstantTimeCompare([]byte(supplied), []byte(u.config.token)) != 1 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	responseStatus := http.StatusOK
	var result any
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/v1/status":
		result = u.snapshot()
	case r.Method == http.MethodPost && r.URL.Path == "/v1/cleanup":
		var fields map[string]string
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4096))
		if err != nil || common.Unmarshal(body, &fields) != nil || len(fields) != 1 || !validHexID(fields["cleanup_id"], 32) {
			writeCleanupError(w, http.StatusBadRequest, cleanupError("cleanup_invalid_request"))
			return
		}
		status, err := u.startCleanup(fields["cleanup_id"])
		if err != nil {
			var operationError *siteupdate.OperationError
			if !errors.As(err, &operationError) {
				operationError = cleanupError("cleanup_unavailable")
			}
			code := http.StatusConflict
			if operationError.Code == "cleanup_persistence_failed" {
				code = http.StatusServiceUnavailable
			}
			writeCleanupError(w, code, operationError)
			return
		}
		responseStatus = http.StatusAccepted
		result = status
	case r.Method == http.MethodGet && r.URL.Path == "/v1/releases":
		releases, err := u.releases(r.Context())
		if err != nil {
			http.Error(w, "release source unavailable", http.StatusBadGateway)
			return
		}
		result = releases
	case r.Method == http.MethodPost && r.URL.Path == "/v1/update":
		var request siteupdate.UpdateRequest
		if err := common.DecodeJson(http.MaxBytesReader(w, r.Body, 4096), &request); err != nil || strings.TrimSpace(request.Tag) == "" {
			http.Error(w, "invalid update version", http.StatusBadRequest)
			return
		}
		status, err := u.startUpdate(r.Context(), strings.TrimSpace(request.Tag))
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		responseStatus = http.StatusAccepted
		result = status
	default:
		http.NotFound(w, r)
		return
	}
	data, err := common.Marshal(result)
	if err != nil {
		http.Error(w, "encoding failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(responseStatus)
	_, _ = w.Write(data)
}

func main() {
	config, err := loadConfig()
	if err != nil {
		panic(err)
	}
	engine, err := newDockerHTTPClient(config.dockerSocket)
	if err != nil {
		panic(err)
	}
	controller, err := newController(config, engine, nil)
	if err != nil {
		panic(err)
	}
	go controller.runMaintenance(context.Background())
	server := &http.Server{
		Addr:              ":8080",
		Handler:           http.HandlerFunc(controller.serve),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      120 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	if err := server.ListenAndServe(); err != nil {
		panic(err)
	}
}
