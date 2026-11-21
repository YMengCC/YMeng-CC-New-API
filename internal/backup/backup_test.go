package backup

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEncryptedArchiveRoundTripAndTamperDetection(t *testing.T) {
	directory := t.TempDir()
	inputPath := filepath.Join(directory, "input.zip")
	outputPath := filepath.Join(directory, "backup.nab")
	decryptedPath := filepath.Join(directory, "decrypted.zip")
	payload := []byte("backup payload with unicode 萌萌")
	require.NoError(t, os.WriteFile(inputPath, payload, 0600))
	require.NoError(t, encryptFile(inputPath, outputPath, "correct horse battery staple"))
	require.NoError(t, decryptFile(outputPath, decryptedPath, "correct horse battery staple"))
	actual, err := os.ReadFile(decryptedPath)
	require.NoError(t, err)
	require.Equal(t, payload, actual)

	contents, err := os.ReadFile(outputPath)
	require.NoError(t, err)
	contents[len(contents)-1] ^= 1
	require.NoError(t, os.WriteFile(outputPath, contents, 0600))
	require.Error(t, decryptFile(outputPath, decryptedPath, "correct horse battery staple"))
}

func TestDecodeValuePreservesLargeIntegerAndBinary(t *testing.T) {
	integer, err := decodeValue(EncodedValue{Type: "int", Value: "9223372036854770000"}, "BIGINT")
	require.NoError(t, err)
	require.Equal(t, int64(9223372036854770000), integer)

	binaryValue := encodeValue([]byte{0, 1, 255}, ColumnInfo{DatabaseType: "blob"})
	decoded, err := decodeValue(binaryValue, "blob")
	require.NoError(t, err)
	require.Equal(t, []byte{0, 1, 255}, decoded)
}
