package common

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetUpdateLifecycleForTest() {
	updateLifecycle.activeRequests.Store(0)
	updateLifecycle.pendingWrites.Store(0)
	updateLifecycle.draining.Store(false)
	updateLifecycle.ready.Store(false)
}

func TestUpdateLifecycleWaitsForRequestsAndWrites(t *testing.T) {
	resetUpdateLifecycleForTest()
	t.Cleanup(resetUpdateLifecycleForTest)
	SetUpdateReady(true)
	if !BeginUpdateRequest() {
		t.Fatal("ready instance rejected a request")
	}
	BeginUpdateDrain()
	BeginUpdateWrite()
	status := UpdateLifecycle()
	if status.SafeToStop || status.ActiveRequests != 1 || status.PendingWrites != 1 {
		t.Fatalf("unexpected draining status: %+v", status)
	}
	EndUpdateRequest()
	EndUpdateWrite()
	status = UpdateLifecycle()
	if !status.SafeToStop {
		t.Fatalf("expected safe stop after all work completed: %+v", status)
	}
}

func TestUpdateLifecycleRejectsNewRequestsAfterDrain(t *testing.T) {
	resetUpdateLifecycleForTest()
	t.Cleanup(resetUpdateLifecycleForTest)
	SetUpdateReady(true)
	BeginUpdateDrain()
	if BeginUpdateRequest() {
		t.Fatal("draining instance accepted a new request")
	}
}

func TestEnsureManagedOrderEncryptionKey(t *testing.T) {
	t.Run("generates and persists stable 32-byte key across restarts", func(t *testing.T) {
		keyFile := filepath.Join(t.TempDir(), ".jingsoft_order_encryption_key")
		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY", "")
		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY_AUTO", "")
		t.Setenv("CAT"+"FK_ORDER_ENCRYPTION_KEY", "")

		require.NoError(t, EnsureManagedOrderEncryptionKey(keyFile))
		first := os.Getenv("JINGSOFT_ORDER_ENCRYPTION_KEY")
		decoded, err := base64.StdEncoding.DecodeString(first)
		require.NoError(t, err)
		assert.Len(t, decoded, 32)

		// Subsequent restart without env var loads the exact persisted key.
		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY", "")
		require.NoError(t, EnsureManagedOrderEncryptionKey(keyFile))
		assert.Equal(t, first, os.Getenv("JINGSOFT_ORDER_ENCRYPTION_KEY"))

		// Subsequent restart with controller _AUTO key yields to earlier persisted key.
		var other [32]byte
		other[0] = 0xff
		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(other[:]))
		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY_AUTO", "true")
		require.NoError(t, EnsureManagedOrderEncryptionKey(keyFile))
		assert.Equal(t, first, os.Getenv("JINGSOFT_ORDER_ENCRYPTION_KEY"))
	})

	t.Run("explicit operator env var takes precedence", func(t *testing.T) {
		var explicit [32]byte
		explicit[0] = 0x42
		explicitB64 := base64.StdEncoding.EncodeToString(explicit[:])
		keyFile := filepath.Join(t.TempDir(), ".jingsoft_order_encryption_key")

		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY", explicitB64)
		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY_AUTO", "")
		require.NoError(t, EnsureManagedOrderEncryptionKey(keyFile))
		assert.Equal(t, explicitB64, os.Getenv("JINGSOFT_ORDER_ENCRYPTION_KEY"))
		_, err := os.Stat(keyFile)
		assert.True(t, os.IsNotExist(err))
	})

	t.Run("migrates valid legacy env key and rejects corrupt persisted file", func(t *testing.T) {
		var legacy [32]byte
		legacy[0] = 0x7a
		legacyB64 := base64.StdEncoding.EncodeToString(legacy[:])
		keyFile := filepath.Join(t.TempDir(), ".jingsoft_order_encryption_key")

		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY", "")
		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY_AUTO", "")
		t.Setenv("CAT"+"FK_ORDER_ENCRYPTION_KEY", legacyB64)
		require.NoError(t, EnsureManagedOrderEncryptionKey(keyFile))
		assert.Equal(t, legacyB64, os.Getenv("JINGSOFT_ORDER_ENCRYPTION_KEY"))

		corruptFile := filepath.Join(t.TempDir(), "corrupt_key")
		require.NoError(t, os.WriteFile(corruptFile, []byte("not-32-bytes\n"), 0600))
		t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY", "")
		t.Setenv("CAT"+"FK_ORDER_ENCRYPTION_KEY", "")
		require.Error(t, EnsureManagedOrderEncryptionKey(corruptFile))
	})
}
