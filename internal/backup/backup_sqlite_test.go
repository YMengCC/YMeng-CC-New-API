package backup

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestSQLiteBackupRestorePreservesBusinessRows(t *testing.T) {
	sourcePath := filepath.Join(t.TempDir(), "source.db")
	targetPath := filepath.Join(t.TempDir(), "target.db")

	source, sourceType, err := model.OpenDatabaseForBackup(sourcePath)
	require.NoError(t, err)
	sourceSQL, err := source.DB()
	require.NoError(t, err)
	defer sourceSQL.Close()
	require.NoError(t, model.AutoMigrateBackupSchema(source))
	require.NoError(t, source.Create(&model.User{
		Username:    "backup-user",
		Password:    "password-hash",
		DisplayName: "Backup User",
	}).Error)
	require.NoError(t, source.Create(&model.Option{Key: "backup.test", Value: "中文 value"}).Error)

	archivePath := filepath.Join(t.TempDir(), "backup.nab")
	_, err = Export(context.Background(), source, sourceType, "v1.2.3", archivePath, "test-password")
	require.NoError(t, err)

	result, err := Restore(context.Background(), archivePath, "test-password", targetPath, "v1.2.4")
	require.NoError(t, err)
	require.Greater(t, result.Rows, int64(0))

	target, _, err := model.OpenDatabaseForBackup(targetPath)
	require.NoError(t, err)
	targetSQL, err := target.DB()
	require.NoError(t, err)
	defer targetSQL.Close()
	var user model.User
	require.NoError(t, target.Where("username = ?", "backup-user").First(&user).Error)
	require.Equal(t, "Backup User", user.DisplayName)
	var option model.Option
	require.NoError(t, target.First(&option, "key = ?", "backup.test").Error)
	require.Equal(t, "中文 value", option.Value)
}
