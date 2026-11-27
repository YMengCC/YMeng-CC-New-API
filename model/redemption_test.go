package model

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestSearchRedemptionsFiltersAndPaginates(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	})

	now := common.GetTimestamp()
	redemptions := []Redemption{
		{Id: 1, Name: "alpha-active", Key: "00000000000000000000000000000001", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: 0},
		{Id: 2, Name: "alpha-future", Key: "00000000000000000000000000000002", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now + 3600},
		{Id: 3, Name: "alpha-expired", Key: "00000000000000000000000000000003", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now - 10},
		{Id: 4, Name: "beta-disabled", Key: "0000000000000000000000000000000a", Status: common.RedemptionCodeStatusDisabled, ExpiredTime: 0},
		{Id: 5, Name: "beta-used", Key: "00000000000000000000000000000005", Status: common.RedemptionCodeStatusUsed, ExpiredTime: 0},
	}
	require.NoError(t, DB.Create(&redemptions).Error)

	tests := []struct {
		name      string
		keyword   string
		status    string
		key       string
		startIdx  int
		num       int
		wantTotal int64
		wantIds   []int
	}{
		{
			name:      "no filters returns all rows",
			num:       10,
			wantTotal: 5,
			wantIds:   []int{5, 4, 3, 2, 1},
		},
		{
			name:      "keyword filters by name prefix",
			keyword:   "alpha",
			num:       10,
			wantTotal: 3,
			wantIds:   []int{3, 2, 1},
		},
		{
			name:      "enabled status excludes expired rows",
			status:    "1",
			num:       10,
			wantTotal: 2,
			wantIds:   []int{2, 1},
		},
		{
			name:      "expired status returns enabled expired rows",
			status:    "expired",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{3},
		},
		{
			name:      "disabled status",
			status:    "2",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{4},
		},
		{
			name:      "used status",
			status:    "3",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{5},
		},
		{
			name:      "pagination keeps unpaged total",
			startIdx:  1,
			num:       2,
			wantTotal: 5,
			wantIds:   []int{4, 3},
		},
		{
			name:      "exact key returns one row",
			key:       "00000000000000000000000000000002",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{2},
		},
		{
			name:      "key is combined with keyword",
			keyword:   "alpha",
			key:       "00000000000000000000000000000003",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{3},
		},
		{
			name:      "key is combined with status",
			status:    "1",
			key:       "00000000000000000000000000000003",
			num:       10,
			wantTotal: 0,
			wantIds:   []int{},
		},
		{
			name:      "key is trimmed and lowercased",
			key:       "  0000000000000000000000000000000A  ",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{4},
		},
		{
			name:      "unknown key returns no rows",
			key:       "ffffffffffffffffffffffffffffffff",
			num:       10,
			wantTotal: 0,
			wantIds:   []int{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows, total, err := SearchRedemptions(tt.keyword, tt.status, tt.key, tt.startIdx, tt.num)
			require.NoError(t, err)
			assert.Equal(t, tt.wantTotal, total)
			gotIds := make([]int, 0, len(rows))
			for _, row := range rows {
				gotIds = append(gotIds, row.Id)
			}
			assert.Equal(t, tt.wantIds, gotIds)
		})
	}
}

func setupRedeemFixture(t *testing.T, quota int) (userId int, key string) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&User{}).Error)
		require.NoError(t, LOG_DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Log{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&TopUp{}).Error)
	})

	user := &User{Username: "redeem-user", Password: "password", Status: common.UserStatusEnabled, Quota: 0}
	require.NoError(t, DB.Create(user).Error)

	key = "10000000000000000000000000000001"
	redemption := &Redemption{
		Name:        "redeem-test",
		Key:         key,
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       quota,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(redemption).Error)
	return user.Id, key
}

func TestRedeemCreditsQuotaExactlyOnce(t *testing.T) {
	userId, key := setupRedeemFixture(t, 500)
	// A code issued long before it is redeemed is still a recent top-up.
	require.NoError(t, DB.Model(&Redemption{}).Where("name = ?", "redeem-test").Update("created_time", common.GetTimestamp()-60*24*60*60).Error)

	quota, err := Redeem(key, userId)
	require.NoError(t, err)
	assert.Equal(t, 500, quota)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "name = ?", "redeem-test").Error)
	assert.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	assert.Equal(t, userId, redemption.UsedUserId)

	var topUp TopUp
	require.NoError(t, DB.Where("trade_no = ?", "redemption:"+strconv.Itoa(redemption.Id)).First(&topUp).Error)
	assert.Equal(t, PaymentProviderRedemption, topUp.PaymentProvider)
	assert.Equal(t, common.TopUpStatusSuccess, topUp.Status)
	assert.Equal(t, int64(500), topUp.CreditedQuota)
	wantInvoiceAmount, invoiceErr := InvoiceAmountFromQuota(500)
	require.NoError(t, invoiceErr)
	assert.Equal(t, wantInvoiceAmount, topUp.InvoiceAmount)
	assert.Equal(t, redemption.RedeemedTime, topUp.CreateTime)
	history, total, err := GetUserTopUps(userId, &common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	require.EqualValues(t, 1, total, "ordinary redemptions appear in the user's order history")
	assert.Equal(t, topUp.TradeNo, history[0].TradeNo)
	found, total, err := SearchUserTopUps(userId, topUp.TradeNo, &common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	assert.Equal(t, topUp.TradeNo, found[0].TradeNo)
	assert.Equal(t, redemption.RedeemedTime, topUp.CompleteTime)
	assert.Positive(t, topUp.CompleteTime)

	// Redeeming the same code again must fail and must not credit quota.
	_, err = Redeem(key, userId)
	require.Error(t, err)
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)
}

func TestRedeemRollsBackInvoiceSnapshotFailure(t *testing.T) {
	userID, key := setupRedeemFixture(t, 500)
	var redemption Redemption
	require.NoError(t, DB.Where(commonKeyCol+" = ?", key).First(&redemption).Error)
	// A conflicting invoice trade number must roll back both the code and wallet.
	require.NoError(t, DB.Create(&TopUp{UserId: userID, TradeNo: "redemption:" + strconv.Itoa(redemption.Id)}).Error)

	_, err := Redeem(key, userID)
	require.ErrorIs(t, err, ErrRedeemFailed)
	var user User
	require.NoError(t, DB.First(&user, userID).Error)
	assert.Zero(t, user.Quota)
	require.NoError(t, DB.First(&redemption, redemption.Id).Error)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, redemption.Status)
	assert.Zero(t, redemption.UsedUserId)
	assert.Zero(t, redemption.RedeemedTime)
}

func TestRedeemRejectsWalletOverflow(t *testing.T) {
	userId, key := setupRedeemFixture(t, 11)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", userId).Update("quota", common.MaxWalletQuota-10).Error)

	_, err := Redeem(key, userId)
	require.ErrorIs(t, err, ErrRedeemFailed)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, common.MaxWalletQuota-10, user.Quota)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "key = ?", key).Error)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, redemption.Status)
}

func TestRedemptionQuotaRejectsWalletOverflow(t *testing.T) {
	setupRedeemFixture(t, 500)

	redemption := &Redemption{
		Name:        "overflow-redemption",
		Key:         "10000000000000000000000000000002",
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       common.MaxWalletQuota + 1,
		CreatedTime: common.GetTimestamp(),
	}
	require.Error(t, redemption.Insert())
}

// TestJingSoftDatabaseMatrix uses dedicated test databases when DSNs are supplied.
// The SQLite branch uses a real file, not a mocked SQL connection.
func TestJingSoftDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(filepath.Join(t.TempDir(), "jingsoft.db"))
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(dsn)
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "jingsoft_matrix_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			previousDB, previousLogDB := DB, LOG_DB
			previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
			DB, LOG_DB = db, db
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			initCol()
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(db.NamingStrategy.TableName("cat_fk_price_slots"), db.NamingStrategy.TableName("cat_fk_orders"), &JingSoftPriceSlot{}, &JingSoftOrder{}, &TopUp{}, &Redemption{}, &Log{}, &User{}, &Option{}))
				DB, LOG_DB = previousDB, previousLogDB
				common.SetDatabaseTypes(previousMainType, previousLogType)
				initCol()
				require.NoError(t, sqlDB.Close())
			})
			var version string
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database version: %s", version)

			// Simulate a legacy pre-rename database (cat_fk_orders, cat_fk_price_slots, legacy TopUps & Options)
			// and verify idempotent upgrade into JingSoft tables and identifiers.
			legacyPrefix := "cat" + "fk"
			require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}, &Redemption{}, &Log{}, &Option{}))
			legacy := &TopUp{UserId: 123, Amount: 2, Money: 2.5, TradeNo: "legacy-epay-order", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusPending}
			require.NoError(t, db.Create(legacy).Error)

			require.NoError(t, db.Table(db.NamingStrategy.TableName("cat_fk_orders")).AutoMigrate(&jingSoftOrderLegacyV1{}))
			require.NoError(t, db.Table(db.NamingStrategy.TableName("cat_fk_price_slots")).AutoMigrate(&jingSoftPriceSlotLegacyV1{}))

			completedLegacyTopUp := &TopUp{
				UserId: 123, Amount: 500, Money: 10.0,
				TradeNo:         legacyPrefix + "_completed_1",
				PaymentMethod:   legacyPrefix + "_alipay",
				PaymentProvider: legacyPrefix,
				Status:          common.TopUpStatusSuccess,
				CreateTime:      1700000000,
			}
			require.NoError(t, db.Create(completedLegacyTopUp).Error)
			upstreamV1 := "upstream-legacy-v1"
			require.NoError(t, db.Table(db.NamingStrategy.TableName("cat_fk_orders")).Create(&jingSoftOrderLegacyV1{
				TopUpID: completedLegacyTopUp.Id, UserID: 123, TradeNo: legacyPrefix + "_completed_1",
				TierID: "tier", ProductID: "product", ChannelID: "1",
				ExpectedQuota: 500, PriceAmount: "10.00", Currency: "CNY",
				ShopID: "shop-v1", ShopURL: "https://wzyp.cn/shop/shop-v1",
				PaymentMethod:   legacyPrefix + "_alipay",
				UpstreamOrderID: &upstreamV1, Status: JingSoftOrderStatusCompleted, Version: 1, IdempotencyKey: "legacy-idem-v1",
				CreatedAt: 1700000000, UpdatedAt: 1700000000,
			}).Error)

			inFlightLegacyTopUp := &TopUp{
				UserId: 123, Amount: 600, Money: 12.0,
				TradeNo:         legacyPrefix + "_inflight_1",
				PaymentMethod:   legacyPrefix + "_wxpay",
				PaymentProvider: legacyPrefix,
				Status:          common.TopUpStatusPending,
				CreateTime:      1700000001,
			}
			require.NoError(t, db.Create(inFlightLegacyTopUp).Error)
			upstreamV2 := "upstream-legacy-v2"
			require.NoError(t, db.Table(db.NamingStrategy.TableName("cat_fk_orders")).Create(&jingSoftOrderLegacyV1{
				TopUpID: inFlightLegacyTopUp.Id, UserID: 123, TradeNo: legacyPrefix + "_inflight_1",
				TierID: "tier", ProductID: "product", ChannelID: "2",
				ExpectedQuota: 600, PriceAmount: "12.00", Currency: "CNY",
				ShopID: "shop-v1", ShopURL: "https://wzyp.cn/shop/shop-v1",
				PaymentMethod:        legacyPrefix + "_wxpay",
				UpstreamOrderID:      &upstreamV2,
				Status:               JingSoftOrderStatusPaid,
				Version:              1,
				CredentialCiphertext: "sealed-aead-ciphertext",
				IdempotencyKey:       "legacy-idem-v2",
				CreatedAt:            1700000001,
				UpdatedAt:            1700000001,
			}).Error)

			require.NoError(t, db.Table(db.NamingStrategy.TableName("cat_fk_price_slots")).Create(&jingSoftPriceSlotLegacyV1{
				ShopID: "shop-v1", GoodsKey: "slot-legacy", Status: JingSoftSlotStatusIdle,
				OrderTradeNo: legacyPrefix + "_completed_1", Version: 1, CreatedAt: 1700000000, UpdatedAt: 1700000000,
			}).Error)

			require.NoError(t, db.Create(&Option{Key: legacyPrefix + "_setting.enabled", Value: "true"}).Error)
			require.NoError(t, db.Create(&Option{Key: legacyPrefix + "_setting.store_token", Value: "shop-v1"}).Error)
			require.NoError(t, db.Create(&Option{Key: "PayMethods", Value: `[{"type":"` + legacyPrefix + `_alipay","name":"Cat` + `fk Alipay","channel_id":"1"}]`}).Error)

			for range 2 {
				require.NoError(t, db.AutoMigrate(&JingSoftOrder{}, &JingSoftPriceSlot{}, &TopUp{}, &Redemption{}, &Option{}))
				require.NoError(t, MigrateLegacyJingSoftData(db))
			}

			// Legacy tables and options stay intact in DB so an active v1.3.0 instance
			// remains operational during blue-green cutover and rollback.
			assert.True(t, db.Migrator().HasTable(db.NamingStrategy.TableName("cat_fk_orders")))
			assert.True(t, db.Migrator().HasTable(db.NamingStrategy.TableName("cat_fk_price_slots")))
			assert.Equal(t, int64(2), GetTopUpById(legacy.Id).Amount)

			migratedCompletedTopUp := GetTopUpById(completedLegacyTopUp.Id)
			require.NotNil(t, migratedCompletedTopUp)
			assert.Equal(t, "JingSoft_completed_1", migratedCompletedTopUp.TradeNo)
			assert.Equal(t, PaymentMethodJingSoftAlipay, migratedCompletedTopUp.PaymentMethod)
			assert.Equal(t, PaymentProviderJingSoft, migratedCompletedTopUp.PaymentProvider)

			migratedOrder1, err := GetJingSoftOrderByTradeNo("JingSoft_completed_1")
			require.NoError(t, err)
			assert.Equal(t, PaymentMethodJingSoftAlipay, migratedOrder1.PaymentMethod)
			assert.Empty(t, migratedOrder1.Mode)
			assert.Nil(t, migratedOrder1.TransactionID)
			// Lookup by pre-rename trade_no also resolves to the migrated completed order.
			migratedOrder1ByLegacy, err := GetJingSoftOrderByTradeNo(legacyPrefix + "_completed_1")
			require.NoError(t, err)
			assert.Equal(t, migratedOrder1.ID, migratedOrder1ByLegacy.ID)

			// In-flight pending TopUp keeps legacy provider/method in DB until settled so v1.3.0
			// can still complete it on drain/rollback, while JingSoft settles and upgrades it atomically.
			migratedInFlightTopUp := GetTopUpById(inFlightLegacyTopUp.Id)
			require.NotNil(t, migratedInFlightTopUp)
			assert.Equal(t, legacyPrefix+"_inflight_1", migratedInFlightTopUp.TradeNo)
			assert.Equal(t, legacyPrefix+"_wxpay", migratedInFlightTopUp.PaymentMethod)
			assert.Equal(t, legacyPrefix, migratedInFlightTopUp.PaymentProvider)
			migratedOrder2, err := GetJingSoftOrderByTradeNo(legacyPrefix + "_inflight_1")
			require.NoError(t, err)
			assert.Equal(t, PaymentMethodJingSoftWeChat, migratedOrder2.PaymentMethod)

			var migratedSlot JingSoftPriceSlot
			require.NoError(t, db.Where("shop_id = ? AND goods_key = ?", "shop-v1", "slot-legacy").First(&migratedSlot).Error)
			assert.Equal(t, "JingSoft_completed_1", migratedSlot.OrderTradeNo)

			var baseOpt, tokenOpt, legacyTokenOpt, payMethodsOpt Option
			require.NoError(t, db.Where(commonKeyCol+" = ?", "jingsoft_setting.base_url").First(&baseOpt).Error)
			assert.Equal(t, "https://wzyp.cn", baseOpt.Value)
			require.NoError(t, db.Where(commonKeyCol+" = ?", "jingsoft_setting.store_token").First(&tokenOpt).Error)
			assert.Equal(t, "shop-v1", tokenOpt.Value)
			require.NoError(t, db.Where(commonKeyCol+" = ?", legacyPrefix+"_setting.store_token").First(&legacyTokenOpt).Error)
			assert.Equal(t, "shop-v1", legacyTokenOpt.Value)
			require.NoError(t, db.Where(commonKeyCol+" = ?", "PayMethods").First(&payMethodsOpt).Error)
			assert.Contains(t, payMethodsOpt.Value, `"type":"`+legacyPrefix+`_alipay"`)
			previousPayMethods := operation_setting.PayMethods
			t.Cleanup(func() { operation_setting.PayMethods = previousPayMethods })
			require.NoError(t, updateOptionMap("PayMethods", payMethodsOpt.Value))
			assert.Contains(t, common.OptionMap["PayMethods"], `"type":"jingsoft_alipay"`)
			assert.Contains(t, common.OptionMap["PayMethods"], `"name":"JingSoft Alipay"`)
			require.NoError(t, updateOptionMap(legacyPrefix+"_setting.store_token", "shop-v1"))
			_, leaked := common.OptionMap[legacyPrefix+"_setting.store_token"]
			assert.False(t, leaked)

			// Settling the migrated in-flight order atomically upgrades its pending TopUp row to JingSoft.
			inFlightUser := &User{Username: "legacy-inflight-user", Password: "passwordpassword", AffCode: "legacy-aff-1", Quota: 0}
			require.NoError(t, db.Create(inFlightUser).Error)
			require.NoError(t, db.Model(&TopUp{}).Where("id = ?", inFlightLegacyTopUp.Id).Update("user_id", inFlightUser.Id).Error)
			require.NoError(t, db.Model(&JingSoftOrder{}).Where("id = ?", migratedOrder2.ID).Update("user_id", inFlightUser.Id).Error)
			inFlightRedeem := &Redemption{UserId: 1, Name: "legacy-inflight-code", Key: "30000000000000000000000000000003", Status: common.RedemptionCodeStatusEnabled, Quota: 600, CreatedTime: 1700000000}
			require.NoError(t, db.Create(inFlightRedeem).Error)
			alreadyDone, err := CompleteVerifiedJingSoftOrder(migratedOrder2.ID, migratedOrder2.Version, inFlightRedeem.Key, "", "")
			require.NoError(t, err)
			assert.False(t, alreadyDone)
			settledInFlightTopUp := GetTopUpById(inFlightLegacyTopUp.Id)
			require.NotNil(t, settledInFlightTopUp)
			assert.Equal(t, common.TopUpStatusSuccess, settledInFlightTopUp.Status)
			assert.Equal(t, PaymentProviderJingSoft, settledInFlightTopUp.PaymentProvider)
			assert.Equal(t, PaymentMethodJingSoftWeChat, settledInFlightTopUp.PaymentMethod)

			require.NoError(t, db.Table(db.NamingStrategy.TableName("cat_fk_orders")).Where("1 = 1").Delete(&jingSoftOrderLegacyV1{}).Error)
			require.NoError(t, db.Table(db.NamingStrategy.TableName("cat_fk_price_slots")).Where("1 = 1").Delete(&jingSoftPriceSlotLegacyV1{}).Error)
			require.NoError(t, db.Delete(&JingSoftPriceSlot{}, "id = ?", migratedSlot.ID).Error)
			require.NoError(t, db.Delete(&JingSoftOrder{}, "id IN ?", []int{migratedOrder1.ID, migratedOrder2.ID}).Error)
			require.NoError(t, db.Delete(&TopUp{}, "id IN ?", []int{completedLegacyTopUp.Id, inFlightLegacyTopUp.Id}).Error)
			require.NoError(t, db.Unscoped().Delete(&Redemption{}, "id = ?", inFlightRedeem.Id).Error)
			require.NoError(t, db.Unscoped().Delete(&User{}, "id = ?", inFlightUser.Id).Error)

			tables, err := BackupTableNames(db)
			require.NoError(t, err)
			assert.Contains(t, tables, (JingSoftOrder{}).TableName())
			assert.Contains(t, tables, (JingSoftPriceSlot{}).TableName())
			t.Run("ordinary_redemption", TestRedeemCreditsQuotaExactlyOnce)
			t.Run("invoice_rollback", TestRedeemRollsBackInvoiceSnapshotFailure)
			t.Run("persistence", TestJingSoftOrderPersistenceAndRecovery)
			t.Run("completion", TestJingSoftCompletionIsAtomicAndIdempotent)
			t.Run("rollback", TestJingSoftCompletionRollsBackFailures)
			t.Run("unique_and_concurrent", TestJingSoftUniqueLinksAndConcurrentCompletion)
			t.Run("direct_and_tx_replay", TestJingSoftDirectSettlementAndTransactionReplay)
			t.Run("price_slot_leases", TestJingSoftPriceSlotLeaseAndQuarantine)
		})
	}
}

type jingSoftOrderLegacyV1 struct {
	ID                   int     `gorm:"primaryKey"`
	TopUpID              int     `gorm:"uniqueIndex;not null"`
	UserID               int     `gorm:"index;uniqueIndex:idx_jingsoft_legacy_user_idem,priority:1;not null"`
	TradeNo              string  `gorm:"type:varchar(191);uniqueIndex;not null"`
	TierID               string  `gorm:"type:varchar(191);not null"`
	ProductID            string  `gorm:"type:varchar(191);not null"`
	ChannelID            string  `gorm:"type:varchar(191);not null"`
	ExpectedQuota        int     `gorm:"not null"`
	PriceAmount          string  `gorm:"type:varchar(64);not null"`
	Currency             string  `gorm:"type:varchar(16);not null"`
	ShopID               string  `gorm:"type:varchar(128);uniqueIndex:idx_jingsoft_legacy_shop_up,priority:1;not null"`
	ShopName             string  `gorm:"type:varchar(255)"`
	ShopURL              string  `gorm:"type:text"`
	PaymentMethod        string  `gorm:"type:varchar(50)"`
	PaymentURL           string  `gorm:"type:text"`
	PaymentQRCode        string  `gorm:"type:text"`
	UpstreamOrderID      *string `gorm:"type:varchar(128);uniqueIndex:idx_jingsoft_legacy_shop_up,priority:2"`
	RedemptionID         *int    `gorm:"uniqueIndex"`
	Status               string  `gorm:"type:varchar(32);index:idx_jingsoft_legacy_due,priority:1;not null"`
	NextQueryAt          int64   `gorm:"index:idx_jingsoft_legacy_due,priority:2;not null"`
	LeaseUntil           int64   `gorm:"not null"`
	Version              int64   `gorm:"not null"`
	CredentialCiphertext string  `gorm:"type:text"`
	IdempotencyKey       string  `gorm:"type:varchar(191);uniqueIndex:idx_jingsoft_legacy_user_idem,priority:2;not null"`
	FailureCode          string  `gorm:"type:varchar(64)"`
	CreatedAt            int64   `gorm:"autoCreateTime:false;not null"`
	UpdatedAt            int64   `gorm:"autoUpdateTime:false;not null"`
}

type jingSoftPriceSlotLegacyV1 struct {
	ID             int    `gorm:"primaryKey"`
	ShopID         string `gorm:"type:varchar(128);uniqueIndex:idx_jingsoft_legacy_slot_shop_goods,priority:1;not null"`
	GoodsKey       string `gorm:"type:varchar(128);uniqueIndex:idx_jingsoft_legacy_slot_shop_goods,priority:2;not null"`
	Status         string `gorm:"type:varchar(32);not null"`
	ConfirmedPrice string `gorm:"type:varchar(64)"`
	HolderToken    string `gorm:"type:varchar(128)"`
	OrderTradeNo   string `gorm:"type:varchar(191)"`
	QuarantineCode string `gorm:"type:varchar(64)"`
	LeaseUntil     int64  `gorm:"not null"`
	Version        int64  `gorm:"not null"`
	CreatedAt      int64  `gorm:"autoCreateTime:false;not null"`
	UpdatedAt      int64  `gorm:"autoUpdateTime:false;not null"`
}

func setupJingSoftOrderFixture(t *testing.T, userID int, suffix string) *JingSoftOrder {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&JingSoftOrder{}, &JingSoftPriceSlot{}))
	order, existed, err := CreateJingSoftOrder(&JingSoftOrder{
		UserID: userID, TradeNo: "JingSoft_" + suffix, IdempotencyKey: "request-" + suffix,
		TierID: "tier", ProductID: "product", ChannelID: "channel", ExpectedQuota: 500,
		PriceAmount: "2.50", Currency: "CNY", ShopID: "shop", ShopName: "Snapshot shop", ShopURL: "https://wzyp.cn",
		Mode: JingSoftOrderModeRedemption, ExpectedContact: "123456",
		CredentialCiphertext: "encrypted-credentials",
	})
	require.NoError(t, err)
	require.False(t, existed)
	t.Cleanup(func() {
		require.NoError(t, DB.Delete(&JingSoftOrder{}, "id = ?", order.ID).Error)
		require.NoError(t, DB.Delete(&TopUp{}, "id = ?", order.TopUpID).Error)
	})
	return order
}

func markJingSoftOrderPaid(t *testing.T, order *JingSoftOrder) *JingSoftOrder {
	t.Helper()
	claimed, ok, err := ClaimJingSoftOrder(order.ID, common.GetTimestamp(), 60)
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = MarkJingSoftOrderCreated(order.ID, claimed.Version, fmt.Sprintf("upstream-%d", order.ID), "https://wzyp.cn/pay", common.GetTimestamp())
	require.NoError(t, err)
	require.True(t, ok)
	order, err = GetJingSoftOrderByTradeNo(order.TradeNo)
	require.NoError(t, err)
	qrCode := "https://qr.alipay.com/upx-code"
	ok, err = UpdateJingSoftOrder(order.ID, order.Version, JingSoftOrderUpdate{Status: JingSoftOrderStatusPaid, PaymentQRCode: &qrCode, NextQueryAt: common.GetTimestamp()})
	require.NoError(t, err)
	require.True(t, ok)
	order, err = GetJingSoftOrderByTradeNo(order.TradeNo)
	require.NoError(t, err)
	return order
}

func TestJingSoftOrderPersistenceAndRecovery(t *testing.T) {
	userID, _ := setupRedeemFixture(t, 500)
	order := setupJingSoftOrderFixture(t, userID, "recovery")
	assert.Equal(t, "encrypted-credentials", order.CredentialCiphertext)
	// Repeat migration with a representative existing row and verify it survives.
	require.NoError(t, DB.AutoMigrate(&JingSoftOrder{}))
	require.NoError(t, DB.AutoMigrate(&JingSoftOrder{}))
	existing, existed, err := CreateJingSoftOrder(&JingSoftOrder{UserID: userID, IdempotencyKey: order.IdempotencyKey})
	require.NoError(t, err)
	assert.True(t, existed)
	assert.Equal(t, order.ID, existing.ID)
	assert.Equal(t, 500, existing.ExpectedQuota)
	recovered, err := FindJingSoftOrderForRequest(userID, order.IdempotencyKey)
	require.NoError(t, err)
	require.NotNil(t, recovered)
	assert.Equal(t, order.ID, recovered.ID)
	otherAccount, err := FindJingSoftOrderForRequest(userID+1, order.IdempotencyKey)
	require.NoError(t, err)
	assert.Nil(t, otherAccount)
	_, err = GetJingSoftOrderForUser(userID+1, order.TradeNo)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	payload, err := common.Marshal(order)
	require.NoError(t, err)
	assert.NotContains(t, string(payload), "encrypted-credentials")
	assert.NotContains(t, string(payload), "idempotency_key")
	now := common.GetTimestamp()
	claimed, ok, err := ClaimJingSoftOrder(order.ID, now, 60)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, JingSoftOrderStatusSubmitting, claimed.Status)
	_, ok, err = ClaimJingSoftOrder(order.ID, now, 60)
	require.NoError(t, err)
	assert.False(t, ok)
	recovered, ok, err = ClaimJingSoftOrder(order.ID, now+61, 60)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, JingSoftOrderStatusCreationUnknown, recovered.Status)
	ok, err = MarkJingSoftOrderCreated(order.ID, claimed.Version, "stale", "https://wzyp.cn/pay", now+62)
	require.NoError(t, err)
	assert.False(t, ok)
	ok, err = RetryJingSoftOrder(order.ID, recovered.Version, now+120)
	require.NoError(t, err)
	require.True(t, ok)
	rows, err := ListDueJingSoftOrders(now+119, 100)
	require.NoError(t, err)
	assert.Empty(t, rows)
	rows, err = ListDueJingSoftOrders(now+120, 100)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, JingSoftOrderStatusCreationUnknown, rows[0].Status)
	require.Error(t, ManualCompleteTopUp(order.TradeNo, ""))
	assert.Equal(t, common.TopUpStatusPending, GetTopUpById(order.TopUpID).Status)
}

func TestJingSoftCompletionIsAtomicAndIdempotent(t *testing.T) {
	userID, key := setupRedeemFixture(t, 500)
	order := setupJingSoftOrderFixture(t, userID, "complete")
	_, err := CompleteVerifiedJingSoftOrder(order.ID, order.Version, key, "tx-complete", "")
	require.ErrorIs(t, err, ErrJingSoftOrderConflict)
	order = markJingSoftOrderPaid(t, order)
	assert.Equal(t, "https://qr.alipay.com/upx-code", order.PaymentQRCode)
	_, err = GetJingSoftRedemptionForUser(userID, order.TradeNo)
	require.ErrorIs(t, err, ErrJingSoftOrderConflict, "a code is shown only after completion")
	_, err = CompleteVerifiedJingSoftOrder(order.ID, order.Version-1, key, "tx-complete", "")
	require.ErrorIs(t, err, ErrJingSoftOrderConflict)
	_, err = CompleteVerifiedJingSoftOrder(order.ID, order.Version, key, "", "")
	require.ErrorIs(t, err, ErrJingSoftTransactionRequired, "new orders require an official transaction ID")
	already, err := CompleteVerifiedJingSoftOrder(order.ID, order.Version, key, "tx-complete", "")
	require.NoError(t, err)
	assert.False(t, already)
	already, err = CompleteVerifiedJingSoftOrder(order.ID, order.Version, "", "tx-complete", "")
	require.NoError(t, err)
	assert.True(t, already)
	_, err = CompleteVerifiedJingSoftOrder(order.ID, order.Version, "", "tx-other", "")
	require.ErrorIs(t, err, ErrJingSoftOrderConflict)
	stored, err := GetJingSoftOrderForUser(userID, order.TradeNo)
	require.NoError(t, err)
	assert.Equal(t, JingSoftOrderStatusCompleted, stored.Status)
	assert.Empty(t, stored.CredentialCiphertext)
	require.NotNil(t, stored.RedemptionID)
	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "id = ?", *stored.RedemptionID).Error)
	assert.Equal(t, userID, redemption.UsedUserId)
	assert.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	require.NoError(t, DB.Delete(&Redemption{}, "id = ?", redemption.Id).Error)
	shown, err := GetJingSoftRedemptionForUser(userID, order.TradeNo)
	require.NoError(t, err, "a soft-deleted code remains the purchase record")
	assert.Equal(t, key, shown.Key)
	staffShown, err := GetJingSoftRedemptionByTradeNo(order.TradeNo)
	require.NoError(t, err, "staff can read a completed order regardless of its owner")
	assert.Equal(t, key, staffShown.Key)
	_, err = GetJingSoftRedemptionByTradeNo("JingSoft_missing")
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = GetJingSoftRedemptionForUser(userID+1, order.TradeNo)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	assert.Equal(t, common.TopUpStatusSuccess, GetTopUpById(order.TopUpID).Status)
	var topUpCount int64
	require.NoError(t, DB.Model(&TopUp{}).Where("user_id = ?", userID).Count(&topUpCount).Error)
	assert.Equal(t, int64(1), topUpCount, "JingSoft must complete its existing TopUp, not create a second redemption snapshot")
	var user User
	require.NoError(t, DB.First(&user, "id = ?", userID).Error)
	assert.Equal(t, 500, user.Quota)
}

func TestJingSoftCompletionRollsBackFailures(t *testing.T) {
	for _, scenario := range []string{"denomination", "expired", "disabled", "used", "wallet_overflow", "account_binding", "topup_conflict"} {
		t.Run(scenario, func(t *testing.T) {
			userID, key := setupRedeemFixture(t, 500)
			order := markJingSoftOrderPaid(t, setupJingSoftOrderFixture(t, userID, scenario))
			initialQuota := 0
			switch scenario {
			case "denomination":
				require.NoError(t, DB.Model(&Redemption{}).Where(commonKeyCol+" = ?", key).Update("quota", 501).Error)
			case "expired":
				require.NoError(t, DB.Model(&Redemption{}).Where(commonKeyCol+" = ?", key).Update("expired_time", common.GetTimestamp()-1).Error)
			case "disabled":
				require.NoError(t, DB.Model(&Redemption{}).Where(commonKeyCol+" = ?", key).Update("status", common.RedemptionCodeStatusDisabled).Error)
			case "used":
				require.NoError(t, DB.Model(&Redemption{}).Where(commonKeyCol+" = ?", key).Update("status", common.RedemptionCodeStatusUsed).Error)
			case "wallet_overflow":
				initialQuota = common.MaxWalletQuota - 499
				require.NoError(t, DB.Model(&User{}).Where("id = ?", userID).Update("quota", initialQuota).Error)
			case "account_binding":
				require.NoError(t, DB.Model(&TopUp{}).Where("id = ?", order.TopUpID).Update("user_id", userID+1).Error)
			case "topup_conflict":
				require.NoError(t, DB.Model(&TopUp{}).Where("id = ?", order.TopUpID).Update("status", common.TopUpStatusSuccess).Error)
			}
			var before Redemption
			require.NoError(t, DB.Where(commonKeyCol+" = ?", key).First(&before).Error)
			_, err := CompleteVerifiedJingSoftOrder(order.ID, order.Version, key, "tx-"+scenario, "")
			require.Error(t, err)
			stored, err := GetJingSoftOrderByTradeNo(order.TradeNo)
			require.NoError(t, err)
			assert.Equal(t, JingSoftOrderStatusPaid, stored.Status)
			assert.Equal(t, order.Version, stored.Version)
			assert.Nil(t, stored.RedemptionID)
			assert.Equal(t, "encrypted-credentials", stored.CredentialCiphertext)
			var after Redemption
			require.NoError(t, DB.Where(commonKeyCol+" = ?", key).First(&after).Error)
			assert.Equal(t, before.Status, after.Status)
			assert.Equal(t, before.UsedUserId, after.UsedUserId)
			var user User
			require.NoError(t, DB.First(&user, "id = ?", userID).Error)
			assert.Equal(t, initialQuota, user.Quota)
		})
	}
}

func TestJingSoftUniqueLinksAndConcurrentCompletion(t *testing.T) {
	userID, key := setupRedeemFixture(t, 500)
	first := markJingSoftOrderPaid(t, setupJingSoftOrderFixture(t, userID, "first"))
	second := setupJingSoftOrderFixture(t, userID, "second")
	claimed, ok, err := ClaimJingSoftOrder(second.ID, common.GetTimestamp(), 60)
	require.NoError(t, err)
	require.True(t, ok)
	_, err = MarkJingSoftOrderCreated(second.ID, claimed.Version, *first.UpstreamOrderID, "https://wzyp.cn/pay", common.GetTimestamp())
	require.Error(t, err, "one upstream purchase must not fund two orders")
	// Separate shops may use the same upstream ID.
	require.NoError(t, DB.Model(&JingSoftOrder{}).Where("id = ?", second.ID).Update("shop_id", "other-shop").Error)
	ok, err = MarkJingSoftOrderCreated(second.ID, claimed.Version, *first.UpstreamOrderID, "https://wzyp.cn/pay", common.GetTimestamp())
	require.NoError(t, err)
	require.True(t, ok)
	var wg sync.WaitGroup
	results := make(chan bool, 2)
	for range 2 {
		wg.Go(func() {
			already, err := CompleteVerifiedJingSoftOrder(first.ID, first.Version, key, "tx-first", "")
			results <- err == nil && !already
		})
	}
	wg.Wait()
	close(results)
	credits := 0
	for credited := range results {
		if credited {
			credits++
		}
	}
	assert.Equal(t, 1, credits)
	second, err = GetJingSoftOrderByTradeNo(second.TradeNo)
	require.NoError(t, err)
	ok, err = UpdateJingSoftOrder(second.ID, second.Version, JingSoftOrderUpdate{Status: JingSoftOrderStatusPaid})
	require.NoError(t, err)
	require.True(t, ok)
	second, err = GetJingSoftOrderByTradeNo(second.TradeNo)
	require.NoError(t, err)
	_, err = CompleteVerifiedJingSoftOrder(second.ID, second.Version, key, "tx-second", "")
	require.ErrorIs(t, err, ErrRedemptionUsed, "the same local code cannot fund another purchase")
	stored, err := GetJingSoftOrderByTradeNo(second.TradeNo)
	require.NoError(t, err)
	assert.Equal(t, JingSoftOrderStatusPaid, stored.Status)
	assert.Nil(t, stored.RedemptionID)
	assert.Equal(t, common.TopUpStatusPending, GetTopUpById(second.TopUpID).Status)
	completed, err := GetJingSoftOrderByTradeNo(first.TradeNo)
	require.NoError(t, err)
	require.Error(t, DB.Model(&JingSoftOrder{}).Where("id = ?", second.ID).Update("redemption_id", completed.RedemptionID).Error)
	var user User
	require.NoError(t, DB.First(&user, "id = ?", userID).Error)
	assert.Equal(t, 500, user.Quota)
}

func TestJingSoftDirectSettlementAndTransactionReplay(t *testing.T) {
	userID, key := setupRedeemFixture(t, 500)
	require.NoError(t, DB.AutoMigrate(&JingSoftOrder{}, &JingSoftPriceSlot{}))

	// 1. Direct-mode order credits wallet directly, hides redemption lookup, and populates JingSoftMode on TopUp history.
	directOrder, existed, err := CreateJingSoftOrder(&JingSoftOrder{
		UserID: userID, TradeNo: "JingSoft_direct_1", IdempotencyKey: "idem-direct-1",
		TierID: "direct:10", ProductID: "slot-1", ChannelID: "1", ExpectedQuota: 600,
		PriceAmount: "70.00", Currency: "CNY", ShopID: "shop", ShopName: "Direct Shop",
		PaymentMethod: PaymentMethodJingSoftWeChat, Mode: JingSoftOrderModeDirect, ExpectedContact: "JingSoft_direct_1",
		CredentialCiphertext: "encrypted",
	})
	require.NoError(t, err)
	require.False(t, existed)
	t.Cleanup(func() {
		require.NoError(t, DB.Delete(&JingSoftOrder{}, "id = ?", directOrder.ID).Error)
		require.NoError(t, DB.Delete(&TopUp{}, "id = ?", directOrder.TopUpID).Error)
	})

	_, err = GetJingSoftRedemptionForUser(userID, directOrder.TradeNo)
	require.ErrorIs(t, err, ErrJingSoftDirectOrderNoRedemption)
	directOrder = markJingSoftOrderPaid(t, directOrder)
	_, err = CompleteVerifiedJingSoftOrder(directOrder.ID, directOrder.Version, "", "", "")
	require.ErrorIs(t, err, ErrJingSoftTransactionRequired)
	already, err := CompleteVerifiedJingSoftOrder(directOrder.ID, directOrder.Version, "", "wx-official-tx-1", "")
	require.NoError(t, err)
	assert.False(t, already)
	already, err = CompleteVerifiedJingSoftOrder(directOrder.ID, directOrder.Version, "", "wx-official-tx-1", "")
	require.NoError(t, err)
	assert.True(t, already)

	storedDirect, err := GetJingSoftOrderByTradeNo(directOrder.TradeNo)
	require.NoError(t, err)
	assert.Equal(t, JingSoftOrderStatusCompleted, storedDirect.Status)
	assert.Nil(t, storedDirect.RedemptionID)
	require.NotNil(t, storedDirect.TransactionID)
	assert.Equal(t, "wx-official-tx-1", *storedDirect.TransactionID)
	_, err = GetJingSoftRedemptionForUser(userID, directOrder.TradeNo)
	require.ErrorIs(t, err, ErrJingSoftDirectOrderNoRedemption)

	topups, total, err := GetUserTopUps(userID, &common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	assert.Equal(t, JingSoftOrderModeDirect, topups[0].JingSoftMode)

	// 2. Cross-mode transaction_id replay must fail and roll back without crediting wallet or consuming redemption code.
	replayRedemption := markJingSoftOrderPaid(t, setupJingSoftOrderFixture(t, userID, "tx-replay-redemption"))
	_, err = CompleteVerifiedJingSoftOrder(replayRedemption.ID, replayRedemption.Version, key, "wx-official-tx-1", "")
	require.ErrorIs(t, err, ErrJingSoftTransactionReplay)

	// 3. Concurrent direct orders competing on the same transaction_id settle at most one.
	d1, _, err := CreateJingSoftOrder(&JingSoftOrder{
		UserID: userID, TradeNo: "JingSoft_direct_race_1", IdempotencyKey: "idem-race-1",
		TierID: "direct:5", ProductID: "slot-1", ChannelID: "1", ExpectedQuota: 200,
		PriceAmount: "35.00", Currency: "CNY", ShopID: "shop", Mode: JingSoftOrderModeDirect, ExpectedContact: "JingSoft_direct_race_1",
	})
	require.NoError(t, err)
	d2, _, err := CreateJingSoftOrder(&JingSoftOrder{
		UserID: userID, TradeNo: "JingSoft_direct_race_2", IdempotencyKey: "idem-race-2",
		TierID: "direct:5", ProductID: "slot-2", ChannelID: "1", ExpectedQuota: 200,
		PriceAmount: "35.00", Currency: "CNY", ShopID: "shop", Mode: JingSoftOrderModeDirect, ExpectedContact: "JingSoft_direct_race_2",
	})
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, DB.Delete(&JingSoftOrder{}, "id IN ?", []int{d1.ID, d2.ID}).Error)
		require.NoError(t, DB.Delete(&TopUp{}, "id IN ?", []int{d1.TopUpID, d2.TopUpID}).Error)
	})
	d1 = markJingSoftOrderPaid(t, d1)
	d2 = markJingSoftOrderPaid(t, d2)

	var wg sync.WaitGroup
	wins := make(chan bool, 2)
	for _, candidate := range []*JingSoftOrder{d1, d2} {
		wg.Go(func() {
			done, settleErr := CompleteVerifiedJingSoftOrder(candidate.ID, candidate.Version, "", "wx-shared-race-tx", "")
			wins <- settleErr == nil && !done
		})
	}
	wg.Wait()
	close(wins)
	winCount := 0
	for won := range wins {
		if won {
			winCount++
		}
	}
	assert.Equal(t, 1, winCount)

	// 4. Pre-upgrade in-flight redemption order (empty Mode and ExpectedContact) still completes without TransactionID.
	legacyInFlight, _, err := CreateJingSoftOrder(&JingSoftOrder{
		UserID: userID, TradeNo: "JingSoft_preupgrade", IdempotencyKey: "idem-preupgrade",
		TierID: "tier", ProductID: "product", ChannelID: "1", ExpectedQuota: 500,
		PriceAmount: "2.50", Currency: "CNY", ShopID: "shop",
	})
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, DB.Delete(&JingSoftOrder{}, "id = ?", legacyInFlight.ID).Error)
		require.NoError(t, DB.Delete(&TopUp{}, "id = ?", legacyInFlight.TopUpID).Error)
	})
	legacyInFlight = markJingSoftOrderPaid(t, legacyInFlight)
	_, err = CompleteVerifiedJingSoftOrder(legacyInFlight.ID, legacyInFlight.Version, key, "", "")
	require.NoError(t, err)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userID).Error)
	assert.Equal(t, 600+200+500, user.Quota)
}

func TestJingSoftPriceSlotLeaseAndQuarantine(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&JingSoftPriceSlot{}))
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&JingSoftPriceSlot{}).Error)
	})
	now := int64(1700000000)
	keys := []string{"slot-a", "slot-b"}

	first, ok, err := AcquireJingSoftPriceSlot("shop-1", keys, "10.00", "order-1", now, 60)
	require.NoError(t, err)
	require.True(t, ok)
	second, ok, err := AcquireJingSoftPriceSlot("shop-1", keys, "20.00", "order-2", now, 60)
	require.NoError(t, err)
	require.True(t, ok)
	assert.NotEqual(t, first.GoodsKey, second.GoodsKey)

	// Exhausted pool returns ok=false without overwriting active leases.
	_, ok, err = AcquireJingSoftPriceSlot("shop-1", keys, "30.00", "order-3", now, 60)
	require.NoError(t, err)
	assert.False(t, ok)

	// Clean release records confirmed price and prefers matching price on next acquire.
	released, err := ReleaseJingSoftPriceSlot(second.ID, second.Version, second.HolderToken, "20.00", now+10)
	require.NoError(t, err)
	assert.True(t, released)

	// Expired lease on first is quarantined, NOT reused! Only second ("20.00") is acquired.
	reused, ok, err := AcquireJingSoftPriceSlot("shop-1", keys, "20.00", "order-4", now+61, 60)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, second.GoodsKey, reused.GoodsKey)

	_, ok, err = AcquireJingSoftPriceSlot("shop-1", keys, "10.00", "order-5", now+61, 60)
	require.NoError(t, err)
	assert.False(t, ok, "expired slot must stay quarantined until explicitly reset")

	var quarantinedSlot JingSoftPriceSlot
	require.NoError(t, DB.First(&quarantinedSlot, "id = ?", first.ID).Error)
	assert.Equal(t, JingSoftSlotStatusQuarantined, quarantinedSlot.Status)
	assert.Equal(t, "lease_expired", quarantinedSlot.QuarantineCode)

	resetCount, err := ResetQuarantinedJingSoftPriceSlots("shop-1", now+62)
	require.NoError(t, err)
	assert.Equal(t, int64(1), resetCount)

	recovered, ok, err := AcquireJingSoftPriceSlot("shop-1", keys, "15.00", "order-6", now+63, 60)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, first.GoodsKey, recovered.GoodsKey)
}

// Exactly one of several concurrent redeems of the same code may win, and
// quota must be credited exactly once.
func TestRedeemConcurrentSingleSuccess(t *testing.T) {
	userId, key := setupRedeemFixture(t, 300)

	const goroutines = 5
	successes := make([]bool, goroutines)
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := range goroutines {
		go func(idx int) {
			defer wg.Done()
			if _, err := Redeem(key, userId); err == nil {
				successes[idx] = true
			}
		}(i)
	}
	wg.Wait()

	successCount := 0
	for _, ok := range successes {
		if ok {
			successCount++
		}
	}
	assert.Equal(t, 1, successCount, "exactly one concurrent redeem should succeed")

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 300, user.Quota, "quota must be credited exactly once")
}
