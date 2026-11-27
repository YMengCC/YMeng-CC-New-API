package model

import "gorm.io/gorm"

// backupModels is the application schema used by the offline backup tool. Keep
// this list explicit so a backup never follows arbitrary tables created by an
// extension or an operator.
func backupModels() []any {
	return []any{
		&Channel{},
		&Token{},
		&User{},
		&UserSession{},
		&AuthFlow{},
		&ExternalIdentityClaim{},
		&PasskeyCredential{},
		&Option{},
		&LoginEncryptionKey{},
		&Redemption{},
		&TopUp{},
		&JingSoftOrder{},
		&JingSoftPriceSlot{},
		&Ability{},
		&Log{},
		&AuditLog{},
		&Midjourney{},
		&QuotaData{},
		&Task{},
		&TaskPlugin{},
		&Model{},
		&Vendor{},
		&PrefillGroup{},
		&Setup{},
		&TwoFA{},
		&TwoFABackupCode{},
		&Checkin{},
		&SubscriptionOrder{},
		&UserSubscription{},
		&SubscriptionPreConsumeRecord{},
		&SubscriptionPlan{},
		&CustomOAuthProvider{},
		&UserOAuthBinding{},
		&PerfMetric{},
		&SystemInstance{},
		&SystemTask{},
		&SystemTaskLock{},
		&CasbinRule{},
		&AuthzRole{},
		&AffiliateCommission{},
		&InvoiceProfile{},
		&InvoiceApplication{},
		&InvoiceApplicationItem{},
		&InvoiceRefundAdjustment{},
		&UpstreamSite{},
		&UpstreamChannelMonitor{},
		&UpstreamCostRecord{},
		&UserAccessToken{},
		&UserAvatar{},
		&WithdrawalProfile{},
		&Withdrawal{},
		&SupportTicket{},
		&SupportTicketMessage{},
	}
}

// AutoMigrateBackupSchema creates the current application schema in a target
// database. Data backfills and runtime initialization intentionally remain in
// the normal application startup path.
func AutoMigrateBackupSchema(db *gorm.DB) error {
	return db.AutoMigrate(backupModels()...)
}

// BackupTableNames returns the explicit application table catalog using the
// target database's naming strategy.
func BackupTableNames(db *gorm.DB) ([]string, error) {
	tables := make([]string, 0, len(backupModels()))
	for _, value := range backupModels() {
		statement := &gorm.Statement{DB: db}
		if err := statement.Parse(value); err != nil {
			return nil, err
		}
		tables = append(tables, statement.Schema.Table)
	}
	return tables, nil
}
