package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
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
type catFKTestAdapter struct {
	CatFKAdapter
	offer          CatFKOffer
	directOffer    CatFKOffer
	quoteDirectErr error
	checkTokenFn   func(merchantToken string) (bool, error)
	creates        atomic.Int32
	queries        atomic.Int32
	prepares       atomic.Int32
	replenishes    atomic.Int32
	lastContact    string
	prepareFn      func(slotGoodsKey, baseAmount, knownConfirmedPrice string) (*CatFKDynamicSlotReady, error)
	replenishFn    func(slotGoodsKey string, force bool) (int, error)
	createFn       func(*model.CatFKOrder, CatFKCredentials) (*CatFKCreatedOrder, error)
	queryFn        func(*model.CatFKOrder, CatFKCredentials) (*CatFKOrderEvidence, error)
}

func (a *catFKTestAdapter) Ready() bool { return true }
func (a *catFKTestAdapter) CheckMerchantToken(_ context.Context, merchantToken string) (bool, error) {
	if a.checkTokenFn != nil {
		return a.checkTokenFn(merchantToken)
	}
	return merchantToken != "", nil
}
func (a *catFKTestAdapter) Quote(context.Context, string, string, string) (*CatFKOffer, error) {
	o := a.offer
	return &o, nil
}
func (a *catFKTestAdapter) QuoteDirect(_ context.Context, storeToken, _, slotGoodsKey, channelID, baseAmount string) (*CatFKOffer, error) {
	if a.quoteDirectErr != nil {
		return nil, a.quoteDirectErr
	}
	if a.directOffer.ShopID != "" {
		o := a.directOffer
		return &o, nil
	}
	return &CatFKOffer{
		ShopID:         storeToken,
		ShopName:       "Direct Shop",
		ShopURL:        "https://catfk.com/shop/" + storeToken,
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
func (a *catFKTestAdapter) PrepareDirectSlot(_ context.Context, storeToken, _, slotGoodsKey, channelID, baseAmount, knownConfirmedPrice string, _, _ int) (*CatFKDynamicSlotReady, error) {
	a.prepares.Add(1)
	if a.prepareFn != nil {
		return a.prepareFn(slotGoodsKey, baseAmount, knownConfirmedPrice)
	}
	offer, err := a.QuoteDirect(context.Background(), storeToken, "m-token", slotGoodsKey, channelID, baseAmount)
	if err != nil {
		return nil, err
	}
	return &CatFKDynamicSlotReady{Offer: *offer, ConfirmedPrice: baseAmount}, nil
}
func (a *catFKTestAdapter) ReplenishDirectSlot(_ context.Context, _, _, slotGoodsKey string, _, restockBatch int, force bool) (int, error) {
	a.replenishes.Add(1)
	if a.replenishFn != nil {
		return a.replenishFn(slotGoodsKey, force)
	}
	return restockBatch, nil
}
func (a *catFKTestAdapter) Create(_ context.Context, o *model.CatFKOrder, c CatFKCredentials, contact string) (*CatFKCreatedOrder, error) {
	a.creates.Add(1)
	a.lastContact = contact
	return a.createFn(o, c)
}
func (a *catFKTestAdapter) Query(_ context.Context, o *model.CatFKOrder, c CatFKCredentials) (*CatFKOrderEvidence, error) {
	a.queries.Add(1)
	return a.queryFn(o, c)
}

type catFKTestStore struct {
	mu           sync.Mutex
	order        *model.CatFKOrder
	completed    int
	completeErr  error
	completeKey  string
	completeTxID string
	updateCalls  int
	loseUpdate   bool
	dueLimit     int
	slotBusy     bool
	slots        map[string]*model.CatFKPriceSlot
}

func cloneCatFK(o *model.CatFKOrder) *model.CatFKOrder {
	if o == nil {
		return nil
	}
	copy := *o
	return &copy
}
func (f *catFKTestStore) Create(o *model.CatFKOrder) (*model.CatFKOrder, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order != nil {
		return cloneCatFK(f.order), true, nil
	}
	f.order = cloneCatFK(o)
	f.order.ID = 1
	return cloneCatFK(f.order), false, nil
}
func (f *catFKTestStore) Get(u int, t string) (*model.CatFKOrder, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order == nil || f.order.UserID != u || f.order.TradeNo != t {
		return nil, errors.New("not found")
	}
	return cloneCatFK(f.order), nil
}
func (f *catFKTestStore) Find(u int, key string) (*model.CatFKOrder, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order == nil || f.order.UserID != u || f.order.IdempotencyKey != key {
		return nil, nil
	}
	return cloneCatFK(f.order), nil
}
func (f *catFKTestStore) Due(_ int64, limit int) ([]*model.CatFKOrder, error) {
	f.dueLimit = limit
	return []*model.CatFKOrder{cloneCatFK(f.order)}, nil
}
func (f *catFKTestStore) Claim(_ int, now, lease int64) (*model.CatFKOrder, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order.LeaseUntil > now {
		return cloneCatFK(f.order), false, nil
	}
	switch f.order.Status {
	case model.CatFKOrderStatusNew:
		f.order.Status = model.CatFKOrderStatusSubmitting
	case model.CatFKOrderStatusSubmitting:
		f.order.Status = model.CatFKOrderStatusCreationUnknown
	}
	f.order.Version++
	f.order.LeaseUntil = now + lease
	return cloneCatFK(f.order), true, nil
}
func (f *catFKTestStore) Update(_ int, v int64, u model.CatFKOrderUpdate) (bool, error) {
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
func (f *catFKTestStore) Created(id int, v int64, u, p string, n int64) (bool, error) {
	return f.Update(id, v, model.CatFKOrderUpdate{Status: model.CatFKOrderStatusPending, UpstreamOrderID: &u, PaymentURL: &p, NextQueryAt: n})
}
func (f *catFKTestStore) Retry(id int, v, n int64) (bool, error) {
	return f.Update(id, v, model.CatFKOrderUpdate{Status: f.order.Status, NextQueryAt: n})
}
func (f *catFKTestStore) Complete(_ int, v int64, k, txID, _ string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.order.Version != v || f.order.Status != model.CatFKOrderStatusPaid {
		return false, errors.New("unfenced completion")
	}
	if f.completeErr != nil {
		return false, f.completeErr
	}
	f.completed++
	f.completeKey = k
	f.completeTxID = txID
	f.order.Status = model.CatFKOrderStatusCompleted
	return false, nil
}
func (f *catFKTestStore) Capacity(int, int) error { return nil }
func (f *catFKTestStore) AcquireSlot(shopID string, goodsKeys []string, targetPrice, orderTradeNo string, now, leaseSeconds int64) (*model.CatFKPriceSlot, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.slotBusy {
		return nil, false, nil
	}
	if f.slots == nil {
		f.slots = make(map[string]*model.CatFKPriceSlot, len(goodsKeys))
	}
	for i, key := range goodsKeys {
		if _, exists := f.slots[key]; !exists {
			f.slots[key] = &model.CatFKPriceSlot{ID: i + 1, ShopID: shopID, GoodsKey: key, Status: model.CatFKSlotStatusIdle}
		}
	}
	for _, key := range goodsKeys {
		s := f.slots[key]
		if s.Status == model.CatFKSlotStatusIdle && targetPrice != "" && s.ConfirmedPrice == targetPrice {
			s.Status = model.CatFKSlotStatusLeased
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
		if s.Status == model.CatFKSlotStatusIdle {
			s.Status = model.CatFKSlotStatusLeased
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
func (f *catFKTestStore) ReleaseSlot(id int, version int64, holderToken, confirmedPrice string, _ int64) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, s := range f.slots {
		if s.ID == id && s.Version == version && s.HolderToken == holderToken && s.Status == model.CatFKSlotStatusLeased {
			s.Status = model.CatFKSlotStatusIdle
			s.ConfirmedPrice = confirmedPrice
			s.HolderToken = ""
			s.Version++
			return true, nil
		}
	}
	return false, nil
}
func (f *catFKTestStore) QuarantineSlot(id int, version int64, holderToken, code string, _ int64) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, s := range f.slots {
		if s.ID == id && s.Version == version && s.HolderToken == holderToken && s.Status == model.CatFKSlotStatusLeased {
			s.Status = model.CatFKSlotStatusQuarantined
			s.ConfirmedPrice = ""
			s.HolderToken = ""
			s.QuarantineCode = code
			s.Version++
			return true, nil
		}
	}
	return false, nil
}

func catFKFixture(t *testing.T) (*catFKService, *catFKTestAdapter, *catFKTestStore, *operation_setting.CatFKSetting) {
	t.Helper()
	previousPayMethods := operation_setting.PayMethods
	t.Cleanup(func() { operation_setting.PayMethods = previousPayMethods })
	operation_setting.PayMethods = []map[string]string{{
		"name":       "Catfk WeChat",
		"type":       operation_setting.CatFKPaymentMethodWeChat,
		"channel_id": "pay",
	}}
	cfg := &operation_setting.CatFKSetting{Enabled: true, StoreToken: "private-store-token", Products: []operation_setting.CatFKProduct{{ID: "tier", Name: "Credit", GoodsKey: "goods", Amount: 2.5}}, Channels: []operation_setting.CatFKChannel{{ID: "pay", Name: "WeChat Pay", PaymentType: "wxpay"}}}
	adapter := &catFKTestAdapter{offer: CatFKOffer{ShopID: "shop", ProductID: "goods", ChannelID: "pay", Amount: "18.00", Currency: "CNY", Quantity: 1, InStock: true}}
	store := &catFKTestStore{}
	service := &catFKService{adapter: adapter, store: store, setting: func() *operation_setting.CatFKSetting { return cfg }, now: func() time.Time { return time.Unix(1700000000, 0) }, key: func() ([]byte, error) { return make([]byte, 32), nil }}
	adapter.createFn = func(o *model.CatFKOrder, c CatFKCredentials) (*CatFKCreatedOrder, error) {
		c.Cookie = "upstream-secret-cookie"
		return &CatFKCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://payments.example/pay", Credentials: &c, Evidence: catFKTestEvidence(o)}, nil
	}
	adapter.queryFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKOrderEvidence, error) {
		e := catFKTestEvidence(o)
		return &e, nil
	}
	return service, adapter, store, cfg
}
func catFKTestEvidence(o *model.CatFKOrder) CatFKOrderEvidence {
	contact := o.ExpectedContact
	if contact == "" {
		contact = "123456"
	}
	return CatFKOrderEvidence{UpstreamOrderID: "upstream", TransactionID: "wx-tx-" + o.TradeNo, Contact: contact, ShopID: o.ShopID, ProductID: o.ProductID, ChannelID: o.ChannelID, Quantity: 1, Amount: o.PriceAmount, Currency: o.Currency, Paid: true, Delivered: true, RedemptionKey: "0123456789abcdef0123456789abcdef"}
}
func catFKRequest(t *testing.T, s *catFKService) CatFKPaymentRequest {
	t.Helper()
	q, err := s.quote(context.Background(), 7, "tier", "pay")
	require.NoError(t, err)
	assert.Equal(t, 18.0, q.Amount)
	assert.Equal(t, 2.5, q.TopUpAmount)
	return CatFKPaymentRequest{ProductID: "tier", ChannelID: "pay", QuoteID: q.QuoteID, QQ: "123456", IdempotencyKey: "stable-request-key"}
}

func TestCatFKStoreTokenAcceptsOnlyPlatformShopLinks(t *testing.T) {
	for _, input := range []string{"YMengCC", " https://catfk.com/shop/YMengCC/ "} {
		token, err := operation_setting.NormalizeCatFKStoreToken(input)
		require.NoError(t, err)
		assert.Equal(t, "YMengCC", token)
		require.NoError(t, operation_setting.ValidateCatFKOption("catfk_setting.store_token", input))
	}
	for _, input := range []string{"https://other.example/shop/YMengCC", "http://catfk.com/shop/YMengCC", "https://catfk.com:8443/shop/YMengCC", "https://catfk.com/shop/YMengCC?x=1", "https://catfk.com/shop/YMengCC#x", "YMengCC\r\n"} {
		_, err := operation_setting.NormalizeCatFKStoreToken(input)
		require.Error(t, err)
		require.Error(t, operation_setting.ValidateCatFKOption("catfk_setting.store_token", input))
	}
}

func TestCatFKUnverifiedAdapterRejectsPaymentOperations(t *testing.T) {
	assert.True(t, CatFKProtocolReady())
	// An unverified adapter still cannot touch persistence, keys or settings.
	s := &catFKService{adapter: catFKUnverifiedAdapter{}}
	_, err := s.create(context.Background(), 7, CatFKPaymentRequest{})
	require.ErrorIs(t, err, ErrCatFKProtocolUnverified)
	_, err = s.quote(context.Background(), 7, "tier", "pay")
	require.ErrorIs(t, err, ErrCatFKProtocolUnverified)
	require.ErrorIs(t, s.poll(context.Background()), ErrCatFKProtocolUnverified)
	_, err = ListCatFKChannels(context.Background(), "https://other.example/shop/secret")
	require.ErrorIs(t, err, ErrCatFKInvalidRequest)
	assert.True(t, (catFKPollHandler{}).Enabled())
	assert.Equal(t, ErrCatFKOrderUnavailable, catFKPublicError(errors.New("SQL contains sensitive value")))
}

func TestCatFKChannelRequiresMatchingGeneralPaymentMethod(t *testing.T) {
	s, _, store, _ := catFKFixture(t)
	operation_setting.PayMethods = []map[string]string{{
		"type":       operation_setting.CatFKPaymentMethodAlipay,
		"channel_id": "pay",
	}}
	_, err := s.quote(context.Background(), 7, "tier", "pay")
	require.ErrorIs(t, err, ErrCatFKInvalidRequest)
	assert.Nil(t, store.order)

	operation_setting.PayMethods = []map[string]string{{
		"type":       operation_setting.CatFKPaymentMethodWeChat,
		"channel_id": "another-channel",
	}}
	_, err = s.quote(context.Background(), 7, "tier", "pay")
	require.ErrorIs(t, err, ErrCatFKInvalidRequest)
	assert.Nil(t, store.order)
}

func TestCatFKPaymentMethodRemovalAfterQuoteBlocksNewOrder(t *testing.T) {
	s, a, store, _ := catFKFixture(t)
	req := catFKRequest(t, s)
	operation_setting.PayMethods = nil

	_, err := s.create(context.Background(), 7, req)
	require.ErrorIs(t, err, ErrCatFKInvalidRequest)
	assert.Nil(t, store.order)
	assert.Zero(t, a.creates.Load())
}

func TestCatFKQuoteAndCreateBindings(t *testing.T) {
	for _, name := range []string{"user", "config", "expiry", "tamper", "channel", "price", "stock", "qq-empty", "qq-unicode", "qq-letter"} {
		t.Run(name, func(t *testing.T) {
			s, a, store, cfg := catFKFixture(t)
			req := catFKRequest(t, s)
			user := 7
			want := ErrCatFKInvalidQuote
			switch name {
			case "user":
				user = 8
			case "config":
				cfg.StoreToken = "changed"
			case "expiry":
				s.now = func() time.Time { return time.Unix(1700000300, 0) }
			case "tamper":
				req.QuoteID = "!" + req.QuoteID
			case "channel":
				req.ChannelID = "other"
				want = ErrCatFKInvalidRequest
			case "price":
				a.offer.Amount = "19"
			case "stock":
				a.offer.InStock = false
			case "qq-empty":
				req.QQ = ""
				want = ErrCatFKInvalidRequest
			case "qq-unicode":
				req.QQ = "１２３"
				want = ErrCatFKInvalidRequest
			case "qq-letter":
				req.QQ = "12a"
				want = ErrCatFKInvalidRequest
			}
			_, err := s.create(context.Background(), user, req)
			require.ErrorIs(t, err, want)
			assert.Nil(t, store.order)
			assert.Zero(t, a.creates.Load())
		})
	}
	s, a, store, _ := catFKFixture(t)
	a.offer.ProductID = "wrong"
	_, err := s.quote(context.Background(), 7, "tier", "pay")
	require.ErrorIs(t, err, ErrCatFKVerification)
	assert.Nil(t, store.order)
}

func TestCatFKCreateOnceAndCredentialRecovery(t *testing.T) {
	s, a, store, _ := catFKFixture(t)
	req := catFKRequest(t, s)
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
	assert.Equal(t, model.CatFKOrderStatusPending, store.order.Status)
	assert.Equal(t, model.PaymentMethodCatFKWeChat, store.order.PaymentMethod)
	var credentials CatFKCredentials
	key, err := s.key()
	require.NoError(t, err)
	purpose := fmt.Sprintf("catfk/order/v1/%d/%s", 7, store.order.TradeNo)
	require.NoError(t, catFKOpen(key, purpose, store.order.CredentialCiphertext, &credentials))
	assert.Equal(t, "upstream-secret-cookie", credentials.Cookie)
	assert.NotEmpty(t, credentials.Visitor)
	assert.NotEmpty(t, credentials.Password)
	require.Error(t, catFKOpen(key, purpose+"other", store.order.CredentialCiphertext, &credentials))
	public, err := common.Marshal(catFKSafePayment(store.order))
	require.NoError(t, err)
	assert.NotContains(t, string(public), credentials.Cookie)
	assert.NotContains(t, string(public), credentials.Password)
	assert.NotContains(t, string(public), "0123456789abcdef0123456789abcdef")
	t.Setenv("CATFK_ORDER_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(key))
	restartedKey, err := catFKEncryptionKey()
	require.NoError(t, err)
	require.NoError(t, catFKOpen(restartedKey, purpose, store.order.CredentialCiphertext, &credentials))
	store.order.Status = model.CatFKOrderStatusCompleted
	assert.Empty(t, catFKSafePayment(store.order).PaymentQRCode)
}

func TestCatFKAmbiguousCreationNeverResubmits(t *testing.T) {
	s, a, store, cfg := catFKFixture(t)
	req := catFKRequest(t, s)
	a.createFn = func(_ *model.CatFKOrder, c CatFKCredentials) (*CatFKCreatedOrder, error) {
		c.Cookie = "recover-cookie"
		return &CatFKCreatedOrder{Credentials: &c}, context.DeadlineExceeded
	}
	payment, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.Equal(t, model.CatFKOrderStatusCreationUnknown, payment.Status)
	assert.Empty(t, payment.PaymentQRCode)
	_, err = s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.EqualValues(t, 1, a.creates.Load())
	cfg.Enabled = false // Recovery intentionally ignores the new-purchase switch.
	require.NoError(t, s.poll(context.Background()))
	assert.Equal(t, model.CatFKOrderStatusCompleted, store.order.Status)
	assert.Equal(t, 1, store.completed)
	assert.Equal(t, "0123456789abcdef0123456789abcdef", store.completeKey)
	assert.Equal(t, 50, store.dueLimit)
	assert.EqualValues(t, 1, a.creates.Load())
}

func TestCatFKExistingRequestSurvivesQuoteExpiryAndDisabledPurchases(t *testing.T) {
	s, a, store, cfg := catFKFixture(t)
	req := catFKRequest(t, s)
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
	require.ErrorIs(t, err, ErrCatFKInvalidRequest)
	assert.EqualValues(t, 1, a.creates.Load())
}

func TestCatFKPartialCreationRetainsRecoveryIdentity(t *testing.T) {
	s, a, store, _ := catFKFixture(t)
	req := catFKRequest(t, s)
	a.createFn = func(_ *model.CatFKOrder, c CatFKCredentials) (*CatFKCreatedOrder, error) {
		c.Cookie = "recovery-cookie"
		return &CatFKCreatedOrder{UpstreamOrderID: "known-upstream", Credentials: &c}, context.DeadlineExceeded
	}
	payment, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.Equal(t, model.CatFKOrderStatusCreationUnknown, payment.Status)
	require.NotNil(t, store.order.UpstreamOrderID)
	assert.Equal(t, "known-upstream", *store.order.UpstreamOrderID)
	assert.Empty(t, payment.PaymentQRCode)
	_, err = s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.EqualValues(t, 1, a.creates.Load())
}

func TestCatFKCreationSnapshotMismatch(t *testing.T) {
	s, a, store, _ := catFKFixture(t)
	req := catFKRequest(t, s)
	a.createFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKCreatedOrder, error) {
		e := catFKTestEvidence(o)
		e.Amount = "0.01"
		return &CatFKCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://payments.example/pay", Evidence: e}, nil
	}
	p, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.Equal(t, model.CatFKOrderStatusNeedsAttention, p.Status)
	assert.Empty(t, p.PaymentQRCode)
	assert.Zero(t, store.completed)
}

func TestCatFKPendingOrderExposesOnlyTheScrapedQRCode(t *testing.T) {
	for _, tc := range []struct{ name, scraped, want string }{
		{"non-native-scrape", "https://qr.alipay.com/upx-code", ""},
		{"unsafe-scrape", "javascript:alert(1)", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, a, store, _ := catFKFixture(t)
			req := catFKRequest(t, s)
			a.createFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKCreatedOrder, error) {
				e := catFKTestEvidence(o)
				e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
				return &CatFKCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://payments.example/pay", PaymentQRCode: tc.scraped, Evidence: e}, nil
			}
			payment, err := s.create(context.Background(), 7, req)
			require.NoError(t, err)
			assert.Equal(t, model.CatFKOrderStatusPending, payment.Status)
			assert.Equal(t, tc.want, payment.PaymentQRCode)
			public, err := common.Marshal(payment)
			require.NoError(t, err)
			assert.NotContains(t, string(public), "payment_url")
			store.order.Status = model.CatFKOrderStatusExpired
			assert.Empty(t, catFKSafePayment(store.order).PaymentQRCode)
		})
	}
}

func TestCatFKRefreshSettlesAWatchedOrderWithoutWaitingForThePoll(t *testing.T) {
	s, a, store, _ := catFKFixture(t)
	req := catFKRequest(t, s)
	a.createFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKCreatedOrder, error) {
		e := catFKTestEvidence(o)
		e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
		return &CatFKCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://payments.example/pay", Evidence: e}, nil
	}
	payment, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	require.Equal(t, model.CatFKOrderStatusPending, payment.Status)
	require.Greater(t, store.order.NextQueryAt, s.now().Unix(), "the background poll is not due yet")

	store.order.UpdatedAt = s.now().Unix()
	order, err := s.refresh(context.Background(), 7, payment.TradeNo)
	require.NoError(t, err)
	assert.Equal(t, model.CatFKOrderStatusPending, order.Status)
	assert.Zero(t, a.queries.Load(), "a just-updated order is not queried again")

	store.order.UpdatedAt = s.now().Unix() - 2
	order, err = s.refresh(context.Background(), 7, payment.TradeNo)
	require.NoError(t, err)
	assert.Equal(t, model.CatFKOrderStatusCompleted, order.Status)
	assert.EqualValues(t, 1, a.queries.Load())
	assert.Equal(t, 1, store.completed)

	order, err = s.refresh(context.Background(), 7, payment.TradeNo)
	require.NoError(t, err)
	assert.Equal(t, model.CatFKOrderStatusCompleted, order.Status)
	assert.EqualValues(t, 1, a.queries.Load(), "a finished order is never queried")
	_, err = s.refresh(context.Background(), 8, payment.TradeNo)
	require.Error(t, err)
}

func TestCatFKQuoteShowsTheIncludedFeeOnlyWhenItAddsUp(t *testing.T) {
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
			s, a, _, _ := catFKFixture(t)
			a.offer.Amount, a.offer.OriginalAmount, a.offer.Fee = "10.18", tc.original, tc.fee
			q, err := s.quote(context.Background(), 7, "tier", "pay")
			require.NoError(t, err)
			assert.Equal(t, 10.18, q.Amount)
			assert.Equal(t, tc.wantFee, q.Fee)
			assert.Equal(t, tc.wantRate, q.FeeRate)
		})
	}
}

func TestCatFKDocumentedReceiptCanSettleOnlyTheBoundPurchase(t *testing.T) {
	s, a, store, _ := catFKFixture(t)
	req := catFKRequest(t, s)
	a.createFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKCreatedOrder, error) {
		e := catFKTestEvidence(o)
		e.ChannelID, e.Currency = "", ""
		e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
		return &CatFKCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://payments.example/pay", Evidence: e}, nil
	}
	payment, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	assert.Equal(t, model.CatFKOrderStatusPending, payment.Status)
	assert.Empty(t, payment.PaymentQRCode, "WeChat payment requires a cashier-verified native QR code")
	assert.Zero(t, store.completed)
	a.queryFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKOrderEvidence, error) {
		e := catFKTestEvidence(o)
		e.ChannelID, e.Currency = "", ""
		return &e, nil
	}
	require.NoError(t, s.poll(context.Background()))
	assert.Equal(t, model.CatFKOrderStatusCompleted, store.order.Status)
	assert.Equal(t, 7, store.order.UserID)
	assert.Equal(t, 1, store.completed)
}

func TestCatFKSettlementRequiresCompleteEvidence(t *testing.T) {
	cases := []struct {
		name   string
		change func(*CatFKOrderEvidence)
	}{
		{"upstream", func(e *CatFKOrderEvidence) { e.UpstreamOrderID = "other" }},
		{"shop", func(e *CatFKOrderEvidence) { e.ShopID = "other" }},
		{"product", func(e *CatFKOrderEvidence) { e.ProductID = "other" }},
		{"channel", func(e *CatFKOrderEvidence) { e.ChannelID = "other" }},
		{"quantity", func(e *CatFKOrderEvidence) { e.Quantity = 2 }},
		{"amount", func(e *CatFKOrderEvidence) { e.Amount = "17.99" }},
		{"currency", func(e *CatFKOrderEvidence) { e.Currency = "USD" }},
		{"unpaid", func(e *CatFKOrderEvidence) { e.Paid = false }},
		{"undelivered", func(e *CatFKOrderEvidence) { e.Delivered = false }},
		{"missing-code", func(e *CatFKOrderEvidence) { e.RedemptionKey = "" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, _, store, _ := catFKFixture(t)
			req := catFKRequest(t, s)
			_, err := s.create(context.Background(), 7, req)
			require.NoError(t, err)
			order := cloneCatFK(store.order)
			e := catFKTestEvidence(order)
			tc.change(&e)
			require.NoError(t, s.applyEvidence(order, &e))
			assert.Zero(t, store.completed)
		})
	}
	t.Run("stale CAS cannot settle", func(t *testing.T) {
		s, _, store, _ := catFKFixture(t)
		req := catFKRequest(t, s)
		_, err := s.create(context.Background(), 7, req)
		require.NoError(t, err)
		store.loseUpdate = true
		e := catFKTestEvidence(store.order)
		require.NoError(t, s.applyEvidence(cloneCatFK(store.order), &e))
		assert.Zero(t, store.completed)
	})
}

func TestCatFKPollRecoversSubmittingWithoutCreate(t *testing.T) {
	s, a, store, _ := catFKFixture(t)
	req := catFKRequest(t, s)
	_, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	store.order.Status = model.CatFKOrderStatusSubmitting
	store.order.LeaseUntil = 0
	a.queryFn = func(_ *model.CatFKOrder, _ CatFKCredentials) (*CatFKOrderEvidence, error) {
		return nil, errors.New("temporary upstream failure")
	}
	require.NoError(t, s.poll(context.Background()))
	assert.Equal(t, model.CatFKOrderStatusCreationUnknown, store.order.Status)
	assert.Greater(t, store.order.NextQueryAt, s.now().Unix())
	assert.EqualValues(t, 1, a.creates.Load())
	assert.Zero(t, store.completed)
}

func TestCatFKLatePaymentRecoveryDoesNotWaitForOldOrderVersion(t *testing.T) {
	for _, status := range []string{model.CatFKOrderStatusPending, model.CatFKOrderStatusPaid} {
		t.Run(status, func(t *testing.T) {
			s, a, store, _ := catFKFixture(t)
			_, err := s.create(context.Background(), 7, catFKRequest(t, s))
			require.NoError(t, err)
			store.order.Status = status
			store.order.Version = 100
			started := s.now()
			a.queryFn = func(*model.CatFKOrder, CatFKCredentials) (*CatFKOrderEvidence, error) {
				return nil, errors.New("temporary query failure after waiting for payment")
			}
			require.NoError(t, s.poll(context.Background()))
			assert.LessOrEqual(t, store.order.NextQueryAt-started.Unix(), int64(60), "one transient failure must not postpone a late payment for fifteen minutes")
			assert.Zero(t, store.completed)
			s.now = func() time.Time { return started.Add(time.Minute) }
			a.queryFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKOrderEvidence, error) {
				e := catFKTestEvidence(o)
				return &e, nil
			}
			require.NoError(t, s.poll(context.Background()))
			assert.Equal(t, model.CatFKOrderStatusCompleted, store.order.Status)
			assert.Equal(t, 1, store.completed)
			assert.EqualValues(t, 1, a.creates.Load())
		})
	}
}

func TestCatFKPendingPaymentAndDeliveryRecheckPromptly(t *testing.T) {
	for _, paid := range []bool{false, true} {
		t.Run(fmt.Sprintf("paid=%t", paid), func(t *testing.T) {
			s, a, store, _ := catFKFixture(t)
			_, err := s.create(context.Background(), 7, catFKRequest(t, s))
			require.NoError(t, err)
			a.queryFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKOrderEvidence, error) {
				e := catFKTestEvidence(o)
				e.Paid, e.Delivered = paid, false
				return &e, nil
			}
			require.NoError(t, s.poll(context.Background()))
			assert.Equal(t, s.now().Add(15*time.Second).Unix(), store.order.NextQueryAt)
			assert.Zero(t, store.completed)
		})
	}
}

func TestCatFKQueryVerificationFailureRequiresAttention(t *testing.T) {
	s, a, store, _ := catFKFixture(t)
	req := catFKRequest(t, s)
	_, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	a.queryFn = func(_ *model.CatFKOrder, _ CatFKCredentials) (*CatFKOrderEvidence, error) {
		return nil, ErrCatFKVerification
	}
	require.NoError(t, s.poll(context.Background()))
	assert.Equal(t, model.CatFKOrderStatusNeedsAttention, store.order.Status)
	assert.Equal(t, "verification_mismatch", store.order.FailureCode)
	assert.Zero(t, store.completed)
}

func TestCatFKPaidOrderWaitsForDeliveryAndRetriesTransientSettlement(t *testing.T) {
	s, _, store, _ := catFKFixture(t)
	req := catFKRequest(t, s)
	_, err := s.create(context.Background(), 7, req)
	require.NoError(t, err)
	evidence := catFKTestEvidence(store.order)
	evidence.Delivered = false
	evidence.Expired = true
	require.NoError(t, s.applyEvidence(cloneCatFK(store.order), &evidence))
	assert.Equal(t, model.CatFKOrderStatusPaid, store.order.Status)
	assert.Zero(t, store.completed)
	require.NoError(t, s.applyEvidence(cloneCatFK(store.order), &evidence))
	assert.Equal(t, model.CatFKOrderStatusPaid, store.order.Status)
	evidence.Delivered = true
	store.completeErr = model.ErrRedemptionDatabase
	require.NoError(t, s.applyEvidence(cloneCatFK(store.order), &evidence))
	assert.Equal(t, model.CatFKOrderStatusPaid, store.order.Status)
	assert.Greater(t, store.order.NextQueryAt, s.now().Unix())
	assert.Zero(t, store.completed)
	store.completeErr = model.ErrRedemptionQuotaMismatch
	require.NoError(t, s.applyEvidence(cloneCatFK(store.order), &evidence))
	assert.Equal(t, model.CatFKOrderStatusNeedsAttention, store.order.Status)
	assert.Zero(t, store.completed)
}

func TestCatFKRejectsEmbeddedOrMultipleCodes(t *testing.T) {
	for _, code := range []string{"prefix 0123456789abcdef0123456789abcdef", "0123456789abcdef0123456789abcdef\n0123456789abcdef0123456789abcdef", "0123456789abcdef0123456789abcdeg"} {
		s, _, store, _ := catFKFixture(t)
		req := catFKRequest(t, s)
		_, err := s.create(context.Background(), 7, req)
		require.NoError(t, err)
		evidence := catFKTestEvidence(store.order)
		evidence.RedemptionKey = code
		require.NoError(t, s.applyEvidence(cloneCatFK(store.order), &evidence))
		assert.Equal(t, "delivery_invalid", store.order.FailureCode)
		assert.Zero(t, store.completed)
	}
}

func TestCatFKDirectModeCustomAmountSlotQuarantineAndModeIsolation(t *testing.T) {
	previousPrice := operation_setting.Price
	previousMinTopUp := operation_setting.MinTopUp
	t.Cleanup(func() {
		operation_setting.Price = previousPrice
		operation_setting.MinTopUp = previousMinTopUp
	})
	operation_setting.Price = 7.2
	operation_setting.MinTopUp = 2

	t.Run("redemption mode rejects custom amount", func(t *testing.T) {
		s, _, _, _ := catFKFixture(t)
		amount := int64(10)
		_, err := s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &amount, ChannelID: "pay"})
		require.ErrorIs(t, err, ErrCatFKInvalidRequest)
	})

	t.Run("direct mode quotes without mutating slot, ignores client QQ, settles without redemption code, and survives mode switch", func(t *testing.T) {
		s, a, store, cfg := catFKFixture(t)
		cfg.Mode = operation_setting.CatFKModeDirect
		cfg.StoreToken = "YMengCC"
		cfg.MerchantToken = "secret-merchant-token"
		cfg.DirectGoodsKeys = []string{"slot-1", "slot-2"}

		amount := int64(10)
		belowMin := int64(1)
		_, err := s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &belowMin, ChannelID: "pay"})
		require.ErrorIs(t, err, ErrCatFKInvalidRequest)

		q, err := s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &amount, ChannelID: "pay"})
		require.NoError(t, err)
		assert.Equal(t, 72.0, q.Amount)
		assert.Equal(t, 10.0, q.TopUpAmount)
		assert.Zero(t, a.prepares.Load(), "quote must not touch or lock upstream slots")

		a.createFn = func(o *model.CatFKOrder, c CatFKCredentials) (*CatFKCreatedOrder, error) {
			e := catFKTestEvidence(o)
			e.UpstreamOrderID = "upstream-direct-1"
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &CatFKCreatedOrder{
				UpstreamOrderID: "upstream-direct-1",
				PaymentURL:      "https://catfk.com/pay/upstream-direct-1",
				PaymentQRCode:   "weixin://wxpay/bizpayurl?pr=directToken",
				Credentials:     &c,
				Evidence:        e,
			}, nil
		}
		// Client-supplied QQ is ignored in direct mode; contact is bound to TradeNo.
		payment, err := s.create(context.Background(), 7, CatFKPaymentRequest{
			Amount:         &amount,
			ChannelID:      "pay",
			QuoteID:        q.QuoteID,
			QQ:             "override-attempt",
			IdempotencyKey: "direct-idempotency-key-1",
		})
		require.NoError(t, err)
		assert.Equal(t, model.CatFKOrderStatusPending, payment.Status)
		assert.Equal(t, operation_setting.CatFKModeDirect, payment.Mode)
		assert.Equal(t, "weixin://wxpay/bizpayurl?pr=directToken", payment.PaymentQRCode)
		assert.Equal(t, payment.TradeNo, a.lastContact)
		assert.Equal(t, model.CatFKSlotStatusIdle, store.slots["slot-1"].Status)
		assert.Equal(t, "72.00", store.slots["slot-1"].ConfirmedPrice)

		// Switching global config back to redemption does not alter the in-flight direct order.
		cfg.Mode = operation_setting.CatFKModeRedemption
		a.queryFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKOrderEvidence, error) {
			return &CatFKOrderEvidence{
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
		assert.Equal(t, model.CatFKOrderStatusCompleted, store.order.Status)
		assert.Equal(t, 1, store.completed)
		assert.Empty(t, store.completeKey, "direct mode must ignore placeholder card text")
		assert.Equal(t, "wx-tx-direct-1", store.completeTxID)
	})

	t.Run("direct mode rejects contact mismatch, missing transaction ID, busy slots, and quarantines ambiguous slots", func(t *testing.T) {
		s, a, store, cfg := catFKFixture(t)
		cfg.Mode = operation_setting.CatFKModeDirect
		cfg.StoreToken = "YMengCC"
		cfg.MerchantToken = "secret-merchant-token"
		cfg.DirectGoodsKeys = []string{"slot-only"}

		amount := int64(5)
		q, err := s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &amount, ChannelID: "pay"})
		require.NoError(t, err)

		// Exhausted slots return ErrCatFKSlotBusy without creating an order.
		store.slotBusy = true
		_, err = s.create(context.Background(), 7, CatFKPaymentRequest{
			Amount: &amount, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "direct-busy-key-1234",
		})
		require.ErrorIs(t, err, ErrCatFKSlotBusy)
		assert.Nil(t, store.order)
		store.slotBusy = false

		// Ambiguous upstream order creation quarantines the slot so it cannot be reused blindly.
		a.createFn = func(_ *model.CatFKOrder, c CatFKCredentials) (*CatFKCreatedOrder, error) {
			return &CatFKCreatedOrder{Credentials: &c}, context.DeadlineExceeded
		}
		p, err := s.create(context.Background(), 7, CatFKPaymentRequest{
			Amount: &amount, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "direct-ambiguous-key",
		})
		require.NoError(t, err)
		assert.Equal(t, model.CatFKOrderStatusCreationUnknown, p.Status)
		assert.Equal(t, model.CatFKSlotStatusQuarantined, store.slots["slot-only"].Status)

		// Contact mismatch marks NeedsAttention without crediting.
		wrongContact := CatFKOrderEvidence{
			UpstreamOrderID: "up-2", TransactionID: "wx-tx-2", Contact: "wrong-contact",
			ShopID: store.order.ShopID, ProductID: store.order.ProductID, Quantity: 1, Amount: store.order.PriceAmount,
			Paid: true, Delivered: true,
		}
		require.NoError(t, s.applyEvidence(cloneCatFK(store.order), &wrongContact))
		assert.Equal(t, model.CatFKOrderStatusNeedsAttention, store.order.Status)
		assert.Zero(t, store.completed)
	})

	t.Run("probe-only unpaid response reschedules pending orders without settling", func(t *testing.T) {
		s, a, store, _ := catFKFixture(t)
		req := catFKRequest(t, s)
		a.createFn = func(o *model.CatFKOrder, c CatFKCredentials) (*CatFKCreatedOrder, error) {
			e := catFKTestEvidence(o)
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &CatFKCreatedOrder{UpstreamOrderID: "upstream", PaymentURL: "https://payments.example/pay", Credentials: &c, Evidence: e}, nil
		}
		_, err := s.create(context.Background(), 7, req)
		require.NoError(t, err)
		a.queryFn = func(*model.CatFKOrder, CatFKCredentials) (*CatFKOrderEvidence, error) {
			return &CatFKOrderEvidence{ProbeOnlyUnpaid: true}, nil
		}
		require.NoError(t, s.poll(context.Background()))
		assert.Equal(t, model.CatFKOrderStatusPending, store.order.Status)
		assert.Equal(t, s.now().Add(15*time.Second).Unix(), store.order.NextQueryAt)
		assert.Zero(t, store.completed)
	})

	t.Run("auto mode seamlessly falls back to redemption on token expiry and resumes direct on token update", func(t *testing.T) {
		s, a, store, cfg := catFKFixture(t)
		cfg.Mode = operation_setting.CatFKModeAuto
		cfg.StoreToken = "YMengCC"
		cfg.MerchantToken = "token-v1"
		cfg.Products = []operation_setting.CatFKProduct{{ID: "ten", Name: "Ten", GoodsKey: "goods", Amount: 10}}
		cfg.DirectGoodsKeys = []string{"slot-auto-1"}

		// Healthy token resolves to direct mode and supports custom amounts.
		effMode, fallback := s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.CatFKModeDirect, effMode)
		assert.False(t, fallback)
		customAmt := int64(15)
		qCustom, err := s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &customAmt, ChannelID: "pay"})
		require.NoError(t, err)
		assert.Equal(t, operation_setting.CatFKModeDirect, qCustom.Mode)

		// Mid-request expiry on a preset amount ($10 matches cfg.Products[0]) falls back seamlessly in the same quote call.
		a.quoteDirectErr = errCatFKMerchantAuthExpired
		presetAmt := int64(10)
		qFallback, err := s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &presetAmt, ChannelID: "pay"})
		require.NoError(t, err)
		assert.Equal(t, operation_setting.CatFKModeRedemption, qFallback.Mode)
		assert.Equal(t, "ten", qFallback.ProductID)

		effMode, fallback = s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.CatFKModeRedemption, effMode)
		assert.True(t, fallback)

		// Unmapped custom amount while fallen back returns clean fallback guidance.
		_, err = s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &customAmt, ChannelID: "pay"})
		require.ErrorIs(t, err, ErrCatFKCustomAmountFallback)

		// Completing the fallen-back redemption quote works normally with QQ.
		a.createFn = func(o *model.CatFKOrder, c CatFKCredentials) (*CatFKCreatedOrder, error) {
			e := catFKTestEvidence(o)
			e.UpstreamOrderID = "upstream-auto-redemption"
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &CatFKCreatedOrder{UpstreamOrderID: "upstream-auto-redemption", PaymentURL: "https://payments.example/pay", Credentials: &c, Evidence: e}, nil
		}
		p, err := s.create(context.Background(), 7, CatFKPaymentRequest{
			ProductID: "ten", ChannelID: "pay", QuoteID: qFallback.QuoteID, QQ: "123456", IdempotencyKey: "auto-fallback-pay-1",
		})
		require.NoError(t, err)
		assert.Equal(t, operation_setting.CatFKModeRedemption, p.Mode)
		assert.Equal(t, "123456", store.order.ExpectedContact)

		// Updating merchant_token immediately restores direct mode; background probe keeps it updated.
		a.quoteDirectErr = nil
		cfg.MerchantToken = "token-v2"
		effMode, fallback = s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.CatFKModeDirect, effMode)
		assert.False(t, fallback)

		// Transient network error in background probe does not falsely trigger fallback.
		a.checkTokenFn = func(string) (bool, error) { return false, ErrCatFKOrderUnavailable }
		s.probeAutoMerchantTokenIfDue(context.Background())
		effMode, fallback = s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.CatFKModeDirect, effMode)
		assert.False(t, fallback)

		// Confirmed invalid token in background probe switches effectiveMode to redemption before customer visit.
		a.checkTokenFn = func(string) (bool, error) { return false, nil }
		s.probeAutoMerchantTokenIfDue(context.Background())
		effMode, fallback = s.effectiveMode(cfg)
		assert.Equal(t, operation_setting.CatFKModeRedemption, effMode)
		assert.True(t, fallback)
	})

	t.Run("direct mode retries out-of-stock order creation once after force restock and proactively checks stock after settlement", func(t *testing.T) {
		s, a, store, cfg := catFKFixture(t)
		cfg.Mode = operation_setting.CatFKModeDirect
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
		a.createFn = func(o *model.CatFKOrder, c CatFKCredentials) (*CatFKCreatedOrder, error) {
			if createAttempts.Add(1) == 1 {
				return &CatFKCreatedOrder{Credentials: &c}, errCatFKOutOfStock
			}
			e := catFKTestEvidence(o)
			e.UpstreamOrderID = "upstream-restocked-1"
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &CatFKCreatedOrder{
				UpstreamOrderID: "upstream-restocked-1",
				PaymentURL:      "https://catfk.com/pay/upstream-restocked-1",
				PaymentQRCode:   "weixin://wxpay/bizpayurl?pr=restockedQR",
				Credentials:     &c,
				Evidence:        e,
			}, nil
		}

		amount := int64(5)
		q, err := s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &amount, ChannelID: "pay"})
		require.NoError(t, err)

		payment, err := s.create(context.Background(), 7, CatFKPaymentRequest{
			Amount: &amount, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "restock-retry-idem-1",
		})
		require.NoError(t, err)
		assert.Equal(t, model.CatFKOrderStatusPending, payment.Status)
		assert.EqualValues(t, 2, createAttempts.Load())
		assert.EqualValues(t, 1, forcedCalls.Load())
		assert.Zero(t, gentleCalls.Load())
		assert.Equal(t, model.CatFKSlotStatusIdle, store.slots["slot-restock-1"].Status)

		a.queryFn = func(o *model.CatFKOrder, _ CatFKCredentials) (*CatFKOrderEvidence, error) {
			return &CatFKOrderEvidence{
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
		assert.Equal(t, model.CatFKOrderStatusCompleted, store.order.Status)
		assert.EqualValues(t, 1, gentleCalls.Load(), "completed direct order must proactively check slot stock")
	})

	t.Run("enforces configurable CNY max amount and sliding-window new order rate limit without blocking idempotent recovery", func(t *testing.T) {
		s, a, store, cfg := catFKFixture(t)
		cfg.Mode = operation_setting.CatFKModeDirect
		cfg.StoreToken = "YMengCC"
		cfg.MerchantToken = "secret-merchant-token"
		cfg.DirectGoodsKeys = []string{"slot-limit-1"}
		cfg.MaxAmountCNY = 100
		cfg.MaxOrdersPerMinute = 2

		nowUnix := int64(1700001000)
		s.now = func() time.Time { return time.Unix(nowUnix, 0) }

		// $20 * 7.2 = ¥144.00 > ¥100.00 max limit -> rejected with exact limit message.
		tooHigh := int64(20)
		_, err := QuoteCatFKRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &tooHigh, ChannelID: "pay"})
		_, err = s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &tooHigh, ChannelID: "pay"})
		require.Error(t, err)
		assert.Equal(t, "Catfk single payment cannot exceed ¥100.00", catFKPublicError(err).Error())

		// $10 * 7.2 = ¥72.00 <= ¥100.00 succeeds; if buyer fee pushes total > ¥100.00, also rejected.
		okAmt := int64(10)
		a.directOffer = CatFKOffer{
			ShopID: "YMengCC", ShopName: "Direct Shop", ShopURL: "https://catfk.com/shop/YMengCC",
			ProductID: "slot-limit-1", ChannelID: "pay", Amount: "101.50", OriginalAmount: "72.00", Fee: "29.50",
			Currency: "CNY", Quantity: 1, InStock: true,
		}
		_, err = s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &okAmt, ChannelID: "pay"})
		require.Error(t, err)
		assert.Equal(t, "Catfk single payment cannot exceed ¥100.00", catFKPublicError(err).Error())
		a.directOffer = CatFKOffer{}

		q, err := s.quoteRequest(context.Background(), 7, CatFKQuoteRequest{Amount: &okAmt, ChannelID: "pay"})
		require.NoError(t, err)
		a.createFn = func(o *model.CatFKOrder, c CatFKCredentials) (*CatFKCreatedOrder, error) {
			e := catFKTestEvidence(o)
			e.UpstreamOrderID = "up-" + o.IdempotencyKey
			e.Paid, e.Delivered, e.RedemptionKey = false, false, ""
			return &CatFKCreatedOrder{UpstreamOrderID: e.UpstreamOrderID, PaymentURL: "https://catfk.com/pay/1", PaymentQRCode: "weixin://wxpay/bizpayurl?pr=ok", Credentials: &c, Evidence: e}, nil
		}

		// Order 1 allowed.
		_, err = s.createWithIP(context.Background(), 7, CatFKPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0001",
		}, "203.0.113.9")
		require.NoError(t, err)

		// Clear test store's single-order slot to simulate second distinct order; Order 2 allowed.
		firstOrder := store.order
		store.order = nil
		_, err = s.createWithIP(context.Background(), 7, CatFKPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0002",
		}, "203.0.113.9")
		require.NoError(t, err)

		// Order 3 within 60s window rejected by user & IP limit.
		store.order = nil
		_, err = s.createWithIP(context.Background(), 7, CatFKPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0003",
		}, "203.0.113.9")
		require.ErrorIs(t, err, ErrCatFKRateLimited)

		// Different user from the same IP is also blocked by per-IP limit.
		qOtherUser, err := s.quoteRequest(context.Background(), 8, CatFKQuoteRequest{Amount: &okAmt, ChannelID: "pay"})
		require.NoError(t, err)
		_, err = s.createWithIP(context.Background(), 8, CatFKPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: qOtherUser.QuoteID, IdempotencyKey: "rate-limit-order-0004",
		}, "203.0.113.9")
		require.ErrorIs(t, err, ErrCatFKRateLimited)

		// Idempotent retry of an existing order is NEVER blocked even while rate-limited.
		store.order = firstOrder
		recovered, err := s.createWithIP(context.Background(), 7, CatFKPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0001",
		}, "203.0.113.9")
		require.NoError(t, err)
		assert.Equal(t, firstOrder.TradeNo, recovered.TradeNo)

		// Advancing past 60s sliding window allows new orders again.
		store.order = nil
		nowUnix += 61
		_, err = s.createWithIP(context.Background(), 7, CatFKPaymentRequest{
			Amount: &okAmt, ChannelID: "pay", QuoteID: q.QuoteID, IdempotencyKey: "rate-limit-order-0005",
		}, "203.0.113.9")
		require.NoError(t, err)
	})
}
