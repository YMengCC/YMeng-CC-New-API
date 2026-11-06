package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/siteupdate"
)

const (
	cleanupRetained        = "retained"
	cleanupValidating      = "validating"
	cleanupStopRequested   = "stop_requested"
	cleanupStopped         = "stopped"
	cleanupRemoveRequested = "remove_requested"
	reconcileInterval      = 5 * time.Second
	cleanupRetryInterval   = 30 * time.Second
)

func validHexID(value string, size int) bool {
	if len(value) != size {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && hex.EncodeToString(decoded) == value
}

func validatePersistedReferences(state persistedState) error {
	validRef := func(ref containerRef) bool {
		return validHexID(ref.ID, 64) && ref.Name != "" && ref.NetworkID != ""
	}
	if state.ActiveRef != nil && !validRef(*state.ActiveRef) {
		return fmt.Errorf("invalid active container reference")
	}
	if state.Cleanup != nil {
		record := state.Cleanup
		if !validHexID(record.CleanupID, 32) || !validRef(record.Active) || !validRef(record.Old) || record.Active.ID == record.Old.ID || record.Active.NetworkID != record.Old.NetworkID ||
			!slices.Contains([]string{cleanupRetained, cleanupValidating, cleanupStopRequested, cleanupStopped, cleanupRemoveRequested}, record.Phase) {
			return fmt.Errorf("invalid cleanup record")
		}
		if state.ActiveRef == nil || *state.ActiveRef != record.Active || state.ActiveContainer != record.Active.Name || state.DrainingContainer != record.Old.Name {
			return fmt.Errorf("inconsistent cleanup references")
		}
	}
	if state.SwitchIntent != nil {
		intent := state.SwitchIntent
		if !validRef(intent.From) || !validRef(intent.To) || intent.From.ID == intent.To.ID || intent.From.NetworkID != intent.To.NetworkID || intent.TargetVersion == "" || state.Cleanup != nil {
			return fmt.Errorf("invalid traffic switch intent")
		}
	}
	return nil
}

func (u *controller) persistedLocked() persistedState {
	return persistedState{
		SchemaVersion: 2, Status: u.status, ActiveContainer: u.active, DrainingContainer: u.drainingContainer,
		ActiveRef: u.activeRef, Cleanup: u.cleanup, SwitchIntent: u.switchIntent, LastCleanupID: u.lastCleanupID,
	}
}

func (u *controller) canUpdateLocked() bool {
	return u.status.Supported && !u.persistenceFailed && !u.workerRunning && u.status.OperationID == "" && !u.status.Draining &&
		u.drainingContainer == "" && u.cleanup == nil && u.switchIntent == nil && (u.status.State == "ready" || u.status.State == "failed")
}

func (u *controller) snapshotLocked() siteupdate.Status {
	status := u.status
	status.CleanupSupported = true
	allowed := u.canUpdateLocked()
	status.CanUpdate = &allowed
	// Keep clients polling across the brief failure-persistence/worker-exit gap.
	if u.workerRunning && status.OperationID == "" {
		status.OperationID = "finishing"
	}
	status.CanCleanup = u.status.Supported && u.cleanup != nil && u.status.State == "cleanup_failed" &&
		!u.workerRunning && u.switchIntent == nil && u.status.OperationID == ""
	if u.cleanup != nil {
		status.Cleanup = &siteupdate.CleanupStatus{CleanupID: u.cleanup.CleanupID, TargetName: u.cleanup.Old.Name, Phase: u.cleanup.Phase, LastErrorCode: u.cleanup.LastErrorCode}
	}
	return status
}

func (u *controller) cleanupFailure(code string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.cleanupFailureLocked(code)
}

func (u *controller) cleanupFailureLocked(code string) {
	if u.cleanup == nil {
		return
	}
	record := *u.cleanup
	record.LastErrorCode = code
	u.cleanup = &record
	u.status.State = "cleanup_failed"
	u.status.OperationID = ""
	u.status.ReasonCode = code
	u.status.Reason = cleanupReason(code)
	if code == "cleanup_not_drained" && u.status.Draining {
		u.status.State = "draining"
		u.status.Reason = "Traffic switched; the previous container is still draining and was retained."
	}
	u.nextReconcile = time.Now().Add(cleanupRetryInterval)
	common.SysLog(common.LogText("managed cleanup failed: cleanup_id=%s old_id=%s reason=%s", record.CleanupID, record.Old.ID, code))
	if err := u.persistLocked(); err != nil {
		common.SysError("managed cleanup failure could not be persisted")
	}
}

func cleanupReason(code string) string {
	switch code {
	case "cleanup_not_drained":
		return "The previous instance is not safely drained. Wait for its requests to finish before retrying cleanup."
	case "cleanup_route_mismatch":
		return "Cleanup is blocked because the proxy route does not match the active instance."
	case "cleanup_persistence_failed":
		return "Cleanup could not save its progress. Check controller storage and retry."
	case "cleanup_stop_pending":
		return "The previous instance has not finished stopping. Retry cleanup after it stops."
	case "cleanup_remove_failed":
		return "The previous instance could not be removed. Check the controller and retry cleanup."
	case "cleanup_identity_mismatch":
		return "Cleanup could not verify the retained instance identity. No container was removed."
	case "cleanup_engine_unavailable":
		return "The container engine is temporarily unavailable. Cleanup will retry automatically."
	default:
		return "Cleanup could not verify the active instance. Check the controller and retry."
	}
}

func cleanupError(code string) *siteupdate.OperationError {
	message := "Cleanup is not available in the current controller state."
	switch code {
	case "cleanup_conflict":
		message = "The cleanup confirmation is outdated or another operation is in progress. Refresh the update status."
	case "cleanup_invalid_request":
		message = "Invalid cleanup request."
	case "cleanup_persistence_failed":
		message = cleanupReason(code)
	}
	return &siteupdate.OperationError{Code: code, Message: message}
}

func (u *controller) reserveCleanup(id string) (siteupdate.Status, bool, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if !validHexID(id, 32) {
		return u.snapshotLocked(), false, cleanupError("cleanup_invalid_request")
	}
	if u.lastCleanupID == id {
		return u.snapshotLocked(), false, nil
	}
	if u.cleanup == nil || u.cleanup.CleanupID != id || u.switchIntent != nil {
		return u.snapshotLocked(), false, cleanupError("cleanup_conflict")
	}
	if u.workerRunning {
		if u.status.State == "cleaning" {
			return u.snapshotLocked(), false, nil
		}
		return u.snapshotLocked(), false, cleanupError("cleanup_conflict")
	}
	if !u.status.Supported || (u.status.Draining && u.status.State != "cleanup_failed") || u.status.OperationID != "" {
		return u.snapshotLocked(), false, cleanupError("cleanup_unavailable")
	}
	return u.acceptCleanupLocked()
}

// acceptCleanupLocked persists a cleanup reservation while the caller owns the worker.
func (u *controller) acceptCleanupLocked() (siteupdate.Status, bool, error) {
	id := u.cleanup.CleanupID
	record := *u.cleanup
	if record.Phase == cleanupRetained {
		record.Phase = cleanupValidating
	}
	record.LastErrorCode = ""
	state := u.persistedLocked()
	state.Cleanup = &record
	state.Status.State = "cleaning"
	state.Status.OperationID = id
	state.Status.ReasonCode = ""
	state.Status.Reason = "Cleaning up the previous instance. The active service remains available."
	if err := u.store.save(state); err != nil {
		u.persistenceFailed = true
		u.cleanupFailureLocked("cleanup_persistence_failed")
		return u.snapshotLocked(), false, cleanupError("cleanup_persistence_failed")
	}
	u.cleanup, u.status = &record, state.Status
	u.persistenceFailed = false
	u.workerRunning = true
	return u.snapshotLocked(), true, nil
}

func (u *controller) startCleanup(id string) (siteupdate.Status, error) {
	status, start, err := u.reserveCleanup(id)
	if start {
		go u.runCleanup(id)
	}
	return status, err
}

func (u *controller) cleanupPhase(id, phase string) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.cleanup == nil || u.cleanup.CleanupID != id {
		return cleanupError("cleanup_conflict")
	}
	record := *u.cleanup
	record.Phase = phase
	state := u.persistedLocked()
	state.Cleanup = &record
	if err := u.store.save(state); err != nil {
		u.persistenceFailed = true
		return err
	}
	u.cleanup = &record
	u.persistenceFailed = false
	return nil
}

func (u *controller) validateCleanupActive(ctx context.Context, record cleanupRecord) error {
	active, err := u.engine.Inspect(ctx, record.Active.ID)
	if err != nil {
		if dockerNotFound(err) {
			return fmt.Errorf("cleanup_identity_mismatch")
		}
		return fmt.Errorf("cleanup_active_unavailable")
	}
	if active.ID != record.Active.ID || active.ID == record.Old.ID || active.Labels[managedLabel] != "true" {
		return fmt.Errorf("cleanup_identity_mismatch")
	}
	if !active.State.Running || active.State.Restarting || active.State.Dead {
		return fmt.Errorf("cleanup_active_unavailable")
	}
	address, err := addressOnNetwork(active, record.Active.NetworkID)
	if err != nil {
		return fmt.Errorf("cleanup_identity_mismatch")
	}
	life, err := u.lifecycle(ctx, address, http.MethodGet)
	if err != nil || life.Protocol != lifecycleProtocol || !life.Ready || life.Draining {
		return fmt.Errorf("cleanup_active_unavailable")
	}
	if err := u.verifyProxyTarget(ctx, address.host); err != nil {
		return fmt.Errorf("cleanup_route_mismatch")
	}
	return nil
}

func dockerNotFound(err error) bool {
	var engineError *dockerHTTPError
	return errors.As(err, &engineError) && engineError.StatusCode == http.StatusNotFound
}

func stableStopped(container dockerContainer) bool {
	return !container.State.Running && !container.State.Restarting && !container.State.Dead && container.State.Status == "exited"
}

func (u *controller) runCleanup(id string) {
	defer u.releaseWorker(id)
	ctx, cancel := context.WithTimeout(context.Background(), max(u.config.operationTimeout, 150*time.Second))
	defer cancel()
	u.mu.Lock()
	draining := u.status.Draining
	u.mu.Unlock()
	if draining {
		if err := u.resumeDrain(ctx); err != nil {
			u.cleanupFailure(err.Error())
			return
		}
	}
	u.cleanupInstance(ctx, id)
}

func (u *controller) cleanupInstance(ctx context.Context, id string) {
	u.mu.Lock()
	if u.cleanup == nil || u.cleanup.CleanupID != id {
		u.mu.Unlock()
		return
	}
	record := *u.cleanup
	u.mu.Unlock()
	if err := u.validateCleanupActive(ctx, record); err != nil {
		u.cleanupFailure(err.Error())
		return
	}
	old, err := u.engine.Inspect(ctx, record.Old.ID)
	if dockerNotFound(err) && record.Phase != cleanupRetained && record.Phase != cleanupValidating {
		u.finishCleanup(id)
		return
	}
	if err != nil && !dockerNotFound(err) {
		u.cleanupFailure("cleanup_engine_unavailable")
		return
	}
	if err != nil || old.ID != record.Old.ID || old.Labels[managedLabel] != "true" {
		u.cleanupFailure("cleanup_identity_mismatch")
		return
	}
	if old.State.Running {
		address, err := addressOnNetwork(old, record.Old.NetworkID)
		if err != nil {
			u.cleanupFailure("cleanup_identity_mismatch")
			return
		}
		life, lifeErr := u.lifecycle(ctx, address, http.MethodGet)
		if record.Phase == cleanupStopRequested && (lifeErr != nil || !life.Ready) {
			// A graceful stop accepted before a restart can still be in flight.
			// Wait for Docker to prove exit without signaling the process again.
			if err := u.waitCleanupStopped(ctx, record.Old.ID); err != nil {
				u.cleanupFailure("cleanup_stop_pending")
				return
			}
		} else {
			if lifeErr != nil || life.Protocol != lifecycleProtocol || !life.SafeToStop || !life.Ready || !life.Draining || life.ActiveRequests != 0 || life.PendingWrites != 0 {
				u.cleanupFailure("cleanup_not_drained")
				return
			}
			if err := u.cleanupPhase(id, cleanupStopRequested); err != nil {
				u.cleanupFailure("cleanup_persistence_failed")
				return
			}
			_ = u.engine.Stop(ctx, old.ID)
			old, err = u.engine.Inspect(ctx, record.Old.ID)
			if dockerNotFound(err) {
				u.finishCleanup(id)
				return
			}
			if err != nil || !stableStopped(old) {
				u.cleanupFailure("cleanup_stop_pending")
				return
			}
		}
	} else if !stableStopped(old) || record.Phase == cleanupRetained || record.Phase == cleanupValidating {
		// There is no persisted safety decision for a manually stopped instance.
		u.cleanupFailure("cleanup_identity_mismatch")
		return
	}
	if err := u.cleanupPhase(id, cleanupStopped); err != nil {
		u.cleanupFailure("cleanup_persistence_failed")
		return
	}
	if err := u.validateCleanupActive(ctx, record); err != nil {
		u.cleanupFailure(err.Error())
		return
	}
	if err := u.cleanupPhase(id, cleanupRemoveRequested); err != nil {
		u.cleanupFailure("cleanup_persistence_failed")
		return
	}
	_ = u.engine.Remove(ctx, record.Old.ID, false)
	if _, err := u.engine.Inspect(ctx, record.Old.ID); !dockerNotFound(err) {
		u.cleanupFailure("cleanup_remove_failed")
		return
	}
	u.finishCleanup(id)
}

func (u *controller) waitCleanupStopped(ctx context.Context, id string) error {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		container, err := u.engine.Inspect(ctx, id)
		if dockerNotFound(err) || (err == nil && container.ID == id && stableStopped(container)) {
			return nil
		}
		if err != nil || container.ID != id {
			return fmt.Errorf("cannot inspect stopping instance")
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (u *controller) releaseWorker(id string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.status.OperationID == id || u.status.OperationID == "" {
		u.workerRunning = false
	}
}

func (u *controller) finishCleanup(id string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.cleanup == nil || u.cleanup.CleanupID != id {
		return
	}
	state := u.persistedLocked()
	state.Cleanup = nil
	state.DrainingContainer = ""
	state.LastCleanupID = id
	state.Status.State = "ready"
	state.Status.OperationID, state.Status.TargetVersion, state.Status.ReasonCode = "", "", ""
	state.Status.Draining = false
	state.Status.Reason = "Previous instance cleanup completed. New updates can now be installed."
	if err := u.store.save(state); err != nil {
		u.cleanupFailureLocked("cleanup_persistence_failed")
		return
	}
	u.status, u.cleanup, u.drainingContainer, u.lastCleanupID = state.Status, nil, "", id
	u.persistenceFailed = false
	u.nextReconcile = time.Time{}
	common.SysLog(common.LogText("managed cleanup completed: cleanup_id=%s active_id=%s", id, state.ActiveRef.ID))
}

// prepareRetainedCleanup upgrades legacy name-only state while the old instance
// can still prove its identity and drain state. The caller owns the worker.
// A missing name is not success.
func (u *controller) prepareRetainedCleanup(ctx context.Context) error {
	u.mu.Lock()
	if u.cleanup != nil || u.drainingContainer == "" || u.switchIntent != nil {
		u.mu.Unlock()
		return nil
	}
	activeName, oldName := u.active, u.drainingContainer
	resumingDrain := u.status.Draining || u.status.State == "draining"
	u.mu.Unlock()
	active, err := u.engine.Inspect(ctx, activeName)
	if err != nil {
		if !dockerNotFound(err) {
			return fmt.Errorf("cleanup_engine_unavailable")
		}
		return fmt.Errorf("cleanup_identity_mismatch")
	}
	old, err := u.engine.Inspect(ctx, oldName)
	if err != nil && !dockerNotFound(err) {
		return fmt.Errorf("cleanup_engine_unavailable")
	}
	if err != nil || active.ID == old.ID || old.Labels[managedLabel] != "true" || !old.State.Running {
		return fmt.Errorf("cleanup_identity_mismatch")
	}
	activeRef, oldRef, err := u.sharedContainerRefs(active, old)
	if err != nil {
		return fmt.Errorf("cleanup_identity_mismatch")
	}
	id, err := newOperationID()
	if err != nil {
		return err
	}
	record := cleanupRecord{CleanupID: id, Active: activeRef, Old: oldRef, Phase: cleanupRetained}
	if err := u.validateCleanupActive(ctx, record); err != nil {
		return err
	}
	address, _ := addressOnNetwork(old, oldRef.NetworkID)
	life, err := u.lifecycle(ctx, address, http.MethodGet)
	if err != nil || life.Protocol != lifecycleProtocol || (!life.Draining && (!resumingDrain || !life.Ready)) {
		return fmt.Errorf("cleanup_not_drained")
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	state := u.persistedLocked()
	state.ActiveRef, state.Cleanup = &activeRef, &record
	if err := u.store.save(state); err != nil {
		u.persistenceFailed = true
		return fmt.Errorf("cleanup_persistence_failed")
	}
	u.activeRef, u.cleanup, u.persistenceFailed = &activeRef, &record, false
	return nil
}

func writeCleanupError(w http.ResponseWriter, status int, operationError *siteupdate.OperationError) {
	data, err := common.Marshal(operationError)
	if err != nil {
		http.Error(w, "encoding failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(status)
	_, _ = w.Write(data)
}

func (u *controller) runMaintenance(ctx context.Context) {
	ticker := time.NewTicker(reconcileInterval)
	defer ticker.Stop()
	for {
		if ctx.Err() != nil {
			return
		}
		u.reconcileRetainedState(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (u *controller) reconcileRetainedState(parent context.Context) {
	u.mu.Lock()
	if u.engine == nil || !u.status.Supported || u.workerRunning ||
		(u.cleanup == nil && u.switchIntent == nil && u.drainingContainer == "") || time.Now().Before(u.nextReconcile) {
		u.mu.Unlock()
		return
	}
	if u.switchIntent == nil && (u.status.ReasonCode == "cleanup_identity_mismatch" || u.status.ReasonCode == "cleanup_route_mismatch") {
		u.mu.Unlock()
		return
	}
	u.workerRunning = true
	needsSwitch := u.switchIntent != nil
	u.mu.Unlock()
	defer func() {
		u.mu.Lock()
		defer u.mu.Unlock()
		u.workerRunning = false
		if u.cleanup != nil || u.drainingContainer != "" || u.switchIntent != nil {
			u.nextReconcile = time.Now().Add(cleanupRetryInterval)
		}
	}()
	ctx, cancel := context.WithTimeout(parent, max(u.config.operationTimeout, 150*time.Second))
	defer cancel()
	if needsSwitch {
		if err := u.reconcileSwitch(ctx); err != nil {
			_ = u.setStatus(func(status *siteupdate.Status) {
				status.State = "blocked"
				status.OperationID = ""
				status.ReasonCode = "cleanup_route_mismatch"
				status.Reason = cleanupReason(status.ReasonCode)
			})
			return
		}
	}
	if err := u.prepareRetainedCleanup(ctx); err != nil {
		_ = u.setStatus(func(status *siteupdate.Status) {
			status.State = "cleanup_failed"
			status.OperationID = ""
			status.ReasonCode, status.Reason = err.Error(), cleanupReason(err.Error())
		})
		return
	}
	u.mu.Lock()
	if u.cleanup == nil || u.switchIntent != nil {
		u.mu.Unlock()
		return
	}
	resume := u.status.Draining || u.status.State == "draining"
	id := u.cleanup.CleanupID
	u.mu.Unlock()
	if resume {
		if err := u.resumeDrain(ctx); err != nil {
			u.cleanupFailure(err.Error())
			return
		}
	}
	u.mu.Lock()
	_, start, err := u.acceptCleanupLocked()
	u.mu.Unlock()
	if err != nil || !start {
		return
	}
	u.cleanupInstance(ctx, id)
}
