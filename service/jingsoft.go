package service

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
)

var (
	ErrJingSoftProtocolUnverified   error = common.NewMessage("JingSoft protocol is not verified")
	ErrJingSoftDisabled             error = common.NewMessage("JingSoft payments are disabled")
	ErrJingSoftEncryptionKey        error = common.NewMessage("JingSoft order encryption key is not configured")
	ErrJingSoftInvalidBaseURL       error = common.NewMessage("Invalid JingSoft platform URL")
	ErrJingSoftInvalidRequest       error = common.NewMessage("Invalid JingSoft payment request")
	ErrJingSoftInvalidQuote         error = common.NewMessage("JingSoft quote is invalid or expired")
	ErrJingSoftOrderUnavailable     error = common.NewMessage("JingSoft order is unavailable")
	ErrJingSoftSlotBusy             error = common.NewMessage("JingSoft payment channel is busy, please try again shortly")
	ErrJingSoftRateLimited          error = common.NewMessage("Too many JingSoft payment requests, please try again shortly")
	ErrJingSoftCustomAmountFallback error = common.NewMessage("Custom amounts are temporarily unavailable, please select a preset amount")
	ErrJingSoftVerification         error = common.NewMessage("JingSoft payment requires attention")
	ErrJingSoftRedemptionPending    error = common.NewMessage("Redemption code is not available yet")

	errJingSoftSlotAmbiguous       = errors.New("jingsoft slot remote state is ambiguous")
	errJingSoftMerchantAuthExpired = errors.New("jingsoft merchant token is invalid or expired")
	errJingSoftOutOfStock          = errors.New("jingsoft goods out of stock")
)

const jingSoftMaxAmountMessageKey = "JingSoft single payment cannot exceed ¥{{amount}}"

func jingSoftMaxAmountError(limit decimal.Decimal) error {
	return common.NewMessage(jingSoftMaxAmountMessageKey, map[string]any{"amount": limit.StringFixed(2)})
}

type JingSoftQuoteRequest struct {
	ProductID string `json:"product_id"`
	Amount    *int64 `json:"amount,omitempty"`
	ChannelID string `json:"channel_id"`
}

type JingSoftQuote struct {
	QuoteID     string  `json:"quote_id"`
	Amount      float64 `json:"amount"`
	Currency    string  `json:"currency"`
	TopUpAmount float64 `json:"topup_amount"`
	Mode        string  `json:"mode,omitempty"`
	ProductID   string  `json:"product_id,omitempty"`
	// Fee is included in Amount; FeeRate is its percentage of the goods price.
	Fee     *float64 `json:"fee,omitempty"`
	FeeRate *float64 `json:"fee_rate,omitempty"`
}

type JingSoftPaymentRequest struct {
	ProductID      string `json:"product_id"`
	Amount         *int64 `json:"amount,omitempty"`
	ChannelID      string `json:"channel_id"`
	QuoteID        string `json:"quote_id"`
	QQ             string `json:"qq"`
	IdempotencyKey string `json:"idempotency_key"`
}

type JingSoftPayment struct {
	TradeNo       string `json:"trade_no"`
	Status        string `json:"status"`
	PaymentQRCode string `json:"payment_qr_code,omitempty"`
	PaymentMethod string `json:"payment_method,omitempty"`
	Mode          string `json:"mode,omitempty"`
	FailureCode   string `json:"failure_code,omitempty"`
}

type JingSoftRedemption struct {
	Key          string `json:"key"`
	Quota        int    `json:"quota"`
	RedeemedTime int64  `json:"redeemed_time"`
}

type JingSoftPublicProduct struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
}

type JingSoftInfo struct {
	Enabled           bool                                `json:"enabled"`
	Available         bool                                `json:"available"`
	Mode              string                              `json:"mode"`
	ConfiguredMode    string                              `json:"configured_mode,omitempty"`
	AvailableModes    []string                            `json:"available_modes,omitempty"`
	FallbackActive    bool                                `json:"fallback_active,omitempty"`
	MaxAmountCNY      float64                             `json:"max_amount_cny,omitempty"`
	UnavailableReason string                              `json:"unavailable_reason"`
	Products          []JingSoftPublicProduct             `json:"products"`
	Channels          []operation_setting.JingSoftChannel `json:"channels"`
}

type JingSoftMerchantTokenStatus struct {
	Configured     bool     `json:"configured"`
	Valid          bool     `json:"valid"`
	ConfiguredMode string   `json:"configured_mode"`
	EffectiveMode  string   `json:"effective_mode"`
	AvailableModes []string `json:"available_modes,omitempty"`
	FallbackActive bool     `json:"fallback_active"`
}

type JingSoftCompatibilityResult struct {
	Compatible            bool   `json:"compatible"`
	BaseURL               string `json:"base_url"`
	ProtocolVerified      bool   `json:"protocol_verified"`
	StoreVerified         bool   `json:"store_verified"`
	ShopName              string `json:"shop_name,omitempty"`
	ChannelCount          int    `json:"channel_count"`
	SupportedChannelCount int    `json:"supported_channel_count"`
	ProductCount          int    `json:"product_count"`
	MerchantTokenChecked  bool   `json:"merchant_token_checked"`
	MerchantTokenValid    bool   `json:"merchant_token_valid"`
	MessageKey            string `json:"message_key,omitempty"`
}

type JingSoftDiscoveredProduct struct {
	GoodsKey      string `json:"goods_key"`
	Name          string `json:"name"`
	PriceCNY      string `json:"price_cny"`
	StockCount    int    `json:"stock_count"`
	InStock       bool   `json:"in_stock"`
	ContactFormat string `json:"contact_format,omitempty"`
	LimitCount    int    `json:"limit_count,omitempty"`
	Compatible    bool   `json:"compatible"`
}

type JingSoftDynamicSlotReady struct {
	Offer          JingSoftOffer
	ConfirmedPrice string
}

// JingSoftAdapter is a normalized, verified protocol boundary. These structures
// describe service invariants, not an assumed upstream wire schema.
type JingSoftAdapter interface {
	Ready() bool
	CheckCompatibility(ctx context.Context, baseURL, storeToken, merchantToken string) (*JingSoftCompatibilityResult, error)
	DiscoverProducts(ctx context.Context, baseURL, storeToken string) ([]JingSoftDiscoveredProduct, error)
	DiscoverDirectSlots(ctx context.Context, baseURL, merchantToken string) ([]JingSoftDiscoveredProduct, error)
	Quote(ctx context.Context, baseURL, storeToken, goodsKey, channelID string) (*JingSoftOffer, error)
	QuoteDirect(ctx context.Context, baseURL, storeToken, merchantToken, slotGoodsKey, channelID, baseAmount string) (*JingSoftOffer, error)
	PrepareDirectSlot(ctx context.Context, baseURL, storeToken, merchantToken, slotGoodsKey, channelID, baseAmount, knownConfirmedPrice string, minStock, restockBatch int) (*JingSoftDynamicSlotReady, error)
	ReplenishDirectSlot(ctx context.Context, baseURL, storeToken, merchantToken, slotGoodsKey string, minStock, restockBatch int, force bool) (int, error)
	CheckMerchantToken(ctx context.Context, baseURL, merchantToken string) (bool, error)
	Create(ctx context.Context, baseURL string, order *model.JingSoftOrder, credentials JingSoftCredentials, contact string) (*JingSoftCreatedOrder, error)
	Query(ctx context.Context, baseURL string, order *model.JingSoftOrder, credentials JingSoftCredentials) (*JingSoftOrderEvidence, error)
	Channels(ctx context.Context, baseURL, storeToken string) ([]operation_setting.JingSoftChannel, error)
}

type JingSoftOffer struct {
	ShopID    string
	ShopName  string
	ShopURL   string
	ProductID string
	ChannelID string
	Amount    string
	Currency  string
	Quantity  int
	InStock   bool
	// OriginalAmount and Fee break Amount down for display; empty if unknown.
	OriginalAmount string
	Fee            string
}

type JingSoftCredentials struct {
	Visitor  string
	Cookie   string
	Password string
}

type JingSoftCreatedOrder struct {
	Evidence        JingSoftOrderEvidence
	UpstreamOrderID string
	PaymentURL      string
	// PaymentQRCode is read silently from the payment page; empty if unknown.
	PaymentQRCode string
	// Optional refreshed recovery credentials, encrypted before persistence.
	Credentials *JingSoftCredentials
}

type JingSoftOrderEvidence struct {
	UpstreamOrderID string
	TransactionID   string
	Contact         string
	ShopID          string
	ProductID       string
	ChannelID       string
	Quantity        int
	Amount          string
	Currency        string
	Paid            bool
	Delivered       bool
	Expired         bool
	ProbeOnlyUnpaid bool
	RedemptionKey   string
	PaymentQRCode   string
}

type jingSoftUnverifiedAdapter struct{}

func (jingSoftUnverifiedAdapter) Ready() bool { return false }
func (jingSoftUnverifiedAdapter) CheckCompatibility(context.Context, string, string, string) (*JingSoftCompatibilityResult, error) {
	return nil, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) DiscoverProducts(context.Context, string, string) ([]JingSoftDiscoveredProduct, error) {
	return nil, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) DiscoverDirectSlots(context.Context, string, string) ([]JingSoftDiscoveredProduct, error) {
	return nil, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) Quote(context.Context, string, string, string, string) (*JingSoftOffer, error) {
	return nil, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) QuoteDirect(context.Context, string, string, string, string, string, string) (*JingSoftOffer, error) {
	return nil, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) PrepareDirectSlot(context.Context, string, string, string, string, string, string, string, int, int) (*JingSoftDynamicSlotReady, error) {
	return nil, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) ReplenishDirectSlot(context.Context, string, string, string, string, int, int, bool) (int, error) {
	return 0, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) CheckMerchantToken(context.Context, string, string) (bool, error) {
	return false, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) Create(context.Context, string, *model.JingSoftOrder, JingSoftCredentials, string) (*JingSoftCreatedOrder, error) {
	return nil, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) Query(context.Context, string, *model.JingSoftOrder, JingSoftCredentials) (*JingSoftOrderEvidence, error) {
	return nil, ErrJingSoftProtocolUnverified
}
func (jingSoftUnverifiedAdapter) Channels(context.Context, string, string) ([]operation_setting.JingSoftChannel, error) {
	return nil, ErrJingSoftProtocolUnverified
}

// Store operations own transactions and CAS/lease fencing. No SQL belongs here.
type jingSoftStore interface {
	Create(*model.JingSoftOrder) (*model.JingSoftOrder, bool, error)
	Get(int, string) (*model.JingSoftOrder, error)
	Find(int, string) (*model.JingSoftOrder, error)
	Due(int64, int) ([]*model.JingSoftOrder, error)
	Claim(int, int64, int64) (*model.JingSoftOrder, bool, error)
	Update(int, int64, model.JingSoftOrderUpdate) (bool, error)
	Retry(int, int64, int64) (bool, error)
	Complete(int, int64, string, string, string) (bool, error)
	Capacity(int, int) error
	AcquireSlot(shopID string, goodsKeys []string, targetPrice, orderTradeNo string, now, leaseSeconds int64) (*model.JingSoftPriceSlot, bool, error)
	ReleaseSlot(id int, version int64, holderToken, confirmedPrice string, now int64) (bool, error)
	QuarantineSlot(id int, version int64, holderToken, code string, now int64) (bool, error)
}

type jingSoftModelStore struct{}

func (jingSoftModelStore) Create(o *model.JingSoftOrder) (*model.JingSoftOrder, bool, error) {
	return model.CreateJingSoftOrder(o)
}
func (jingSoftModelStore) Get(u int, t string) (*model.JingSoftOrder, error) {
	return model.GetJingSoftOrderForUser(u, t)
}
func (jingSoftModelStore) Find(u int, key string) (*model.JingSoftOrder, error) {
	return model.FindJingSoftOrderForRequest(u, key)
}
func (jingSoftModelStore) Due(n int64, l int) ([]*model.JingSoftOrder, error) {
	return model.ListDueJingSoftOrders(n, l)
}
func (jingSoftModelStore) Claim(id int, n, s int64) (*model.JingSoftOrder, bool, error) {
	return model.ClaimJingSoftOrder(id, n, s)
}
func (jingSoftModelStore) Update(id int, v int64, u model.JingSoftOrderUpdate) (bool, error) {
	return model.UpdateJingSoftOrder(id, v, u)
}
func (jingSoftModelStore) Retry(id int, v, n int64) (bool, error) {
	return model.RetryJingSoftOrder(id, v, n)
}
func (jingSoftModelStore) Complete(id int, v int64, k, txID, ip string) (bool, error) {
	return model.CompleteVerifiedJingSoftOrder(id, v, k, txID, ip)
}
func (jingSoftModelStore) Capacity(u, q int) error { return model.ValidateTopUpQuotaCapacity(u, q) }
func (jingSoftModelStore) AcquireSlot(shopID string, goodsKeys []string, targetPrice, orderTradeNo string, now, leaseSeconds int64) (*model.JingSoftPriceSlot, bool, error) {
	return model.AcquireJingSoftPriceSlot(shopID, goodsKeys, targetPrice, orderTradeNo, now, leaseSeconds)
}
func (jingSoftModelStore) ReleaseSlot(id int, version int64, holderToken, confirmedPrice string, now int64) (bool, error) {
	return model.ReleaseJingSoftPriceSlot(id, version, holderToken, confirmedPrice, now)
}
func (jingSoftModelStore) QuarantineSlot(id int, version int64, holderToken, code string, now int64) (bool, error) {
	return model.QuarantineJingSoftPriceSlot(id, version, holderToken, code, now)
}

type jingSoftMerchantHealthTracker struct {
	mu        sync.Mutex
	tokenHash string
	checked   bool
	valid     bool
	checkedAt int64
}

func jingSoftMerchantTokenHash(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	return fmt.Sprintf("%x", sha256.Sum256([]byte(trimmed)))
}

func jingSoftMerchantScopeHash(baseURL, rawToken string) string {
	trimmed := strings.TrimSpace(rawToken)
	if trimmed == "" {
		return ""
	}
	return fmt.Sprintf("%x", sha256.Sum256([]byte(strings.TrimSpace(baseURL)+"|"+trimmed)))
}

func (h *jingSoftMerchantHealthTracker) isInvalid(baseURL, rawToken string) bool {
	hash := jingSoftMerchantScopeHash(baseURL, rawToken)
	if hash == "" {
		return true
	}
	if h == nil {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.tokenHash != hash {
		return false
	}
	return h.checked && !h.valid
}

func (h *jingSoftMerchantHealthTracker) shouldProbe(baseURL, rawToken string, now int64) bool {
	hash := jingSoftMerchantScopeHash(baseURL, rawToken)
	if hash == "" || h == nil {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.tokenHash != hash || !h.checked {
		return true
	}
	return now-h.checkedAt >= 60
}

func (h *jingSoftMerchantHealthTracker) record(baseURL, rawToken string, valid bool, now int64) {
	if h == nil {
		return
	}
	hash := jingSoftMerchantScopeHash(baseURL, rawToken)
	h.mu.Lock()
	defer h.mu.Unlock()
	h.tokenHash = hash
	h.checked = hash != ""
	h.valid = valid && hash != ""
	h.checkedAt = now
}

func (h *jingSoftMerchantHealthTracker) reset() {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.tokenHash = ""
	h.checked = false
	h.valid = false
	h.checkedAt = 0
}

type jingSoftOrderRateLimiter struct {
	mu      sync.Mutex
	buckets map[string][]int64
}

func (l *jingSoftOrderRateLimiter) allow(nowUnix int64, limit int, keys ...string) bool {
	if l == nil || limit <= 0 {
		return true
	}
	cutoff := nowUnix - 60
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.buckets == nil {
		l.buckets = make(map[string][]int64)
	}
	activeKeys := make([]string, 0, len(keys))
	seen := make(map[string]bool, len(keys))
	for _, raw := range keys {
		k := strings.TrimSpace(raw)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		activeKeys = append(activeKeys, k)
	}
	for _, k := range activeKeys {
		existing := l.buckets[k]
		kept := existing[:0]
		for _, ts := range existing {
			if ts > cutoff {
				kept = append(kept, ts)
			}
		}
		l.buckets[k] = kept
		if len(kept) >= limit {
			return false
		}
	}
	for _, k := range activeKeys {
		l.buckets[k] = append(l.buckets[k], nowUnix)
	}
	if len(l.buckets) > 5000 {
		for k, list := range l.buckets {
			if len(list) == 0 || list[len(list)-1] <= cutoff {
				delete(l.buckets, k)
			}
		}
	}
	return true
}

var (
	defaultJingSoftMerchantHealth jingSoftMerchantHealthTracker
	defaultJingSoftOrderLimiter   jingSoftOrderRateLimiter
	defaultJingSoftHTTPAdapter    = newJingSoftHTTPAdapter()
)

func NotifyJingSoftMerchantTokenUpdated() {
	defaultJingSoftMerchantHealth.reset()
	defaultJingSoftHTTPAdapter.ResetCache()
}

type jingSoftService struct {
	adapter   JingSoftAdapter
	store     jingSoftStore
	setting   func() *operation_setting.JingSoftSetting
	now       func() time.Time
	key       func() ([]byte, error)
	userGroup func(int) (string, error)
	health    *jingSoftMerchantHealthTracker
	limiter   *jingSoftOrderRateLimiter
	async     func(func())
	lazyMu    sync.Mutex
}

func (s *jingSoftService) healthTracker() *jingSoftMerchantHealthTracker {
	s.lazyMu.Lock()
	defer s.lazyMu.Unlock()
	if s.health == nil {
		s.health = &jingSoftMerchantHealthTracker{}
	}
	return s.health
}

func (s *jingSoftService) rateLimiter() *jingSoftOrderRateLimiter {
	s.lazyMu.Lock()
	defer s.lazyMu.Unlock()
	if s.limiter == nil {
		s.limiter = &jingSoftOrderRateLimiter{}
	}
	return s.limiter
}

func (s *jingSoftService) runAsync(fn func()) {
	if fn == nil {
		return
	}
	if s != nil && s.async != nil {
		s.async(fn)
		return
	}
	fn()
}

func jingSoftProductionService() *jingSoftService {
	return &jingSoftService{
		adapter:   defaultJingSoftHTTPAdapter,
		store:     jingSoftModelStore{},
		setting:   operation_setting.GetJingSoftSetting,
		now:       time.Now,
		key:       jingSoftEncryptionKey,
		userGroup: func(uid int) (string, error) { return model.GetUserGroup(uid, true) },
		health:    &defaultJingSoftMerchantHealth,
		limiter:   &defaultJingSoftOrderLimiter,
		async: func(fn func()) {
			go func() {
				defer func() { _ = recover() }()
				fn()
			}()
		},
	}
}

func JingSoftProtocolReady() bool { return defaultJingSoftHTTPAdapter.Ready() }

func jingSoftModeFromOrder(order *model.JingSoftOrder) string {
	if order != nil && order.Mode == operation_setting.JingSoftModeDirect {
		return operation_setting.JingSoftModeDirect
	}
	return operation_setting.JingSoftModeRedemption
}

func jingSoftConfiguredMode(cfg *operation_setting.JingSoftSetting) string {
	if cfg == nil {
		return operation_setting.JingSoftModeAuto
	}
	switch cfg.Mode {
	case operation_setting.JingSoftModeAuto, operation_setting.JingSoftModeDirect, operation_setting.JingSoftModeRedemption:
		return cfg.Mode
	default:
		return operation_setting.JingSoftModeAuto
	}
}

func (s *jingSoftService) effectiveMode(cfg *operation_setting.JingSoftSetting) (string, bool) {
	configured := jingSoftConfiguredMode(cfg)
	switch configured {
	case operation_setting.JingSoftModeAuto:
		merchantToken := strings.TrimSpace(cfg.MerchantToken)
		hasDirect := merchantToken != "" && len(jingSoftValidDirectSlotKeys(cfg)) > 0
		if hasDirect && !s.healthTracker().isInvalid(cfg.BaseURL, merchantToken) {
			return operation_setting.JingSoftModeDirect, false
		}
		return operation_setting.JingSoftModeRedemption, true
	case operation_setting.JingSoftModeDirect:
		return operation_setting.JingSoftModeDirect, false
	default:
		return operation_setting.JingSoftModeRedemption, false
	}
}

func (s *jingSoftService) probeAutoMerchantTokenIfDue(ctx context.Context) {
	cfg := s.setting()
	if cfg == nil || !cfg.Enabled || jingSoftConfiguredMode(cfg) != operation_setting.JingSoftModeAuto {
		return
	}
	baseURL, baseErr := operation_setting.NormalizeJingSoftBaseURL(cfg.BaseURL)
	if baseErr != nil || baseURL == "" {
		return
	}
	merchantToken := strings.TrimSpace(cfg.MerchantToken)
	now := s.now().Unix()
	if !s.healthTracker().shouldProbe(baseURL, merchantToken, now) {
		return
	}
	valid, err := s.adapter.CheckMerchantToken(ctx, baseURL, merchantToken)
	if err != nil {
		// Transient network errors must not flap customer mode.
		return
	}
	s.healthTracker().record(baseURL, merchantToken, valid, now)
}

func resolveJingSoftBaseAndStoreInputs(candidateBaseURL, candidateStoreToken string, cfg *operation_setting.JingSoftSetting) (baseURL, storeToken string, err error) {
	rawBase := strings.TrimSpace(candidateBaseURL)
	if rawBase == "" && cfg != nil {
		rawBase = strings.TrimSpace(cfg.BaseURL)
	}
	rawStore := strings.TrimSpace(candidateStoreToken)
	if rawStore == "" && cfg != nil {
		rawStore = strings.TrimSpace(cfg.StoreToken)
	}
	// Allow extracting origin when a full /shop/... URL is pasted before saving BaseURL.
	if rawBase == "" && strings.HasPrefix(rawStore, "https://") {
		if parsed, parseErr := url.Parse(rawStore); parseErr == nil && parsed.Host != "" {
			rawBase = parsed.Scheme + "://" + parsed.Host
		}
	}
	baseURL, err = operation_setting.NormalizeJingSoftBaseURL(rawBase)
	if err != nil || baseURL == "" {
		return "", "", ErrJingSoftInvalidBaseURL
	}
	if rawStore != "" {
		storeToken, err = operation_setting.NormalizeJingSoftStoreTokenForBase(rawStore, baseURL)
		if err != nil {
			return "", "", ErrJingSoftInvalidRequest
		}
	}
	return baseURL, storeToken, nil
}

func CheckJingSoftMerchantTokenStatus(ctx context.Context, candidateBaseURL, candidateToken string) (*JingSoftMerchantTokenStatus, error) {
	if !JingSoftProtocolReady() {
		return nil, ErrJingSoftProtocolUnverified
	}
	svc := jingSoftProductionService()
	cfg := svc.setting()
	configuredMode := jingSoftConfiguredMode(cfg)
	token := strings.TrimSpace(candidateToken)
	persistResult := false
	if token == "" {
		token = strings.TrimSpace(cfg.MerchantToken)
		persistResult = true
	}
	if token == "" {
		effMode, fallback := svc.effectiveMode(cfg)
		return &JingSoftMerchantTokenStatus{
			Configured:     false,
			Valid:          false,
			ConfiguredMode: configuredMode,
			EffectiveMode:  effMode,
			AvailableModes: operation_setting.JingSoftModes(),
			FallbackActive: fallback,
		}, nil
	}
	rawBase := strings.TrimSpace(candidateBaseURL)
	if rawBase == "" {
		rawBase = strings.TrimSpace(cfg.BaseURL)
	} else if rawBase != strings.TrimSpace(cfg.BaseURL) {
		persistResult = false
	}
	baseURL, baseErr := operation_setting.NormalizeJingSoftBaseURL(rawBase)
	if baseErr != nil || baseURL == "" {
		return nil, ErrJingSoftInvalidBaseURL
	}
	valid, err := svc.adapter.CheckMerchantToken(ctx, baseURL, token)
	if err != nil {
		return nil, jingSoftPublicError(err)
	}
	if persistResult {
		svc.healthTracker().record(baseURL, token, valid, svc.now().Unix())
	}
	effMode, fallback := svc.effectiveMode(cfg)
	return &JingSoftMerchantTokenStatus{
		Configured:     true,
		Valid:          valid,
		ConfiguredMode: configuredMode,
		EffectiveMode:  effMode,
		AvailableModes: operation_setting.JingSoftModes(),
		FallbackActive: fallback,
	}, nil
}

func CheckJingSoftPlatformCompatibility(ctx context.Context, candidateBaseURL, candidateStoreToken, candidateMerchantToken string) (*JingSoftCompatibilityResult, error) {
	if !JingSoftProtocolReady() {
		return nil, ErrJingSoftProtocolUnverified
	}
	svc := jingSoftProductionService()
	cfg := svc.setting()
	baseURL, storeToken, err := resolveJingSoftBaseAndStoreInputs(candidateBaseURL, candidateStoreToken, cfg)
	if err != nil {
		return nil, err
	}
	merchantToken := strings.TrimSpace(candidateMerchantToken)
	if merchantToken == "" && cfg != nil && baseURL == strings.TrimSpace(cfg.BaseURL) {
		merchantToken = strings.TrimSpace(cfg.MerchantToken)
	}
	res, err := svc.adapter.CheckCompatibility(ctx, baseURL, storeToken, merchantToken)
	if err != nil {
		return nil, jingSoftPublicError(err)
	}
	return res, nil
}

func DiscoverJingSoftStoreProducts(ctx context.Context, candidateBaseURL, candidateStoreToken string) ([]JingSoftDiscoveredProduct, error) {
	if !JingSoftProtocolReady() {
		return nil, ErrJingSoftProtocolUnverified
	}
	svc := jingSoftProductionService()
	cfg := svc.setting()
	baseURL, storeToken, err := resolveJingSoftBaseAndStoreInputs(candidateBaseURL, candidateStoreToken, cfg)
	if err != nil {
		return nil, err
	}
	if storeToken == "" {
		return nil, ErrJingSoftInvalidRequest
	}
	products, err := svc.adapter.DiscoverProducts(ctx, baseURL, storeToken)
	if err != nil {
		return nil, jingSoftPublicError(err)
	}
	directKeys := make(map[string]bool, len(cfg.DirectGoodsKeys))
	for _, raw := range cfg.DirectGoodsKeys {
		if k, kErr := operation_setting.NormalizeJingSoftGoodsKeyForBase(raw, baseURL); kErr == nil && k != "" {
			directKeys[k] = true
		}
	}
	if len(directKeys) == 0 {
		return products, nil
	}
	filtered := make([]JingSoftDiscoveredProduct, 0, len(products))
	for _, item := range products {
		if !directKeys[item.GoodsKey] {
			filtered = append(filtered, item)
		}
	}
	return filtered, nil
}

func DiscoverJingSoftDirectSlots(ctx context.Context, candidateBaseURL, candidateMerchantToken string) ([]JingSoftDiscoveredProduct, error) {
	if !JingSoftProtocolReady() {
		return nil, ErrJingSoftProtocolUnverified
	}
	svc := jingSoftProductionService()
	cfg := svc.setting()
	rawBase := strings.TrimSpace(candidateBaseURL)
	if rawBase == "" && cfg != nil {
		rawBase = strings.TrimSpace(cfg.BaseURL)
	}
	baseURL, err := operation_setting.NormalizeJingSoftBaseURL(rawBase)
	if err != nil || baseURL == "" {
		return nil, ErrJingSoftInvalidBaseURL
	}
	merchantToken := strings.TrimSpace(candidateMerchantToken)
	if merchantToken == "" && cfg != nil && baseURL == strings.TrimSpace(cfg.BaseURL) {
		merchantToken = strings.TrimSpace(cfg.MerchantToken)
	}
	if merchantToken == "" {
		return nil, common.NewMessage("No JingSoft merchant token is configured yet")
	}
	slots, err := svc.adapter.DiscoverDirectSlots(ctx, baseURL, merchantToken)
	if err != nil {
		if errors.Is(err, errJingSoftMerchantAuthExpired) {
			return nil, common.NewMessage("JingSoft merchant token is invalid or expired")
		}
		return nil, jingSoftPublicError(err)
	}
	if cfg == nil || len(cfg.Products) == 0 {
		return slots, nil
	}
	redemptionKeys := make(map[string]bool, len(cfg.Products))
	for _, p := range cfg.Products {
		if k, kErr := operation_setting.NormalizeJingSoftGoodsKeyForBase(p.GoodsKey, baseURL); kErr == nil && k != "" {
			redemptionKeys[k] = true
		} else if trimmed := strings.TrimSpace(p.GoodsKey); trimmed != "" {
			redemptionKeys[trimmed] = true
		}
	}
	if len(redemptionKeys) == 0 {
		return slots, nil
	}
	filtered := make([]JingSoftDiscoveredProduct, 0, len(slots))
	for _, item := range slots {
		if !redemptionKeys[item.GoodsKey] {
			filtered = append(filtered, item)
		}
	}
	return filtered, nil
}

func jingSoftValidDirectSlotKeys(cfg *operation_setting.JingSoftSetting) []string {
	if cfg == nil || len(cfg.DirectGoodsKeys) == 0 || len(cfg.DirectGoodsKeys) > 20 {
		return nil
	}
	redemptionKeys := make(map[string]bool, len(cfg.Products))
	for _, p := range cfg.Products {
		if key, err := operation_setting.NormalizeJingSoftGoodsKeyForBase(p.GoodsKey, cfg.BaseURL); err == nil && key != "" {
			redemptionKeys[key] = true
		} else if trimmed := strings.TrimSpace(p.GoodsKey); trimmed != "" {
			redemptionKeys[trimmed] = true
		}
	}
	result := make([]string, 0, len(cfg.DirectGoodsKeys))
	seen := make(map[string]bool, len(cfg.DirectGoodsKeys))
	for _, raw := range cfg.DirectGoodsKeys {
		normalized, err := operation_setting.NormalizeJingSoftGoodsKeyForBase(raw, cfg.BaseURL)
		if err != nil || normalized == "" || seen[normalized] || redemptionKeys[normalized] {
			return nil
		}
		seen[normalized] = true
		result = append(result, normalized)
	}
	return result
}

func jingSoftChannelPaymentType(channel operation_setting.JingSoftChannel) string {
	if channel.PaymentType != "" {
		return channel.PaymentType
	}
	return operation_setting.JingSoftClassifyChannel(channel.Code, "", channel.Name)
}

func jingSoftPaymentMethod(cfg *operation_setting.JingSoftSetting, channelID string) string {
	var channel *operation_setting.JingSoftChannel
	for i := range cfg.Channels {
		if cfg.Channels[i].ID == channelID {
			channel = &cfg.Channels[i]
			break
		}
	}
	if channel == nil {
		return ""
	}

	paymentType := jingSoftChannelPaymentType(*channel)
	methodType := operation_setting.JingSoftPaymentMethodAlipay
	if paymentType == "wxpay" {
		methodType = operation_setting.JingSoftPaymentMethodWeChat
	} else if paymentType != "alipay" {
		return ""
	}
	for _, method := range operation_setting.PayMethods {
		if method["type"] == methodType && method["channel_id"] == channelID {
			return methodType
		}
	}
	return ""
}

func jingSoftConfiguredChannel(cfg *operation_setting.JingSoftSetting, channelID string) bool {
	return jingSoftPaymentMethod(cfg, channelID) != ""
}

func JingSoftUnavailableReason() string {
	if !JingSoftProtocolReady() {
		return ErrJingSoftProtocolUnverified.Error()
	}
	svc := jingSoftProductionService()
	cfg := svc.setting()
	if !cfg.Enabled {
		return ErrJingSoftDisabled.Error()
	}
	if _, err := jingSoftEncryptionKey(); err != nil {
		return ErrJingSoftEncryptionKey.Error()
	}
	baseURL, baseErr := operation_setting.NormalizeJingSoftBaseURL(cfg.BaseURL)
	if baseErr != nil || baseURL == "" {
		return "Invalid JingSoft platform URL"
	}
	token, err := operation_setting.NormalizeJingSoftStoreTokenForBase(cfg.StoreToken, baseURL)
	if err != nil || token == "" {
		return "Invalid JingSoft settings"
	}
	configured := jingSoftConfiguredMode(cfg)
	effMode, _ := svc.effectiveMode(cfg)
	switch configured {
	case operation_setting.JingSoftModeAuto:
		if effMode == operation_setting.JingSoftModeDirect {
			if strings.TrimSpace(cfg.MerchantToken) == "" || len(jingSoftValidDirectSlotKeys(cfg)) == 0 {
				return "Invalid JingSoft settings"
			}
		} else if len(cfg.Products) == 0 {
			return "Invalid JingSoft settings"
		}
	case operation_setting.JingSoftModeDirect:
		if strings.TrimSpace(cfg.MerchantToken) == "" || len(jingSoftValidDirectSlotKeys(cfg)) == 0 {
			return "Direct-credit mode requires a JingSoft merchant token and dedicated slot goods keys"
		}
	default:
		if len(cfg.Products) == 0 {
			return "Invalid JingSoft settings"
		}
	}
	configuredChannel := false
	for _, channel := range cfg.Channels {
		if jingSoftConfiguredChannel(cfg, channel.ID) {
			configuredChannel = true
			break
		}
	}
	if !configuredChannel {
		return "No JingSoft payment method is configured"
	}
	return ""
}

func JingSoftPublicInfo() JingSoftInfo {
	svc := jingSoftProductionService()
	cfg := svc.setting()
	reason := JingSoftUnavailableReason()
	effMode, fallback := svc.effectiveMode(cfg)
	maxCNY, _ := jingSoftMaxCNYDecimal(cfg).Float64()
	info := JingSoftInfo{
		Enabled:           cfg.Enabled && operation_setting.IsPaymentComplianceConfirmed(),
		Available:         reason == "",
		Mode:              effMode,
		ConfiguredMode:    jingSoftConfiguredMode(cfg),
		AvailableModes:    operation_setting.JingSoftModes(),
		FallbackActive:    fallback,
		MaxAmountCNY:      maxCNY,
		UnavailableReason: reason,
		Products:          []JingSoftPublicProduct{},
		Channels:          []operation_setting.JingSoftChannel{},
	}
	if !operation_setting.IsPaymentComplianceConfirmed() {
		info.Available = false
		info.UnavailableReason = "Payment compliance confirmation is required"
	}
	for _, p := range cfg.Products {
		info.Products = append(info.Products, JingSoftPublicProduct{ID: p.ID, Name: p.Name, Amount: p.Amount})
	}
	for _, channel := range cfg.Channels {
		if !jingSoftConfiguredChannel(cfg, channel.ID) {
			continue
		}
		info.Channels = append(info.Channels, operation_setting.JingSoftChannel{
			ID:          channel.ID,
			Name:        channel.Name,
			Icon:        channel.Icon,
			PaymentType: jingSoftChannelPaymentType(channel),
		})
	}
	return info
}

func QuoteJingSoft(ctx context.Context, userID int, productID, channelID string) (*JingSoftQuote, error) {
	return QuoteJingSoftRequest(ctx, userID, JingSoftQuoteRequest{ProductID: productID, ChannelID: channelID})
}

func QuoteJingSoftRequest(ctx context.Context, userID int, req JingSoftQuoteRequest) (*JingSoftQuote, error) {
	q, err := jingSoftProductionService().quoteRequest(ctx, userID, req)
	return q, jingSoftPublicError(err)
}

func CreateJingSoftPayment(ctx context.Context, userID int, req JingSoftPaymentRequest) (*JingSoftPayment, error) {
	return CreateJingSoftPaymentWithIP(ctx, userID, req, "")
}

func CreateJingSoftPaymentWithIP(ctx context.Context, userID int, req JingSoftPaymentRequest, clientIP string) (*JingSoftPayment, error) {
	p, err := jingSoftProductionService().createWithIP(ctx, userID, req, clientIP)
	return p, jingSoftPublicError(err)
}

func GetUserJingSoftPayment(ctx context.Context, userID int, tradeNo string) (*JingSoftPayment, error) {
	if userID <= 0 || tradeNo == "" {
		return nil, ErrJingSoftInvalidRequest
	}
	order, err := jingSoftProductionService().refresh(ctx, userID, tradeNo)
	if err != nil {
		return nil, ErrJingSoftOrderUnavailable
	}
	return jingSoftSafePayment(order), nil
}

// GetJingSoftOrderRedemption returns the code a completed order redeemed. Direct
// orders never use redemption codes and are rejected explicitly.
func GetJingSoftOrderRedemption(viewerID int, tradeNo string, canViewAnyOrder bool) (*JingSoftRedemption, error) {
	if viewerID <= 0 || tradeNo == "" {
		return nil, ErrJingSoftInvalidRequest
	}
	var (
		redemption *model.Redemption
		err        error
	)
	if canViewAnyOrder {
		redemption, err = model.GetJingSoftRedemptionByTradeNo(tradeNo)
	} else {
		redemption, err = model.GetJingSoftRedemptionForUser(viewerID, tradeNo)
	}
	if errors.Is(err, model.ErrJingSoftOrderConflict) {
		return nil, ErrJingSoftRedemptionPending
	}
	if err != nil {
		return nil, ErrJingSoftOrderUnavailable
	}
	return &JingSoftRedemption{Key: redemption.Key, Quota: redemption.Quota, RedeemedTime: redemption.RedeemedTime}, nil
}

func ListJingSoftChannels(ctx context.Context, candidateBaseURL, candidateToken string) ([]operation_setting.JingSoftChannel, error) {
	if !JingSoftProtocolReady() {
		return nil, ErrJingSoftProtocolUnverified
	}
	svc := jingSoftProductionService()
	baseURL, token, err := resolveJingSoftBaseAndStoreInputs(candidateBaseURL, candidateToken, svc.setting())
	if err != nil {
		return nil, err
	}
	if token == "" {
		return nil, ErrJingSoftInvalidRequest
	}
	channels, err := svc.adapter.Channels(ctx, baseURL, token)
	return channels, jingSoftPublicError(err)
}

func ResetQuarantinedJingSoftSlots() (int64, error) {
	cfg := operation_setting.GetJingSoftSetting()
	token, err := operation_setting.NormalizeJingSoftStoreTokenForBase(cfg.StoreToken, cfg.BaseURL)
	if err != nil || token == "" {
		return 0, ErrJingSoftInvalidRequest
	}
	count, err := model.ResetQuarantinedJingSoftPriceSlots(token, time.Now().Unix())
	return count, jingSoftPublicError(err)
}

func jingSoftOrderOrigin(order *model.JingSoftOrder) string {
	if order == nil {
		return ""
	}
	for _, candidate := range []string{order.ShopURL, order.PaymentURL} {
		if candidate == "" {
			continue
		}
		if u, err := url.Parse(candidate); err == nil && u.Scheme != "" && u.Host != "" {
			return u.Scheme + "://" + u.Host
		}
	}
	return ""
}

func jingSoftSafePayment(o *model.JingSoftOrder) *JingSoftPayment {
	p := &JingSoftPayment{TradeNo: o.TradeNo, Status: o.Status, PaymentMethod: o.PaymentMethod, Mode: jingSoftModeFromOrder(o)}
	switch o.FailureCode {
	case "creation_unknown", "verification_mismatch", "credential_unavailable", "settlement_failed", "delivery_invalid", "payment_regressed":
		p.FailureCode = o.FailureCode
	}
	if o.Status == model.JingSoftOrderStatusPending {
		allowedOrigin := jingSoftOrderOrigin(o)
		if jingSoftValidPaymentQRCode(o.PaymentQRCode, o.PaymentMethod, allowedOrigin) {
			p.PaymentQRCode = o.PaymentQRCode
		}
		if p.PaymentQRCode == "" && o.PaymentMethod != model.PaymentMethodJingSoftWeChat && len(o.PaymentURL) <= 2048 && jingSoftValidPaymentURL(o.PaymentURL) {
			p.PaymentQRCode = o.PaymentURL
		}
	}
	return p
}

func jingSoftEncryptionKey() ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(os.Getenv("JINGSOFT_ORDER_ENCRYPTION_KEY"))
	if err != nil || len(key) != 32 {
		return nil, ErrJingSoftEncryptionKey
	}
	return key, nil
}

func jingSoftOrderSealPurpose(userID int, tradeNo string) string {
	legacyPrefix := "cat" + "fk_"
	if strings.HasPrefix(tradeNo, legacyPrefix) {
		return fmt.Sprintf("cat"+"fk/order/v1/%d/%s", userID, tradeNo)
	}
	return fmt.Sprintf("jingsoft/order/v1/%d/%s", userID, tradeNo)
}

// Both quote snapshots and recovery credentials use separate domain prefixes;
// credentials additionally bind the user and immutable local trade number.
func jingSoftSeal(key []byte, purpose string, value any) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	data, err := common.Marshal(value)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(gcm.Seal(nonce, nonce, data, []byte(purpose))), nil
}

func jingSoftOpen(key []byte, purpose, token string, value any) error {
	if len(token) > 32768 {
		return ErrJingSoftInvalidQuote
	}
	data, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	if len(data) < gcm.NonceSize() {
		return ErrJingSoftInvalidQuote
	}
	plain, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], []byte(purpose))
	if err != nil {
		return err
	}
	return common.Unmarshal(plain, value)
}

type jingSoftQuoteSnapshot struct {
	UserID        int
	Mode          string
	BaseURL       string
	TierID        string
	ProductID     string
	RequestAmount int64
	BaseAmount    string
	ChannelID     string
	ConfigHash    string
	ExpiresAt     int64
	Quota         int
	TopUpAmount   float64
	Offer         JingSoftOffer
}

func jingSoftConfigHash(cfg *operation_setting.JingSoftSetting) string {
	data, _ := common.Marshal(cfg)
	return fmt.Sprintf("%x", sha256.Sum256(data))
}

func jingSoftMaxCNYDecimal(cfg *operation_setting.JingSoftSetting) decimal.Decimal {
	if cfg != nil && cfg.MaxAmountCNY >= 1 && cfg.MaxAmountCNY <= 1000000 && !math.IsNaN(cfg.MaxAmountCNY) && !math.IsInf(cfg.MaxAmountCNY, 0) {
		return decimal.NewFromFloat(cfg.MaxAmountCNY).Round(2)
	}
	return decimal.NewFromFloat(operation_setting.JingSoftDefaultMaxAmountCNY)
}

func (s *jingSoftService) computeDirectPricing(userID int, amount int64) (quota int, topUpUSD float64, baseCNY decimal.Decimal, err error) {
	if amount <= 0 || common.QuotaPerUnit <= 0 {
		return 0, 0, decimal.Zero, ErrJingSoftInvalidRequest
	}
	minTopUp := int64(operation_setting.MinTopUp)
	quotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		minQuota, minErr := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(minTopUp).Mul(quotaPerUnit))
		if minErr != nil {
			return 0, 0, decimal.Zero, ErrJingSoftInvalidRequest
		}
		minTopUp = int64(minQuota)
	}
	if amount < minTopUp {
		return 0, 0, decimal.Zero, ErrJingSoftInvalidRequest
	}
	var unitsDecimal decimal.Decimal
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		unitsDecimal = decimal.NewFromInt(decimal.NewFromInt(amount).Div(quotaPerUnit).IntPart())
	} else {
		unitsDecimal = decimal.NewFromInt(amount)
	}
	quota, err = common.WalletQuotaFromDecimalStrict(unitsDecimal.Mul(quotaPerUnit))
	if err != nil || quota <= 0 {
		return 0, 0, decimal.Zero, ErrJingSoftInvalidRequest
	}
	topUpUSD, _ = unitsDecimal.Float64()

	group := "default"
	if s.userGroup != nil {
		group, err = s.userGroup(userID)
		if err != nil {
			return 0, 0, decimal.Zero, ErrJingSoftOrderUnavailable
		}
	}
	groupRatio := common.GetTopupGroupRatio(group)
	if groupRatio <= 0 || math.IsNaN(groupRatio) || math.IsInf(groupRatio, 0) {
		groupRatio = 1
	}
	priceRatio := operation_setting.Price
	if priceRatio <= 0 || math.IsNaN(priceRatio) || math.IsInf(priceRatio, 0) {
		return 0, 0, decimal.Zero, ErrJingSoftInvalidRequest
	}
	discount := 1.0
	if int64(int(amount)) == amount {
		if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok && ds > 0 && !math.IsNaN(ds) && !math.IsInf(ds, 0) {
			discount = ds
		}
	}
	baseCNY = unitsDecimal.
		Mul(decimal.NewFromFloat(priceRatio)).
		Mul(decimal.NewFromFloat(groupRatio)).
		Mul(decimal.NewFromFloat(discount)).
		Round(2)
	if baseCNY.LessThan(decimal.RequireFromString("0.01")) || baseCNY.GreaterThan(decimal.NewFromInt(1000000)) {
		return 0, 0, decimal.Zero, ErrJingSoftInvalidRequest
	}
	maxCNY := jingSoftMaxCNYDecimal(s.setting())
	if baseCNY.GreaterThan(maxCNY) {
		return 0, 0, decimal.Zero, jingSoftMaxAmountError(maxCNY)
	}
	return quota, topUpUSD, baseCNY, nil
}

func (s *jingSoftService) quote(ctx context.Context, userID int, productID, channelID string) (*JingSoftQuote, error) {
	return s.quoteRequest(ctx, userID, JingSoftQuoteRequest{ProductID: productID, ChannelID: channelID})
}

func (s *jingSoftService) quoteRedemptionProduct(ctx context.Context, userID int, baseURL string, cfg *operation_setting.JingSoftSetting, product *operation_setting.JingSoftProduct, channelID string) (quota int, topUpAmount float64, offer *JingSoftOffer, err error) {
	if product == nil || math.IsNaN(product.Amount) || math.IsInf(product.Amount, 0) || product.Amount <= 0 {
		return 0, 0, nil, ErrJingSoftInvalidRequest
	}
	goodsKey, keyErr := operation_setting.NormalizeJingSoftGoodsKeyForBase(product.GoodsKey, baseURL)
	if keyErr != nil || goodsKey == "" {
		return 0, 0, nil, ErrJingSoftInvalidRequest
	}
	quota, err = common.WalletQuotaFromDecimalStrict(decimal.NewFromFloat(product.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	if err != nil || quota <= 0 {
		return 0, 0, nil, ErrJingSoftInvalidRequest
	}
	if err = s.store.Capacity(userID, quota); err != nil {
		return 0, 0, nil, err
	}
	offer, err = s.adapter.Quote(ctx, baseURL, cfg.StoreToken, goodsKey, channelID)
	if err != nil {
		return 0, 0, nil, err
	}
	if offer == nil || offer.ShopID == "" || offer.ProductID != goodsKey || offer.ChannelID != channelID || offer.Currency == "" || offer.Quantity != 1 || !offer.InStock {
		return 0, 0, nil, ErrJingSoftVerification
	}
	return quota, product.Amount, offer, nil
}

func findJingSoftProductByAmount(products []operation_setting.JingSoftProduct, usdAmount float64) *operation_setting.JingSoftProduct {
	for i := range products {
		if math.Abs(products[i].Amount-usdAmount) < 1e-9 {
			return &products[i]
		}
	}
	return nil
}

func (s *jingSoftService) quoteRequest(ctx context.Context, userID int, req JingSoftQuoteRequest) (*JingSoftQuote, error) {
	if !s.adapter.Ready() {
		return nil, ErrJingSoftProtocolUnverified
	}
	cfg := s.setting()
	if !cfg.Enabled {
		return nil, ErrJingSoftDisabled
	}
	baseURL, baseErr := operation_setting.NormalizeJingSoftBaseURL(cfg.BaseURL)
	if baseErr != nil || baseURL == "" {
		return nil, ErrJingSoftInvalidBaseURL
	}
	key, err := s.key()
	if err != nil {
		return nil, err
	}
	if userID <= 0 || !jingSoftConfiguredChannel(cfg, req.ChannelID) {
		return nil, ErrJingSoftInvalidRequest
	}
	configuredMode := jingSoftConfiguredMode(cfg)
	mode, _ := s.effectiveMode(cfg)
	var (
		tierID        string
		productID     string
		requestAmount int64
		baseAmount    string
		quota         int
		topUpAmount   float64
		offer         *JingSoftOffer
	)
	if mode == operation_setting.JingSoftModeDirect {
		if req.Amount == nil || *req.Amount <= 0 || req.ProductID != "" {
			if configuredMode == operation_setting.JingSoftModeAuto && req.Amount == nil && req.ProductID != "" {
				mode = operation_setting.JingSoftModeRedemption
			} else {
				return nil, ErrJingSoftInvalidRequest
			}
		}
	}
	if mode == operation_setting.JingSoftModeDirect {
		storeToken, tokenErr := operation_setting.NormalizeJingSoftStoreTokenForBase(cfg.StoreToken, baseURL)
		slotKeys := jingSoftValidDirectSlotKeys(cfg)
		merchantToken := strings.TrimSpace(cfg.MerchantToken)
		if tokenErr != nil || storeToken == "" || merchantToken == "" || len(slotKeys) == 0 {
			return nil, ErrJingSoftOrderUnavailable
		}
		var baseCNY decimal.Decimal
		quota, topUpAmount, baseCNY, err = s.computeDirectPricing(userID, *req.Amount)
		if err != nil {
			return nil, err
		}
		if err = s.store.Capacity(userID, quota); err != nil {
			return nil, err
		}
		requestAmount = *req.Amount
		baseAmount = baseCNY.StringFixed(2)
		tierID = fmt.Sprintf("direct:%d", requestAmount)
		offer, err = s.adapter.QuoteDirect(ctx, baseURL, storeToken, merchantToken, slotKeys[0], req.ChannelID, baseAmount)
		if err != nil {
			if configuredMode == operation_setting.JingSoftModeAuto && errors.Is(err, errJingSoftMerchantAuthExpired) {
				s.healthTracker().record(baseURL, merchantToken, false, s.now().Unix())
				matched := findJingSoftProductByAmount(cfg.Products, topUpAmount)
				if matched == nil {
					return nil, ErrJingSoftCustomAmountFallback
				}
				mode = operation_setting.JingSoftModeRedemption
				requestAmount = 0
				baseAmount = ""
				tierID = matched.ID
				productID = matched.ID
				quota, topUpAmount, offer, err = s.quoteRedemptionProduct(ctx, userID, baseURL, cfg, matched, req.ChannelID)
				if err != nil {
					return nil, err
				}
			} else {
				return nil, err
			}
		} else {
			s.healthTracker().record(baseURL, merchantToken, true, s.now().Unix())
			if offer == nil || offer.ShopID == "" || !slices.Contains(slotKeys, offer.ProductID) || offer.ChannelID != req.ChannelID || offer.Currency == "" || offer.Quantity != 1 || !offer.InStock {
				return nil, ErrJingSoftVerification
			}
		}
	} else {
		var product *operation_setting.JingSoftProduct
		if req.Amount != nil {
			if configuredMode != operation_setting.JingSoftModeAuto || *req.Amount <= 0 || req.ProductID != "" {
				return nil, ErrJingSoftInvalidRequest
			}
			_, requestedUSD, _, priceErr := s.computeDirectPricing(userID, *req.Amount)
			if priceErr != nil {
				return nil, priceErr
			}
			product = findJingSoftProductByAmount(cfg.Products, requestedUSD)
			if product == nil {
				return nil, ErrJingSoftCustomAmountFallback
			}
		} else {
			if req.ProductID == "" {
				return nil, ErrJingSoftInvalidRequest
			}
			for i := range cfg.Products {
				if cfg.Products[i].ID == req.ProductID {
					product = &cfg.Products[i]
					break
				}
			}
		}
		if product == nil {
			return nil, ErrJingSoftInvalidRequest
		}
		tierID = product.ID
		productID = product.ID
		quota, topUpAmount, offer, err = s.quoteRedemptionProduct(ctx, userID, baseURL, cfg, product, req.ChannelID)
		if err != nil {
			return nil, err
		}
	}
	amount, err := decimal.NewFromString(offer.Amount)
	if err != nil || !amount.IsPositive() {
		return nil, ErrJingSoftVerification
	}
	if mode == operation_setting.JingSoftModeDirect {
		maxCNY := jingSoftMaxCNYDecimal(cfg)
		if amount.GreaterThan(maxCNY) {
			return nil, jingSoftMaxAmountError(maxCNY)
		}
	}
	amountFloat, _ := amount.Float64()
	if math.IsInf(amountFloat, 0) || math.IsNaN(amountFloat) {
		return nil, ErrJingSoftVerification
	}
	snap := jingSoftQuoteSnapshot{
		UserID:        userID,
		Mode:          mode,
		BaseURL:       baseURL,
		TierID:        tierID,
		ProductID:     productID,
		RequestAmount: requestAmount,
		BaseAmount:    baseAmount,
		ChannelID:     req.ChannelID,
		ConfigHash:    jingSoftConfigHash(cfg),
		ExpiresAt:     s.now().Add(5 * time.Minute).Unix(),
		Quota:         quota,
		TopUpAmount:   topUpAmount,
		Offer:         *offer,
	}
	token, err := jingSoftSeal(key, "jingsoft/quote/v1", snap)
	if err != nil {
		return nil, err
	}
	result := &JingSoftQuote{
		QuoteID:     token,
		Amount:      amountFloat,
		Currency:    offer.Currency,
		TopUpAmount: topUpAmount,
		Mode:        mode,
		ProductID:   productID,
	}
	original, originalErr := decimal.NewFromString(offer.OriginalAmount)
	fee, feeErr := decimal.NewFromString(offer.Fee)
	if originalErr == nil && feeErr == nil && original.IsPositive() && original.Add(fee).Equal(amount) {
		feeFloat, _ := fee.Float64()
		rateFloat, _ := fee.Div(original).Mul(decimal.NewFromInt(100)).Round(2).Float64()
		result.Fee, result.FeeRate = &feeFloat, &rateFloat
	}
	return result, nil
}

func isValidJingSoftQQ(qq string) bool {
	if len(qq) < 5 || len(qq) > 12 {
		return false
	}
	for _, digit := range qq {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	return true
}

func jingSoftAmountsEqual(a, b string) bool {
	da, ea := decimal.NewFromString(a)
	db, eb := decimal.NewFromString(b)
	return ea == nil && eb == nil && da.IsPositive() && da.Equal(db)
}

func (s *jingSoftService) create(ctx context.Context, userID int, req JingSoftPaymentRequest) (*JingSoftPayment, error) {
	return s.createWithIP(ctx, userID, req, "")
}

func (s *jingSoftService) createWithIP(ctx context.Context, userID int, req JingSoftPaymentRequest, clientIP string) (*JingSoftPayment, error) {
	if !s.adapter.Ready() {
		return nil, ErrJingSoftProtocolUnverified
	}
	if userID <= 0 || req.ChannelID == "" || len(req.IdempotencyKey) < 16 || len(req.IdempotencyKey) > 128 {
		return nil, ErrJingSoftInvalidRequest
	}
	expectedTierID := req.ProductID
	if req.Amount != nil {
		if *req.Amount <= 0 || req.ProductID != "" {
			return nil, ErrJingSoftInvalidRequest
		}
		expectedTierID = fmt.Sprintf("direct:%d", *req.Amount)
	} else if req.ProductID == "" {
		return nil, ErrJingSoftInvalidRequest
	}
	// Recovery is account-scoped and does not depend on an expired quote,
	// disabled new purchases, or a changed shop configuration.
	existing, err := s.store.Find(userID, req.IdempotencyKey)
	if err != nil {
		return nil, ErrJingSoftOrderUnavailable
	}
	if existing != nil {
		if existing.TierID != expectedTierID || existing.ChannelID != req.ChannelID {
			return nil, ErrJingSoftInvalidRequest
		}
		if jingSoftModeFromOrder(existing) == operation_setting.JingSoftModeRedemption && !isValidJingSoftQQ(req.QQ) {
			return nil, ErrJingSoftInvalidRequest
		}
		return jingSoftSafePayment(existing), nil
	}
	cfg := s.setting()
	if !cfg.Enabled {
		return nil, ErrJingSoftDisabled
	}
	baseURL, baseErr := operation_setting.NormalizeJingSoftBaseURL(cfg.BaseURL)
	if baseErr != nil || baseURL == "" {
		return nil, ErrJingSoftInvalidBaseURL
	}
	if !jingSoftConfiguredChannel(cfg, req.ChannelID) {
		return nil, ErrJingSoftInvalidRequest
	}
	configuredMode := jingSoftConfiguredMode(cfg)
	if configuredMode == operation_setting.JingSoftModeRedemption && (req.Amount != nil || !isValidJingSoftQQ(req.QQ)) {
		return nil, ErrJingSoftInvalidRequest
	}
	if configuredMode == operation_setting.JingSoftModeDirect && (req.Amount == nil || *req.Amount <= 0 || req.ProductID != "") {
		return nil, ErrJingSoftInvalidRequest
	}
	key, err := s.key()
	if err != nil {
		return nil, err
	}
	var snap jingSoftQuoteSnapshot
	if err = jingSoftOpen(key, "jingsoft/quote/v1", req.QuoteID, &snap); err != nil || snap.UserID != userID || snap.TierID != expectedTierID || snap.ChannelID != req.ChannelID || snap.BaseURL != baseURL || snap.ConfigHash != jingSoftConfigHash(cfg) || snap.ExpiresAt <= s.now().Unix() {
		return nil, ErrJingSoftInvalidQuote
	}
	mode := snap.Mode
	if mode != operation_setting.JingSoftModeRedemption && mode != operation_setting.JingSoftModeDirect {
		return nil, ErrJingSoftInvalidQuote
	}
	if configuredMode != operation_setting.JingSoftModeAuto && mode != configuredMode {
		return nil, ErrJingSoftInvalidQuote
	}
	if mode == operation_setting.JingSoftModeRedemption {
		if req.Amount != nil || !isValidJingSoftQQ(req.QQ) {
			return nil, ErrJingSoftInvalidRequest
		}
	} else {
		if req.Amount == nil || *req.Amount <= 0 || req.ProductID != "" {
			return nil, ErrJingSoftInvalidRequest
		}
		if configuredMode == operation_setting.JingSoftModeAuto && s.healthTracker().isInvalid(baseURL, cfg.MerchantToken) {
			return nil, ErrJingSoftInvalidQuote
		}
	}
	if err = s.store.Capacity(userID, snap.Quota); err != nil {
		return nil, err
	}
	maxOrdersPerMin := cfg.MaxOrdersPerMinute
	if maxOrdersPerMin <= 0 {
		maxOrdersPerMin = operation_setting.JingSoftDefaultMaxOrdersPerMinute
	}
	ipKey := ""
	if trimmedIP := strings.TrimSpace(clientIP); trimmedIP != "" {
		ipKey = "ip:" + trimmedIP
	}
	if !s.rateLimiter().allow(s.now().Unix(), maxOrdersPerMin, fmt.Sprintf("user:%d", userID), ipKey) {
		return nil, ErrJingSoftRateLimited
	}

	trade := "JingSoft_" + common.GetUUID()
	selectedGoodsKey := snap.Offer.ProductID
	expectedContact := req.QQ
	var (
		slot           *model.JingSoftPriceSlot
		confirmedPrice string
	)
	if mode == operation_setting.JingSoftModeDirect {
		freshQuota, _, freshBaseCNY, priceErr := s.computeDirectPricing(userID, snap.RequestAmount)
		if priceErr != nil {
			return nil, priceErr
		}
		if freshQuota != snap.Quota || freshBaseCNY.StringFixed(2) != snap.BaseAmount {
			return nil, ErrJingSoftInvalidQuote
		}
		storeToken, tokenErr := operation_setting.NormalizeJingSoftStoreTokenForBase(cfg.StoreToken, baseURL)
		slotKeys := jingSoftValidDirectSlotKeys(cfg)
		merchantToken := strings.TrimSpace(cfg.MerchantToken)
		if tokenErr != nil || storeToken == "" || merchantToken == "" || len(slotKeys) == 0 {
			return nil, ErrJingSoftOrderUnavailable
		}
		var acquired bool
		slot, acquired, err = s.store.AcquireSlot(storeToken, slotKeys, snap.BaseAmount, trade, s.now().Unix(), 90)
		if err != nil {
			return nil, ErrJingSoftOrderUnavailable
		}
		if !acquired || slot == nil {
			return nil, ErrJingSoftSlotBusy
		}
		minStock := cfg.AutoRestockMin
		if minStock <= 0 {
			minStock = operation_setting.JingSoftDefaultAutoRestockMin
		}
		restockBatch := cfg.AutoRestockBatch
		if restockBatch <= 0 {
			restockBatch = operation_setting.JingSoftDefaultAutoRestockBatch
		}
		ready, prepErr := s.adapter.PrepareDirectSlot(ctx, baseURL, storeToken, merchantToken, slot.GoodsKey, req.ChannelID, snap.BaseAmount, slot.ConfirmedPrice, minStock, restockBatch)
		if prepErr != nil {
			if resetter, ok := s.adapter.(interface{ ResetCache() }); ok {
				resetter.ResetCache()
			}
			if errors.Is(prepErr, errJingSoftMerchantAuthExpired) {
				s.healthTracker().record(baseURL, merchantToken, false, s.now().Unix())
				_, _ = s.store.ReleaseSlot(slot.ID, slot.Version, slot.HolderToken, slot.ConfirmedPrice, s.now().Unix())
				if configuredMode == operation_setting.JingSoftModeAuto {
					return nil, ErrJingSoftInvalidQuote
				}
				return nil, ErrJingSoftOrderUnavailable
			}
			if errors.Is(prepErr, errJingSoftSlotAmbiguous) {
				_, _ = s.store.QuarantineSlot(slot.ID, slot.Version, slot.HolderToken, "prepare_ambiguous", s.now().Unix())
			} else {
				_, _ = s.store.ReleaseSlot(slot.ID, slot.Version, slot.HolderToken, slot.ConfirmedPrice, s.now().Unix())
			}
			return nil, prepErr
		}
		s.healthTracker().record(baseURL, merchantToken, true, s.now().Unix())
		if ready == nil || !ready.Offer.InStock || ready.Offer.Quantity != 1 || ready.Offer.ShopID != snap.Offer.ShopID || ready.Offer.ProductID != slot.GoodsKey || ready.Offer.ChannelID != snap.Offer.ChannelID || !jingSoftAmountsEqual(ready.Offer.Amount, snap.Offer.Amount) || ready.Offer.Currency != snap.Offer.Currency {
			if resetter, ok := s.adapter.(interface{ ResetCache() }); ok {
				resetter.ResetCache()
			}
			confirmed := slot.ConfirmedPrice
			if ready != nil && ready.ConfirmedPrice != "" {
				confirmed = ready.ConfirmedPrice
			}
			_, _ = s.store.ReleaseSlot(slot.ID, slot.Version, slot.HolderToken, confirmed, s.now().Unix())
			return nil, ErrJingSoftInvalidQuote
		}
		selectedGoodsKey = slot.GoodsKey
		confirmedPrice = ready.ConfirmedPrice
		expectedContact = trade
	} else {
		// Re-price immediately before persistence. A changed purchase requires a
		// new confirmation rather than silently accepting a higher upstream amount.
		fresh, quoteErr := s.adapter.Quote(ctx, baseURL, cfg.StoreToken, snap.Offer.ProductID, req.ChannelID)
		if quoteErr != nil {
			if resetter, ok := s.adapter.(interface{ ResetCache() }); ok {
				resetter.ResetCache()
			}
			return nil, quoteErr
		}
		if fresh == nil || !fresh.InStock || fresh.Quantity != 1 || fresh.ShopID != snap.Offer.ShopID || fresh.ProductID != snap.Offer.ProductID || fresh.ChannelID != snap.Offer.ChannelID || !jingSoftAmountsEqual(fresh.Amount, snap.Offer.Amount) || fresh.Currency != snap.Offer.Currency {
			if resetter, ok := s.adapter.(interface{ ResetCache() }); ok {
				resetter.ResetCache()
			}
			return nil, ErrJingSoftInvalidQuote
		}
	}

	releaseSlotClean := func() {
		if slot != nil {
			_, _ = s.store.ReleaseSlot(slot.ID, slot.Version, slot.HolderToken, confirmedPrice, s.now().Unix())
			slot = nil
		}
	}
	quarantineSlot := func(code string) {
		if slot != nil {
			_, _ = s.store.QuarantineSlot(slot.ID, slot.Version, slot.HolderToken, code, s.now().Unix())
			slot = nil
		}
	}

	paymentMethod := jingSoftPaymentMethod(cfg, req.ChannelID)
	password := make([]byte, 32)
	if _, err = rand.Read(password); err != nil {
		releaseSlotClean()
		return nil, err
	}
	credentials := JingSoftCredentials{Visitor: common.GetUUID(), Password: base64.RawURLEncoding.EncodeToString(password)}
	ciphertext, err := jingSoftSeal(key, jingSoftOrderSealPurpose(userID, trade), credentials)
	if err != nil {
		releaseSlotClean()
		return nil, err
	}
	order := &model.JingSoftOrder{
		UserID:               userID,
		TradeNo:              trade,
		TierID:               expectedTierID,
		ProductID:            selectedGoodsKey,
		ChannelID:            req.ChannelID,
		ExpectedQuota:        snap.Quota,
		PriceAmount:          snap.Offer.Amount,
		Currency:             snap.Offer.Currency,
		ShopID:               snap.Offer.ShopID,
		ShopName:             snap.Offer.ShopName,
		ShopURL:              snap.Offer.ShopURL,
		PaymentMethod:        paymentMethod,
		Mode:                 snap.Mode,
		ExpectedContact:      expectedContact,
		Status:               model.JingSoftOrderStatusNew,
		NextQueryAt:          s.now().Unix(),
		CredentialCiphertext: ciphertext,
		IdempotencyKey:       req.IdempotencyKey,
	}
	order, alreadyExists, err := s.store.Create(order)
	if err != nil {
		releaseSlotClean()
		return nil, ErrJingSoftOrderUnavailable
	}
	if alreadyExists {
		releaseSlotClean()
		if order.TierID != expectedTierID || order.ChannelID != req.ChannelID {
			return nil, ErrJingSoftInvalidRequest
		}
		return jingSoftSafePayment(order), nil
	}
	claimed, ok, err := s.store.Claim(order.ID, s.now().Unix(), 120)
	if err != nil {
		releaseSlotClean()
		return nil, err
	}
	if !ok {
		releaseSlotClean()
		return jingSoftSafePayment(order), nil
	}
	// Only the creator may submit after claiming the new state. Recovery never
	// calls Create, including when a request timed out after reaching upstream.
	if claimed.Status != model.JingSoftOrderStatusSubmitting {
		releaseSlotClean()
		return jingSoftSafePayment(claimed), nil
	}
	createCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	result, createErr := s.adapter.Create(createCtx, baseURL, claimed, credentials, expectedContact)
	if mode == operation_setting.JingSoftModeDirect && errors.Is(createErr, errJingSoftOutOfStock) && (result == nil || result.UpstreamOrderID == "") {
		storeToken, _ := operation_setting.NormalizeJingSoftStoreTokenForBase(cfg.StoreToken, baseURL)
		merchantToken := strings.TrimSpace(cfg.MerchantToken)
		minStock := cfg.AutoRestockMin
		if minStock <= 0 {
			minStock = operation_setting.JingSoftDefaultAutoRestockMin
		}
		restockBatch := cfg.AutoRestockBatch
		if restockBatch <= 0 {
			restockBatch = operation_setting.JingSoftDefaultAutoRestockBatch
		}
		if _, restockErr := s.adapter.ReplenishDirectSlot(createCtx, baseURL, storeToken, merchantToken, selectedGoodsKey, minStock, restockBatch, true); restockErr != nil {
			if errors.Is(restockErr, errJingSoftMerchantAuthExpired) {
				s.healthTracker().record(baseURL, merchantToken, false, s.now().Unix())
			}
		} else {
			retryCredentials := credentials
			if result != nil && result.Credentials != nil {
				retryCredentials = *result.Credentials
			}
			result, createErr = s.adapter.Create(createCtx, baseURL, claimed, retryCredentials, expectedContact)
		}
	}
	cancel()

	if errors.Is(createErr, errJingSoftOutOfStock) && (result == nil || result.UpstreamOrderID == "") {
		releaseSlotClean()
		_, _ = s.store.Update(claimed.ID, claimed.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusExpired, NextQueryAt: 0})
		return nil, ErrJingSoftOrderUnavailable
	}

	update := model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusCreationUnknown, FailureCode: "creation_unknown", NextQueryAt: s.now().Add(time.Minute).Unix()}
	// A received identifier is valuable for recovery even if the verification
	// query fails. It never authorizes payment navigation or wallet credit.
	if result != nil && result.UpstreamOrderID != "" && len(result.UpstreamOrderID) <= 128 && !strings.ContainsAny(result.UpstreamOrderID, " \t\r\n\x00") {
		update.UpstreamOrderID = &result.UpstreamOrderID
		update.NextQueryAt = s.now().Add(15 * time.Second).Unix()
		if jingSoftValidPaymentURL(result.PaymentURL) {
			update.PaymentURL = &result.PaymentURL
		}
	}
	// Persist refreshed cookies even when the create result is ambiguous. An
	// adapter must return any obtained recovery credentials on error as well.
	if result != nil && result.Credentials != nil {
		encrypted, sealErr := jingSoftSeal(key, jingSoftOrderSealPurpose(userID, trade), *result.Credentials)
		if sealErr != nil {
			quarantineSlot("create_ambiguous")
			return nil, sealErr
		}
		update.CredentialCiphertext = &encrypted
	}
	if errors.Is(createErr, ErrJingSoftVerification) {
		update.Status = model.JingSoftOrderStatusNeedsAttention
		update.FailureCode = "verification_mismatch"
		update.NextQueryAt = 0
	}
	orderLockedRemote := false
	if createErr == nil && result != nil && result.UpstreamOrderID != "" && jingSoftValidPaymentURL(result.PaymentURL) {
		if result.Evidence.UpstreamOrderID == result.UpstreamOrderID && jingSoftMatchesPurchase(claimed, &result.Evidence) {
			update.Status = model.JingSoftOrderStatusPending
			update.FailureCode = ""
			update.UpstreamOrderID = &result.UpstreamOrderID
			update.PaymentURL = &result.PaymentURL
			if jingSoftValidPaymentQRCode(result.PaymentQRCode, claimed.PaymentMethod, baseURL) {
				update.PaymentQRCode = &result.PaymentQRCode
			}
			update.NextQueryAt = s.now().Add(15 * time.Second).Unix()
			orderLockedRemote = true
		} else {
			update.Status = model.JingSoftOrderStatusNeedsAttention
			update.FailureCode = "verification_mismatch"
		}
	}
	if orderLockedRemote {
		releaseSlotClean()
	} else {
		quarantineSlot("create_ambiguous")
	}
	if _, err = s.store.Update(claimed.ID, claimed.Version, update); err != nil {
		return nil, err
	}
	saved, err := s.store.Get(userID, trade)
	if err != nil {
		return nil, err
	}
	return jingSoftSafePayment(saved), nil
}

func jingSoftValidPaymentQRCode(raw, paymentMethod, allowedOrigin string) bool {
	if paymentMethod == model.PaymentMethodJingSoftWeChat {
		return len(raw) <= 2048 && (jingSoftWeChatQRPattern.MatchString(raw) || jingSoftValidWeChatJspayQR(raw, allowedOrigin))
	}
	return len(raw) <= 2048 && jingSoftValidPaymentURL(raw)
}

func jingSoftValidWeChatJspayQR(raw, allowedOrigin string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Fragment != "" || u.RawPath != "" || u.Path != "/payApi/WeixinJspay/pay.html" {
		return false
	}
	if _, originErr := operation_setting.NormalizeJingSoftBaseURL("https://" + u.Host); originErr != nil {
		return false
	}
	if strings.TrimSpace(allowedOrigin) != "" {
		if normAllowed, err := operation_setting.NormalizeJingSoftBaseURL(allowedOrigin); err == nil && normAllowed != "" {
			normActual, actualErr := operation_setting.NormalizeJingSoftBaseURL("https://" + u.Host)
			if actualErr != nil || normActual != normAllowed {
				return false
			}
		}
	}
	params, err := url.ParseQuery(u.RawQuery)
	return err == nil && len(params) == 1 && len(params["trade_no"]) == 1 && jingSoftCashierTradeNoPattern.MatchString(params.Get("trade_no"))
}

func jingSoftValidPaymentURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && u.Fragment == ""
}

func jingSoftPublicError(err error) error {
	if err == nil {
		return nil
	}
	switch err {
	case ErrJingSoftProtocolUnverified, ErrJingSoftDisabled, ErrJingSoftEncryptionKey, ErrJingSoftInvalidBaseURL, ErrJingSoftInvalidRequest, ErrJingSoftInvalidQuote, ErrJingSoftVerification, ErrJingSoftOrderUnavailable, ErrJingSoftSlotBusy, ErrJingSoftRateLimited, ErrJingSoftCustomAmountFallback, ErrJingSoftRedemptionPending:
		return err
	}
	var msg *common.Message
	if errors.As(err, &msg) && msg.Key == jingSoftMaxAmountMessageKey {
		return msg
	}
	return ErrJingSoftOrderUnavailable
}

// jingSoftMatchesPurchase validates upstream trade, shop, goods, quantity, contact
// and exact amount. Channel/currency remain local purchase metadata unless also
// returned by upstream, in which case they must match.
func jingSoftMatchesPurchase(order *model.JingSoftOrder, e *JingSoftOrderEvidence) bool {
	actual, ae := decimal.NewFromString(e.Amount)
	expected, ee := decimal.NewFromString(order.PriceAmount)
	if e.UpstreamOrderID == "" || (order.UpstreamOrderID != nil && *order.UpstreamOrderID != e.UpstreamOrderID) || e.ShopID != order.ShopID || e.ProductID != order.ProductID || (e.ChannelID != "" && e.ChannelID != order.ChannelID) || e.Quantity != 1 || ae != nil || ee != nil || !actual.IsPositive() || !actual.Equal(expected) || (e.Currency != "" && e.Currency != order.Currency) {
		return false
	}
	if jingSoftModeFromOrder(order) == operation_setting.JingSoftModeDirect {
		return order.ExpectedContact != "" && e.Contact == order.ExpectedContact
	}
	if order.ExpectedContact != "" && e.Contact != "" && e.Contact != order.ExpectedContact {
		return false
	}
	return true
}
