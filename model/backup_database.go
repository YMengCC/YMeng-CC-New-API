package model

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// OpenDatabaseForBackup opens a primary database without changing the
// application's global database handles or running migrations.
func OpenDatabaseForBackup(dsn string) (*gorm.DB, common.DatabaseType, error) {
	dsn = strings.TrimSpace(dsn)
	explicitSQLite := strings.HasPrefix(dsn, "sqlite://")
	if explicitSQLite {
		dsn = strings.TrimPrefix(dsn, "sqlite://")
	}
	if dsn == ":memory:" || explicitSQLite || dsn == "" || strings.HasPrefix(dsn, "local") || strings.HasPrefix(dsn, "file:") || isSQLiteFilePath(dsn) || isSQLitePath(dsn) {
		if dsn == "" || strings.HasPrefix(dsn, "local") {
			dsn = common.SQLitePath
		}
		db, err := gorm.Open(sqlite.Open(dsn), newGormConfig(true))
		common.SetMainDatabaseType(common.DatabaseTypeSQLite)
		return db, common.DatabaseTypeSQLite, err
	}
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		db, err := gorm.Open(postgresMigrationDialector{postgres.Dialector{Config: &postgres.Config{
			DSN:                  dsn,
			PreferSimpleProtocol: true,
		}}}, newGormConfig(false))
		common.SetMainDatabaseType(common.DatabaseTypePostgreSQL)
		return db, common.DatabaseTypePostgreSQL, err
	}
	if isClickHouseDSN(dsn) {
		return nil, "", fmt.Errorf("ClickHouse is supported only as a log database and cannot be used for the primary backup")
	}
	if !strings.Contains(dsn, "parseTime") {
		if strings.Contains(dsn, "?") {
			dsn += "&parseTime=true"
		} else {
			dsn += "?parseTime=true"
		}
	}
	db, err := gorm.Open(mysqlMigrationDialector{mysql.Dialector{Config: &mysql.Config{DSN: dsn}}}, newGormConfig(true))
	common.SetMainDatabaseType(common.DatabaseTypeMySQL)
	return db, common.DatabaseTypeMySQL, err
}

func isSQLitePath(dsn string) bool {
	return strings.ContainsAny(dsn, `/\\`) && !strings.Contains(dsn, "@")
}

func isSQLiteFilePath(dsn string) bool {
	extension := strings.ToLower(filepath.Ext(strings.Split(dsn, "?")[0]))
	switch extension {
	case ".db", ".sqlite", ".sqlite3":
		return true
	default:
		return false
	}
}
