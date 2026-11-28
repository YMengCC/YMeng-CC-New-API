package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These fakes model external/store contracts only. Database transaction and
// redemption guarantees are exercised by model tests, not asserted by a fake.
type jingSoftTestAdapter struct {
	JingSoftAdapter
	offer            JingSoftOffer
	directOffer      JingSoftOffer
	quoteDirectErr   error
	discovered       []JingSoftDiscoveredProduct
	discoveredSlots  []JingSoftDiscoveredProduct
	compatibilityRes *JingSoftCompatibilityResult
	checkTokenFn     func(baseURL, merchantToken string) (bool, error)
	creates          atomic.Int32
	queries          atomic.Int32
	prepares         atomic.Int32
	replenishes      atomic.Int32
	lastContact      string
	lastBaseURL      string
	prepareFn        func(slotGoodsKey, baseAmount, knownConfirmedPrice string) (*JingSoftDynamicSlotReady, error)
	replenishFn      func(slotGoodsKey string, force bool) (int, error)
	createFn         func(*model.JingSoftOrder, JingSoftCredentials) (*JingSoftCreatedOrder, error)
	queryFn          func(*model.JingSoftOrder, JingSoftCredentials) (*JingSoftOrderEvidence, error)
}

func (a *jingSoftTestAdapter) Ready() bool { return true }
func (a *jingSoftTestAdapter) CheckCompatibility(_ context.Context, baseURL, _, _ string) (*JingSoftCompatibilityResult, error) {
	a.lastBaseURL = baseURL
	if a.compatibilityRes != nil {
		res := *a.compatibilityRes
		return &res, nil
	}
	return &JingSoftCompatibilityResult{Compatible: true, BaseURL: baseURL, ProtocolVerified: true, StoreVerified: true}, nil
}
func (a *jingSoftTestAdapter) DiscoverProducts(_ context.Context, baseURL, _ string) ([]JingSoftDiscoveredProduct, error) {
	a.lastBaseURL = baseURL
	return append([]JingSoftDiscoveredProduct(nil), a.discovered...), nil
}
func (a *jingSoftTestAdapter) DiscoverDirectSlots(_ context.Context, baseURL, _ string) ([]JingSoftDiscoveredProduct, error) {
	a.lastBaseURL = baseURL
	return append([]JingSoftDiscoveredProduct(nil), a.discoveredSlots...), nil
}
func (a *jingSoftTestAdapter) CheckMerchantToken(_ context.Context, baseURL, merchantToken string) (bool, error) {
	a.lastBaseURL = baseURL
	if a.checkTokenFn != nil {
		return a.checkTokenFn(baseURL, merchantToken)
	}
	return merchantToken != "", nil
}
func (a *jingSoftTestAdapter) Quote(_ context.Context, baseURL, _, _, _ string) (*JingSoftOffer, error) {
	a.lastBaseURL = baseURL
	o := a.offer
	return &o, nil
}
func (a *jingSoftTestAdapter) QuoteDirect(_ context.Context, baseURL, storeToken, _, slotGoodsKey, channelID, baseAmount string) (*JingSoftOffer, error) {
	a.lastBaseURL = baseURL
	if a.quoteDirectErr != nil {
		return nil, a.quoteDirectErr
	}
	if a.directOffer.ShopID != "" {
		o := a.directOffer
		return &o, nil
	}
	return &JingSoftOffer{
		ShopID:         storeToken,
		ShopName:       "Direct Shop",
		ShopURL:        baseURL + "/shop/" + storeToken,
		ProductID:      slotGoodsKey,
		ChannelID:      channelID,
		Amount:         baseAmount,
		OriginalAmount: baseAmount,
		Fee:            "0.00",
		Currency:       "CNY",
		Quantity:       1,
		InStock:        true,
	}, nil
}
func (a *jingSoftTestAdapter) PrepareDirectSlot(_ context.Context, baseURL, storeToken, _, slotGoodsKey, channelID, baseAmount, knownConfirmedPrice string, _, _ int) (*JingSoftDynamicSlotReady, error) {
	a.lastBaseURL = baseURL
	a.prepares.Add(1)
	if a.prepareFn != nil {
		return a.prepareFn(slotGoodsKey, baseAmount, knownConfirmedPrice)
	}
	offer, err := a.QuoteDirect(context.Background(), baseURL, storeToken, "m-token", slotGoodsKey, channelID, baseAmount)
	if err != nil {
		return nil, err
	}
	return &JingSoftDynamicSlotReady{Offer: *offer, ConfirmedPrice: baseAmount}, nil
}
func (a *jingSoftTestAdapter) ReplenishDirectSlot(_ context.Context, baseURL, _, _, slotGoodsKey string, _, restockBatch int, force bool) (int, error) {
	a.lastBaseURL = baseURL
	a.replenishes.Add(1)
	if a.replenishFn != nil {
		return a.replenishFn(slotGoodsKey, force)
	}
	return restockBatch, nil
}
func (a *jingSoftTestAdapter) Create(_ context.Context, baseURL string, o *model.JingSoftOrder, c JingSoftCredentials, contact string) (*JingSoftCreatedOrder, error) {
	a.lastBaseURL = baseURL
	a.creates.Add(1)
	a.lastContact = contact
	return a.createFn(o, c)
}
func (a *jingSoftTestAdapter) Query(_ context.Context, baseURL string, o *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftOrderEvidence, error) {
	a.lastBaseURL = baseURL
	a.queries.Add(1)
	return a.queryFn(o, c)
}

type jingSoftTestStore struct {
	mu           sync.Mutex
	order        *model.JingSoftOrder
	completed    int
	completeErr  error
	completeKey  string
	completeTxID string
	updateCalls  int
	loseUpdate   bool
	dueLimit     int
	slotBusy     bool
	slots        map[string]*model.JingSoftPriceSlot
}

func cloneJingSoft(o *model.JingSoftOrder) *model.JingSoftOrder {
	if o == nil {
		return nil
	}
	copied := *o
	return &copied
}
func (f *jingSoftTestStore) Create(o *model.JingSoftOrder) (*model.JingSoftOrder, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order != nil {
		return cloneJingSoft(f.order), true, nil
	}
	f.order = cloneJingSoft(o)
	f.order.ID = 1
	return cloneJingSoft(f.order), false, nil
}
func (f *jingSoftTestStore) Get(u int, t string) (*model.JingSoftOrder, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order == nil || f.order.UserID != u || f.order.TradeNo != t {
		return nil, errors.New("not found")
	}
	return cloneJingSoft(f.order), nil
}
func (f *jingSoftTestStore) Find(u int, key string) (*model.JingSoftOrder, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order == nil || f.order.UserID != u || f.order.IdempotencyKey != key {
		return nil, nil
	}
	return cloneJingSoft(f.order), nil
}
func (f *jingSoftTestStore) Due(_ int64, limit int) ([]*model.JingSoftOrder, error) {
	f.dueLimit = limit
	return []*model.JingSoftOrder{cloneJingSoft(f.order)}, nil
}
func (f *jingSoftTestStore) Claim(_ int, now, lease int64) (*model.JingSoftOrder, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order.LeaseUntil > now {
		return cloneJingSoft(f.order), false, nil
	}
	switch f.order.Status {
	case model.JingSoftOrderStatusNew:
		f.order.Status = model.JingSoftOrderStatusSubmitting
	case model.JingSoftOrderStatusSubmitting:
		f.order.Status = model.JingSoftOrderStatusCreationUnknown
	}
	f.order.Version++
	f.order.LeaseUntil = now + lease
	return cloneJingSoft(f.order), true, nil
}
func (f *jingSoftTestStore) Update(_ int, v int64, u model.JingSoftOrderUpdate) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.updateCalls++
	if f.loseUpdate || f.order.Version != v {
		return false, nil
	}
	f.order.Version++
	f.order.Status = u.Status
	f.order.NextQueryAt = u.NextQueryAt
	f.order.LeaseUntil = 0
	f.order.FailureCode = u.FailureCode
	if u.UpstreamOrderID != nil {
		f.order.UpstreamOrderID = u.UpstreamOrderID
	}
	if u.PaymentURL != nil {
		f.order.PaymentURL = *u.PaymentURL
	}
	if u.PaymentQRCode != nil {
		f.order.PaymentQRCode = *u.PaymentQRCode
	}
	if u.CredentialCiphertext != nil {
		f.order.CredentialCiphertext = *u.CredentialCiphertext
	}
	return true, nil
}
func (f *jingSoftTestStore) Created(id int, v int64, u, p string, n int64) (bool, error) {
	return f.Update(id, v, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusPending, UpstreamOrderID: &u, PaymentURL: &p, NextQueryAt: n})
}
func (f *jingSoftTestStore) Retry(id int, v, n int64) (bool, error) {
	return f.Update(id, v, model.JingSoftOrderUpdate{Status: f.order.Status, NextQueryAt: n})
}
func (f *jingSoftTestStore) Complete(_ int, v int64, k, txID, _ string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order.Version != v || f.order.Status != model.JingSoftOrderStatusPaid {
		return false, errors.New("unfenced completion")
	}
	if f.completeErr != nil {
		return false, f.completeErr
	}
	f.completed++
	f.completeKey = k
	f.completeTxID = txID
	f.order.Status = model.JingSoftOrderStatusCompleted
	return false, nil
}
func (f *jingSoftTestStore) Capacity(int, int) error { return nil }
func (f *jingSoftTestStore) AcquireSlot(shopID string, goodsKeys []string, targetPrice, orderTradeNo string, now, leaseSeconds int64) (*model.JingSoftPriceSlot, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.slotBusy {
		return nil, false, nil
	}
	if f.slots == nil {
		f.slots = make(map[string]*model.JingSoftPriceSlot, len(goodsKeys))
	}
	for i, key := range goodsKeys {
		if _, exists := f.slots[key]; !exists {
			f.slots[key] = &model.JingSoftPriceSlot{ID: i + 1, ShopID: shopID, GoodsKey: key, Status: model.JingSoftSlotStatusIdle}
		}
	}
	for _, key := range goodsKeys {
		s := f.slots[key]
		if s.Status == model.JingSoftSlotStatusIdle && targetPrice != "" && s.ConfirmedPrice == targetPrice {
			s.Status = model.JingSoftSlotStatusLeased
			s.HolderToken = "holder-" + key
			s.OrderTradeNo = orderTradeNo
			s.LeaseUntil = now + leaseSeconds
			s.Version++
			copySlot := *s
			return &copySlot, true, nil
		}
	}
	for _, key := range goodsKeys {
		s := f.slots[key]
		if s.Status == model.JingSoftSlotStatusIdle {
			s.Status = model.JingSoftSlotStatusLeased
			s.HolderToken = "holder-" + key
			s.OrderTradeNo = orderTradeNo
			s.LeaseUntil = now + leaseSeconds
			s.Version++
			copySlot := *s
			return &copySlot, true, nil
		}
	}
	return nil, false, nil
}
func (f *jingSoftTestStore) ReleaseSlot(id int, version int64, holderToken, confirmedPrice string, _ int64) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, s := range f.slots {
		if s.ID == id && s.Version == version && s.HolderToken == holderToken && s.Status == model.JingSoftSlotStatusLeased {
			s.Status = model.JingSoftSlotStatusIdle
			s.ConfirmedPrice = confirmedPrice
			s.HolderToken = ""
			s.Version++
			return true, nil
		}
	}
	return false, nil
}
func (f *jingSoftTestStore) QuarantineSlot(id int, version int64, holderToken, code string, _ int64) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, s := range f.slots {
		if s.ID == id && s.Version == version && s.HolderToken == holderToken && s.Status == model.JingSoftSlotStatusLeased {
			s.Status = model.JingSoftSlotStatusQuarantined
			s.ConfirmedPrice = ""
			s.HolderToken = ""
			s.QuarantineCode = code
			s.Version++
			return true, nil
		}
	}
	return false, nil
}

func jingSoftFixture(t *testing.T) (*jingSoftService, *jingSoftTestAdapter, *jingSoftTestStore, *operation_setting.JingSoftSetting) {
	t.Helper()
	previousPayMethods := operation_setting.PayMethods
	t.Cleanup(func() { operation_setting.PayMethods = previousPayMethods })
	operation_setting.PayMethods = []map[string]string{{
		"name":       "JingSoft WeChat Pay",
		"type":       operation_setting.JingSoftPaymentMethodWeChat,
		"channel_id": "pay",
	}}
	cfg := &operation_setting.JingSoftSetting{
		Enabled:    true,
		BaseURL:    "https://wzyp.cn",
		StoreToken: "private-store-token",
		Products:   []operation_setting.JingSoftProduct{{ID: "tier", Name: "Credit", GoodsKey: "goods", Amount: 2.5}},
		Channels:   []operation_setting.JingSoftChannel{{ID: "pay", Name: "WeChat Pay", PaymentType: "wxpay"}},
	}
	adapter := &jingSoftTestAdapter{offer: JingSoftOffer{ShopID: "shop", ShopURL: "https://wzyp.cn/shop/shop", ProductID: "goods", ChannelID: "pay", Amount: "18.00", Currency: "CNY", Quantity: 1, InStock: true}}
	store := &jingSoftTestStore{}
	service := &jingSoftService{adapter: adapter, store: store, setting: func() *operation_setting.JingSoftSetting { return cfg }, now: func() time.Time { return time.Unix(1700000000, 0) }, key: func() ([]byte, error) { return make([]byte, 32), nil }}
	adapter.createFn = func(o *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftCreatedOrder, error) {
		c.Cookie = "upstream-secret-cookie"
		return &JingSoftCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://wzyp.cn/pay", Credentials: &c, Evidence: jingSoftTestEvidence(o)}, nil
	}
	adapter.queryFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftOrderEvidence, error) {
		e := jingSoftTestEvidence(o)
		return &e, nil
	}
	return service, adapter, store, cfg
}
func jingSoftTestEvidence(o *model.JingSoftOrder) JingSoftOrderEvidence {
	contact := o.ExpectedContact
	if contact == "" {
		contact = "123456"
	}
	return JingSoftOrderEvidence{UpstreamOrderID: "upstream", TransactionID: "wx-tx-" + o.TradeNo, Contact: contact, ShopID: o.ShopID, ProductID: o.ProductID, ChannelID: o.ChannelID, Quantity: 1, Amount: o.PriceAmount, Currency: o.Currency, Paid: true, Delivered: true, RedemptionKey: "0123456789abcdef0123456789abcdef"}
}
func jingSoftRequest(t *testing.T, s *jingSoftService) JingSoftPaymentRequest {
	t.Helper()
	q, err := s.quote(context.Background(), 7, "tier", "pay")
	require.NoError(t, err)
	assert.Equal(t, 18.0, q.Amount)
	assert.Equal(t, 2.5, q.TopUpAmount)
	return JingSoftPaymentRequest{ProductID: "tier", ChannelID: "pay", QuoteID: q.QuoteID, QQ: "123456", IdempotencyKey: "stable-request-key"}
}

func TestJingSoftBaseURLStoreTokenAndGoodsKeyNormalization(t *testing.T) {
	for _, tc := range []struct {
		raw, want string
	}{
		{"https://wzyp.cn", "https://wzyp.cn"},
		{" https://WZYP.CN/ ", "https://wzyp.cn"},
		{"https://wzyp.cn:443/", "https://wzyp.cn"},
		{"https://store.example.com:8443/", "https://store.example.com:8443"},
		{"", ""},
	} {
		got, err := operation_setting.NormalizeJingSoftBaseURL(tc.raw)
		require.NoError(t, err, tc.raw)
		assert.Equal(t, tc.want, got)
		require.NoError(t, operation_setting.ValidateJingSoftOption("jingsoft_setting.base_url", tc.raw))
	}

	for _, invalid := range []string{
		"http://wzyp.cn",
		"https://localhost",
		"https://127.0.0.1",
		"https://10.0.0.1",
		"https://192.168.1.1",
		"https://user:pass@wzyp.cn",
		"https://wzyp.cn/shop/YMengCC",
		"https://wzyp.cn?x=1",
		"https://wzyp.cn#frag",
		"https://wzyp.cn\r\n",
	} {
		_, err := operation_setting.NormalizeJingSoftBaseURL(invalid)
		require.Error(t, err, invalid)
		require.Error(t, operation_setting.ValidateJingSoftOption("jingsoft_setting.base_url", invalid))
	}

	for _, input := range []string{"YMengCC", " https://wzyp.cn/shop/YMengCC/ "} {
		token, err := operation_setting.NormalizeJingSoftStoreTokenForBase(input, "https://wzyp.cn")
		require.NoError(t, err)
		assert.Equal(t, "YMengCC", token)
	}
	for _, input := range []string{
		"https://other.example.com/shop/YMengCC",
		"http://wzyp.cn/shop/YMengCC",
		"https://wzyp.cn:8443/shop/YMengCC",
		"https://wzyp.cn/shop/YMengCC?x=1",
		"https://wzyp.cn/shop/YMengCC#x",
		"YMengCC\r\n",
	} {
		_, err := operation_setting.NormalizeJingSoftStoreTokenForBase(input, "https://wzyp.cn")
		require.Error(t, err, input)
	}

	for _, input := range []string{"jbf7yz", " https://wzyp.cn/item/jbf7yz/ "} {
		goodsKey, err := operation_setting.NormalizeJingSoftGoodsKeyForBase(input, "https://wzyp.cn")
		require.NoError(t, err)
		assert.Equal(t, "jbf7yz", goodsKey)
	}
	_, err := operation_setting.NormalizeJingSoftGoodsKeyForBase("https://other.example.com/item/jbf7yz", "https://wzyp.cn")
	require.Error(t, err)

	// resolveJingSoftBaseAndStoreInputs extracts origin when pasting a full /shop/<token> URL before BaseURL is saved.
	resolvedBase, resolvedToken, err := resolveJingSoftBaseAndStoreInputs("", "https://wzyp.cn/shop/YMengCC", &operation_setting.JingSoftSetting{})
	require.NoError(t, err)
	assert.Equal(t, "https://wzyp.cn", resolvedBase)
	assert.Equal(t, "YMengCC", resolvedToken)
}

func TestJingSoftUnverifiedAdapterRejectsPaymentOperations(t *testing.T) {
	assert.True(t, JingSoftProtocolReady())
	// An unverified adapter still cannot touch persistence, keys or settings.
	s := &jingSoftService{adapter: jingSoftUnverifiedAdapter{}}
	_, err := s.create(context.Background(), 7, JingSoftPaymentRequest{})
	require.ErrorIs(t, err, ErrJingSoftProtocolUnverified)
	_, err = s.quote(context.Background(), 7, "tier", "pay")
	require.ErrorIs(t, err, ErrJingSoftProtocolUnverified)
	require.ErrorIs(t, s.poll(context.Background()), ErrJingSoftProtocolUnverified)
	_, err = ListJingSoftChannels(context.Background(), "https://wzyp.cn", "https://other.example.com/shop/secret")
	require.ErrorIs(t, err, ErrJingSoftInvalidRequest)
	assert.Equal(t, "jingsoft_order_poll", (jingSoftPollHandler{}).Type())
	assert.True(t, (jingSoftPollHandler{}).Enabled())
	assert.Equal(t, ErrJingSoftOrderUnavailable, jingSoftPublicError(errors.New("SQL contains sensitive value")))
}

func TestJingSoftChannelRequiresMatchingGeneralPaymentMethod(t *testing.T) {
	s, _, store, _ := jingSoftFixture(t)
	operation_setting.PayMethods = []map[string]string{{
		"type":       operation_setting.JingSoftPaymentMethodAlipay,
		"channel_id": "pay",
	}}
	_, err := s.quote(context.Background(), 7, "tier", "pay")
	require.ErrorIs(t, err, ErrJingSoftInvalidRequest)
	assert.Nil(t, store.order)

	operation_setting.PayMethods = []map[string]string{{
		"type":       operation_setting.JingSoftPaymentMethodWeChat,
		"channel_id": "another-channel",
	}}
	_, err = s.quote(context.Background(), 7, "tier", "pay")
	require.ErrorIs(t, err, ErrJingSoftInvalidRequest)
	assert.Nil(t, store.order)
}

func TestJingSoftPaymentMethodRemovalAfterQuoteBlocksNewOrder(t *testing.T) {
	s, a, store, _ := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	operation_setting.PayMethods = nil

	_, err := s.create(context.Background(), 7, req)
	require.ErrorIs(t, err, ErrJingSoftInvalidRequest)
	assert.Nil(t, store.order)
	assert.Zero(t, a.creates.Load())
}

func TestJingSoftQuoteAndCreateBindings(t *testing.T) {
	for _, name := range []string{"user", "config", "base-url", "expiry", "tamper", "channel", "price", "stock", "qq-empty", "qq-unicode", "qq-letter"} {
		t.Run(name, func(t *testing.T) {
			s, a, store, cfg := jingSoftFixture(t)
			req := jingSoftRequest(t, s)
			user := 7
			want := ErrJingSoftInvalidQuote
			switch name {
			case "user":
				user = 8
			case "config":
				cfg.StoreToken = "changed"
			case "base-url":
				cfg.BaseURL = "https://other-store.example.com"
			case "expiry":
				s.now = func() time.Time { return time.Unix(1700000300, 0) }
			case "tamper":
				req.QuoteID = "!" + req.QuoteID
			case "channel":
				req.ChannelID = "other"
				want = ErrJingSoftInvalidRequest
			case "price":
				a.offer.Amount = "19"
			case "stock":
				a.offer.InStock = false
			case "qq-empty":
				req.QQ = ""
				want = ErrJingSoftInvalidRequest
			case "qq-unicode":
				req.QQ = "１２３"
				want = ErrJingSoftInvalidRequest
			case "qq-letter":
				req.QQ = "12a"
				want = ErrJingSoftInvalidRequest
			}
			_, err := s.create(context.Background(), user, req)
			require.ErrorIs(t, err, want)
			assert.Nil(t, store.order)
			assert.Zero(t, a.creates.Load())
		})
	}
	s, a, store, _ := jingSoftFixture(t)
	a.offer.ProductID = "wrong"
	_, err := s.quote(context.Background(), 7, "tier", "pay")
	require.ErrorIs(t, err, ErrJingSoftVerification)
	assert.Nil(t, store.order)
}

func TestJingSoftCreateOnceOrderPrefixAndCredentialRecovery(t *testing.T) {
	s, a, store, _ := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Go(func() { _, err := s.create(context.Background(), 7, req); errs <- err })
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	assert.EqualValues(t, 1, a.creates.Load())
	require.NotNil(t, store.order)
	assert.True(t, strings.HasPrefix(store.order.TradeNo, "JingSoft_"), "new orders must use exact JingSoft_ prefix")
	assert.Equal(t, model.JingSoftOrderStatusPending, store.order.Status)
	assert.Equal(t, model.PaymentMethodJingSoftWeChat, store.order.PaymentMethod)
	var credentials JingSoftCredentials
	key, err := s.key()
	require.NoError(t, err)
	purpose := fmt.Sprintf("jingsoft/order/v1/%d/%s", 7, store.order.TradeNo)
	require.NoError(t, jingSoftOpen(key, purpose, store.order.CredentialCiphertext, &credentials))
	assert.Equal(t, "upstream-secret-cookie", credentials.Cookie)
	assert.NotEmpty(t, credentials.Visitor)
	assert.NotEmpty(t, credentials.Password)
	require.Error(t, jingSoftOpen(key, purpose+"other", store.order.CredentialCiphertext, &credentials))

	// Legacy in-flight pre-rename orders keep their original AEAD associated data purpose.
	legacyTrade := "cat" + "fk_inflight_legacy"
	assert.Equal(t, fmt.Sprintf("cat"+"fk/order/v1/%d/%s", 7, legacyTrade), jingSoftOrderSealPurpose(7, legacyTrade))

	public, err := common.Marshal(jingSoftSafePayment(store.order))
	require.NoError(t, err)
	assert.NotContains(t, string(public), credentials.Cookie)
	assert.NotContains(t, string(public), credentials.Password)
	assert.NotContains(t, string(public), "0123456789abcdef0123456789abcdef")
	t.Setenv("JINGSOFT_ORDER_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(key))
	restartedKey, err := jingSoftEncryptionKey()
	require.NoError(t, err)
	require.NoError(t, jingSoftOpen(restartedKey, purpose, store.order.CredentialCiphertext, &credentials))
	store.order.Status = model.JingSoftOrderStatusCompleted
	assert.Empty(t, jingSoftSafePayment(store.order).PaymentQRCode)
}

func TestJingSoftAmbiguousCreationNeverResubmits(t *testing.T) {
	s, a, store, cfg := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	a.createFn = func(_ *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftCreatedOrder, error) {
		c.Cookie = "recover-cookie"
		return &JingSoftCreatedOrder{Credentials: &c}, context.DeadlineExceeded
	}
	payment, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.Equal(t, model.JingSoftOrderStatusCreationUnknown, payment.Status)
	assert.Empty(t, payment.PaymentQRCode)
	_, err = s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.EqualValues(t, 1, a.creates.Load())
	cfg.Enabled = false // Recovery intentionally ignores the new-purchase switch.
	require.NoError(t, s.poll(context.Background()))
	assert.Equal(t, model.JingSoftOrderStatusCompleted, store.order.Status)
	assert.Equal(t, 1, store.completed)
	assert.Equal(t, "0123456789abcdef0123456789abcdef", store.completeKey)
	assert.Equal(t, 50, store.dueLimit)
	assert.EqualValues(t, 1, a.creates.Load())
}

func TestJingSoftExistingRequestSurvivesQuoteExpiryAndDisabledPurchases(t *testing.T) {
	s, a, store, cfg := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	first, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	cfg.Enabled = false
	cfg.StoreToken = "changed-shop"
	s.now = func() time.Time { return time.Unix(1700000600, 0) }
	recovered, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.Equal(t, first, recovered)
	assert.EqualValues(t, 1, a.creates.Load())
	assert.Equal(t, first.TradeNo, store.order.TradeNo)

	req.ChannelID = "different-channel"
	_, err = s.create(context.Background(), 7, req)
	require.ErrorIs(t, err, ErrJingSoftInvalidRequest)
	assert.EqualValues(t, 1, a.creates.Load())
}

func TestJingSoftPartialCreationRetainsRecoveryIdentity(t *testing.T) {
	s, a, store, _ := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	a.createFn = func(_ *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftCreatedOrder, error) {
		c.Cookie = "recovery-cookie"
		return &JingSoftCreatedOrder{UpstreamOrderID: "known-upstream", Credentials: &c}, context.DeadlineExceeded
	}
	payment, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.Equal(t, model.JingSoftOrderStatusCreationUnknown, payment.Status)
	require.NotNil(t, store.order.UpstreamOrderID)
	assert.Equal(t, "known-upstream", *store.order.UpstreamOrderID)
	assert.Empty(t, payment.PaymentQRCode)
	_, err = s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.EqualValues(t, 1, a.creates.Load())
}

func TestJingSoftCreationSnapshotMismatch(t *testing.T) {
	s, a, store, _ := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	a.createFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftCreatedOrder, error) {
		e := jingSoftTestEvidence(o)
		e.Amount = "0.01"
		return &JingSoftCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://wzyp.cn/pay", Evidence: e}, nil
	}
	p, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.Equal(t, model.JingSoftOrderStatusNeedsAttention, p.Status)
	assert.Empty(t, p.PaymentQRCode)
	assert.Zero(t, store.completed)
}

func TestJingSoftPendingOrderExposesOnlyTheScrapedQRCode(t *testing.T) {
	for _, tc := range []struct{ name, scraped, want string }{
		{"non-native-scrape", "https://qr.alipay.com/upx-code", ""},
		{"unsafe-scrape", "javascript:alert(1)", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, a, store, _ := jingSoftFixture(t)
			req := jingSoftRequest(t, s)
			a.createFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftCreatedOrder, error) {
				e := jingSoftTestEvidence(o)
				e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
				return &JingSoftCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://wzyp.cn/pay", PaymentQRCode: tc.scraped, Evidence: e}, nil
			}
			payment, err := s.create(context.Background(), 7, req)
			require.NoError(t, err)
			assert.Equal(t, model.JingSoftOrderStatusPending, payment.Status)
			assert.Equal(t, tc.want, payment.PaymentQRCode)
			public, err := common.Marshal(payment)
			require.NoError(t, err)
			assert.NotContains(t, string(public), "payment_url")
			store.order.Status = model.JingSoftOrderStatusExpired
			assert.Empty(t, jingSoftSafePayment(store.order).PaymentQRCode)
		})
	}
}

func TestJingSoftRefreshSettlesAWatchedOrderWithoutWaitingForThePoll(t *testing.T) {
	s, a, store, _ := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	a.createFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftCreatedOrder, error) {
		e := jingSoftTestEvidence(o)
		e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
		return &JingSoftCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://wzyp.cn/pay", Evidence: e}, nil
	}
	payment, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	require.Equal(t, model.JingSoftOrderStatusPending, payment.Status)
	require.Greater(t, store.order.NextQueryAt, s.now().Unix(), "the background poll is not due yet")

	store.order.UpdatedAt = s.now().Unix()
	order, err := s.refresh(context.Background(), 7, payment.TradeNo)
	require.NoError(t, err)
	assert.Equal(t, model.JingSoftOrderStatusPending, order.Status)
	assert.Zero(t, a.queries.Load(), "a just-updated order is not queried again")

	store.order.UpdatedAt = s.now().Unix() - 2
	order, err = s.refresh(context.Background(), 7, payment.TradeNo)
	require.NoError(t, err)
	assert.Equal(t, model.JingSoftOrderStatusCompleted, order.Status)
	assert.EqualValues(t, 1, a.queries.Load())
	assert.Equal(t, 1, store.completed)

	order, err = s.refresh(context.Background(), 7, payment.TradeNo)
	require.NoError(t, err)
	assert.Equal(t, model.JingSoftOrderStatusCompleted, order.Status)
	assert.EqualValues(t, 1, a.queries.Load(), "a finished order is never queried")
	_, err = s.refresh(context.Background(), 8, payment.TradeNo)
	require.Error(t, err)
}

func TestJingSoftQuoteShowsTheIncludedFeeOnlyWhenItAddsUp(t *testing.T) {
	for _, tc := range []struct {
		name, original, fee string
		wantFee, wantRate   *float64
	}{
		{"breakdown", "10", "0.18", new(0.18), new(1.8)},
		{"no-fee", "10.18", "0", new(0.0), new(0.0)},
		{"inconsistent", "10", "0.5", nil, nil},
		{"unknown", "", "", nil, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, a, _, _ := jingSoftFixture(t)
			a.offer.Amount, a.offer.OriginalAmount, a.offer.Fee = "10.18", tc.original, tc.fee
			q, err := s.quote(context.Background(), 7, "tier", "pay")
			require.NoError(t, err)
			assert.Equal(t, 10.18, q.Amount)
			assert.Equal(t, tc.wantFee, q.Fee)
			assert.Equal(t, tc.wantRate, q.FeeRate)
		})
	}
}

func TestJingSoftDocumentedReceiptCanSettleOnlyTheBoundPurchase(t *testing.T) {
	s, a, store, _ := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	a.createFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftCreatedOrder, error) {
		e := jingSoftTestEvidence(o)
		e.ChannelID, e.Currency = "", ""
		e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
		return &JingSoftCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://wzyp.cn/pay", Evidence: e}, nil
	}
	payment, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.Equal(t, model.JingSoftOrderStatusPending, payment.Status)
	assert.Empty(t, payment.PaymentQRCode, "WeChat payment requires a cashier-verified native QR code")
	assert.Zero(t, store.completed)
	a.queryFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftOrderEvidence, error) {
		e := jingSoftTestEvidence(o)
		e.ChannelID, e.Currency = "", ""
		return &e, nil
	}
	require.NoError(t, s.poll(context.Background()))
	assert.Equal(t, model.JingSoftOrderStatusCompleted, store.order.Status)
	assert.Equal(t, 7, store.order.UserID)
	assert.Equal(t, 1, store.completed)
}

func TestJingSoftSettlementRequiresCompleteEvidence(t *testing.T) {
	cases := []struct {
		name   string
		change func(*JingSoftOrderEvidence)
	}{
		{"upstream", func(e *JingSoftOrderEvidence) { e.UpstreamOrderID = "other" }},
		{"shop", func(e *JingSoftOrderEvidence) { e.ShopID = "other" }},
		{"product", func(e *JingSoftOrderEvidence) { e.ProductID = "other" }},
		{"channel", func(e *JingSoftOrderEvidence) { e.ChannelID = "other" }},
		{"quantity", func(e *JingSoftOrderEvidence) { e.Quantity = 2 }},
		{"amount", func(e *JingSoftOrderEvidence) { e.Amount = "17.99" }},
		{"currency", func(e *JingSoftOrderEvidence) { e.Currency = "USD" }},
		{"unpaid", func(e *JingSoftOrderEvidence) { e.Paid = false }},
		{"undelivered", func(e *JingSoftOrderEvidence) { e.Delivered = false }},
		{"missing-code", func(e *JingSoftOrderEvidence) { e.RedemptionKey = "" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, _, store, _ := jingSoftFixture(t)
			req := jingSoftRequest(t, s)
			_, err := s.create(context.Background(), 7, req)
			require.NoError(t, err)
			order := cloneJingSoft(store.order)
			e := jingSoftTestEvidence(order)
			tc.change(&e)
			require.NoError(t, s.applyEvidence(order, &e))
			assert.Zero(t, store.completed)
		})
	}
	t.Run("stale CAS cannot settle", func(t *testing.T) {
		s, _, store, _ := jingSoftFixture(t)
		req := jingSoftRequest(t, s)
		_, err := s.create(context.Background(), 7, req)
		require.NoError(t, err)
		store.loseUpdate = true
		e := jingSoftTestEvidence(store.order)
		require.NoError(t, s.applyEvidence(cloneJingSoft(store.order), &e))
		assert.Zero(t, store.completed)
	})
}

func TestJingSoftPollRecoversSubmittingWithoutCreate(t *testing.T) {
	s, a, store, _ := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	_, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	store.order.Status = model.JingSoftOrderStatusSubmitting
	store.order.LeaseUntil = 0
	a.queryFn = func(_ *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftOrderEvidence, error) {
		return nil, errors.New("temporary upstream failure")
	}
	require.NoError(t, s.poll(context.Background()))
	assert.Equal(t, model.JingSoftOrderStatusCreationUnknown, store.order.Status)
	assert.Greater(t, store.order.NextQueryAt, s.now().Unix())
	assert.EqualValues(t, 1, a.creates.Load())
	assert.Zero(t, store.completed)
}

func TestJingSoftLatePaymentRecoveryDoesNotWaitForOldOrderVersion(t *testing.T) {
	for _, status := range []string{model.JingSoftOrderStatusPending, model.JingSoftOrderStatusPaid} {
		t.Run(status, func(t *testing.T) {
			s, a, store, _ := jingSoftFixture(t)
			_, err := s.create(context.Background(), 7, jingSoftRequest(t, s))
			require.NoError(t, err)
			store.order.Status = status
			store.order.Version = 100
			started := s.now()
			a.queryFn = func(*model.JingSoftOrder, JingSoftCredentials) (*JingSoftOrderEvidence, error) {
				return nil, errors.New("temporary query failure after waiting for payment")
			}
			require.NoError(t, s.poll(context.Background()))
			assert.LessOrEqual(t, store.order.NextQueryAt-started.Unix(), int64(60), "one transient failure must not postpone a late payment for fifteen minutes")
			assert.Zero(t, store.completed)
			s.now = func() time.Time { return started.Add(time.Minute) }
			a.queryFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftOrderEvidence, error) {
				e := jingSoftTestEvidence(o)
				return &e, nil
			}
			require.NoError(t, s.poll(context.Background()))
			assert.Equal(t, model.JingSoftOrderStatusCompleted, store.order.Status)
			assert.Equal(t, 1, store.completed)
			assert.EqualValues(t, 1, a.creates.Load())
		})
	}
}

func TestJingSoftPendingPaymentAndDeliveryRecheckPromptly(t *testing.T) {
	for _, paid := range []bool{false, true} {
		t.Run(fmt.Sprintf("paid=%t", paid), func(t *testing.T) {
			s, a, store, _ := jingSoftFixture(t)
			_, err := s.create(context.Background(), 7, jingSoftRequest(t, s))
			require.NoError(t, err)
			a.queryFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftOrderEvidence, error) {
				e := jingSoftTestEvidence(o)
				e.Paid, e.Delivered = paid, false
				return &e, nil
			}
			require.NoError(t, s.poll(context.Background()))
			assert.Equal(t, s.now().Add(15*time.Second).Unix(), store.order.NextQueryAt)
			assert.Zero(t, store.completed)
		})
	}
}

func TestJingSoftQueryVerificationFailureRequiresAttention(t *testing.T) {
	s, a, store, _ := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	_, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	a.queryFn = func(_ *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftOrderEvidence, error) {
		return nil, ErrJingSoftVerification
	}
	require.NoError(t, s.poll(context.Background()))
	assert.Equal(t, model.JingSoftOrderStatusNeedsAttention, store.order.Status)
	assert.Equal(t, "verification_mismatch", store.order.FailureCode)
	assert.Zero(t, store.completed)
}

func TestJingSoftPaidOrderWaitsForDeliveryAndRetriesTransientSettlement(t *testing.T) {
	s, _, store, _ := jingSoftFixture(t)
	req := jingSoftRequest(t, s)
	_, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	evidence := jingSoftTestEvidence(store.order)
	evidence.Delivered = false
	evidence.Expired = true
	require.NoError(t, s.applyEvidence(cloneJingSoft(store.order), &evidence))
	assert.Equal(t, model.JingSoftOrderStatusPaid, store.order.Status)
	assert.Zero(t, store.completed)
	require.NoError(t, s.applyEvidence(cloneJingSoft(store.order), &evidence))
	assert.Equal(t, model.JingSoftOrderStatusPaid, store.order.Status)
	evidence.Delivered = true
	store.completeErr = model.ErrRedemptionDatabase
	require.NoError(t, s.applyEvidence(cloneJingSoft(store.order), &evidence))
	assert.Equal(t, model.JingSoftOrderStatusPaid, store.order.Status)
	assert.Greater(t, store.order.NextQueryAt, s.now().Unix())
	assert.Zero(t, store.completed)
	store.completeErr = model.ErrRedemptionQuotaMismatch
	require.NoError(t, s.applyEvidence(cloneJingSoft(store.order), &evidence))
	assert.Equal(t, model.JingSoftOrderStatusNeedsAttention, store.order.Status)
	assert.Zero(t, store.completed)
}

func TestJingSoftRejectsEmbeddedOrMultipleCodes(t *testing.T) {
	for _, code := range []string{"prefix 0123456789abcdef0123456789abcdef", "0123456789abcdef0123456789abcdef\n0123456789abcdef0123456789abcdef", "0123456789abcdef0123456789abcdeg"} {
		s, _, store, _ := jingSoftFixture(t)
		req := jingSoftRequest(t, s)
		_, err := s.create(context.Background(), 7, req)
		require.NoError(t, err)
		evidence := jingSoftTestEvidence(store.order)
		evidence.RedemptionKey = code
		require.NoError(t, s.applyEvidence(cloneJingSoft(store.order), &evidence))
		assert.Equal(t, "delivery_invalid", store.order.FailureCode)
		assert.Zero(t, store.completed)
	}
}

func TestJingSoftDirectModeCustomAmountSlotQuarantineAndModeIsolation(t *testing.T) {
	previousPrice := operation_setting.Price
	previousMinTopUp := operation_setting.MinTopUp
	t.Cleanup(func() {
		operation_setting.Price = previousPrice
		operation_setting.MinTopUp = previousMinTopUp
	})
	operation_setting.Price = 7.2
	operation_setting.MinTopUp = 2

	t.Run("mode order and defaults prefer auto fallback while preserving existing payment semantics", func(t *testing.T) {
		assert.Equal(t, []string{
			operation_setting.JingSoftModeAuto,
			operation_setting.JingSoftModeDirect,
			operation_setting.JingSoftModeRedemption,
		}, operation_setting.JingSoftModes())
		assert.Equal(t, operation_setting.JingSoftModeAuto, jingSoftConfiguredMode(nil))
		assert.Equal(t, operation_setting.JingSoftModeAuto, jingSoftConfiguredMode(&operation_setting.JingSoftSetting{}))
		assert.Equal(t, operation_setting.JingSoftModeRedemption, jingSoftModeFromOrder(&model.JingSoftOrder{}))

		info := JingSoftPublicInfo()
		assert.Equal(t, []string{
			operation_setting.JingSoftModeAuto,
			operation_setting.JingSoftModeDirect,
			operation_setting.JingSoftModeRedemption,
		}, info.AvailableModes)
	})

	t.Run("redemption mode rejects custom amount", func(t *testing.T) {
		s, _, _, cfg := jingSoftFixture(t)
		cfg.Mode = operation_setting.JingSoftModeRedemption
		amount := int64(10)
		_, err := s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &amount, ChannelID: "pay"})
		require.ErrorIs(t, err, ErrJingSoftInvalidRequest)
	})

	t.Run("direct mode quotes without mutating slot, ignores client QQ, settles without redemption code, and survives mode switch", func(t *testing.T) {
		s, a, store, cfg := jingSoftFixture(t)
		cfg.Mode = operation_setting.JingSoftModeDirect
		cfg.StoreToken = "YMengCC"
		cfg.MerchantToken = "secret-merchant-token"
		cfg.DirectGoodsKeys = []string{"slot-1", "slot-2"}

		amount := int64(10)
		belowMin := int64(1)
		_, err := s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &belowMin, ChannelID: "pay"})
		require.ErrorIs(t, err, ErrJingSoftInvalidRequest)

		q, err := s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &amount, ChannelID: "pay"})
		require.NoError(t, err)
		assert.Equal(t, 72.0, q.Amount)
		assert.Equal(t, 10.0, q.TopUpAmount)
		assert.Zero(t, a.prepares.Load(), "quote must not touch or lock upstream slots")

		a.createFn = func(o *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftCreatedOrder, error) {
			e := jingSoftTestEvidence(o)
			e.UpstreamOrderID = "upstream-direct-1"
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &JingSoftCreatedOrder{
				UpstreamOrderID: "upstream-direct-1",
				PaymentURL:      "https://wzyp.cn/pay/upstream-direct-1",
				PaymentQRCode:   "weixin://wxpay/bizpayurl?pr=directToken",
				Credentials:     &c,
				Evidence:        e,
			}, nil
		}
		// Client-supplied QQ is ignored in direct mode; contact is bound to TradeNo.
		payment, err := s.create(context.Background(), 7, JingSoftPaymentRequest{
			Amount:         &amount,
			ChannelID:      "pay",
			QuoteID:        q.QuoteID,
			QQ:             "override-attempt",
			IdempotencyKey: "direct-idempotency-key-1",
		})
		require.NoError(t, err)
		assert.Equal(t, model.JingSoftOrderStatusPending, payment.Status)
		assert.Equal(t, operation_setting.JingSoftModeDirect, payment.Mode)
		assert.True(t, strings.HasPrefix(payment.TradeNo, "JingSoft_"))
		assert.Equal(t, "weixin://wxpay/bizpayurl?pr=directToken", payment.PaymentQRCode)
		assert.Equal(t, payment.TradeNo, a.lastContact)
		assert.Equal(t, model.JingSoftSlotStatusIdle, store.slots["slot-1"].Status)
		assert.Equal(t, "72.00", store.slots["slot-1"].ConfirmedPrice)

		// Switching global config back to redemption does not alter the in-flight direct order.
		cfg.Mode = operation_setting.JingSoftModeRedemption
		a.queryFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftOrderEvidence, error) {
			return &JingSoftOrderEvidence{
				UpstreamOrderID: "upstream-direct-1",
				TransactionID:   "wx-tx-direct-1",
				Contact:         o.TradeNo,
				ShopID:          o.ShopID,
				ProductID:       o.ProductID,
				Quantity:        1,
				Amount:          o.PriceAmount,
				Paid:            true,
				Delivered:       true,
				RedemptionKey:   "DIRECT-PLACEHOLDER-CARD",
			}, nil
		}
		require.NoError(t, s.poll(context.Background()))
		assert.Equal(t, model.JingSoftOrderStatusCompleted, store.order.Status)
		assert.Equal(t, 1, store.completed)
		assert.Empty(t, store.completeKey, "direct mode must ignore placeholder card text")
		assert.Equal(t, "wx-tx-direct-1", store.completeTxID)
	})

	t.Run("direct mode rejects contact mismatch, missing transaction ID, busy slots, and quarantines ambiguous slots", func(t *testing.T) {
		s, a, store, cfg := jingSoftFixture(t)
		cfg.Mode = operation_setting.JingSoftModeDirect
		cfg.StoreToken = "YMengCC"
		cfg.MerchantToken = "secret-merchant-token"
		cfg.DirectGoodsKeys = []string{"slot-only"}

		amount := int64(5)
		q, err := s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &amount, ChannelID: "pay"})
		require.NoError(t, err)

		// Exhausted slots return ErrJingSoftSlotBusy without creating an order.
		store.slotBusy = true
		_, err = s.create(context.Background(), 7, JingSoftPaymentRequest{
			Amount: &amount, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "direct-busy-key-1234",
		})
		require.ErrorIs(t, err, ErrJingSoftSlotBusy)
		assert.Nil(t, store.order)
		store.slotBusy = false

		// Ambiguous upstream order creation quarantines the slot so it cannot be reused blindly.
		a.createFn = func(_ *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftCreatedOrder, error) {
			return &JingSoftCreatedOrder{Credentials: &c}, context.DeadlineExceeded
		}
		p, err := s.create(context.Background(), 7, JingSoftPaymentRequest{
			Amount: &amount, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "direct-ambiguous-key",
		})
		require.NoError(t, err)
		assert.Equal(t, model.JingSoftOrderStatusCreationUnknown, p.Status)
		assert.Equal(t, model.JingSoftSlotStatusQuarantined, store.slots["slot-only"].Status)

		// Contact mismatch marks NeedsAttention without crediting.
		wrongContact := JingSoftOrderEvidence{
			UpstreamOrderID: "up-2", TransactionID: "wx-tx-2", Contact: "wrong-contact",
			ShopID: store.order.ShopID, ProductID: store.order.ProductID, Quantity: 1, Amount: store.order.PriceAmount,
			Paid: true, Delivered: true,
		}
		require.NoError(t, s.applyEvidence(cloneJingSoft(store.order), &wrongContact))
		assert.Equal(t, model.JingSoftOrderStatusNeedsAttention, store.order.Status)
		assert.Zero(t, store.completed)
	})

	t.Run("probe-only unpaid response reschedules pending orders without settling", func(t *testing.T) {
		s, a, store, _ := jingSoftFixture(t)
		req := jingSoftRequest(t, s)
		a.createFn = func(o *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftCreatedOrder, error) {
			e := jingSoftTestEvidence(o)
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &JingSoftCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://wzyp.cn/pay", Credentials: &c, Evidence: e}, nil
		}
		_, err := s.create(context.Background(), 7, req)
		require.NoError(t, err)
		a.queryFn = func(*model.JingSoftOrder, JingSoftCredentials) (*JingSoftOrderEvidence, error) {
			return &JingSoftOrderEvidence{ProbeOnlyUnpaid: true}, nil
		}
		require.NoError(t, s.poll(context.Background()))
		assert.Equal(t, model.JingSoftOrderStatusPending, store.order.Status)
		assert.Equal(t, s.now().Add(15*time.Second).Unix(), store.order.NextQueryAt)
		assert.Zero(t, store.completed)
	})

	t.Run("auto mode seamlessly falls back to redemption on token expiry and resumes direct on token update", func(t *testing.T) {
		s, a, store, cfg := jingSoftFixture(t)
		cfg.Mode = operation_setting.JingSoftModeAuto
		cfg.StoreToken = "YMengCC"
		cfg.MerchantToken = "token-v1"
		cfg.Products = []operation_setting.JingSoftProduct{{ID: "ten", Name: "Ten", GoodsKey: "goods", Amount: 10}}
		cfg.DirectGoodsKeys = []string{"slot-auto-1"}

		// Healthy token resolves to direct mode and supports custom amounts.
		effMode, fallback := s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.JingSoftModeDirect, effMode)
		assert.False(t, fallback)
		customAmt := int64(15)
		qCustom, err := s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &customAmt, ChannelID: "pay"})
		require.NoError(t, err)
		assert.Equal(t, operation_setting.JingSoftModeDirect, qCustom.Mode)

		// Mid-request expiry on a preset amount ($10 matches cfg.Products[0]) falls back seamlessly in the same quote call.
		a.quoteDirectErr = errJingSoftMerchantAuthExpired
		presetAmt := int64(10)
		qFallback, err := s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &presetAmt, ChannelID: "pay"})
		require.NoError(t, err)
		assert.Equal(t, operation_setting.JingSoftModeRedemption, qFallback.Mode)
		assert.Equal(t, "ten", qFallback.ProductID)

		effMode, fallback = s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.JingSoftModeRedemption, effMode)
		assert.True(t, fallback)

		// Unmapped custom amount while fallen back returns clean fallback guidance.
		_, err = s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &customAmt, ChannelID: "pay"})
		require.ErrorIs(t, err, ErrJingSoftCustomAmountFallback)

		// Completing the fallen-back redemption quote works normally with QQ.
		a.createFn = func(o *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftCreatedOrder, error) {
			e := jingSoftTestEvidence(o)
			e.UpstreamOrderID = "upstream-auto-redemption"
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &JingSoftCreatedOrder{UpstreamOrderID: "upstream-auto-redemption", PaymentURL: "https://wzyp.cn/pay", Credentials: &c, Evidence: e}, nil
		}
		p, err := s.create(context.Background(), 7, JingSoftPaymentRequest{
			ProductID: "ten", ChannelID: "pay", QuoteID: qFallback.QuoteID, QQ: "123456", IdempotencyKey: "auto-fallback-pay-1",
		})
		require.NoError(t, err)
		assert.Equal(t, operation_setting.JingSoftModeRedemption, p.Mode)
		assert.Equal(t, "123456", store.order.ExpectedContact)

		// Updating merchant_token immediately restores direct mode; background probe keeps it updated.
		a.quoteDirectErr = nil
		cfg.MerchantToken = "token-v2"
		effMode, fallback = s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.JingSoftModeDirect, effMode)
		assert.False(t, fallback)

		// Transient network error in background probe does not falsely trigger fallback.
		a.checkTokenFn = func(string, string) (bool, error) { return false, ErrJingSoftOrderUnavailable }
		s.probeAutoMerchantTokenIfDue(context.Background())
		effMode, fallback = s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.JingSoftModeDirect, effMode)
		assert.False(t, fallback)

		// Confirmed invalid token in background probe switches effectiveMode to redemption before customer visit.
		a.checkTokenFn = func(string, string) (bool, error) { return false, nil }
		s.probeAutoMerchantTokenIfDue(context.Background())
		effMode, fallback = s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.JingSoftModeRedemption, effMode)
		assert.True(t, fallback)
	})

	t.Run("direct mode retries out-of-stock order creation once after force restock and proactively checks stock after settlement", func(t *testing.T) {
		s, a, store, cfg := jingSoftFixture(t)
		cfg.Mode = operation_setting.JingSoftModeDirect
		cfg.StoreToken = "YMengCC"
		cfg.MerchantToken = "secret-merchant-token"
		cfg.DirectGoodsKeys = []string{"slot-restock-1"}

		var forcedCalls, gentleCalls atomic.Int32
		a.replenishFn = func(slotGoodsKey string, force bool) (int, error) {
			assert.Equal(t, "slot-restock-1", slotGoodsKey)
			if force {
				forcedCalls.Add(1)
			} else {
				gentleCalls.Add(1)
			}
			return 20, nil
		}
		var createAttempts atomic.Int32
		a.createFn = func(o *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftCreatedOrder, error) {
			if createAttempts.Add(1) == 1 {
				return &JingSoftCreatedOrder{Credentials: &c}, errJingSoftOutOfStock
			}
			e := jingSoftTestEvidence(o)
			e.UpstreamOrderID = "upstream-restocked-1"
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &JingSoftCreatedOrder{
				UpstreamOrderID: "upstream-restocked-1",
				PaymentURL:      "https://wzyp.cn/pay/upstream-restocked-1",
				PaymentQRCode:   "weixin://wxpay/bizpayurl?pr=restockedQR",
				Credentials:     &c,
				Evidence:        e,
			}, nil
		}

		amount := int64(5)
		q, err := s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &amount, ChannelID: "pay"})
		require.NoError(t, err)

		payment, err := s.create(context.Background(), 7, JingSoftPaymentRequest{
			Amount: &amount, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "restock-retry-idem-1",
		})
		require.NoError(t, err)
		assert.Equal(t, model.JingSoftOrderStatusPending, payment.Status)
		assert.EqualValues(t, 2, createAttempts.Load())
		assert.EqualValues(t, 1, forcedCalls.Load())
		assert.Zero(t, gentleCalls.Load())
		assert.Equal(t, model.JingSoftSlotStatusIdle, store.slots["slot-restock-1"].Status)

		a.queryFn = func(o *model.JingSoftOrder, _ JingSoftCredentials) (*JingSoftOrderEvidence, error) {
			return &JingSoftOrderEvidence{
				UpstreamOrderID: "upstream-restocked-1",
				TransactionID:   "wx-tx-restocked-1",
				Contact:         o.TradeNo,
				ShopID:          o.ShopID,
				ProductID:       o.ProductID,
				Quantity:        1,
				Amount:          o.PriceAmount,
				Paid:            true,
				Delivered:       true,
			}, nil
		}
		require.NoError(t, s.poll(context.Background()))
		assert.Equal(t, model.JingSoftOrderStatusCompleted, store.order.Status)
		assert.EqualValues(t, 1, gentleCalls.Load(), "completed direct order must proactively check slot stock")
	})

	t.Run("enforces configurable CNY max amount and sliding-window new order rate limit without blocking idempotent recovery", func(t *testing.T) {
		s, a, store, cfg := jingSoftFixture(t)
		cfg.Mode = operation_setting.JingSoftModeDirect
		cfg.StoreToken = "YMengCC"
		cfg.MerchantToken = "secret-merchant-token"
		cfg.DirectGoodsKeys = []string{"slot-limit-1"}
		cfg.MaxAmountCNY = 100
		cfg.MaxOrdersPerMinute = 2

		nowUnix := int64(1700001000)
		s.now = func() time.Time { return time.Unix(nowUnix, 0) }

		// $20 * 7.2 = ¥144.00 > ¥100.00 max limit -> rejected with exact limit message.
		tooHigh := int64(20)
		_, err := QuoteJingSoftRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &tooHigh, ChannelID: "pay"})
		_, err = s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &tooHigh, ChannelID: "pay"})
		require.Error(t, err)
		assert.Equal(t, "JingSoft single payment cannot exceed ¥100.00", jingSoftPublicError(err).Error())

		// $10 * 7.2 = ¥72.00 <= ¥100.00 succeeds; if buyer fee pushes total > ¥100.00, also rejected.
		okAmt := int64(10)
		a.directOffer = JingSoftOffer{
			ShopID: "YMengCC", ShopName: "Direct Shop", ShopURL: "https://wzyp.cn/shop/YMengCC",
			ProductID: "slot-limit-1", ChannelID: "pay", Amount: "101.50", OriginalAmount: "72.00", Fee: "29.50",
			Currency: "CNY", Quantity: 1, InStock: true,
		}
		_, err = s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &okAmt, ChannelID: "pay"})
		require.Error(t, err)
		assert.Equal(t, "JingSoft single payment cannot exceed ¥100.00", jingSoftPublicError(err).Error())
		a.directOffer = JingSoftOffer{}

		q, err := s.quoteRequest(context.Background(), 7, JingSoftQuoteRequest{Amount: &okAmt, ChannelID: "pay"})
		require.NoError(t, err)
		a.createFn = func(o *model.JingSoftOrder, c JingSoftCredentials) (*JingSoftCreatedOrder, error) {
			e := jingSoftTestEvidence(o)
			e.UpstreamOrderID = "up-" + o.IdempotencyKey
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &JingSoftCreatedOrder{UpstreamOrderID: e.UpstreamOrderID, PaymentURL: "https://wzyp.cn/pay/1", PaymentQRCode: "weixin://wxpay/bizpayurl?pr=ok", Credentials: &c, Evidence: e}, nil
		}

		// Order 1 allowed.
		_, err = s.createWithIP(context.Background(), 7, JingSoftPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0001",
		}, "203.0.113.9")
		require.NoError(t, err)

		// Clear test store's single-order slot to simulate second distinct order; Order 2 allowed.
		firstOrder := store.order
		store.order = nil
		_, err = s.createWithIP(context.Background(), 7, JingSoftPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0002",
		}, "203.0.113.9")
		require.NoError(t, err)

		// Order 3 within 60s window rejected by user & IP limit.
		store.order = nil
		_, err = s.createWithIP(context.Background(), 7, JingSoftPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0003",
		}, "203.0.113.9")
		require.ErrorIs(t, err, ErrJingSoftRateLimited)

		// Different user from the same IP is also blocked by per-IP limit.
		qOtherUser, err := s.quoteRequest(context.Background(), 8, JingSoftQuoteRequest{Amount: &okAmt, ChannelID: "pay"})
		require.NoError(t, err)
		_, err = s.createWithIP(context.Background(), 8, JingSoftPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: qOtherUser.QuoteID, IdempotencyKey: "rate-limit-order-0004",
		}, "203.0.113.9")
		require.ErrorIs(t, err, ErrJingSoftRateLimited)

		// Idempotent retry of an existing order is NEVER blocked even while rate-limited.
		store.order = firstOrder
		recovered, err := s.createWithIP(context.Background(), 7, JingSoftPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0001",
		}, "203.0.113.9")
		require.NoError(t, err)
		assert.Equal(t, firstOrder.TradeNo, recovered.TradeNo)

		// Advancing past 60s sliding window allows new orders again.
		store.order = nil
		nowUnix += 61
		_, err = s.createWithIP(context.Background(), 7, JingSoftPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0005",
		}, "203.0.113.9")
		require.NoError(t, err)
	})
}
