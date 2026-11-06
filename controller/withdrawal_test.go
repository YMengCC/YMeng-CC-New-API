package controller

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// External DSNs must point to disposable databases, as in the invoice matrix.
func TestWithdrawalDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(filepath.Join(t.TempDir(), "withdrawal.db") + "?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)")
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
			require.NoError(t, err)
			connection, err := db.DB()
			require.NoError(t, err)
			connection.SetMaxOpenConns(8)
			oldDB, oldLog := model.DB, model.LOG_DB
			oldMain, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
			oldRedis, oldBatch, oldQuota := common.RedisEnabled, common.BatchUpdateEnabled, common.QuotaPerUnit
			oldGeneral, oldPayment := *operation_setting.GetGeneralSetting(), *operation_setting.GetPaymentSetting()
			model.DB, model.LOG_DB = db, db
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			common.RedisEnabled, common.BatchUpdateEnabled, common.QuotaPerUnit = false, false, 100
			operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
			operation_setting.GetPaymentSetting().ComplianceConfirmed = true
			operation_setting.GetPaymentSetting().ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&model.Withdrawal{}, &model.WithdrawalProfile{}, &model.AffiliateCommission{}, &model.UserAccessToken{}, &model.AuditLog{}, &model.User{}))
				model.DB, model.LOG_DB = oldDB, oldLog
				common.SetDatabaseTypes(oldMain, oldLogType)
				common.RedisEnabled, common.BatchUpdateEnabled, common.QuotaPerUnit = oldRedis, oldBatch, oldQuota
				*operation_setting.GetGeneralSetting(), *operation_setting.GetPaymentSetting() = oldGeneral, oldPayment
				require.NoError(t, connection.Close())
			})
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("database: %s %s", dialect, version)
			require.NoError(t, i18n.Init())
			gin.SetMode(gin.TestMode)
			// A representative pre-feature user remains unchanged when the new
			// independent tables and their indexes are added on two restarts.
			require.NoError(t, db.AutoMigrate(&model.User{}))
			legacy := withdrawalTestUser(t, "legacy", 123)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.User{}, &model.WithdrawalProfile{}, &model.Withdrawal{}, &model.AffiliateCommission{}, &model.UserAccessToken{}, &model.AuditLog{}))
			}
			var retained model.User
			require.NoError(t, db.First(&retained, legacy.Id).Error)
			assert.Equal(t, legacy.Username, retained.Username)
			assert.Equal(t, legacy.InviteQuota, retained.InviteQuota)
			assert.True(t, db.Migrator().HasIndex(&model.Withdrawal{}, "idx_withdrawal_user_request"))
			t.Run("minimum_display_amount", testWithdrawalMinimum)
			t.Run("accounting_and_snapshots", testWithdrawalAccounting)
			t.Run("independent_connection_races", testWithdrawalConcurrency)
			t.Run("png_and_api_authorization", testWithdrawalAPI)
		})
	}
}

func withdrawalTestUser(t *testing.T, name string, quota int64) model.User {
	t.Helper()
	user := model.User{Username: "withdrawal-" + name, Password: "retained-hash", DisplayName: "Before", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "withdrawal-" + name, InviteQuota: quota, Quota: 10, AffQuota: 700, AffHistoryQuota: 900, InviteRewardRemainder: 0.25}
	require.NoError(t, model.DB.Create(&user).Error)
	return user
}

func testWithdrawalMinimum(t *testing.T) {
	oldSettings, oldRate, oldUnit := *operation_setting.GetGeneralSetting(), operation_setting.USDExchangeRate, common.QuotaPerUnit
	t.Cleanup(func() {
		*operation_setting.GetGeneralSetting(), operation_setting.USDExchangeRate, common.QuotaPerUnit = oldSettings, oldRate, oldUnit
	})
	user := withdrawalTestUser(t, "minimum", 100_000)
	require.NoError(t, model.SaveWithdrawalProfile(user.Id, &model.WithdrawalProfile{Data: []byte("minimum-png"), Sha256: strings.Repeat("e", 64)}))
	readToken, _ := createScopedAccessToken(t, user.Id, 0, "profile:read")
	router := withdrawalTestRouter()
	for _, tc := range []struct {
		name         string
		displayType  string
		quotaPerUnit float64
		rate         float64
		minimum      int64
	}{
		{"USD_9.99_and_10", operation_setting.QuotaDisplayTypeUSD, 100, 7.3, 1000},
		{"CNY_9.99_and_10", operation_setting.QuotaDisplayTypeCNY, 300, 3, 1000},
		{"CUSTOM_9.99_and_10", operation_setting.QuotaDisplayTypeCustom, 100, 0.1, 10000},
		{"TOKENS_9_and_10", operation_setting.QuotaDisplayTypeTokens, 100, 7.3, 10},
		{"CNY_exact_ceiling", operation_setting.QuotaDisplayTypeCNY, 100, 7.3, 137},
		{"CUSTOM_exact_ceiling", operation_setting.QuotaDisplayTypeCustom, 100, 0.3, 3334},
		{"USD_fractional_quota_unit", operation_setting.QuotaDisplayTypeUSD, 100.1, 1, 1001},
	} {
		t.Run(tc.name, func(t *testing.T) {
			settings := operation_setting.GetGeneralSetting()
			settings.QuotaDisplayType, settings.CustomCurrencyExchangeRate = tc.displayType, tc.rate
			operation_setting.USDExchangeRate, common.QuotaPerUnit = tc.rate, tc.quotaPerUnit
			response := withdrawalAPIRequest(router, "GET", "/api/withdrawal/profile", readToken, nil, "")
			var metadata struct {
				Success bool `json:"success"`
				Data    struct {
					MinimumQuota int64 `json:"minimum_quota"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &metadata))
			require.True(t, metadata.Success, response.Body.String())
			assert.Equal(t, tc.minimum, metadata.Data.MinimumQuota)
			var before model.User
			require.NoError(t, model.DB.First(&before, user.Id).Error)
			_, err := model.CreateWithdrawal(user.Id, tc.minimum-1, uuid.NewString())
			assert.ErrorIs(t, err, model.ErrWithdrawalAmountTooLow)
			requestID := uuid.NewString()
			application, err := model.CreateWithdrawal(user.Id, tc.minimum, requestID)
			require.NoError(t, err, "exact integer minimum must succeed")
			assert.Equal(t, tc.minimum, application.Quota)
			// Raising the current minimum cannot invalidate an accepted request.
			settings.QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
			common.QuotaPerUnit = 100_000
			replayed, err := model.CreateWithdrawal(user.Id, tc.minimum, requestID)
			require.NoError(t, err)
			assert.Equal(t, application.Id, replayed.Id)
			assert.Equal(t, application.CurrencySnapshot, replayed.CurrencySnapshot)
			_, err = model.CreateWithdrawal(user.Id, tc.minimum, uuid.NewString())
			assert.ErrorIs(t, err, model.ErrWithdrawalAmountTooLow)
			var after model.User
			require.NoError(t, model.DB.First(&after, user.Id).Error)
			assert.Equal(t, before.InviteQuota-tc.minimum, after.InviteQuota, "minimum failures and replay must not debit")
		})
	}
	// An application accepted under the former no-minimum rule must replay,
	// including amounts below 10 raw quota and a now-unconfigured profile.
	legacy := model.Withdrawal{UserId: user.Id, Quota: 1, RequestId: uuid.NewString(), Status: model.WithdrawalStatusPending, QRData: []byte("legacy-png")}
	require.NoError(t, model.DB.Create(&legacy).Error)
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Delete(&model.WithdrawalProfile{}).Error)
	var before model.User
	require.NoError(t, model.DB.First(&before, user.Id).Error)
	replayed, err := model.CreateWithdrawal(user.Id, 1, legacy.RequestId)
	require.NoError(t, err)
	assert.Equal(t, legacy.Id, replayed.Id)
	_, err = model.CreateWithdrawal(user.Id, 2, legacy.RequestId)
	assert.ErrorIs(t, err, model.ErrWithdrawalRequestConflict)
	var after model.User
	require.NoError(t, model.DB.First(&after, user.Id).Error)
	assert.Equal(t, before.InviteQuota, after.InviteQuota)
}

func testWithdrawalAccounting(t *testing.T) {
	oldSettings := *operation_setting.GetGeneralSetting()
	t.Cleanup(func() { *operation_setting.GetGeneralSetting() = oldSettings })
	user := withdrawalTestUser(t, "accounting", 300)
	_, err := model.CreateWithdrawal(user.Id, 10, uuid.NewString())
	require.ErrorIs(t, err, model.ErrWithdrawalQRRequired)
	require.NoError(t, model.SaveWithdrawalProfile(user.Id, &model.WithdrawalProfile{Data: []byte("original-png"), Sha256: strings.Repeat("a", 64)}))
	for _, amount := range []int64{0, -1, 301, common.MaxWalletQuota + 1, 1<<63 - 1} {
		_, err := model.CreateWithdrawal(user.Id, amount, uuid.NewString())
		assert.Error(t, err, "quota=%d", amount)
	}
	_, err = model.CreateWithdrawal(user.Id, 1, "invalid")
	assert.ErrorIs(t, err, model.ErrWithdrawalRequestInvalid)
	requestID := uuid.NewString()
	application, err := model.CreateWithdrawal(user.Id, 10, requestID)
	require.NoError(t, err, "below the transfer minimum remains valid")
	assert.Equal(t, model.WithdrawalStatusPending, application.Status)
	assert.Equal(t, common.QuotaPerUnit, application.CurrencySnapshot.QuotaPerUnit)
	assert.Equal(t, operation_setting.USDExchangeRate, application.CurrencySnapshot.USDExchangeRate)
	assert.Equal(t, operation_setting.GetQuotaDisplayType(), application.CurrencySnapshot.QuotaDisplayType)
	originalSnapshot := application.CurrencySnapshot
	// Saving a pre-withdrawal user snapshot cannot resurrect referral funds.
	user.DisplayName = "After"
	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error { return user.UpdateWithTx(tx, false) }))
	require.NoError(t, model.SaveWithdrawalProfile(user.Id, &model.WithdrawalProfile{Data: []byte("replacement-png"), Sha256: strings.Repeat("b", 64)}))
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeCustom
	operation_setting.GetGeneralSetting().CustomCurrencySymbol = "NEW"
	operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate = 42
	replayed, err := model.CreateWithdrawal(user.Id, 10, strings.ToUpper(requestID))
	require.NoError(t, err)
	assert.Equal(t, application.Id, replayed.Id)
	assert.Equal(t, originalSnapshot, replayed.CurrencySnapshot)
	_, err = model.CreateWithdrawal(user.Id, 2, requestID)
	assert.ErrorIs(t, err, model.ErrWithdrawalRequestConflict)
	pngData, err := model.GetWithdrawalQR(application.Id)
	require.NoError(t, err)
	assert.Equal(t, []byte("original-png"), pngData)
	for _, status := range []string{model.WithdrawalStatusCompleted, model.WithdrawalStatusCompleted, model.WithdrawalStatusPending} {
		require.NoError(t, model.SetWithdrawalStatus(application.Id, 99, status))
	}
	assert.ErrorIs(t, model.SetWithdrawalStatus(application.Id, 99, "rejected"), model.ErrWithdrawalStatusInvalid)
	var after model.User
	require.NoError(t, model.DB.First(&after, user.Id).Error)
	assert.Equal(t, int64(290), after.InviteQuota)
	assert.Equal(t, user.Quota, after.Quota)
	assert.Equal(t, user.AffQuota, after.AffQuota)
	assert.Equal(t, user.AffHistoryQuota, after.AffHistoryQuota)
	assert.Equal(t, user.InviteRewardRemainder, after.InviteRewardRemainder)
	var stored model.Withdrawal
	require.NoError(t, model.DB.First(&stored, application.Id).Error)
	assert.Equal(t, originalSnapshot, stored.CurrencySnapshot)
	assert.Equal(t, 99, stored.UpdatedBy)
	// A failed application insert must roll back the earlier conditional debit.
	const callback = "test:withdrawal_insert_failure"
	require.NoError(t, model.DB.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if tx.Statement.Table == "withdrawals" {
			tx.AddError(errors.New("injected application insert failure"))
		}
	}))
	_, err = model.CreateWithdrawal(user.Id, 100, uuid.NewString())
	require.ErrorContains(t, err, "injected application insert failure")
	require.NoError(t, model.DB.Callback().Create().Remove(callback))
	require.NoError(t, model.DB.First(&after, user.Id).Error)
	assert.Equal(t, int64(290), after.InviteQuota)
	// The database unique index is an independent retry safety fence.
	duplicate := stored
	duplicate.Id = 0
	assert.Error(t, model.DB.Create(&duplicate).Error)
	_, err = model.CreateWithdrawal(user.Id, 290, uuid.NewString())
	require.NoError(t, err, "withdrawing all available quota succeeds")
	require.NoError(t, model.DB.First(&after, user.Id).Error)
	assert.Zero(t, after.InviteQuota)
	full := withdrawalTestUser(t, "wallet-full", 100)
	require.NoError(t, model.DB.Model(&full).UpdateColumn("quota", common.MaxWalletQuota).Error)
	assert.Error(t, full.TransferAffQuotaToQuota(100))
	after = model.User{}
	require.NoError(t, model.DB.First(&after, full.Id).Error)
	assert.Equal(t, int64(100), after.InviteQuota)
	assert.Equal(t, common.MaxWalletQuota, after.Quota)
}

func testWithdrawalConcurrency(t *testing.T) {
	user := withdrawalTestUser(t, "race", 200)
	require.NoError(t, model.SaveWithdrawalProfile(user.Id, &model.WithdrawalProfile{Data: []byte("race-png"), Sha256: strings.Repeat("c", 64)}))
	// Pause each operation before its first user query: all four transactions
	// then hold distinct database connections before any can debit or credit.
	arrived, release := make(chan struct{}, 4), make(chan struct{})
	var queries atomic.Int32
	const callback = "test:withdrawal_race_barrier"
	require.NoError(t, model.DB.Callback().Query().Before("gorm:query").Register(callback, func(tx *gorm.DB) {
		if tx.Statement.Table == "users" && queries.Add(1) <= 4 {
			arrived <- struct{}{}
			<-release
		}
	}))
	var wg sync.WaitGroup
	errorsByOperation := make([]error, 4)
	requestID := uuid.NewString()
	for i := range 4 {
		wg.Go(func() {
			switch i {
			case 0, 1:
				_, errorsByOperation[i] = model.CreateWithdrawal(user.Id, 120, requestID)
			case 2:
				transfer := model.User{Id: user.Id}
				errorsByOperation[i] = transfer.TransferAffQuotaToQuota(100)
			case 3:
				_, errorsByOperation[i] = model.CreditAffiliateCommission(&model.AffiliateCommission{InviterId: int64(user.Id), InviteeId: int64(user.Id + 1), SourceKey: "withdrawal-race", EligibleQuota: 100, RatePercent: 50})
			}
		})
	}
	for range 4 {
		<-arrived
	}
	pool, err := model.DB.DB()
	require.NoError(t, err)
	assert.GreaterOrEqual(t, pool.Stats().InUse, 4)
	close(release)
	wg.Wait()
	require.NoError(t, model.DB.Callback().Query().Remove(callback))
	var applications []model.Withdrawal
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Find(&applications).Error)
	assert.LessOrEqual(t, len(applications), 1, "concurrent UUID replay cannot duplicate applications")
	var after model.User
	require.NoError(t, model.DB.First(&after, user.Id).Error)
	withdrawn := int64(0)
	for _, application := range applications {
		withdrawn += application.Quota
	}
	credit := int64(0)
	if errorsByOperation[3] == nil {
		credit = 50
	}
	transferred := int64(0)
	if errorsByOperation[2] == nil {
		transferred = 100
	}
	assert.Equal(t, int64(200)+credit-withdrawn-transferred, after.InviteQuota)
	assert.GreaterOrEqual(t, after.InviteQuota, int64(0))
	assert.Equal(t, user.Quota+int(transferred), after.Quota)
	assert.Equal(t, user.AffHistoryQuota+int(credit), after.AffHistoryQuota)
	if !common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		for _, err := range errorsByOperation {
			assert.NoError(t, err)
		}
		assert.Equal(t, int64(30), after.InviteQuota)
	}
	// SQLite may reject lock upgrades; every rejected operation must leave no
	// partial application, commission, debit, or wallet credit behind.
	var records []model.AffiliateCommission
	require.NoError(t, model.DB.Where("inviter_id = ?", user.Id).Find(&records).Error)
	assert.Len(t, records, int(credit/50))

	// Different request IDs still compete for the same available balance.
	contested := withdrawalTestUser(t, "contested", 200)
	require.NoError(t, model.SaveWithdrawalProfile(contested.Id, &model.WithdrawalProfile{Data: []byte("contested-png"), Sha256: strings.Repeat("d", 64)}))
	queries.Store(0)
	arrived, release = make(chan struct{}, 2), make(chan struct{})
	require.NoError(t, model.DB.Callback().Query().Before("gorm:query").Register(callback, func(tx *gorm.DB) {
		if tx.Statement.Table == "users" && queries.Add(1) <= 2 {
			arrived <- struct{}{}
			<-release
		}
	}))
	for range 2 {
		wg.Go(func() { _, _ = model.CreateWithdrawal(contested.Id, 120, uuid.NewString()) })
	}
	for range 2 {
		<-arrived
	}
	close(release)
	wg.Wait()
	require.NoError(t, model.DB.Callback().Query().Remove(callback))
	var count int64
	require.NoError(t, model.DB.Model(&model.Withdrawal{}).Where("user_id = ?", contested.Id).Count(&count).Error)
	assert.Equal(t, int64(1), count)
	after = model.User{}
	require.NoError(t, model.DB.First(&after, contested.Id).Error)
	assert.Equal(t, int64(80), after.InviteQuota)
}

func withdrawalTestRouter() *gin.Engine {
	r := gin.New()
	r.Use(middleware.RequestId(), middleware.AccessTokenAudit())
	user := r.Group("/api/withdrawal", middleware.UserAuth())
	user.GET("/profile", GetWithdrawalProfile)
	user.GET("/profile/qr", GetWithdrawalProfileQR)
	user.PUT("/profile/qr", UpdateWithdrawalQR)
	user.POST("/", CreateWithdrawal)
	admin := r.Group("/api/withdrawal/admin", middleware.AdminAuth())
	admin.GET("/", GetAllWithdrawals)
	admin.GET("/:id/qr", GetWithdrawalQR)
	admin.PATCH("/:id/status", SetWithdrawalStatus)
	return r
}

func withdrawalAPIRequest(r http.Handler, method, path, token string, data []byte, contentType string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, bytes.NewReader(data))
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	response := httptest.NewRecorder()
	r.ServeHTTP(response, request)
	return response
}

func withdrawalUploadRequest(t *testing.T, r http.Handler, token string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("qr", "untrusted.svg")
	require.NoError(t, err)
	_, err = part.Write(data)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	return withdrawalAPIRequest(r, http.MethodPut, "/api/withdrawal/profile/qr", token, body.Bytes(), writer.FormDataContentType())
}

func testWithdrawalAPI(t *testing.T) {
	user := withdrawalTestUser(t, "api", 100)
	other := withdrawalTestUser(t, "other", 100)
	admin := withdrawalTestUser(t, "admin", 100)
	require.NoError(t, model.DB.Model(&admin).UpdateColumn("role", common.RoleAdminUser).Error)
	ownerRead, _ := createScopedAccessToken(t, user.Id, 0, "profile:read")
	ownerWrite, _ := createScopedAccessToken(t, user.Id, 0, "profile:write")
	walletWrite, _ := createScopedAccessToken(t, user.Id, 0, "wallet:write")
	otherRead, _ := createScopedAccessToken(t, other.Id, 0, "profile:read", "billing:read", "billing:write")
	adminRead, _ := createScopedAccessToken(t, admin.Id, 0, "billing:read")
	adminWrite, _ := createScopedAccessToken(t, admin.Id, 0, "billing:write")
	r := withdrawalTestRouter()
	response := withdrawalAPIRequest(r, "GET", "/api/withdrawal/profile", ownerRead, nil, "")
	assert.Contains(t, response.Body.String(), `"has_qr":false`)
	assert.Contains(t, response.Body.String(), `"minimum_quota":10`)
	for _, token := range []string{"", "invalid"} {
		response := withdrawalAPIRequest(r, "GET", "/api/withdrawal/profile/qr", token, nil, "")
		assert.Equal(t, http.StatusUnauthorized, response.Code)
	}
	var valid, jpegData, tooWide bytes.Buffer
	require.NoError(t, png.Encode(&valid, image.NewRGBA(image.Rect(0, 0, 32, 48))))
	require.NoError(t, jpeg.Encode(&jpegData, image.NewRGBA(image.Rect(0, 0, 16, 16)), nil))
	require.NoError(t, png.Encode(&tooWide, image.NewRGBA(image.Rect(0, 0, service.MaxPayoutQRDimension+1, 1))))
	for name, data := range map[string][]byte{"empty": nil, "jpeg": jpegData.Bytes(), "svg": []byte("<svg/>"), "truncated": valid.Bytes()[:40], "too-wide": tooWide.Bytes(), "too-large": bytes.Repeat([]byte{0}, int(service.MaxPayoutQRSize)+1)} {
		t.Run(name, func(t *testing.T) {
			assert.Equal(t, http.StatusBadRequest, withdrawalUploadRequest(t, r, ownerWrite, data).Code)
		})
	}
	assert.Equal(t, http.StatusForbidden, withdrawalUploadRequest(t, r, ownerRead, valid.Bytes()).Code)
	response = withdrawalUploadRequest(t, r, ownerWrite, valid.Bytes())
	require.Contains(t, response.Body.String(), `"has_qr":true`)
	assert.Contains(t, response.Body.String(), `"minimum_quota":10`)
	response = withdrawalAPIRequest(r, "GET", "/api/withdrawal/profile/qr?user_id="+strconv.Itoa(other.Id), ownerRead, nil, "")
	assert.Equal(t, valid.Bytes(), response.Body.Bytes())
	assert.Equal(t, "image/png", response.Header().Get("Content-Type"))
	assert.Equal(t, "private, no-store", response.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", response.Header().Get("X-Content-Type-Options"))
	response = withdrawalAPIRequest(r, "GET", "/api/withdrawal/profile/qr?user_id="+strconv.Itoa(user.Id), otherRead, nil, "")
	assert.Equal(t, http.StatusNotFound, response.Code, "query cannot select another user's QR")
	for _, quota := range []string{"0", "-1", "101", "9007199254740992", "9223372036854775808", "1.5"} {
		response := withdrawalAPIRequest(r, "POST", "/api/withdrawal/", walletWrite, []byte(fmt.Sprintf(`{"quota":%s,"request_id":%q}`, quota, uuid.NewString())), "application/json")
		assert.Contains(t, response.Body.String(), `"success":false`, quota)
	}
	response = withdrawalAPIRequest(r, "POST", "/api/withdrawal/", walletWrite, []byte(fmt.Sprintf(`{"quota":9,"request_id":%q}`, uuid.NewString())), "application/json")
	assert.Contains(t, response.Body.String(), "Minimum withdrawal amount is 10")
	operation_setting.GetPaymentSetting().ComplianceConfirmed = false
	response = withdrawalAPIRequest(r, "POST", "/api/withdrawal/", walletWrite, []byte(fmt.Sprintf(`{"quota":10,"request_id":%q}`, uuid.NewString())), "application/json")
	assert.Contains(t, response.Body.String(), `"success":false`)
	operation_setting.GetPaymentSetting().ComplianceConfirmed = true
	body := []byte(fmt.Sprintf(`{"quota":10,"request_id":%q}`, uuid.NewString()))
	response = withdrawalAPIRequest(r, "POST", "/api/withdrawal/", ownerRead, body, "application/json")
	assert.Equal(t, http.StatusForbidden, response.Code)
	response = withdrawalAPIRequest(r, "POST", "/api/withdrawal/", walletWrite, body, "application/json")
	var result struct {
		Success bool             `json:"success"`
		Data    model.Withdrawal `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.True(t, result.Success, response.Body.String())
	id := strconv.Itoa(result.Data.Id)
	for _, path := range []string{"/api/withdrawal/admin/", "/api/withdrawal/admin/" + id + "/qr"} {
		assert.Equal(t, http.StatusForbidden, withdrawalAPIRequest(r, "GET", path, otherRead, nil, "").Code)
		assert.Equal(t, http.StatusForbidden, withdrawalAPIRequest(r, "GET", path, adminWrite, nil, "").Code)
	}
	response = withdrawalAPIRequest(r, "GET", "/api/withdrawal/admin/"+id+"/qr", adminRead, nil, "")
	assert.Equal(t, valid.Bytes(), response.Body.Bytes())
	assert.Equal(t, "private, no-store", response.Header().Get("Cache-Control"))
	response = withdrawalAPIRequest(r, "GET", "/api/withdrawal/admin/?p=1&page_size=5&keyword="+user.Username+"&status=pending", adminRead, nil, "")
	var list struct {
		Success bool `json:"success"`
		Data    struct {
			Items    []model.Withdrawal `json:"items"`
			Total    int                `json:"total"`
			Page     int                `json:"p"`
			PageSize int                `json:"page_size"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &list))
	require.True(t, list.Success, response.Body.String())
	require.Len(t, list.Data.Items, 1)
	assert.Equal(t, 1, list.Data.Total)
	assert.Equal(t, 1, list.Data.Page)
	assert.Equal(t, 5, list.Data.PageSize)
	assert.Equal(t, user.Username, list.Data.Items[0].Username)
	assert.NotContains(t, response.Body.String(), "request_id")
	assert.NotContains(t, response.Body.String(), "qr_data")
	for _, query := range []string{"status=rejected", "p=0", "page_size=101"} {
		response = withdrawalAPIRequest(r, "GET", "/api/withdrawal/admin/?"+query, adminRead, nil, "")
		assert.Contains(t, response.Body.String(), `"success":false`)
	}
	assert.Equal(t, http.StatusForbidden, withdrawalAPIRequest(r, "PATCH", "/api/withdrawal/admin/"+id+"/status", adminRead, []byte(`{"status":"completed"}`), "application/json").Code)
	for _, status := range []string{"completed", "completed", "pending"} {
		response = withdrawalAPIRequest(r, "PATCH", "/api/withdrawal/admin/"+id+"/status", adminWrite, []byte(fmt.Sprintf(`{"status":%q}`, status)), "application/json")
		assert.Contains(t, response.Body.String(), `"success":true`)
	}
	var stored model.Withdrawal
	require.NoError(t, model.DB.First(&stored, result.Data.Id).Error)
	assert.Equal(t, admin.Id, stored.UpdatedBy)
	var auditCount int64
	require.NoError(t, model.LOG_DB.Model(&model.AuditLog{}).Where("user_id = ? AND category = ?", admin.Id, model.AuditCategoryOperation).Count(&auditCount).Error)
	assert.GreaterOrEqual(t, auditCount, int64(3))
	var after model.User
	require.NoError(t, model.DB.First(&after, user.Id).Error)
	assert.Equal(t, int64(90), after.InviteQuota)
	assert.Equal(t, user.Quota, after.Quota)
}
