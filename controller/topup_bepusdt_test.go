package controller

import (
	"bytes"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupBEpusdtTestEnv(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)
	confirmPaymentComplianceForTest(t)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.TopUp{},
		&model.Log{},
		&model.Option{},
		&model.SubscriptionPlan{},
		&model.SubscriptionOrder{},
		&model.UserSubscription{},
	))

	prevDB := model.DB
	prevLogDB := model.LOG_DB
	prevQuotaPerUnit := common.QuotaPerUnit
	prevPrice := operation_setting.Price
	prevServerAddr := system_setting.ServerAddress
	prevCallbackAddr := operation_setting.CustomCallbackAddress
	prevEnabled := setting.BEpusdtEnabled
	prevURL := setting.BEpusdtApiUrl
	prevToken := setting.BEpusdtApiToken
	prevFiat := setting.BEpusdtFiat
	prevUnitPrice := setting.BEpusdtUnitPrice
	prevMinTopUp := setting.BEpusdtMinTopUp
	prevTimeout := setting.BEpusdtTimeout
	prevRate := setting.BEpusdtRate
	prevNotifyURL := setting.BEpusdtNotifyUrl
	prevReturnURL := setting.BEpusdtReturnUrl
	prevRedisEnabled := common.RedisEnabled

	common.OptionMapRWMutex.Lock()
	prevOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string, len(prevOptionMap)+4)
	maps.Copy(common.OptionMap, prevOptionMap)
	common.OptionMapRWMutex.Unlock()

	model.InitModelColumnNamesForTest()
	model.DB = db
	model.LOG_DB = db
	common.RedisEnabled = false
	common.QuotaPerUnit = 500000
	operation_setting.Price = 7.3
	system_setting.ServerAddress = "https://api.example.com"
	operation_setting.CustomCallbackAddress = ""
	setting.BEpusdtEnabled = true
	setting.BEpusdtFiat = "CNY"
	setting.BEpusdtUnitPrice = 0
	setting.BEpusdtMinTopUp = 1
	setting.BEpusdtTimeout = 1200
	setting.BEpusdtRate = ""
	setting.BEpusdtNotifyUrl = ""
	setting.BEpusdtReturnUrl = ""

	t.Cleanup(func() {
		model.DB = prevDB
		model.LOG_DB = prevLogDB
		common.RedisEnabled = prevRedisEnabled
		common.QuotaPerUnit = prevQuotaPerUnit
		operation_setting.Price = prevPrice
		system_setting.ServerAddress = prevServerAddr
		operation_setting.CustomCallbackAddress = prevCallbackAddr
		setting.BEpusdtEnabled = prevEnabled
		setting.BEpusdtApiUrl = prevURL
		setting.BEpusdtApiToken = prevToken
		setting.BEpusdtFiat = prevFiat
		setting.BEpusdtUnitPrice = prevUnitPrice
		setting.BEpusdtMinTopUp = prevMinTopUp
		setting.BEpusdtTimeout = prevTimeout
		setting.BEpusdtRate = prevRate
		setting.BEpusdtNotifyUrl = prevNotifyURL
		setting.BEpusdtReturnUrl = prevReturnURL
		common.OptionMapRWMutex.Lock()
		common.OptionMap = prevOptionMap
		common.OptionMapRWMutex.Unlock()
		if sqlDB, dbErr := db.DB(); dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func TestBEpusdtSignatureAndWebhookVerification(t *testing.T) {
	token := "test-bepusdt-token"
	params := map[string]any{
		"order_id":             "BEPUSDT-1-100",
		"trade_id":             "tr_abc123",
		"amount":               float64(73.5),
		"actual_amount":        "10.07",
		"token":                "TTestWalletAddress1234567890123456",
		"block_transaction_id": "0xtxhash",
		"status":               float64(2),
		"empty_str":            "",
		"nil_val":              nil,
	}
	sig := service.SignBEpusdtParams(params, token)
	require.Len(t, sig, 32)
	assert.Equal(t, strings.ToLower(sig), sig)

	params["signature"] = sig
	body, err := common.Marshal(params)
	require.NoError(t, err)

	verified, err := service.VerifyBEpusdtWebhook(body, token)
	require.NoError(t, err)
	assert.Equal(t, "BEPUSDT-1-100", verified.OrderID)
	assert.Equal(t, "tr_abc123", verified.TradeID)
	assert.Equal(t, 73.5, verified.Amount)
	assert.Equal(t, service.BEpusdtOrderStatusSuccess, verified.Status)

	// Tampered amount must fail signature verification.
	params["amount"] = float64(999.0)
	tamperedBody, err := common.Marshal(params)
	require.NoError(t, err)
	_, err = service.VerifyBEpusdtWebhook(tamperedBody, token)
	require.Error(t, err)

	// Missing signature must fail.
	delete(params, "signature")
	unsignedBody, err := common.Marshal(params)
	require.NoError(t, err)
	_, err = service.VerifyBEpusdtWebhook(unsignedBody, token)
	require.Error(t, err)
}

func TestBEpusdtOptionValidationAndTokenRedaction(t *testing.T) {
	setupBEpusdtTestEnv(t)

	invalidCases := []struct{ key, value string }{
		{"BEpusdtEnabled", "maybe"},
		{"BEpusdtApiUrl", "ftp://bepusdt.example.com"},
		{"BEpusdtApiUrl", "https://user:pass@bepusdt.example.com"},
		{"BEpusdtApiUrl", "https://bepusdt.example.com?x=1"},
		{"BEpusdtApiToken", "bad\ntoken"},
		{"BEpusdtFiat", "BTC"},
		{"BEpusdtUnitPrice", "-1"},
		{"BEpusdtMinTopUp", "0"},
		{"BEpusdtTimeout", "60"},
		{"BEpusdtNotifyUrl", "javascript:alert(1)"},
		{"BEpusdtReturnUrl", "not-a-url"},
		{"BEpusdtPayMethods", "not-json"},
		{"BEpusdtPayMethods", `[{"name":"","trade_type":"usdt.trc20"}]`},
		{"BEpusdtPayMethods", `[{"name":"USDT","trade_type":"usdt.trc20","min_topup":-5}]`},
	}
	for _, tc := range invalidCases {
		t.Run(tc.key+"="+tc.value, func(t *testing.T) {
			_, err := setting.ValidateBEpusdtOption(tc.key, tc.value)
			require.Error(t, err)
		})
	}

	normalizedURL, err := setting.ValidateBEpusdtOption("BEpusdtApiUrl", " https://bepusdt.ymeng.cc/ ")
	require.NoError(t, err)
	assert.Equal(t, "https://bepusdt.ymeng.cc", normalizedURL)

	normalizedFiat, err := setting.ValidateBEpusdtOption("BEpusdtFiat", "usd")
	require.NoError(t, err)
	assert.Equal(t, "USD", normalizedFiat)

	normalizedMethods, err := setting.ValidateBEpusdtOption("BEpusdtPayMethods", `[{"name":" Cashier ","trade_type":"","currencies":"USDT,USDC"}]`)
	require.NoError(t, err)
	assert.Contains(t, normalizedMethods, `"trade_type":"cashier"`)

	// Verify BEpusdtApiToken is stripped from GET /api/option/ while BEpusdtApiTokenConfigured is exposed.
	common.OptionMapRWMutex.Lock()
	common.OptionMap["BEpusdtApiToken"] = "super-secret-bepusdt-token"
	common.OptionMapRWMutex.Unlock()

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/option/", nil)
	GetOptions(ctx)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.NotContains(t, rec.Body.String(), "super-secret-bepusdt-token")
	assert.NotContains(t, rec.Body.String(), `"key":"BEpusdtApiToken"`)
	assert.Contains(t, rec.Body.String(), `"key":"BEpusdtApiTokenConfigured","value":"true"`)
}

func TestBEpusdtEndToEndTopUpSubscriptionAndWebhook(t *testing.T) {
	db := setupBEpusdtTestEnv(t)
	token := "bepusdt-live-token"

	var lastPath string
	var lastPayload map[string]any

	mockGateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		var m map[string]any
		require.NoError(t, common.Unmarshal(raw, &m))

		sig, _ := m["signature"].(string)
		expected := service.SignBEpusdtParams(m, token)
		if r.URL.Path == "/api/v1/pay/notify" {
			if sig == expected {
				_, _ = w.Write([]byte("ok"))
			} else {
				_, _ = w.Write([]byte("fail"))
			}
			return
		}
		if sig != expected {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status_code":400,"message":"签名错误"}`))
			return
		}
		lastPath = r.URL.Path
		lastPayload = m

		w.Header().Set("Content-Type", "application/json")
		resp := map[string]any{
			"status_code": 200,
			"message":     "success",
			"data": map[string]any{
				"trade_id":        "bep_trade_001",
				"order_id":        m["order_id"],
				"payment_url":     "https://bepusdt.ymeng.cc/pay/checkout/bep_trade_001",
				"expiration_time": 1200,
			},
		}
		b, _ := common.Marshal(resp)
		_, _ = w.Write(b)
	}))
	defer mockGateway.Close()

	setting.BEpusdtApiUrl = mockGateway.URL
	setting.BEpusdtApiToken = token
	methodsJSON, err := common.Marshal([]constant.BEpusdtPayMethod{
		{
			Name:      "USDT (TRC20)",
			Icon:      "SiTether",
			TradeType: "usdt.trc20",
			Address:   "TFixedWalletAddressForTesting12345",
			Rate:      "~1.01",
			MinTopUp:  5,
		},
		{
			Name:       "Crypto Cashier",
			Icon:       "LuCoins",
			TradeType:  constant.BEpusdtTradeTypeCashier,
			Currencies: "USDT,USDC",
		},
	})
	require.NoError(t, err)
	common.OptionMapRWMutex.Lock()
	common.OptionMap["BEpusdtPayMethods"] = string(methodsJSON)
	common.OptionMapRWMutex.Unlock()

	prevPayMethods := operation_setting.PayMethods
	t.Cleanup(func() { operation_setting.PayMethods = prevPayMethods })
	operation_setting.PayMethods = []map[string]string{
		{"name": "USDT (TRC20)", "type": "bepusdt_usdt.trc20", "channel_id": "0"},
		{"name": "Crypto Cashier", "type": "bepusdt_cashier", "channel_id": "1"},
	}

	user := &model.User{
		Id:       701,
		Username: "bepusdt_tester",
		Status:   common.UserStatusEnabled,
		Group:    "default",
		Quota:    0,
	}
	require.NoError(t, db.Create(user).Error)

	plan := &model.SubscriptionPlan{
		Id:            801,
		Title:         "Pro Monthly",
		PriceAmount:   19.99,
		Currency:      "USD",
		DurationUnit:  model.SubscriptionDurationMonth,
		DurationValue: 1,
		Enabled:       true,
		TotalAmount:   1000000,
	}
	require.NoError(t, db.Create(plan).Error)

	t.Run("public topup info hides wallet address and rate", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/topup/info", nil)
		GetTopUpInfo(ctx)
		require.Equal(t, http.StatusOK, rec.Code)
		body := rec.Body.String()
		assert.Contains(t, body, `"enable_bepusdt_topup":true`)
		assert.Contains(t, body, `"USDT (TRC20)"`)
		assert.NotContains(t, body, "TFixedWalletAddressForTesting12345")
		assert.NotContains(t, body, "~1.01")
	})

	t.Run("connection test validates saved and overridden tokens", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/option/bepusdt/test", strings.NewReader(`{}`))
		ctx.Request.Header.Set("Content-Type", "application/json")
		TestBEpusdtConnection(ctx)
		require.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), `"success":true`)

		recBad := httptest.NewRecorder()
		ctxBad, _ := gin.CreateTestContext(recBad)
		ctxBad.Request = httptest.NewRequest(http.MethodPost, "/api/option/bepusdt/test", strings.NewReader(`{"api_token":"wrong"}`))
		ctxBad.Request.Header.Set("Content-Type", "application/json")
		TestBEpusdtConnection(ctxBad)
		require.Equal(t, http.StatusOK, recBad.Code)
		assert.Contains(t, recBad.Body.String(), `"success":false`)
	})

	t.Run("amount calculation enforces per-method min and falls back to general price", func(t *testing.T) {
		recLow := httptest.NewRecorder()
		ctxLow, _ := gin.CreateTestContext(recLow)
		ctxLow.Set("id", user.Id)
		ctxLow.Request = httptest.NewRequest(http.MethodPost, "/api/user/bepusdt/amount", strings.NewReader(`{"amount":2,"pay_method_index":0}`))
		ctxLow.Request.Header.Set("Content-Type", "application/json")
		RequestBEpusdtAmount(ctxLow)
		assert.Contains(t, recLow.Body.String(), `"message":"error"`)

		recOK := httptest.NewRecorder()
		ctxOK, _ := gin.CreateTestContext(recOK)
		ctxOK.Set("id", user.Id)
		ctxOK.Request = httptest.NewRequest(http.MethodPost, "/api/user/bepusdt/amount", strings.NewReader(`{"amount":10,"pay_method_index":0}`))
		ctxOK.Request.Header.Set("Content-Type", "application/json")
		RequestBEpusdtAmount(ctxOK)
		assert.Contains(t, recOK.Body.String(), `"data":"73.00"`)
	})

	var txTradeNo string
	t.Run("create-transaction mode forwards trade_type, address, and rate", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Set("id", user.Id)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/bepusdt/pay", strings.NewReader(`{"amount":10,"pay_method_index":0}`))
		ctx.Request.Header.Set("Content-Type", "application/json")
		RequestBEpusdtPay(ctx)
		require.Equal(t, http.StatusOK, rec.Code)

		var resp struct {
			Message string `json:"message"`
			Data    struct {
				PaymentURL string `json:"payment_url"`
				OrderID    string `json:"order_id"`
				TradeID    string `json:"trade_id"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &resp))
		require.Equal(t, "success", resp.Message)
		assert.Equal(t, "/api/v1/order/create-transaction", lastPath)
		assert.Equal(t, "usdt.trc20", lastPayload["trade_type"])
		assert.Equal(t, "TFixedWalletAddressForTesting12345", lastPayload["address"])
		assert.Equal(t, "~1.01", lastPayload["rate"])
		assert.Equal(t, "CNY", lastPayload["fiat"])
		assert.Equal(t, float64(73), lastPayload["amount"])
		assert.Equal(t, "https://api.example.com/api/bepusdt/webhook", lastPayload["notify_url"])
		assert.Equal(t, "https://bepusdt.ymeng.cc/pay/checkout/bep_trade_001", resp.Data.PaymentURL)
		txTradeNo = resp.Data.OrderID
	})

	var cashierTradeNo string
	t.Run("create-order cashier mode forwards currencies without trade_type", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Set("id", user.Id)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/bepusdt/pay", strings.NewReader(`{"amount":2,"pay_method_index":1}`))
		ctx.Request.Header.Set("Content-Type", "application/json")
		RequestBEpusdtPay(ctx)
		require.Equal(t, http.StatusOK, rec.Code)

		var resp struct {
			Message string `json:"message"`
			Data    struct {
				OrderID string `json:"order_id"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &resp))
		require.Equal(t, "success", resp.Message)
		assert.Equal(t, "/api/v1/order/create-order", lastPath)
		assert.Equal(t, "USDT,USDC", lastPayload["currencies"])
		_, hasTradeType := lastPayload["trade_type"]
		assert.False(t, hasTradeType)
		cashierTradeNo = resp.Data.OrderID
	})

	sendSignedWebhook := func(payload map[string]any) *httptest.ResponseRecorder {
		payload["signature"] = service.SignBEpusdtParams(payload, token)
		body, err := common.Marshal(payload)
		require.NoError(t, err)
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/bepusdt/webhook", bytes.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		BEpusdtWebhook(ctx)
		return rec
	}

	t.Run("webhook rejects bad signature and amount mismatch, handles waiting/success/idempotency/expired", func(t *testing.T) {
		// Invalid signature -> 401
		badRec := httptest.NewRecorder()
		badCtx, _ := gin.CreateTestContext(badRec)
		badCtx.Request = httptest.NewRequest(http.MethodPost, "/api/bepusdt/webhook", strings.NewReader(`{"order_id":"`+txTradeNo+`","amount":73,"status":2,"signature":"deadbeef"}`))
		BEpusdtWebhook(badCtx)
		assert.Equal(t, http.StatusUnauthorized, badRec.Code)

		// Amount mismatch -> 400 and no quota credited
		mismatchRec := sendSignedWebhook(map[string]any{
			"trade_id":             "bep_trade_001",
			"order_id":             txTradeNo,
			"amount":               float64(10.00),
			"actual_amount":        "1.37",
			"token":                "TWallet",
			"block_transaction_id": "0x1",
			"status":               service.BEpusdtOrderStatusSuccess,
		})
		assert.Equal(t, http.StatusBadRequest, mismatchRec.Code)

		// Waiting status=1 -> 200 ok, remains pending
		waitRec := sendSignedWebhook(map[string]any{
			"trade_id":      "bep_trade_001",
			"order_id":      txTradeNo,
			"amount":        float64(73.00),
			"actual_amount": "10.00",
			"token":         "TWallet",
			"status":        service.BEpusdtOrderStatusWaiting,
		})
		assert.Equal(t, http.StatusOK, waitRec.Code)
		assert.Equal(t, "ok", waitRec.Body.String())
		pendingTopUp := model.GetTopUpByTradeNo(txTradeNo)
		require.NotNil(t, pendingTopUp)
		assert.Equal(t, common.TopUpStatusPending, pendingTopUp.Status)

		// Success status=2 -> credits user quota once
		okRec := sendSignedWebhook(map[string]any{
			"trade_id":             "bep_trade_001",
			"order_id":             txTradeNo,
			"amount":               float64(73.00),
			"actual_amount":        "10.00",
			"token":                "TWallet",
			"block_transaction_id": "0xconfirmed",
			"status":               service.BEpusdtOrderStatusSuccess,
		})
		assert.Equal(t, http.StatusOK, okRec.Code)
		assert.Equal(t, "ok", okRec.Body.String())

		var reloadedUser model.User
		require.NoError(t, db.Where("id = ?", user.Id).First(&reloadedUser).Error)
		assert.Equal(t, 10*500000, reloadedUser.Quota)

		// Duplicate status=2 -> idempotent 200 ok, quota unchanged
		dupRec := sendSignedWebhook(map[string]any{
			"trade_id":             "bep_trade_001",
			"order_id":             txTradeNo,
			"amount":               float64(73.00),
			"actual_amount":        "10.00",
			"token":                "TWallet",
			"block_transaction_id": "0xconfirmed",
			"status":               service.BEpusdtOrderStatusSuccess,
		})
		assert.Equal(t, http.StatusOK, dupRec.Code)
		require.NoError(t, db.Where("id = ?", user.Id).First(&reloadedUser).Error)
		assert.Equal(t, 10*500000, reloadedUser.Quota)

		// Expired status=3 on cashier order -> marks expired
		expRec := sendSignedWebhook(map[string]any{
			"trade_id":      "bep_trade_002",
			"order_id":      cashierTradeNo,
			"amount":        float64(14.60),
			"actual_amount": "2.00",
			"token":         "TWallet",
			"status":        service.BEpusdtOrderStatusExpired,
		})
		assert.Equal(t, http.StatusOK, expRec.Code)
		expiredTopUp := model.GetTopUpByTradeNo(cashierTradeNo)
		require.NotNil(t, expiredTopUp)
		assert.Equal(t, common.TopUpStatusExpired, expiredTopUp.Status)
	})

	t.Run("subscription payment creates order with plan currency and completes on webhook", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Set("id", user.Id)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/subscription/bepusdt/pay", strings.NewReader(`{"plan_id":801,"pay_method_index":1}`))
		ctx.Request.Header.Set("Content-Type", "application/json")
		SubscriptionRequestBEpusdtPay(ctx)
		require.Equal(t, http.StatusOK, rec.Code)

		var resp struct {
			Message string `json:"message"`
			Data    struct {
				OrderID    string `json:"order_id"`
				PaymentURL string `json:"payment_url"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &resp))
		require.Equal(t, "success", resp.Message)
		assert.True(t, strings.HasPrefix(resp.Data.OrderID, bepusdtSubTradeNoPrefix))
		assert.Equal(t, "USD", lastPayload["fiat"])
		assert.Equal(t, float64(19.99), lastPayload["amount"])

		subRec := sendSignedWebhook(map[string]any{
			"trade_id":             "bep_sub_001",
			"order_id":             resp.Data.OrderID,
			"amount":               float64(19.99),
			"actual_amount":        "19.99",
			"token":                "TWallet",
			"block_transaction_id": "0xsubtx",
			"status":               service.BEpusdtOrderStatusSuccess,
		})
		assert.Equal(t, http.StatusOK, subRec.Code)
		assert.Equal(t, "ok", subRec.Body.String())

		var subCount int64
		require.NoError(t, db.Model(&model.UserSubscription{}).Where("user_id = ? AND plan_id = ?", user.Id, plan.Id).Count(&subCount).Error)
		assert.Equal(t, int64(1), subCount)
	})

	t.Run("cross-gateway order is rejected by BEpusdt webhook", func(t *testing.T) {
		stripeOrder := &model.TopUp{
			UserId:          user.Id,
			Amount:          5,
			Money:           5.0,
			TradeNo:         "STRIPE-FOREIGN-1",
			PaymentMethod:   model.PaymentMethodStripe,
			PaymentProvider: model.PaymentProviderStripe,
			Status:          common.TopUpStatusPending,
		}
		require.NoError(t, stripeOrder.Insert())

		rec := sendSignedWebhook(map[string]any{
			"trade_id":             "bep_foreign",
			"order_id":             stripeOrder.TradeNo,
			"amount":               float64(5.0),
			"actual_amount":        "5.0",
			"token":                "TWallet",
			"block_transaction_id": "0xbad",
			"status":               service.BEpusdtOrderStatusSuccess,
		})
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Equal(t, common.TopUpStatusPending, model.GetTopUpByTradeNo(stripeOrder.TradeNo).Status)
	})

	t.Run("prefixed bepusdt_* identifiers are rejected by Epay and resolved by BEpusdt", func(t *testing.T) {
		assert.Equal(t, "bepusdt_usdt.trc20", constant.FormatBEpusdtPaymentMethodType("usdt.trc20"))
		assert.Equal(t, "bepusdt_cashier", constant.FormatBEpusdtPaymentMethodType("cashier"))
		assert.Equal(t, "bepusdt_cashier", constant.FormatBEpusdtPaymentMethodType(""))
		assert.True(t, constant.IsBEpusdtPaymentMethod("bepusdt_usdt.trc20"))
		assert.True(t, constant.IsBEpusdtPaymentMethod("bepusdt_cashier"))
		assert.True(t, constant.IsBEpusdtPaymentMethod("bepusdt"))
		assert.False(t, constant.IsBEpusdtPaymentMethod("usdt.trc20"))

		prevPayMethods := operation_setting.PayMethods
		t.Cleanup(func() { operation_setting.PayMethods = prevPayMethods })
		operation_setting.PayMethods = []map[string]string{
			{"name": "USDT (TRC20)", "type": "bepusdt_usdt.trc20", "channel_id": "0"},
			{"name": "BEpusdt Unified Cashier", "type": "bepusdt_cashier"},
		}

		// Epay top-up must reject bepusdt_* even when present in General PayMethods
		epayRec := httptest.NewRecorder()
		epayCtx, _ := gin.CreateTestContext(epayRec)
		epayCtx.Set("id", user.Id)
		epayCtx.Request = httptest.NewRequest(http.MethodPost, "/api/user/pay", strings.NewReader(`{"amount":10,"payment_method":"bepusdt_usdt.trc20"}`))
		epayCtx.Request.Header.Set("Content-Type", "application/json")
		RequestEpay(epayCtx)
		assert.Contains(t, epayRec.Body.String(), "Payment method does not exist")

		// Epay subscription must reject bepusdt_* even when present in General PayMethods
		subEpayRec := httptest.NewRecorder()
		subEpayCtx, _ := gin.CreateTestContext(subEpayRec)
		subEpayCtx.Set("id", user.Id)
		subEpayCtx.Request = httptest.NewRequest(http.MethodPost, "/api/subscription/epay/pay", strings.NewReader(`{"plan_id":801,"payment_method":"bepusdt_cashier"}`))
		subEpayCtx.Request.Header.Set("Content-Type", "application/json")
		SubscriptionRequestEpay(subEpayCtx)
		assert.Contains(t, subEpayRec.Body.String(), "Payment method does not exist")

		// BEpusdt pay resolves prefixed payment_method="bepusdt_usdt.trc20" to configured fixed address
		prefixedRec := httptest.NewRecorder()
		prefixedCtx, _ := gin.CreateTestContext(prefixedRec)
		prefixedCtx.Set("id", user.Id)
		prefixedCtx.Request = httptest.NewRequest(http.MethodPost, "/api/user/bepusdt/pay", strings.NewReader(`{"amount":10,"payment_method":"bepusdt_usdt.trc20","channel_id":"0"}`))
		prefixedCtx.Request.Header.Set("Content-Type", "application/json")
		RequestBEpusdtPay(prefixedCtx)
		require.Equal(t, http.StatusOK, prefixedRec.Code)
		assert.Contains(t, prefixedRec.Body.String(), `"message":"success"`)
		assert.Equal(t, "/api/v1/order/create-transaction", lastPath)
		assert.Equal(t, "usdt.trc20", lastPayload["trade_type"])
		assert.Equal(t, "TFixedWalletAddressForTesting12345", lastPayload["address"])

		// General-only bepusdt_cashier works even when BEpusdtPayMethods is empty
		common.OptionMapRWMutex.Lock()
		prevBEpusdtMethods := common.OptionMap["BEpusdtPayMethods"]
		common.OptionMap["BEpusdtPayMethods"] = "[]"
		common.OptionMapRWMutex.Unlock()
		t.Cleanup(func() {
			common.OptionMapRWMutex.Lock()
			common.OptionMap["BEpusdtPayMethods"] = prevBEpusdtMethods
			common.OptionMapRWMutex.Unlock()
		})
		require.True(t, isBEpusdtTopUpEnabled())

		genRec := httptest.NewRecorder()
		genCtx, _ := gin.CreateTestContext(genRec)
		genCtx.Set("id", user.Id)
		genCtx.Request = httptest.NewRequest(http.MethodPost, "/api/user/bepusdt/pay", strings.NewReader(`{"amount":2,"payment_method":"bepusdt_cashier"}`))
		genCtx.Request.Header.Set("Content-Type", "application/json")
		RequestBEpusdtPay(genCtx)
		require.Equal(t, http.StatusOK, genRec.Code)
		assert.Contains(t, genRec.Body.String(), `"message":"success"`)
		assert.Equal(t, "/api/v1/order/create-order", lastPath)

		// Channel removed from General PayMethods must be rejected (aligned with JingSoft)
		operation_setting.PayMethods = []map[string]string{
			{"name": "USDT (TRC20)", "type": "bepusdt_usdt.trc20", "channel_id": "0"},
		}
		removedRec := httptest.NewRecorder()
		removedCtx, _ := gin.CreateTestContext(removedRec)
		removedCtx.Set("id", user.Id)
		removedCtx.Request = httptest.NewRequest(http.MethodPost, "/api/user/bepusdt/pay", strings.NewReader(`{"amount":2,"payment_method":"bepusdt_cashier"}`))
		removedCtx.Request.Header.Set("Content-Type", "application/json")
		RequestBEpusdtPay(removedCtx)
		assert.Contains(t, removedRec.Body.String(), "Unsupported payment method")
	})

	t.Run("audit regressions: oversized webhook, multi-channel fallback, and cross-fiat subscription rate", func(t *testing.T) {
		// 1. Oversized webhook body (> 64 KiB) -> 413
		oversizedRec := httptest.NewRecorder()
		oversizedCtx, _ := gin.CreateTestContext(oversizedRec)
		oversizedCtx.Request = httptest.NewRequest(
			http.MethodPost,
			"/api/bepusdt/webhook",
			strings.NewReader(strings.Repeat("a", bepusdtMaxWebhookBodyBytes+16)),
		)
		BEpusdtWebhook(oversizedCtx)
		assert.Equal(t, http.StatusRequestEntityTooLarge, oversizedRec.Code)

		// 2. Duplicate trade_type channels where only index 1 is bound in General PayMethods
		common.OptionMapRWMutex.Lock()
		prevMethodsJSON := common.OptionMap["BEpusdtPayMethods"]
		common.OptionMap["BEpusdtPayMethods"] = `[
			{"name":"TRC20 Unbound","trade_type":"usdt.trc20","address":"TUnboundAddr"},
			{"name":"TRC20 Bound","trade_type":"usdt.trc20","address":"TBoundAddr123","min_topup":3}
		]`
		common.OptionMapRWMutex.Unlock()
		prevGeneral := operation_setting.PayMethods
		operation_setting.PayMethods = []map[string]string{
			{"name": "TRC20 Bound", "type": "bepusdt_usdt.trc20", "channel_id": "1"},
		}
		t.Cleanup(func() {
			common.OptionMapRWMutex.Lock()
			common.OptionMap["BEpusdtPayMethods"] = prevMethodsJSON
			common.OptionMapRWMutex.Unlock()
			operation_setting.PayMethods = prevGeneral
		})

		fallbackPayRec := httptest.NewRecorder()
		fallbackPayCtx, _ := gin.CreateTestContext(fallbackPayRec)
		fallbackPayCtx.Set("id", user.Id)
		fallbackPayCtx.Request = httptest.NewRequest(http.MethodPost, "/api/user/bepusdt/pay", strings.NewReader(`{"amount":5,"payment_method":"bepusdt_usdt.trc20"}`))
		fallbackPayCtx.Request.Header.Set("Content-Type", "application/json")
		RequestBEpusdtPay(fallbackPayCtx)
		require.Equal(t, http.StatusOK, fallbackPayRec.Code)
		assert.Contains(t, fallbackPayRec.Body.String(), `"message":"success"`)
		assert.Equal(t, "TBoundAddr123", lastPayload["address"])

		// 3. USD subscription when BEpusdtFiat="CNY": fixed CNY rate (7.4) must NOT be sent, relative (~1.02) IS sent
		prevRate := setting.BEpusdtRate
		t.Cleanup(func() { setting.BEpusdtRate = prevRate })
		setting.BEpusdtRate = "7.4"

		subFixedRec := httptest.NewRecorder()
		subFixedCtx, _ := gin.CreateTestContext(subFixedRec)
		subFixedCtx.Set("id", user.Id)
		subFixedCtx.Request = httptest.NewRequest(http.MethodPost, "/api/subscription/bepusdt/pay", strings.NewReader(`{"plan_id":801,"payment_method":"bepusdt_usdt.trc20","channel_id":"1"}`))
		subFixedCtx.Request.Header.Set("Content-Type", "application/json")
		SubscriptionRequestBEpusdtPay(subFixedCtx)
		require.Equal(t, http.StatusOK, subFixedRec.Code)
		assert.Equal(t, "USD", lastPayload["fiat"])
		assert.Nil(t, lastPayload["rate"])

		setting.BEpusdtRate = "~1.02"
		subRelRec := httptest.NewRecorder()
		subRelCtx, _ := gin.CreateTestContext(subRelRec)
		subRelCtx.Set("id", user.Id)
		subRelCtx.Request = httptest.NewRequest(http.MethodPost, "/api/subscription/bepusdt/pay", strings.NewReader(`{"plan_id":801,"payment_method":"bepusdt_usdt.trc20","channel_id":"1"}`))
		subRelCtx.Request.Header.Set("Content-Type", "application/json")
		SubscriptionRequestBEpusdtPay(subRelCtx)
		require.Equal(t, http.StatusOK, subRelRec.Code)
		assert.Equal(t, "USD", lastPayload["fiat"])
		assert.Equal(t, "~1.02", lastPayload["rate"])
	})
}
