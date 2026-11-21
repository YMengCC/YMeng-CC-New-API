package backup

import (
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

type SchemaCheckResult struct {
	MissingTables []string `json:"missing_tables"`
	Ready         bool     `json:"ready"`
}

func CheckSchema(db *gorm.DB) (SchemaCheckResult, error) {
	catalog, err := model.BackupTableNames(db)
	if err != nil {
		return SchemaCheckResult{}, err
	}
	result := SchemaCheckResult{Ready: true}
	for _, table := range catalog {
		if isExcludedTable(table) || db.Migrator().HasTable(table) {
			continue
		}
		result.MissingTables = append(result.MissingTables, table)
	}
	result.Ready = len(result.MissingTables) == 0
	return result, nil
}
