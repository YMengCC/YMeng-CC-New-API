package common

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
)

// UpdateLifecycleSnapshot is the private control-plane state exposed to the
// managed updater. It deliberately contains no credentials or request data.
type UpdateLifecycleSnapshot struct {
	Protocol       int    `json:"protocol"`
	Ready          bool   `json:"ready"`
	Draining       bool   `json:"draining"`
	ActiveRequests int64  `json:"active_requests"`
	PendingWrites  int64  `json:"pending_writes"`
	SafeToStop     bool   `json:"safe_to_stop"`
	Reason         string `json:"reason"`
}

var updateLifecycle struct {
	activeRequests atomic.Int64
	pendingWrites  atomic.Int64
	draining       atomic.Bool
	ready          atomic.Bool
}

func BeginUpdateRequest() bool {
	if updateLifecycle.draining.Load() {
		return false
	}
	updateLifecycle.activeRequests.Add(1)
	if updateLifecycle.draining.Load() {
		updateLifecycle.activeRequests.Add(-1)
		return false
	}
	return true
}

func EndUpdateRequest() {
	updateLifecycle.activeRequests.Add(-1)
}

func BeginUpdateWrite() {
	updateLifecycle.pendingWrites.Add(1)
}

func EndUpdateWrite() {
	updateLifecycle.pendingWrites.Add(-1)
}

func SetUpdateReady(ready bool) {
	updateLifecycle.ready.Store(ready)
}

func BeginUpdateDrain() {
	updateLifecycle.draining.Store(true)
}

func UpdateLifecycle() UpdateLifecycleSnapshot {
	active := updateLifecycle.activeRequests.Load()
	pending := updateLifecycle.pendingWrites.Load()
	ready := updateLifecycle.ready.Load()
	draining := updateLifecycle.draining.Load()
	reason := "ready"
	if !ready {
		reason = "application is not ready"
	} else if !draining {
		reason = "accepting requests"
	} else if active != 0 {
		reason = "waiting for active requests and streams"
	} else if pending != 0 {
		reason = "waiting for pending billing writes"
	}
	return UpdateLifecycleSnapshot{
		Protocol:       1,
		Ready:          ready,
		Draining:       draining,
		ActiveRequests: active,
		PendingWrites:  pending,
		SafeToStop:     ready && draining && active == 0 && pending == 0,
		Reason:         reason,
	}
}

const (
	jingSoftOrderEncryptionKeyEnv     = "JINGSOFT_ORDER_ENCRYPTION_KEY"
	jingSoftOrderEncryptionKeyAutoEnv = "JINGSOFT_ORDER_ENCRYPTION_KEY_AUTO"
	defaultManagedJingSoftKeyFile     = ".jingsoft_order_encryption_key"
)

func validOrderEncryptionKey(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false
	}
	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil || len(decoded) != 32 {
		return "", false
	}
	return trimmed, true
}

func generateOrderEncryptionKey() (string, error) {
	var key [32]byte
	if _, err := rand.Read(key[:]); err != nil {
		return "", fmt.Errorf("generate JingSoft order encryption key: %w", err)
	}
	return base64.StdEncoding.EncodeToString(key[:]), nil
}

// EnsureManagedOrderEncryptionKey guarantees a stable 32-byte Base64
// JINGSOFT_ORDER_ENCRYPTION_KEY across managed site updates when the operator
// did not explicitly configure one in the environment.
func EnsureManagedOrderEncryptionKey(keyFilePath string) error {
	current := strings.TrimSpace(os.Getenv(jingSoftOrderEncryptionKeyEnv))
	auto := os.Getenv(jingSoftOrderEncryptionKeyAutoEnv) == "true"
	if current != "" && !auto {
		return nil
	}
	if strings.TrimSpace(keyFilePath) == "" {
		keyFilePath = defaultManagedJingSoftKeyFile
	}
	if existing, err := os.ReadFile(keyFilePath); err == nil {
		if saved, ok := validOrderEncryptionKey(string(existing)); ok {
			return os.Setenv(jingSoftOrderEncryptionKeyEnv, saved)
		}
		if strings.TrimSpace(string(existing)) != "" {
			return fmt.Errorf("invalid managed JingSoft order encryption key file: %s", keyFilePath)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("read managed JingSoft order encryption key file: %w", err)
	}

	legacyEnv := "CAT" + "FK_ORDER_ENCRYPTION_KEY"
	candidate, ok := validOrderEncryptionKey(os.Getenv(legacyEnv))
	if !ok {
		candidate, ok = validOrderEncryptionKey(current)
	}
	if !ok {
		var err error
		candidate, err = generateOrderEncryptionKey()
		if err != nil {
			return err
		}
	}

	directory := filepath.Dir(keyFilePath)
	if directory != "." && directory != "" {
		if err := os.MkdirAll(directory, 0700); err != nil {
			return fmt.Errorf("create managed JingSoft key directory: %w", err)
		}
	}

	resolved := candidate
	created, err := writeExclusiveKeyFile(keyFilePath, candidate)
	if err != nil {
		return err
	}
	if !created {
		existing, readErr := os.ReadFile(keyFilePath)
		if readErr != nil {
			return fmt.Errorf("read concurrent managed JingSoft key file: %w", readErr)
		}
		winner, valid := validOrderEncryptionKey(string(existing))
		if !valid {
			return fmt.Errorf("concurrent managed JingSoft key file is invalid")
		}
		resolved = winner
	} else {
		SysLog(LogText("Initialized managed JingSoft order encryption key"))
	}
	return os.Setenv(jingSoftOrderEncryptionKeyEnv, resolved)
}

func writeExclusiveKeyFile(path, key string) (bool, error) {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".jingsoft-key-*")
	if err != nil {
		return false, fmt.Errorf("create temporary JingSoft key file: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0600); err != nil {
		_ = temporary.Close()
		return false, fmt.Errorf("chmod temporary JingSoft key file: %w", err)
	}
	if _, err := temporary.WriteString(key + "\n"); err != nil {
		_ = temporary.Close()
		return false, fmt.Errorf("write temporary JingSoft key file: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return false, fmt.Errorf("sync temporary JingSoft key file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return false, fmt.Errorf("close temporary JingSoft key file: %w", err)
	}
	if linkErr := os.Link(temporaryName, path); linkErr == nil {
		return true, nil
	} else if errors.Is(linkErr, os.ErrExist) {
		return false, nil
	}
	file, openErr := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if openErr != nil {
		if errors.Is(openErr, os.ErrExist) {
			return false, nil
		}
		return false, fmt.Errorf("persist managed JingSoft key file: %w", openErr)
	}
	if _, err := file.WriteString(key + "\n"); err != nil {
		_ = file.Close()
		return false, fmt.Errorf("write managed JingSoft key file: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return false, fmt.Errorf("sync managed JingSoft key file: %w", err)
	}
	if err := file.Close(); err != nil {
		return false, fmt.Errorf("close managed JingSoft key file: %w", err)
	}
	return true, nil
}
