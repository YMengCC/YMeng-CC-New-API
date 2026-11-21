package backup

import (
	"archive/zip"
	"bufio"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"golang.org/x/crypto/argon2"
	"gorm.io/gorm"
)

const (
	FormatVersion       = "backup/v1"
	encryptedMagic      = "NABK001\x00"
	encryptionSaltSize  = 16
	encryptionNonceSize = 12
	encryptionChunkSize = 1024 * 1024
	maxEncryptedChunk   = 16 * 1024 * 1024
)

type Manifest struct {
	FormatVersion         string          `json:"format_version"`
	ApplicationVersion    string          `json:"application_version"`
	SourceDatabase        string          `json:"source_database"`
	SourceDatabaseVersion string          `json:"source_database_version,omitempty"`
	CreatedAt             string          `json:"created_at"`
	SensitiveDataIncluded bool            `json:"sensitive_data_included"`
	ExternalFilesIncluded bool            `json:"external_files_included"`
	LogsIncluded          bool            `json:"logs_included"`
	ExcludedTables        []string        `json:"excluded_tables"`
	Warnings              []string        `json:"warnings,omitempty"`
	Tables                []TableSnapshot `json:"tables"`
}

type TableSnapshot struct {
	Name    string       `json:"name"`
	Columns []ColumnInfo `json:"columns"`
	Rows    int64        `json:"rows"`
	SHA256  string       `json:"sha256"`
}

type ColumnInfo struct {
	Name          string `json:"name"`
	DatabaseType  string `json:"database_type"`
	Nullable      bool   `json:"nullable"`
	PrimaryKey    bool   `json:"primary_key"`
	AutoIncrement bool   `json:"auto_increment"`
}

type EncodedValue struct {
	Type  string `json:"type"`
	Value any    `json:"value,omitempty"`
}

type Row map[string]EncodedValue

type Result struct {
	ManifestPath string `json:"manifest_path"`
	OutputPath   string `json:"output_path"`
	Bytes        int64  `json:"bytes"`
	Tables       int    `json:"tables"`
	Rows         int64  `json:"rows"`
	SHA256       string `json:"sha256"`
}

type RestoreResult struct {
	SourceDatabase string `json:"source_database"`
	TargetDatabase string `json:"target_database"`
	Tables         int    `json:"tables"`
	Rows           int64  `json:"rows"`
}

func Export(ctx context.Context, db *gorm.DB, dbType common.DatabaseType, applicationVersion, outputPath, password string) (Result, error) {
	if db == nil {
		return Result{}, errors.New("source database is nil")
	}
	if strings.TrimSpace(password) == "" {
		return Result{}, errors.New("backup password is required")
	}
	if outputPath == "" {
		return Result{}, errors.New("backup output path is required")
	}
	if _, err := os.Stat(outputPath); err == nil {
		return Result{}, fmt.Errorf("backup output already exists: %s", outputPath)
	} else if !errors.Is(err, os.ErrNotExist) {
		return Result{}, err
	}

	catalog, err := model.BackupTableNames(db)
	if err != nil {
		return Result{}, err
	}
	manifest := Manifest{
		FormatVersion:         FormatVersion,
		ApplicationVersion:    applicationVersion,
		SourceDatabase:        string(dbType),
		CreatedAt:             time.Now().UTC().Format(time.RFC3339Nano),
		SensitiveDataIncluded: true,
		ExternalFilesIncluded: false,
		LogsIncluded:          false,
		ExcludedTables:        []string{"logs", "audit_logs", "system_tasks", "system_task_locks", "system_instances"},
		Warnings:              []string{"external invoice files are not included", "stop the application before running backup or restore"},
	}
	transaction := db.Begin(&sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if transaction.Error != nil {
		return Result{}, transaction.Error
	}
	defer transaction.Rollback()
	db = transaction.WithContext(ctx)

	workingDir := filepath.Dir(outputPath)
	if err := os.MkdirAll(workingDir, 0700); err != nil {
		return Result{}, err
	}
	zipFile, err := os.CreateTemp(workingDir, ".new-api-backup-*.zip")
	if err != nil {
		return Result{}, err
	}
	zipPath := zipFile.Name()
	defer os.Remove(zipPath)

	archive := zip.NewWriter(zipFile)
	var totalRows int64
	for _, table := range catalog {
		if err := ctx.Err(); err != nil {
			_ = archive.Close()
			_ = zipFile.Close()
			return Result{}, err
		}
		if isExcludedTable(table) || !db.Migrator().HasTable(table) {
			continue
		}
		snapshot, err := exportTable(ctx, db, dbType, archive, table)
		if err != nil {
			_ = archive.Close()
			_ = zipFile.Close()
			return Result{}, fmt.Errorf("export table %s: %w", table, err)
		}
		manifest.Tables = append(manifest.Tables, snapshot)
		totalRows += snapshot.Rows
	}

	manifestData, err := common.Marshal(manifest)
	if err != nil {
		_ = archive.Close()
		_ = zipFile.Close()
		return Result{}, err
	}
	manifestEntry, err := archive.Create("manifest.json")
	if err != nil {
		_ = archive.Close()
		_ = zipFile.Close()
		return Result{}, err
	}
	if _, err := manifestEntry.Write(manifestData); err != nil {
		_ = archive.Close()
		_ = zipFile.Close()
		return Result{}, err
	}
	if err := archive.Close(); err != nil {
		_ = zipFile.Close()
		return Result{}, err
	}
	if err := zipFile.Sync(); err != nil {
		_ = zipFile.Close()
		return Result{}, err
	}
	if err := zipFile.Close(); err != nil {
		return Result{}, err
	}
	if err := transaction.Commit().Error; err != nil {
		return Result{}, err
	}

	temporaryOutput, err := os.CreateTemp(workingDir, ".new-api-backup-*.enc")
	if err != nil {
		return Result{}, err
	}
	temporaryPath := temporaryOutput.Name()
	if err := temporaryOutput.Close(); err != nil {
		os.Remove(temporaryPath)
		return Result{}, err
	}
	defer os.Remove(temporaryPath)
	if err := encryptFile(zipPath, temporaryPath, password); err != nil {
		return Result{}, err
	}
	if err := os.Chmod(temporaryPath, 0600); err != nil {
		return Result{}, err
	}
	if err := os.Rename(temporaryPath, outputPath); err != nil {
		return Result{}, err
	}
	info, err := os.Stat(outputPath)
	if err != nil {
		return Result{}, err
	}
	checksum, err := fileSHA256(outputPath)
	if err != nil {
		return Result{}, err
	}
	return Result{
		ManifestPath: "manifest.json",
		OutputPath:   outputPath,
		Bytes:        info.Size(),
		Tables:       len(manifest.Tables),
		Rows:         totalRows,
		SHA256:       checksum,
	}, nil
}

func exportTable(ctx context.Context, db *gorm.DB, dbType common.DatabaseType, archive *zip.Writer, table string) (TableSnapshot, error) {
	columnTypes, err := db.Migrator().ColumnTypes(table)
	if err != nil {
		return TableSnapshot{}, err
	}
	columns := make([]ColumnInfo, 0, len(columnTypes))
	selectColumns := make([]string, 0, len(columnTypes))
	columnByName := make(map[string]ColumnInfo, len(columnTypes))
	for _, column := range columnTypes {
		name := column.Name()
		primaryKey, _ := column.PrimaryKey()
		autoIncrement, _ := column.AutoIncrement()
		nullable, _ := column.Nullable()
		info := ColumnInfo{
			Name:          name,
			DatabaseType:  column.DatabaseTypeName(),
			Nullable:      nullable,
			PrimaryKey:    primaryKey,
			AutoIncrement: autoIncrement,
		}
		columns = append(columns, info)
		columnByName[name] = info
		selectColumns = append(selectColumns, quoteIdentifier(dbType, name))
	}
	if len(columns) == 0 {
		return TableSnapshot{Name: table, Columns: columns}, nil
	}

	rows, err := db.Raw("SELECT " + strings.Join(selectColumns, ", ") + " FROM " + quoteIdentifier(dbType, table)).Rows()
	if err != nil {
		return TableSnapshot{}, err
	}
	defer rows.Close()

	entry, err := archive.Create("tables/" + table + ".jsonl")
	if err != nil {
		return TableSnapshot{}, err
	}
	hash := sha256.New()
	var count int64
	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return TableSnapshot{}, err
		}
		values := make([]any, len(columns))
		pointers := make([]any, len(values))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return TableSnapshot{}, err
		}
		row := make(Row, len(columns))
		for i, column := range columns {
			row[column.Name] = encodeValue(values[i], columnByName[column.Name])
		}
		line, err := common.Marshal(row)
		if err != nil {
			return TableSnapshot{}, err
		}
		line = append(line, '\n')
		if _, err := io.MultiWriter(entry, hash).Write(line); err != nil {
			return TableSnapshot{}, err
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return TableSnapshot{}, err
	}
	return TableSnapshot{
		Name:    table,
		Columns: columns,
		Rows:    count,
		SHA256:  fmt.Sprintf("%x", hash.Sum(nil)),
	}, nil
}

func Verify(ctx context.Context, archivePath, password string) (Manifest, error) {
	reader, cleanup, err := openArchive(archivePath, password)
	if err != nil {
		return Manifest{}, err
	}
	defer cleanup()
	manifest, err := readManifest(reader)
	if err != nil {
		return Manifest{}, err
	}
	for _, snapshot := range manifest.Tables {
		if err := ctx.Err(); err != nil {
			return Manifest{}, err
		}
		entry, err := reader.Open("tables/" + snapshot.Name + ".jsonl")
		if err != nil {
			return Manifest{}, fmt.Errorf("open table %s: %w", snapshot.Name, err)
		}
		hash := sha256.New()
		scanner := bufio.NewScanner(entry)
		scanner.Buffer(make([]byte, 64*1024), 64*1024*1024)
		var rows int64
		for scanner.Scan() {
			line := append(append([]byte(nil), scanner.Bytes()...), '\n')
			var row Row
			if err := common.Unmarshal(scanner.Bytes(), &row); err != nil {
				return Manifest{}, fmt.Errorf("decode table %s row %d: %w", snapshot.Name, rows+1, err)
			}
			if _, err := hash.Write(line); err != nil {
				return Manifest{}, err
			}
			rows++
		}
		scanErr := scanner.Err()
		_ = entry.Close()
		if scanErr != nil {
			return Manifest{}, scanErr
		}
		if rows != snapshot.Rows {
			return Manifest{}, fmt.Errorf("table %s row count mismatch: manifest=%d actual=%d", snapshot.Name, snapshot.Rows, rows)
		}
		if actual := fmt.Sprintf("%x", hash.Sum(nil)); actual != snapshot.SHA256 {
			return Manifest{}, fmt.Errorf("table %s checksum mismatch", snapshot.Name)
		}
	}
	return manifest, nil
}

func Restore(ctx context.Context, archivePath, password, targetDSN string, applicationVersion string) (RestoreResult, error) {
	manifest, err := Verify(ctx, archivePath, password)
	if err != nil {
		return RestoreResult{}, err
	}
	reader, cleanup, err := openArchive(archivePath, password)
	if err != nil {
		return RestoreResult{}, err
	}
	defer cleanup()
	manifest, err = readManifest(reader)
	if err != nil {
		return RestoreResult{}, err
	}
	if manifest.FormatVersion != FormatVersion {
		return RestoreResult{}, fmt.Errorf("unsupported backup format: %s", manifest.FormatVersion)
	}
	if isOlderApplicationVersion(applicationVersion, manifest.ApplicationVersion) {
		return RestoreResult{}, fmt.Errorf("target application version %s is older than backup version %s", applicationVersion, manifest.ApplicationVersion)
	}

	db, dbType, err := model.OpenDatabaseForBackup(targetDSN)
	if err != nil {
		return RestoreResult{}, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return RestoreResult{}, err
	}
	defer sqlDB.Close()
	if err := ensureTargetEmpty(db); err != nil {
		return RestoreResult{}, err
	}
	if err := model.AutoMigrateBackupSchema(db); err != nil {
		return RestoreResult{}, fmt.Errorf("create target schema: %w", err)
	}
	if err := setForeignKeys(dbType, db, false); err != nil {
		return RestoreResult{}, err
	}
	defer setForeignKeys(dbType, db, true)
	transaction := db.Begin()
	if transaction.Error != nil {
		return RestoreResult{}, transaction.Error
	}
	defer transaction.Rollback()
	db = transaction.WithContext(ctx)

	var totalRows int64
	for _, snapshot := range manifest.Tables {
		if err := ctx.Err(); err != nil {
			return RestoreResult{}, err
		}
		if isExcludedTable(snapshot.Name) {
			continue
		}
		entry, err := reader.Open("tables/" + snapshot.Name + ".jsonl")
		if err != nil {
			return RestoreResult{}, err
		}
		restoreErr := restoreTable(ctx, db, dbType, snapshot, entry)
		_ = entry.Close()
		if restoreErr != nil {
			return RestoreResult{}, fmt.Errorf("restore table %s: %w", snapshot.Name, restoreErr)
		}
		totalRows += snapshot.Rows
		if err := resetSequences(db, dbType, snapshot); err != nil {
			return RestoreResult{}, fmt.Errorf("reset sequence for %s: %w", snapshot.Name, err)
		}
	}
	if err := transaction.Commit().Error; err != nil {
		return RestoreResult{}, err
	}
	return RestoreResult{
		SourceDatabase: manifest.SourceDatabase,
		TargetDatabase: string(dbType),
		Tables:         len(manifest.Tables),
		Rows:           totalRows,
	}, nil
}

func Inspect(ctx context.Context, archivePath, password string) (Manifest, error) {
	if err := ctx.Err(); err != nil {
		return Manifest{}, err
	}
	reader, cleanup, err := openArchive(archivePath, password)
	if err != nil {
		return Manifest{}, err
	}
	defer cleanup()
	return readManifest(reader)
}

func restoreTable(ctx context.Context, db *gorm.DB, dbType common.DatabaseType, snapshot TableSnapshot, entry io.Reader) error {
	columns := make([]string, 0, len(snapshot.Columns))
	placeholders := make([]string, 0, len(snapshot.Columns))
	for _, column := range snapshot.Columns {
		columns = append(columns, quoteIdentifier(dbType, column.Name))
		placeholders = append(placeholders, "?")
	}
	if len(columns) == 0 {
		return nil
	}
	statement := "INSERT INTO " + quoteIdentifier(dbType, snapshot.Name) + " (" + strings.Join(columns, ", ") + ") VALUES (" + strings.Join(placeholders, ", ") + ")"
	scanner := bufio.NewScanner(entry)
	scanner.Buffer(make([]byte, 64*1024), 64*1024*1024)
	for rowNumber := int64(1); scanner.Scan(); rowNumber++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		var row Row
		if err := common.Unmarshal(scanner.Bytes(), &row); err != nil {
			return fmt.Errorf("decode row %d: %w", rowNumber, err)
		}
		values := make([]any, len(snapshot.Columns))
		for i, column := range snapshot.Columns {
			encoded, ok := row[column.Name]
			if !ok {
				return fmt.Errorf("row %d is missing column %s", rowNumber, column.Name)
			}
			value, err := decodeValue(encoded, column.DatabaseType)
			if err != nil {
				return fmt.Errorf("row %d column %s: %w", rowNumber, column.Name, err)
			}
			values[i] = value
		}
		if err := db.Exec(statement, values...).Error; err != nil {
			return fmt.Errorf("insert row %d: %w", rowNumber, err)
		}
	}
	return scanner.Err()
}

func ensureTargetEmpty(db *gorm.DB) error {
	tables, err := db.Migrator().GetTables()
	if err != nil {
		return err
	}
	for _, table := range tables {
		if strings.HasPrefix(strings.ToLower(table), "sqlite_") {
			continue
		}
		var count int64
		if err := db.Table(table).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return fmt.Errorf("target database is not empty: table %s contains %d rows", table, count)
		}
	}
	return nil
}

func setForeignKeys(dbType common.DatabaseType, db *gorm.DB, enabled bool) error {
	switch dbType {
	case common.DatabaseTypeSQLite:
		value := "OFF"
		if enabled {
			value = "ON"
		}
		return db.Exec("PRAGMA foreign_keys = " + value).Error
	case common.DatabaseTypeMySQL:
		value := 0
		if enabled {
			value = 1
		}
		return db.Exec("SET FOREIGN_KEY_CHECKS = ?", value).Error
	default:
		return nil
	}
}

func resetSequences(db *gorm.DB, dbType common.DatabaseType, snapshot TableSnapshot) error {
	for _, column := range snapshot.Columns {
		if !column.AutoIncrement || !column.PrimaryKey {
			continue
		}
		switch dbType {
		case common.DatabaseTypeMySQL:
			var maxValue sql.NullInt64
			if err := db.Raw("SELECT MAX(" + quoteIdentifier(dbType, column.Name) + ") FROM " + quoteIdentifier(dbType, snapshot.Name)).Scan(&maxValue).Error; err != nil {
				return err
			}
			next := int64(1)
			if maxValue.Valid {
				next = maxValue.Int64 + 1
			}
			if err := db.Exec("ALTER TABLE " + quoteIdentifier(dbType, snapshot.Name) + " AUTO_INCREMENT = " + strconv.FormatInt(next, 10)).Error; err != nil {
				return err
			}
		case common.DatabaseTypePostgreSQL:
			var sequence string
			if err := db.Raw("SELECT pg_get_serial_sequence(?, ?)", snapshot.Name, column.Name).Scan(&sequence).Error; err != nil {
				return err
			}
			if sequence == "" {
				continue
			}
			var maxValue sql.NullInt64
			if err := db.Raw("SELECT MAX(" + quoteIdentifier(dbType, column.Name) + ") FROM " + quoteIdentifier(dbType, snapshot.Name)).Scan(&maxValue).Error; err != nil {
				return err
			}
			if maxValue.Valid {
				if err := db.Exec("SELECT setval(?, ?, true)", sequence, maxValue.Int64).Error; err != nil {
					return err
				}
			} else if err := db.Exec("SELECT setval(?, 1, false)", sequence).Error; err != nil {
				return err
			}
		case common.DatabaseTypeSQLite:
			var exists int
			if err := db.Raw("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'").Scan(&exists).Error; err != nil {
				return nil
			}
			if exists == 0 {
				return nil
			}
			if err := db.Exec("DELETE FROM sqlite_sequence WHERE name = ?", snapshot.Name).Error; err != nil {
				return err
			}
			var maxValue sql.NullInt64
			if err := db.Raw("SELECT MAX(" + quoteIdentifier(dbType, column.Name) + ") FROM " + quoteIdentifier(dbType, snapshot.Name)).Scan(&maxValue).Error; err != nil {
				return err
			}
			if maxValue.Valid {
				if err := db.Exec("INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)", snapshot.Name, maxValue.Int64).Error; err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func encodeValue(value any, column ColumnInfo) EncodedValue {
	if value == nil {
		return EncodedValue{Type: "null"}
	}
	switch value := value.(type) {
	case []byte:
		if isBinaryType(column.DatabaseType) {
			return EncodedValue{Type: "bytes", Value: base64.StdEncoding.EncodeToString(value)}
		}
		return EncodedValue{Type: "text", Value: string(value)}
	case time.Time:
		return EncodedValue{Type: "time", Value: value.UTC().Format(time.RFC3339Nano)}
	case bool:
		return EncodedValue{Type: "bool", Value: value}
	case string:
		return EncodedValue{Type: "text", Value: value}
	case int:
		return EncodedValue{Type: "int", Value: strconv.FormatInt(int64(value), 10)}
	case int8:
		return EncodedValue{Type: "int", Value: strconv.FormatInt(int64(value), 10)}
	case int16:
		return EncodedValue{Type: "int", Value: strconv.FormatInt(int64(value), 10)}
	case int32:
		return EncodedValue{Type: "int", Value: strconv.FormatInt(int64(value), 10)}
	case int64:
		return EncodedValue{Type: "int", Value: strconv.FormatInt(value, 10)}
	case uint:
		return EncodedValue{Type: "uint", Value: strconv.FormatUint(uint64(value), 10)}
	case uint8:
		return EncodedValue{Type: "uint", Value: strconv.FormatUint(uint64(value), 10)}
	case uint16:
		return EncodedValue{Type: "uint", Value: strconv.FormatUint(uint64(value), 10)}
	case uint32:
		return EncodedValue{Type: "uint", Value: strconv.FormatUint(uint64(value), 10)}
	case uint64:
		return EncodedValue{Type: "uint", Value: strconv.FormatUint(value, 10)}
	case float32:
		return EncodedValue{Type: "float", Value: strconv.FormatFloat(float64(value), 'g', -1, 32)}
	case float64:
		return EncodedValue{Type: "float", Value: strconv.FormatFloat(value, 'g', -1, 64)}
	default:
		return EncodedValue{Type: "text", Value: fmt.Sprint(value)}
	}
}

func decodeValue(value EncodedValue, databaseType string) (any, error) {
	if value.Type == "null" {
		return nil, nil
	}
	text, isText := value.Value.(string)
	switch value.Type {
	case "bytes":
		if !isText {
			return nil, errors.New("binary value is not base64 text")
		}
		decoded, err := base64.StdEncoding.DecodeString(text)
		if err != nil {
			return nil, err
		}
		return decoded, nil
	case "time":
		if !isText {
			return nil, errors.New("time value is not text")
		}
		parsed, err := time.Parse(time.RFC3339Nano, text)
		if err != nil {
			return nil, err
		}
		return parsed, nil
	case "bool":
		boolean, ok := value.Value.(bool)
		if !ok {
			return nil, errors.New("boolean value is invalid")
		}
		return boolean, nil
	case "int":
		if !isText {
			return nil, errors.New("integer value is invalid")
		}
		return parseInteger(text, databaseType)
	case "uint":
		if !isText {
			return nil, errors.New("unsigned integer value is invalid")
		}
		parsed, err := strconv.ParseUint(text, 10, 64)
		if err != nil {
			return nil, err
		}
		if strings.Contains(strings.ToLower(databaseType), "int") && parsed <= math.MaxInt64 {
			return int64(parsed), nil
		}
		return parsed, nil
	case "float":
		if !isText {
			return nil, errors.New("float value is invalid")
		}
		return strconv.ParseFloat(text, 64)
	case "text":
		if !isText {
			return nil, errors.New("text value is invalid")
		}
		return text, nil
	default:
		return nil, fmt.Errorf("unsupported encoded value type %q", value.Type)
	}
}

func parseInteger(value, databaseType string) (any, error) {
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return nil, err
	}
	if strings.Contains(strings.ToLower(databaseType), "bool") {
		return parsed != 0, nil
	}
	return parsed, nil
}

func isBinaryType(databaseType string) bool {
	databaseType = strings.ToLower(databaseType)
	for _, token := range []string{"blob", "binary", "bytea", "varbinary", "tinyblob", "mediumblob", "longblob"} {
		if strings.Contains(databaseType, token) {
			return true
		}
	}
	return false
}

func isExcludedTable(table string) bool {
	switch strings.ToLower(table) {
	case "logs", "audit_logs", "system_tasks", "system_task_locks", "system_instances":
		return true
	default:
		return false
	}
}

func quoteIdentifier(databaseType common.DatabaseType, identifier string) string {
	if databaseType == common.DatabaseTypePostgreSQL {
		return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
	}
	return "`" + strings.ReplaceAll(identifier, "`", "``") + "`"
}

func readManifest(reader *zip.Reader) (Manifest, error) {
	entry, err := reader.Open("manifest.json")
	if err != nil {
		return Manifest{}, err
	}
	defer entry.Close()
	var manifest Manifest
	if err := common.DecodeJson(entry, &manifest); err != nil {
		return Manifest{}, err
	}
	if manifest.FormatVersion != FormatVersion {
		return Manifest{}, fmt.Errorf("unsupported backup format: %s", manifest.FormatVersion)
	}
	return manifest, nil
}

func openArchive(path, password string) (*zip.Reader, func(), error) {
	if strings.TrimSpace(password) == "" {
		return nil, nil, errors.New("backup password is required")
	}
	working, err := os.CreateTemp("", ".new-api-backup-decrypted-*.zip")
	if err != nil {
		return nil, nil, err
	}
	workingPath := working.Name()
	if err := working.Close(); err != nil {
		os.Remove(workingPath)
		return nil, nil, err
	}
	if err := decryptFile(path, workingPath, password); err != nil {
		os.Remove(workingPath)
		return nil, nil, err
	}
	reader, err := zip.OpenReader(workingPath)
	if err != nil {
		os.Remove(workingPath)
		return nil, nil, err
	}
	return &reader.Reader, func() {
		_ = reader.Close()
		_ = os.Remove(workingPath)
	}, nil
}

func encryptFile(inputPath, outputPath, password string) error {
	input, err := os.Open(inputPath)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(outputPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer output.Close()
	salt := make([]byte, encryptionSaltSize)
	if _, err := rand.Read(salt); err != nil {
		return err
	}
	if _, err := output.Write([]byte(encryptedMagic)); err != nil {
		return err
	}
	if _, err := output.Write(salt); err != nil {
		return err
	}
	key := deriveKey(password, salt)
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	buffer := make([]byte, encryptionChunkSize)
	for {
		read, readErr := input.Read(buffer)
		if read > 0 {
			nonce := make([]byte, encryptionNonceSize)
			if _, err := rand.Read(nonce); err != nil {
				return err
			}
			ciphertext := gcm.Seal(nil, nonce, buffer[:read], nil)
			if err := writeUint32(output, uint32(read)); err != nil {
				return err
			}
			if err := writeUint32(output, uint32(len(ciphertext))); err != nil {
				return err
			}
			if _, err := output.Write(nonce); err != nil {
				return err
			}
			if _, err := output.Write(ciphertext); err != nil {
				return err
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return readErr
		}
	}
	return writeUint32(output, 0)
}

func decryptFile(inputPath, outputPath, password string) error {
	input, err := os.Open(inputPath)
	if err != nil {
		return err
	}
	defer input.Close()
	magic := make([]byte, len(encryptedMagic))
	if _, err := io.ReadFull(input, magic); err != nil {
		return err
	}
	if string(magic) != encryptedMagic {
		return errors.New("invalid backup header")
	}
	salt := make([]byte, encryptionSaltSize)
	if _, err := io.ReadFull(input, salt); err != nil {
		return err
	}
	key := deriveKey(password, salt)
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	output, err := os.OpenFile(outputPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer output.Close()
	for {
		plainLength, err := readUint32(input)
		if err != nil {
			return err
		}
		if plainLength == 0 {
			return nil
		}
		cipherLength, err := readUint32(input)
		if err != nil {
			return err
		}
		if plainLength > encryptionChunkSize || cipherLength > maxEncryptedChunk || cipherLength < uint32(gcm.Overhead()) {
			return errors.New("invalid encrypted chunk size")
		}
		nonce := make([]byte, encryptionNonceSize)
		if _, err := io.ReadFull(input, nonce); err != nil {
			return err
		}
		ciphertext := make([]byte, cipherLength)
		if _, err := io.ReadFull(input, ciphertext); err != nil {
			return err
		}
		plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
		if err != nil {
			return errors.New("backup authentication failed")
		}
		if uint32(len(plaintext)) != plainLength {
			return errors.New("invalid decrypted chunk length")
		}
		if _, err := output.Write(plaintext); err != nil {
			return err
		}
	}
}

func deriveKey(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
}

func writeUint32(writer io.Writer, value uint32) error {
	var data [4]byte
	binary.BigEndian.PutUint32(data[:], value)
	_, err := writer.Write(data[:])
	return err
}

func readUint32(reader io.Reader) (uint32, error) {
	var data [4]byte
	if _, err := io.ReadFull(reader, data[:]); err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(data[:]), nil
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}
