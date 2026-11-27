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
	ErrCatFKProtocolUnverified   error = common.NewMessage("CatFK protocol is not verified")
	ErrCatFKDisabled             error = common.NewMessage("CatFK payments are disabled")
	ErrCatFKEncryptionKey        error = common.NewMessage("CatFK order encryption key is not configured")
	ErrCatFKInvalidRequest       error = common.NewMessage("Invalid CatFK payment request")
	ErrCatFKInvalidQuote         error = common.NewMessage("CatFK quote is invalid or expired")
	ErrCatFKOrderUnavailable     error = common.NewMessage("CatFK order is unavailable")
	ErrCatFKSlotBusy             error = common.NewMessage("CatFK payment channel is busy, please try again shortly")
	ErrCatFKRateLimited          error = common.NewMessage("Too many Catfk payment requests, please try again shortly")
	ErrCatFKCustomAmountFallback error = common.NewMessage("Custom amounts are temporarily unavailable, please select a preset amount")
	ErrCatFKVerification         error = common.NewMessage("CatFK payment requires attention")
	ErrCatFKRedemptionPending    error = common.NewMessage("Redemption code is not available yet")

	errCatFKSlotAmbiguous       = errors.New("catfk slot remote state is ambiguous")
	errCatFKMerchantAuthExpired = errors.New("catfk merchant token is invalid or expired")
	errCatFKOutOfStock          = errors.New("catfk goods out of stock")
)

const catFKMaxAmountMessageKey = "Catfk single payment cannot exceed ¥{{amount}}"

func catFKMaxAmountError(limit decimal.Decimal) error {
	return common.NewMessage(catFKMaxAmountMessageKey, map[string]any{"amount": limit.StringFixed(2)})
}

type CatFKQuoteRequest struct {
	ProductID string `json:"product_id"`
	Amount    *int64 `json:"amount,omitempty"`
	ChannelID string `json:"channel_id"`
}

type CatFKQuote struct {
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

type CatFKPaymentRequest struct {
	ProductID      string `json:"product_id"`
	Amount         *int64 `json:"amount,omitempty"`
	ChannelID      string `json:"channel_id"`
	QuoteID        string `json:"quote_id"`
	QQ             string `json:"qq"`
	IdempotencyKey string `json:"idempotency_key"`
}

type CatFKPayment struct {
	TradeNo       string `json:"trade_no"`
	Status        string `json:"status"`
	PaymentQRCode string `json:"payment_qr_code,omitempty"`
	PaymentMethod string `json:"payment_method,omitempty"`
	Mode          string `json:"mode,omitempty"`
	FailureCode   string `json:"failure_code,omitempty"`
}

type CatFKRedemption struct {
	Key          string `json:"key"`
	Quota        int    `json:"quota"`
	RedeemedTime int64  `json:"redeemed_time"`
}

type CatFKPublicProduct struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
}

type CatFKInfo struct {
	Enabled           bool                             `json:"enabled"`
	Available         bool                             `json:"available"`
	Mode              string                           `json:"mode"`
	ConfiguredMode    string                           `json:"configured_mode,omitempty"`
	FallbackActive    bool                             `json:"fallback_active,omitempty"`
	MaxAmountCNY      float64                          `json:"max_amount_cny,omitempty"`
	UnavailableReason string                           `json:"unavailable_reason"`
	Products          []CatFKPublicProduct             `json:"products"`
	Channels          []operation_setting.CatFKChannel `json:"channels"`
}

type CatFKMerchantTokenStatus struct {
	Configured     bool   `json:"configured"`
	Valid          bool   `json:"valid"`
	ConfiguredMode string `json:"configured_mode"`
	EffectiveMode  string `json:"effective_mode"`
	FallbackActive bool   `json:"fallback_active"`
}

type CatFKDynamicSlotReady struct {
	Offer          CatFKOffer
	ConfirmedPrice string
}

// CatFKAdapter is a normalized, verified protocol boundary. These structures
// describe service invariants, not an assumed upstream wire schema.
type CatFKAdapter interface {
	Ready() bool
	Quote(context.Context, string, string, string) (*CatFKOffer, error)
	QuoteDirect(ctx context.Context, storeToken, merchantToken, slotGoodsKey, channelID, baseAmount string) (*CatFKOffer, error)
	PrepareDirectSlot(ctx context.Context, storeToken, merchantToken, slotGoodsKey, channelID, baseAmount, knownConfirmedPrice string, minStock, restockBatch int) (*CatFKDynamicSlotReady, error)
	ReplenishDirectSlot(ctx context.Context, storeToken, merchantToken, slotGoodsKey string, minStock, restockBatch int, force bool) (int, error)
	CheckMerchantToken(ctx context.Context, merchantToken string) (bool, error)
	Create(context.Context, *model.CatFKOrder, CatFKCredentials, string) (*CatFKCreatedOrder, error)
	Query(context.Context, *model.CatFKOrder, CatFKCredentials) (*CatFKOrderEvidence, error)
	Channels(context.Context, string) ([]operation_setting.CatFKChannel, error)
}

type CatFKOffer struct {
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

type CatFKCredentials struct {
	Visitor  string
	Cookie   string
	Password string
}

type CatFKCreatedOrder struct {
	Evidence        CatFKOrderEvidence
	UpstreamOrderID string
	PaymentURL      string
	// PaymentQRCode is read silently from the payment page; empty if unknown.
	PaymentQRCode string
	// Optional refreshed recovery credentials, encrypted before persistence.
	Credentials *CatFKCredentials
}

type CatFKOrderEvidence struct {
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

type catFKUnverifiedAdapter struct{}

func (catFKUnverifiedAdapter) Ready() bool { return false }
func (catFKUnverifiedAdapter) Quote(context.Context, string, string, string) (*CatFKOffer, error) {
	return nil, ErrCatFKProtocolUnverified
}
func (catFKUnverifiedAdapter) QuoteDirect(context.Context, string, string, string, string, string) (*CatFKOffer, error) {
	return nil, ErrCatFKProtocolUnverified
}
func (catFKUnverifiedAdapter) PrepareDirectSlot(context.Context, string, string, string, string, string, string, int, int) (*CatFKDynamicSlotReady, error) {
	return nil, ErrCatFKProtocolUnverified
}
func (catFKUnverifiedAdapter) ReplenishDirectSlot(context.Context, string, string, string, int, int, bool) (int, error) {
	return 0, ErrCatFKProtocolUnverified
}
func (catFKUnverifiedAdapter) CheckMerchantToken(context.Context, string) (bool, error) {
	return false, ErrCatFKProtocolUnverified
}
func (catFKUnverifiedAdapter) Create(context.Context, *model.CatFKOrder, CatFKCredentials, string) (*CatFKCreatedOrder, error) {
	return nil, ErrCatFKProtocolUnverified
}
func (catFKUnverifiedAdapter) Query(context.Context, *model.CatFKOrder, CatFKCredentials) (*CatFKOrderEvidence, error) {
	return nil, ErrCatFKProtocolUnverified
}
func (catFKUnverifiedAdapter) Channels(context.Context, string) ([]operation_setting.CatFKChannel, error) {
	return nil, ErrCatFKProtocolUnverified
}

// Store operations own transactions and CAS/lease fencing. No SQL belongs here.
type catFKStore interface {
	Create(*model.CatFKOrder) (*model.CatFKOrder, bool, error)
	Get(int, string) (*model.CatFKOrder, error)
	Find(int, string) (*model.CatFKOrder, error)
	Due(int64, int) ([]*model.CatFKOrder, error)
	Claim(int, int64, int64) (*model.CatFKOrder, bool, error)
	Update(int, int64, model.CatFKOrderUpdate) (bool, error)
	Retry(int, int64, int64) (bool, error)
	Complete(int, int64, string, string, string) (bool, error)
	Capacity(int, int) error
	AcquireSlot(shopID string, goodsKeys []string, targetPrice, orderTradeNo string, now, leaseSeconds int64) (*model.CatFKPriceSlot, bool, error)
	ReleaseSlot(id int, version int64, holderToken, confirmedPrice string, now int64) (bool, error)
	QuarantineSlot(id int, version int64, holderToken, code string, now int64) (bool, error)
}

type catFKModelStore struct{}

func (catFKModelStore) Create(o *model.CatFKOrder) (*model.CatFKOrder, bool, error) {
	return model.CreateCatFKOrder(o)
}
func (catFKModelStore) Get(u int, t string) (*model.CatFKOrder, error) {
	return model.GetCatFKOrderForUser(u, t)
}
func (catFKModelStore) Find(u int, key string) (*model.CatFKOrder, error) {
	return model.FindCatFKOrderForRequest(u, key)
}
func (catFKModelStore) Due(n int64, l int) ([]*model.CatFKOrder, error) {
	return model.ListDueCatFKOrders(n, l)
}
func (catFKModelStore) Claim(id int, n, s int64) (*model.CatFKOrder, bool, error) {
	return model.ClaimCatFKOrder(id, n, s)
}
func (catFKModelStore) Update(id int, v int64, u model.CatFKOrderUpdate) (bool, error) {
	return model.UpdateCatFKOrder(id, v, u)
}
func (catFKModelStore) Retry(id int, v, n int64) (bool, error) {
	return model.RetryCatFKOrder(id, v, n)
}
func (catFKModelStore) Complete(id int, v int64, k, txID, ip string) (bool, error) {
	return model.CompleteVerifiedCatFKOrder(id, v, k, txID, ip)
}
func (catFKModelStore) Capacity(u, q int) error { return model.ValidateTopUpQuotaCapacity(u, q) }
func (catFKModelStore) AcquireSlot(shopID string, goodsKeys []string, targetPrice, orderTradeNo string, now, leaseSeconds int64) (*model.CatFKPriceSlot, bool, error) {
	return model.AcquireCatFKPriceSlot(shopID, goodsKeys, targetPrice, orderTradeNo, now, leaseSeconds)
}
func (catFKModelStore) ReleaseSlot(id int, version int64, holderToken, confirmedPrice string, now int64) (bool, error) {
	return model.ReleaseCatFKPriceSlot(id, version, holderToken, confirmedPrice, now)
}
func (catFKModelStore) QuarantineSlot(id int, version int64, holderToken, code string, now int64) (bool, error) {
	return model.QuarantineCatFKPriceSlot(id, version, holderToken, code, now)
}

type catFKMerchantHealthTracker struct {
	mu        sync.Mutex
	tokenHash string
	checked   bool
	valid     bool
	checkedAt int64
}

func catFKMerchantTokenHash(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	return fmt.Sprintf("%x", sha256.Sum256([]byte(trimmed)))
}

func (h *catFKMerchantHealthTracker) isInvalid(rawToken string) bool {
	hash := catFKMerchantTokenHash(rawToken)
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

func (h *catFKMerchantHealthTracker) shouldProbe(rawToken string, now int64) bool {
	hash := catFKMerchantTokenHash(rawToken)
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

func (h *catFKMerchantHealthTracker) record(rawToken string, valid bool, now int64) {
	if h == nil {
		return
	}
	hash := catFKMerchantTokenHash(rawToken)
	h.mu.Lock()
	defer h.mu.Unlock()
	h.tokenHash = hash
	h.checked = hash != ""
	h.valid = valid && hash != ""
	h.checkedAt = now
}

func (h *catFKMerchantHealthTracker) reset() {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	*h = catFKMerchantHealthTracker{}
}

type catFKOrderRateLimiter struct {
	mu      sync.Mutex
	buckets map[string][]int64
}

func (l *catFKOrderRateLimiter) allow(nowUnix int64, limit int, keys ...string) bool {
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
	defaultCatFKMerchantHealth catFKMerchantHealthTracker
	defaultCatFKOrderLimiter   catFKOrderRateLimiter
	defaultCatFKHTTPAdapter    = newCatFKHTTPAdapter()
)

func NotifyCatFKMerchantTokenUpdated() {
	defaultCatFKMerchantHealth.reset()
	defaultCatFKHTTPAdapter.ResetCache()
}

type catFKService struct {
	adapter   CatFKAdapter
	store     catFKStore
	setting   func() *operation_setting.CatFKSetting
	now       func() time.Time
	key       func() ([]byte, error)
	userGroup func(int) (string, error)
	health    *catFKMerchantHealthTracker
	limiter   *catFKOrderRateLimiter
	async     func(func())
	lazyMu    sync.Mutex
}

func (s *catFKService) healthTracker() *catFKMerchantHealthTracker {
	s.lazyMu.Lock()
	defer s.lazyMu.Unlock()
	if s.health == nil {
		s.health = &catFKMerchantHealthTracker{}
	}
	return s.health
}

func (s *catFKService) rateLimiter() *catFKOrderRateLimiter {
	s.lazyMu.Lock()
	defer s.lazyMu.Unlock()
	if s.limiter == nil {
		s.limiter = &catFKOrderRateLimiter{}
	}
	return s.limiter
}

func (s *catFKService) runAsync(fn func()) {
	if fn == nil {
		return
	}
	if s != nil && s.async != nil {
		s.async(fn)
		return
	}
	fn()
}

func catFKProductionService() *catFKService {
	return &catFKService{
		adapter:   defaultCatFKHTTPAdapter,
		store:     catFKModelStore{},
		setting:   operation_setting.GetCatFKSetting,
		now:       time.Now,
		key:       catFKEncryptionKey,
		userGroup: func(uid int) (string, error) { return model.GetUserGroup(uid, true) },
		health:    &defaultCatFKMerchantHealth,
		limiter:   &defaultCatFKOrderLimiter,
		async: func(fn func()) {
			go func() {
				defer func() { _ = recover() }()
				fn()
			}()
		},
	}
}

func CatFKProtocolReady() bool { return defaultCatFKHTTPAdapter.Ready() }

func catFKModeFromOrder(order *model.CatFKOrder) string {
	if order != nil && order.Mode == operation_setting.CatFKModeDirect {
		return operation_setting.CatFKModeDirect
	}
	return operation_setting.CatFKModeRedemption
}

func catFKConfiguredMode(cfg *operation_setting.CatFKSetting) string {
	if cfg == nil {
		return operation_setting.CatFKModeRedemption
	}
	switch cfg.Mode {
	case operation_setting.CatFKModeDirect, operation_setting.CatFKModeAuto:
		return cfg.Mode
	default:
		return operation_setting.CatFKModeRedemption
	}
}

func (s *catFKService) effectiveMode(cfg *operation_setting.CatFKSetting) (string, bool) {
	configured := catFKConfiguredMode(cfg)
	switch configured {
	case operation_setting.CatFKModeDirect:
		return operation_setting.CatFKModeDirect, false
	case operation_setting.CatFKModeAuto:
		merchantToken := strings.TrimSpace(cfg.MerchantToken)
		hasDirect := merchantToken != "" && len(catFKValidDirectSlotKeys(cfg)) > 0
		if hasDirect && !s.healthTracker().isInvalid(merchantToken) {
			return operation_setting.CatFKModeDirect, false
		}
		return operation_setting.CatFKModeRedemption, true
	default:
		return operation_setting.CatFKModeRedemption, false
	}
}

func (s *catFKService) probeAutoMerchantTokenIfDue(ctx context.Context) {
	cfg := s.setting()
	if cfg == nil || !cfg.Enabled || catFKConfiguredMode(cfg) != operation_setting.CatFKModeAuto {
		return
	}
	merchantToken := strings.TrimSpace(cfg.MerchantToken)
	now := s.now().Unix()
	if !s.healthTracker().shouldProbe(merchantToken, now) {
		return
	}
	valid, err := s.adapter.CheckMerchantToken(ctx, merchantToken)
	if err != nil {
		// Transient network errors must not flap customer mode.
		return
	}
	s.healthTracker().record(merchantToken, valid, now)
}

func CheckCatFKMerchantTokenStatus(ctx context.Context, candidateToken string) (*CatFKMerchantTokenStatus, error) {
	if !CatFKProtocolReady() {
		return nil, ErrCatFKProtocolUnverified
	}
	svc := catFKProductionService()
	cfg := svc.setting()
	configuredMode := catFKConfiguredMode(cfg)
	token := strings.TrimSpace(candidateToken)
	persistResult := false
	if token == "" {
		token = strings.TrimSpace(cfg.MerchantToken)
		persistResult = true
	}
	if token == "" {
		effMode, fallback := svc.effectiveMode(cfg)
		return &CatFKMerchantTokenStatus{
			Configured:     false,
			Valid:          false,
			ConfiguredMode: configuredMode,
			EffectiveMode:  effMode,
			FallbackActive: fallback,
		}, nil
	}
	valid, err := svc.adapter.CheckMerchantToken(ctx, token)
	if err != nil {
		return nil, catFKPublicError(err)
	}
	if persistResult {
		svc.healthTracker().record(token, valid, svc.now().Unix())
	}
	effMode, fallback := svc.effectiveMode(cfg)
	return &CatFKMerchantTokenStatus{
		Configured:     true,
		Valid:          valid,
		ConfiguredMode: configuredMode,
		EffectiveMode:  effMode,
		FallbackActive: fallback,
	}, nil
}

func catFKValidDirectSlotKeys(cfg *operation_setting.CatFKSetting) []string {
	if cfg == nil || len(cfg.DirectGoodsKeys) == 0 || len(cfg.DirectGoodsKeys) > 20 {
		return nil
	}
	redemptionKeys := make(map[string]bool, len(cfg.Products))
	for _, p := range cfg.Products {
		if key := strings.TrimSpace(p.GoodsKey); key != "" {
			redemptionKeys[key] = true
		}
	}
	result := make([]string, 0, len(cfg.DirectGoodsKeys))
	seen := make(map[string]bool, len(cfg.DirectGoodsKeys))
	for _, raw := range cfg.DirectGoodsKeys {
		normalized, err := operation_setting.NormalizeCatFKGoodsKey(raw)
		if err != nil || normalized == "" || seen[normalized] || redemptionKeys[normalized] {
			return nil
		}
		seen[normalized] = true
		result = append(result, normalized)
	}
	return result
}

func catFKChannelPaymentType(channel operation_setting.CatFKChannel) string {
	if channel.PaymentType != "" {
		return channel.PaymentType
	}
	return operation_setting.CatFKClassifyChannel(channel.Code, "", channel.Name)
}

func catFKPaymentMethod(cfg *operation_setting.CatFKSetting, channelID string) string {
	var channel *operation_setting.CatFKChannel
	for i := range cfg.Channels {
		if cfg.Channels[i].ID == channelID {
			channel = &cfg.Channels[i]
			break
		}
	}
	if channel == nil {
		return ""
	}

	paymentType := catFKChannelPaymentType(*channel)
	methodType := operation_setting.CatFKPaymentMethodAlipay
	if paymentType == "wxpay" {
		methodType = operation_setting.CatFKPaymentMethodWeChat
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

func catFKConfiguredChannel(cfg *operation_setting.CatFKSetting, channelID string) bool {
	return catFKPaymentMethod(cfg, channelID) != ""
}

func CatFKUnavailableReason() string {
	if !CatFKProtocolReady() {
		return ErrCatFKProtocolUnverified.Error()
	}
	svc := catFKProductionService()
	cfg := svc.setting()
	if !cfg.Enabled {
		return ErrCatFKDisabled.Error()
	}
	if _, err := catFKEncryptionKey(); err != nil {
		return ErrCatFKEncryptionKey.Error()
	}
	token, err := operation_setting.NormalizeCatFKStoreToken(cfg.StoreToken)
	if err != nil || token == "" {
		return "Invalid CatFK settings"
	}
	configured := catFKConfiguredMode(cfg)
	effMode, _ := svc.effectiveMode(cfg)
	switch configured {
	case operation_setting.CatFKModeDirect:
		if strings.TrimSpace(cfg.MerchantToken) == "" || len(catFKValidDirectSlotKeys(cfg)) == 0 {
			return "Direct-credit mode requires a CatFK merchant token and dedicated slot goods keys"
		}
	case operation_setting.CatFKModeAuto:
		if effMode == operation_setting.CatFKModeDirect {
			if strings.TrimSpace(cfg.MerchantToken) == "" || len(catFKValidDirectSlotKeys(cfg)) == 0 {
				return "Invalid CatFK settings"
			}
		} else if len(cfg.Products) == 0 {
			return "Invalid CatFK settings"
		}
	default:
		if len(cfg.Products) == 0 {
			return "Invalid CatFK settings"
		}
	}
	configuredChannel := false
	for _, channel := range cfg.Channels {
		if catFKConfiguredChannel(cfg, channel.ID) {
			configuredChannel = true
			break
		}
	}
	if !configuredChannel {
		return "No CatFK payment method is configured"
	}
	return ""
}

func CatFKPublicInfo() CatFKInfo {
	svc := catFKProductionService()
	cfg := svc.setting()
	reason := CatFKUnavailableReason()
	effMode, fallback := svc.effectiveMode(cfg)
	maxCNY, _ := catFKMaxCNYDecimal(cfg).Float64()
	info := CatFKInfo{
		Enabled:           cfg.Enabled && operation_setting.IsPaymentComplianceConfirmed(),
		Available:         reason == "",
		Mode:              effMode,
		ConfiguredMode:    catFKConfiguredMode(cfg),
		FallbackActive:    fallback,
		MaxAmountCNY:      maxCNY,
		UnavailableReason: reason,
		Products:          []CatFKPublicProduct{},
		Channels:          []operation_setting.CatFKChannel{},
	}
	if !operation_setting.IsPaymentComplianceConfirmed() {
		info.Available = false
		info.UnavailableReason = "Payment compliance confirmation is required"
	}
	for _, p := range cfg.Products {
		info.Products = append(info.Products, CatFKPublicProduct{ID: p.ID, Name: p.Name, Amount: p.Amount})
	}
	for _, channel := range cfg.Channels {
		if !catFKConfiguredChannel(cfg, channel.ID) {
			continue
		}
		info.Channels = append(info.Channels, operation_setting.CatFKChannel{
			ID:          channel.ID,
			Name:        channel.Name,
			Icon:        channel.Icon,
			PaymentType: catFKChannelPaymentType(channel),
		})
	}
	return info
}

func QuoteCatFK(ctx context.Context, userID int, productID, channelID string) (*CatFKQuote, error) {
	return QuoteCatFKRequest(ctx, userID, CatFKQuoteRequest{ProductID: productID, ChannelID: channelID})
}

func QuoteCatFKRequest(ctx context.Context, userID int, req CatFKQuoteRequest) (*CatFKQuote, error) {
	q, err := catFKProductionService().quoteRequest(ctx, userID, req)
	return q, catFKPublicError(err)
}

func CreateCatFKPayment(ctx context.Context, userID int, req CatFKPaymentRequest) (*CatFKPayment, error) {
	return CreateCatFKPaymentWithIP(ctx, userID, req, "")
}

func CreateCatFKPaymentWithIP(ctx context.Context, userID int, req CatFKPaymentRequest, clientIP string) (*CatFKPayment, error) {
	p, err := catFKProductionService().createWithIP(ctx, userID, req, clientIP)
	return p, catFKPublicError(err)
}

func GetUserCatFKPayment(ctx context.Context, userID int, tradeNo string) (*CatFKPayment, error) {
	if userID <= 0 || tradeNo == "" {
		return nil, ErrCatFKInvalidRequest
	}
	order, err := catFKProductionService().refresh(ctx, userID, tradeNo)
	if err != nil {
		return nil, ErrCatFKOrderUnavailable
	}
	return catFKSafePayment(order), nil
}

// GetCatFKOrderRedemption returns the code a completed order redeemed. Direct
// orders never use redemption codes and are rejected explicitly.
func GetCatFKOrderRedemption(viewerID int, tradeNo string, canViewAnyOrder bool) (*CatFKRedemption, error) {
	if viewerID <= 0 || tradeNo == "" {
		return nil, ErrCatFKInvalidRequest
	}
	var (
		redemption *model.Redemption
		err        error
	)
	if canViewAnyOrder {
		redemption, err = model.GetCatFKRedemptionByTradeNo(tradeNo)
	} else {
		redemption, err = model.GetCatFKRedemptionForUser(viewerID, tradeNo)
	}
	if errors.Is(err, model.ErrCatFKOrderConflict) {
		return nil, ErrCatFKRedemptionPending
	}
	if err != nil {
		return nil, ErrCatFKOrderUnavailable
	}
	return &CatFKRedemption{Key: redemption.Key, Quota: redemption.Quota, RedeemedTime: redemption.RedeemedTime}, nil
}

func ListCatFKChannels(ctx context.Context, token string) ([]operation_setting.CatFKChannel, error) {
	if !CatFKProtocolReady() {
		return nil, ErrCatFKProtocolUnverified
	}
	channels, err := catFKProductionService().adapter.Channels(ctx, token)
	return channels, catFKPublicError(err)
}

func ResetQuarantinedCatFKSlots() (int64, error) {
	cfg := operation_setting.GetCatFKSetting()
	token, err := operation_setting.NormalizeCatFKStoreToken(cfg.StoreToken)
	if err != nil || token == "" {
		return 0, ErrCatFKInvalidRequest
	}
	count, err := model.ResetQuarantinedCatFKPriceSlots(token, time.Now().Unix())
	return count, catFKPublicError(err)
}

func catFKSafePayment(o *model.CatFKOrder) *CatFKPayment {
	p := &CatFKPayment{TradeNo: o.TradeNo, Status: o.Status, PaymentMethod: o.PaymentMethod, Mode: catFKModeFromOrder(o)}
	switch o.FailureCode {
	case "creation_unknown", "verification_mismatch", "credential_unavailable", "settlement_failed", "delivery_invalid", "payment_regressed":
		p.FailureCode = o.FailureCode
	}
	if o.Status == model.CatFKOrderStatusPending {
		if catFKValidPaymentQRCode(o.PaymentQRCode, o.PaymentMethod) {
			p.PaymentQRCode = o.PaymentQRCode
		}
		if p.PaymentQRCode == "" && o.PaymentMethod != model.PaymentMethodCatFKWeChat && len(o.PaymentURL) <= 2048 && catFKValidPaymentURL(o.PaymentURL) {
			p.PaymentQRCode = o.PaymentURL
		}
	}
	return p
}

func catFKEncryptionKey() ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(os.Getenv("CATFK_ORDER_ENCRYPTION_KEY"))
	if err != nil || len(key) != 32 {
		return nil, ErrCatFKEncryptionKey
	}
	return key, nil
}

// Both quote snapshots and recovery credentials use separate domain prefixes;
// credentials additionally bind the user and immutable local trade number.
func catFKSeal(key []byte, purpose string, value any) (string, error) {
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

func catFKOpen(key []byte, purpose, token string, value any) error {
	if len(token) > 32768 {
		return ErrCatFKInvalidQuote
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
		return ErrCatFKInvalidQuote
	}
	plain, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], []byte(purpose))
	if err != nil {
		return err
	}
	return common.Unmarshal(plain, value)
}

type catFKQuoteSnapshot struct {
	UserID        int
	Mode          string
	TierID        string
	ProductID     string
	RequestAmount int64
	BaseAmount    string
	ChannelID     string
	ConfigHash    string
	ExpiresAt     int64
	Quota         int
	TopUpAmount   float64
	Offer         CatFKOffer
}

func catFKConfigHash(cfg *operation_setting.CatFKSetting) string {
	data, _ := common.Marshal(cfg)
	return fmt.Sprintf("%x", sha256.Sum256(data))
}

func catFKMaxCNYDecimal(cfg *operation_setting.CatFKSetting) decimal.Decimal {
	if cfg != nil && cfg.MaxAmountCNY >= 1 && cfg.MaxAmountCNY <= 1000000 && !math.IsNaN(cfg.MaxAmountCNY) && !math.IsInf(cfg.MaxAmountCNY, 0) {
		return decimal.NewFromFloat(cfg.MaxAmountCNY).Round(2)
	}
	return decimal.NewFromFloat(operation_setting.CatFKDefaultMaxAmountCNY)
}

func (s *catFKService) computeDirectPricing(userID int, amount int64) (quota int, topUpUSD float64, baseCNY decimal.Decimal, err error) {
	if amount <= 0 || common.QuotaPerUnit <= 0 {
		return 0, 0, decimal.Zero, ErrCatFKInvalidRequest
	}
	minTopUp := int64(operation_setting.MinTopUp)
	quotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		minQuota, minErr := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(minTopUp).Mul(quotaPerUnit))
		if minErr != nil {
			return 0, 0, decimal.Zero, ErrCatFKInvalidRequest
		}
		minTopUp = int64(minQuota)
	}
	if amount < minTopUp {
		return 0, 0, decimal.Zero, ErrCatFKInvalidRequest
	}
	var unitsDecimal decimal.Decimal
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		unitsDecimal = decimal.NewFromInt(decimal.NewFromInt(amount).Div(quotaPerUnit).IntPart())
	} else {
		unitsDecimal = decimal.NewFromInt(amount)
	}
	quota, err = common.WalletQuotaFromDecimalStrict(unitsDecimal.Mul(quotaPerUnit))
	if err != nil || quota <= 0 {
		return 0, 0, decimal.Zero, ErrCatFKInvalidRequest
	}
	topUpUSD, _ = unitsDecimal.Float64()

	group := "default"
	if s.userGroup != nil {
		group, err = s.userGroup(userID)
		if err != nil {
			return 0, 0, decimal.Zero, ErrCatFKOrderUnavailable
		}
	}
	groupRatio := common.GetTopupGroupRatio(group)
	if groupRatio <= 0 || math.IsNaN(groupRatio) || math.IsInf(groupRatio, 0) {
		groupRatio = 1
	}
	priceRatio := operation_setting.Price
	if priceRatio <= 0 || math.IsNaN(priceRatio) || math.IsInf(priceRatio, 0) {
		return 0, 0, decimal.Zero, ErrCatFKInvalidRequest
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
		return 0, 0, decimal.Zero, ErrCatFKInvalidRequest
	}
	maxCNY := catFKMaxCNYDecimal(s.setting())
	if baseCNY.GreaterThan(maxCNY) {
		return 0, 0, decimal.Zero, catFKMaxAmountError(maxCNY)
	}
	return quota, topUpUSD, baseCNY, nil
}

func (s *catFKService) quote(ctx context.Context, userID int, productID, channelID string) (*CatFKQuote, error) {
	return s.quoteRequest(ctx, userID, CatFKQuoteRequest{ProductID: productID, ChannelID: channelID})
}

func (s *catFKService) quoteRedemptionProduct(ctx context.Context, userID int, cfg *operation_setting.CatFKSetting, product *operation_setting.CatFKProduct, channelID string) (quota int, topUpAmount float64, offer *CatFKOffer, err error) {
	if product == nil || product.GoodsKey == "" || math.IsNaN(product.Amount) || math.IsInf(product.Amount, 0) || product.Amount <= 0 {
		return 0, 0, nil, ErrCatFKInvalidRequest
	}
	quota, err = common.WalletQuotaFromDecimalStrict(decimal.NewFromFloat(product.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	if err != nil || quota <= 0 {
		return 0, 0, nil, ErrCatFKInvalidRequest
	}
	if err = s.store.Capacity(userID, quota); err != nil {
		return 0, 0, nil, err
	}
	offer, err = s.adapter.Quote(ctx, cfg.StoreToken, product.GoodsKey, channelID)
	if err != nil {
		return 0, 0, nil, err
	}
	if offer == nil || offer.ShopID == "" || offer.ProductID != product.GoodsKey || offer.ChannelID != channelID || offer.Currency == "" || offer.Quantity != 1 || !offer.InStock {
		return 0, 0, nil, ErrCatFKVerification
	}
	return quota, product.Amount, offer, nil
}

func findCatFKProductByAmount(products []operation_setting.CatFKProduct, usdAmount float64) *operation_setting.CatFKProduct {
	for i := range products {
		if math.Abs(products[i].Amount-usdAmount) < 1e-9 {
			return &products[i]
		}
	}
	return nil
}

func (s *catFKService) quoteRequest(ctx context.Context, userID int, req CatFKQuoteRequest) (*CatFKQuote, error) {
	if !s.adapter.Ready() {
		return nil, ErrCatFKProtocolUnverified
	}
	cfg := s.setting()
	if !cfg.Enabled {
		return nil, ErrCatFKDisabled
	}
	key, err := s.key()
	if err != nil {
		return nil, err
	}
	if userID <= 0 || !catFKConfiguredChannel(cfg, req.ChannelID) {
		return nil, ErrCatFKInvalidRequest
	}
	configuredMode := catFKConfiguredMode(cfg)
	mode, _ := s.effectiveMode(cfg)
	var (
		tierID        string
		productID     string
		requestAmount int64
		baseAmount    string
		quota         int
		topUpAmount   float64
		offer         *CatFKOffer
	)
	if mode == operation_setting.CatFKModeDirect {
		if req.Amount == nil || *req.Amount <= 0 || req.ProductID != "" {
			// In auto mode, also accept explicit product_id quotes if a client sent a redemption request.
			if configuredMode == operation_setting.CatFKModeAuto && req.Amount == nil && req.ProductID != "" {
				mode = operation_setting.CatFKModeRedemption
			} else {
				return nil, ErrCatFKInvalidRequest
			}
		}
	}
	if mode == operation_setting.CatFKModeDirect {
		storeToken, tokenErr := operation_setting.NormalizeCatFKStoreToken(cfg.StoreToken)
		slotKeys := catFKValidDirectSlotKeys(cfg)
		merchantToken := strings.TrimSpace(cfg.MerchantToken)
		if tokenErr != nil || storeToken == "" || merchantToken == "" || len(slotKeys) == 0 {
			return nil, ErrCatFKOrderUnavailable
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
		offer, err = s.adapter.QuoteDirect(ctx, storeToken, merchantToken, slotKeys[0], req.ChannelID, baseAmount)
		if err != nil {
			if configuredMode == operation_setting.CatFKModeAuto && errors.Is(err, errCatFKMerchantAuthExpired) {
				s.healthTracker().record(merchantToken, false, s.now().Unix())
				matched := findCatFKProductByAmount(cfg.Products, topUpAmount)
				if matched == nil {
					return nil, ErrCatFKCustomAmountFallback
				}
				mode = operation_setting.CatFKModeRedemption
				requestAmount = 0
				baseAmount = ""
				tierID = matched.ID
				productID = matched.ID
				quota, topUpAmount, offer, err = s.quoteRedemptionProduct(ctx, userID, cfg, matched, req.ChannelID)
				if err != nil {
					return nil, err
				}
			} else {
				return nil, err
			}
		} else {
			s.healthTracker().record(merchantToken, true, s.now().Unix())
			if offer == nil || offer.ShopID == "" || !slices.Contains(slotKeys, offer.ProductID) || offer.ChannelID != req.ChannelID || offer.Currency == "" || offer.Quantity != 1 || !offer.InStock {
				return nil, ErrCatFKVerification
			}
		}
	} else {
		var product *operation_setting.CatFKProduct
		if req.Amount != nil {
			if configuredMode != operation_setting.CatFKModeAuto || *req.Amount <= 0 || req.ProductID != "" {
				return nil, ErrCatFKInvalidRequest
			}
			_, requestedUSD, _, priceErr := s.computeDirectPricing(userID, *req.Amount)
			if priceErr != nil {
				return nil, priceErr
			}
			product = findCatFKProductByAmount(cfg.Products, requestedUSD)
			if product == nil {
				return nil, ErrCatFKCustomAmountFallback
			}
		} else {
			if req.ProductID == "" {
				return nil, ErrCatFKInvalidRequest
			}
			for i := range cfg.Products {
				if cfg.Products[i].ID == req.ProductID {
					product = &cfg.Products[i]
					break
				}
			}
		}
		if product == nil {
			return nil, ErrCatFKInvalidRequest
		}
		tierID = product.ID
		productID = product.ID
		quota, topUpAmount, offer, err = s.quoteRedemptionProduct(ctx, userID, cfg, product, req.ChannelID)
		if err != nil {
			return nil, err
		}
	}
	amount, err := decimal.NewFromString(offer.Amount)
	if err != nil || !amount.IsPositive() {
		return nil, ErrCatFKVerification
	}
	if mode == operation_setting.CatFKModeDirect {
		maxCNY := catFKMaxCNYDecimal(cfg)
		if amount.GreaterThan(maxCNY) {
			return nil, catFKMaxAmountError(maxCNY)
		}
	}
	amountFloat, _ := amount.Float64()
	if math.IsInf(amountFloat, 0) || math.IsNaN(amountFloat) {
		return nil, ErrCatFKVerification
	}
	snap := catFKQuoteSnapshot{
		UserID:        userID,
		Mode:          mode,
		TierID:        tierID,
		ProductID:     productID,
		RequestAmount: requestAmount,
		BaseAmount:    baseAmount,
		ChannelID:     req.ChannelID,
		ConfigHash:    catFKConfigHash(cfg),
		ExpiresAt:     s.now().Add(5 * time.Minute).Unix(),
		Quota:         quota,
		TopUpAmount:   topUpAmount,
		Offer:         *offer,
	}
	token, err := catFKSeal(key, "catfk/quote/v1", snap)
	if err != nil {
		return nil, err
	}
	result := &CatFKQuote{
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

func isValidCatFKQQ(qq string) bool {
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

func catFKAmountsEqual(a, b string) bool {
	da, ea := decimal.NewFromString(a)
	db, eb := decimal.NewFromString(b)
	return ea == nil && eb == nil && da.IsPositive() && da.Equal(db)
}

func (s *catFKService) create(ctx context.Context, userID int, req CatFKPaymentRequest) (*CatFKPayment, error) {
	return s.createWithIP(ctx, userID, req, "")
}

func (s *catFKService) createWithIP(ctx context.Context, userID int, req CatFKPaymentRequest, clientIP string) (*CatFKPayment, error) {
	if !s.adapter.Ready() {
		return nil, ErrCatFKProtocolUnverified
	}
	if userID <= 0 || req.ChannelID == "" || len(req.IdempotencyKey) < 16 || len(req.IdempotencyKey) > 128 {
		return nil, ErrCatFKInvalidRequest
	}
	expectedTierID := req.ProductID
	if req.Amount != nil {
		if *req.Amount <= 0 || req.ProductID != "" {
			return nil, ErrCatFKInvalidRequest
		}
		expectedTierID = fmt.Sprintf("direct:%d", *req.Amount)
	} else if req.ProductID == "" {
		return nil, ErrCatFKInvalidRequest
	}
	// Recovery is account-scoped and does not depend on an expired quote,
	// disabled new purchases, or a changed shop configuration.
	existing, err := s.store.Find(userID, req.IdempotencyKey)
	if err != nil {
		return nil, ErrCatFKOrderUnavailable
	}
	if existing != nil {
		if existing.TierID != expectedTierID || existing.ChannelID != req.ChannelID {
			return nil, ErrCatFKInvalidRequest
		}
		if catFKModeFromOrder(existing) == operation_setting.CatFKModeRedemption && !isValidCatFKQQ(req.QQ) {
			return nil, ErrCatFKInvalidRequest
		}
		return catFKSafePayment(existing), nil
	}
	cfg := s.setting()
	if !cfg.Enabled {
		return nil, ErrCatFKDisabled
	}
	if !catFKConfiguredChannel(cfg, req.ChannelID) {
		return nil, ErrCatFKInvalidRequest
	}
	configuredMode := catFKConfiguredMode(cfg)
	if configuredMode == operation_setting.CatFKModeRedemption && (req.Amount != nil || !isValidCatFKQQ(req.QQ)) {
		return nil, ErrCatFKInvalidRequest
	}
	if configuredMode == operation_setting.CatFKModeDirect && (req.Amount == nil || *req.Amount <= 0 || req.ProductID != "") {
		return nil, ErrCatFKInvalidRequest
	}
	key, err := s.key()
	if err != nil {
		return nil, err
	}
	var snap catFKQuoteSnapshot
	if err = catFKOpen(key, "catfk/quote/v1", req.QuoteID, &snap); err != nil || snap.UserID != userID || snap.TierID != expectedTierID || snap.ChannelID != req.ChannelID || snap.ConfigHash != catFKConfigHash(cfg) || snap.ExpiresAt <= s.now().Unix() {
		return nil, ErrCatFKInvalidQuote
	}
	mode := snap.Mode
	if mode != operation_setting.CatFKModeRedemption && mode != operation_setting.CatFKModeDirect {
		return nil, ErrCatFKInvalidQuote
	}
	if configuredMode != operation_setting.CatFKModeAuto && mode != configuredMode {
		return nil, ErrCatFKInvalidQuote
	}
	if mode == operation_setting.CatFKModeRedemption {
		if req.Amount != nil || !isValidCatFKQQ(req.QQ) {
			return nil, ErrCatFKInvalidRequest
		}
	} else {
		if req.Amount == nil || *req.Amount <= 0 || req.ProductID != "" {
			return nil, ErrCatFKInvalidRequest
		}
		if configuredMode == operation_setting.CatFKModeAuto && s.healthTracker().isInvalid(cfg.MerchantToken) {
			return nil, ErrCatFKInvalidQuote
		}
	}
	if err = s.store.Capacity(userID, snap.Quota); err != nil {
		return nil, err
	}
	maxOrdersPerMin := cfg.MaxOrdersPerMinute
	if maxOrdersPerMin <= 0 {
		maxOrdersPerMin = operation_setting.CatFKDefaultMaxOrdersPerMinute
	}
	ipKey := ""
	if trimmedIP := strings.TrimSpace(clientIP); trimmedIP != "" {
		ipKey = "ip:" + trimmedIP
	}
	if !s.rateLimiter().allow(s.now().Unix(), maxOrdersPerMin, fmt.Sprintf("user:%d", userID), ipKey) {
		return nil, ErrCatFKRateLimited
	}

	trade := "catfk_" + common.GetUUID()
	selectedGoodsKey := snap.Offer.ProductID
	expectedContact := req.QQ
	var (
		slot           *model.CatFKPriceSlot
		confirmedPrice string
	)
	if mode == operation_setting.CatFKModeDirect {
		freshQuota, _, freshBaseCNY, priceErr := s.computeDirectPricing(userID, snap.RequestAmount)
		if priceErr != nil {
			return nil, priceErr
		}
		if freshQuota != snap.Quota || freshBaseCNY.StringFixed(2) != snap.BaseAmount {
			return nil, ErrCatFKInvalidQuote
		}
		storeToken, tokenErr := operation_setting.NormalizeCatFKStoreToken(cfg.StoreToken)
		slotKeys := catFKValidDirectSlotKeys(cfg)
		merchantToken := strings.TrimSpace(cfg.MerchantToken)
		if tokenErr != nil || storeToken == "" || merchantToken == "" || len(slotKeys) == 0 {
			return nil, ErrCatFKOrderUnavailable
		}
		var acquired bool
		slot, acquired, err = s.store.AcquireSlot(storeToken, slotKeys, snap.BaseAmount, trade, s.now().Unix(), 90)
		if err != nil {
			return nil, ErrCatFKOrderUnavailable
		}
		if !acquired || slot == nil {
			return nil, ErrCatFKSlotBusy
		}
		minStock := cfg.AutoRestockMin
		if minStock <= 0 {
			minStock = operation_setting.CatFKDefaultAutoRestockMin
		}
		restockBatch := cfg.AutoRestockBatch
		if restockBatch <= 0 {
			restockBatch = operation_setting.CatFKDefaultAutoRestockBatch
		}
		ready, prepErr := s.adapter.PrepareDirectSlot(ctx, storeToken, merchantToken, slot.GoodsKey, req.ChannelID, snap.BaseAmount, slot.ConfirmedPrice, minStock, restockBatch)
		if prepErr != nil {
			if errors.Is(prepErr, errCatFKMerchantAuthExpired) {
				s.healthTracker().record(merchantToken, false, s.now().Unix())
				_, _ = s.store.ReleaseSlot(slot.ID, slot.Version, slot.HolderToken, slot.ConfirmedPrice, s.now().Unix())
				if configuredMode == operation_setting.CatFKModeAuto {
					return nil, ErrCatFKInvalidQuote
				}
				return nil, ErrCatFKOrderUnavailable
			}
			if errors.Is(prepErr, errCatFKSlotAmbiguous) {
				_, _ = s.store.QuarantineSlot(slot.ID, slot.Version, slot.HolderToken, "prepare_ambiguous", s.now().Unix())
			} else {
				_, _ = s.store.ReleaseSlot(slot.ID, slot.Version, slot.HolderToken, slot.ConfirmedPrice, s.now().Unix())
			}
			return nil, prepErr
		}
		s.healthTracker().record(merchantToken, true, s.now().Unix())
		if ready == nil || !ready.Offer.InStock || ready.Offer.Quantity != 1 || ready.Offer.ShopID != snap.Offer.ShopID || ready.Offer.ProductID != slot.GoodsKey || ready.Offer.ChannelID != snap.Offer.ChannelID || !catFKAmountsEqual(ready.Offer.Amount, snap.Offer.Amount) || ready.Offer.Currency != snap.Offer.Currency {
			confirmed := slot.ConfirmedPrice
			if ready != nil && ready.ConfirmedPrice != "" {
				confirmed = ready.ConfirmedPrice
			}
			_, _ = s.store.ReleaseSlot(slot.ID, slot.Version, slot.HolderToken, confirmed, s.now().Unix())
			return nil, ErrCatFKInvalidQuote
		}
		selectedGoodsKey = slot.GoodsKey
		confirmedPrice = ready.ConfirmedPrice
		expectedContact = trade
	} else {
		// Re-price immediately before persistence. A changed purchase requires a
		// new confirmation rather than silently accepting a higher upstream amount.
		fresh, quoteErr := s.adapter.Quote(ctx, cfg.StoreToken, snap.Offer.ProductID, req.ChannelID)
		if quoteErr != nil {
			return nil, quoteErr
		}
		if fresh == nil || !fresh.InStock || fresh.Quantity != 1 || fresh.ShopID != snap.Offer.ShopID || fresh.ProductID != snap.Offer.ProductID || fresh.ChannelID != snap.Offer.ChannelID || !catFKAmountsEqual(fresh.Amount, snap.Offer.Amount) || fresh.Currency != snap.Offer.Currency {
			return nil, ErrCatFKInvalidQuote
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

	paymentMethod := catFKPaymentMethod(cfg, req.ChannelID)
	password := make([]byte, 32)
	if _, err = rand.Read(password); err != nil {
		releaseSlotClean()
		return nil, err
	}
	credentials := CatFKCredentials{Visitor: common.GetUUID(), Password: base64.RawURLEncoding.EncodeToString(password)}
	ciphertext, err := catFKSeal(key, fmt.Sprintf("catfk/order/v1/%d/%s", userID, trade), credentials)
	if err != nil {
		releaseSlotClean()
		return nil, err
	}
	order := &model.CatFKOrder{
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
		Status:               model.CatFKOrderStatusNew,
		NextQueryAt:          s.now().Unix(),
		CredentialCiphertext: ciphertext,
		IdempotencyKey:       req.IdempotencyKey,
	}
	order, alreadyExists, err := s.store.Create(order)
	if err != nil {
		releaseSlotClean()
		return nil, ErrCatFKOrderUnavailable
	}
	if alreadyExists {
		releaseSlotClean()
		if order.TierID != expectedTierID || order.ChannelID != req.ChannelID {
			return nil, ErrCatFKInvalidRequest
		}
		return catFKSafePayment(order), nil
	}
	claimed, ok, err := s.store.Claim(order.ID, s.now().Unix(), 120)
	if err != nil {
		releaseSlotClean()
		return nil, err
	}
	if !ok {
		releaseSlotClean()
		return catFKSafePayment(order), nil
	}
	// Only the creator may submit after claiming the new state. Recovery never
	// calls Create, including when a request timed out after reaching upstream.
	if claimed.Status != model.CatFKOrderStatusSubmitting {
		releaseSlotClean()
		return catFKSafePayment(claimed), nil
	}
	createCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	result, createErr := s.adapter.Create(createCtx, claimed, credentials, expectedContact)
	if mode == operation_setting.CatFKModeDirect && errors.Is(createErr, errCatFKOutOfStock) && (result == nil || result.UpstreamOrderID == "") {
		storeToken, _ := operation_setting.NormalizeCatFKStoreToken(cfg.StoreToken)
		merchantToken := strings.TrimSpace(cfg.MerchantToken)
		minStock := cfg.AutoRestockMin
		if minStock <= 0 {
			minStock = operation_setting.CatFKDefaultAutoRestockMin
		}
		restockBatch := cfg.AutoRestockBatch
		if restockBatch <= 0 {
			restockBatch = operation_setting.CatFKDefaultAutoRestockBatch
		}
		if _, restockErr := s.adapter.ReplenishDirectSlot(createCtx, storeToken, merchantToken, selectedGoodsKey, minStock, restockBatch, true); restockErr != nil {
			if errors.Is(restockErr, errCatFKMerchantAuthExpired) {
				s.healthTracker().record(merchantToken, false, s.now().Unix())
			}
		} else {
			retryCredentials := credentials
			if result != nil && result.Credentials != nil {
				retryCredentials = *result.Credentials
			}
			result, createErr = s.adapter.Create(createCtx, claimed, retryCredentials, expectedContact)
		}
	}
	cancel()

	if errors.Is(createErr, errCatFKOutOfStock) && (result == nil || result.UpstreamOrderID == "") {
		releaseSlotClean()
		_, _ = s.store.Update(claimed.ID, claimed.Version, model.CatFKOrderUpdate{Status: model.CatFKOrderStatusExpired, NextQueryAt: 0})
		return nil, ErrCatFKOrderUnavailable
	}

	update := model.CatFKOrderUpdate{Status: model.CatFKOrderStatusCreationUnknown, FailureCode: "creation_unknown", NextQueryAt: s.now().Add(time.Minute).Unix()}
	// A received identifier is valuable for recovery even if the verification
	// query fails. It never authorizes payment navigation or wallet credit.
	if result != nil && result.UpstreamOrderID != "" && len(result.UpstreamOrderID) <= 128 && !strings.ContainsAny(result.UpstreamOrderID, " \t\r\n\x00") {
		update.UpstreamOrderID = &result.UpstreamOrderID
		update.NextQueryAt = s.now().Add(15 * time.Second).Unix()
		if catFKValidPaymentURL(result.PaymentURL) {
			update.PaymentURL = &result.PaymentURL
		}
	}
	// Persist refreshed cookies even when the create result is ambiguous. An
	// adapter must return any obtained recovery credentials on error as well.
	if result != nil && result.Credentials != nil {
		encrypted, sealErr := catFKSeal(key, fmt.Sprintf("catfk/order/v1/%d/%s", userID, trade), *result.Credentials)
		if sealErr != nil {
			quarantineSlot("create_ambiguous")
			return nil, sealErr
		}
		update.CredentialCiphertext = &encrypted
	}
	if errors.Is(createErr, ErrCatFKVerification) {
		update.Status = model.CatFKOrderStatusNeedsAttention
		update.FailureCode = "verification_mismatch"
		update.NextQueryAt = 0
	}
	orderLockedRemote := false
	if createErr == nil && result != nil && result.UpstreamOrderID != "" && catFKValidPaymentURL(result.PaymentURL) {
		if result.Evidence.UpstreamOrderID == result.UpstreamOrderID && catFKMatchesPurchase(claimed, &result.Evidence) {
			update.Status = model.CatFKOrderStatusPending
			update.FailureCode = ""
			update.UpstreamOrderID = &result.UpstreamOrderID
			update.PaymentURL = &result.PaymentURL
			if catFKValidPaymentQRCode(result.PaymentQRCode, claimed.PaymentMethod) {
				update.PaymentQRCode = &result.PaymentQRCode
			}
			update.NextQueryAt = s.now().Add(15 * time.Second).Unix()
			orderLockedRemote = true
		} else {
			update.Status = model.CatFKOrderStatusNeedsAttention
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
	return catFKSafePayment(saved), nil
}

func catFKValidPaymentQRCode(raw, paymentMethod string) bool {
	if paymentMethod == model.PaymentMethodCatFKWeChat {
		return len(raw) <= 2048 && (catFKWeChatQRPattern.MatchString(raw) || catFKValidWeChatJspayQR(raw))
	}
	return len(raw) <= 2048 && catFKValidPaymentURL(raw)
}

func catFKValidWeChatJspayQR(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host != "catfk.com" || u.User != nil || u.Fragment != "" || u.RawPath != "" || u.Path != "/payApi/WeixinJspay/pay.html" {
		return false
	}
	params, err := url.ParseQuery(u.RawQuery)
	return err == nil && len(params) == 1 && len(params["trade_no"]) == 1 && catFKCashierTradeNoPattern.MatchString(params.Get("trade_no"))
}

func catFKValidPaymentURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && u.Fragment == ""
}

func catFKPublicError(err error) error {
	if err == nil {
		return nil
	}
	switch err {
	case ErrCatFKProtocolUnverified, ErrCatFKDisabled, ErrCatFKEncryptionKey, ErrCatFKInvalidRequest, ErrCatFKInvalidQuote, ErrCatFKVerification, ErrCatFKOrderUnavailable, ErrCatFKSlotBusy, ErrCatFKRateLimited, ErrCatFKCustomAmountFallback, ErrCatFKRedemptionPending:
		return err
	}
	var msg *common.Message
	if errors.As(err, &msg) && msg.Key == catFKMaxAmountMessageKey {
		return msg
	}
	return ErrCatFKOrderUnavailable
}

// catFKMatchesPurchase validates upstream trade, shop, goods, quantity, contact
// and exact amount. Channel/currency remain local purchase metadata unless also
// returned by upstream, in which case they must match.
func catFKMatchesPurchase(order *model.CatFKOrder, e *CatFKOrderEvidence) bool {
	actual, ae := decimal.NewFromString(e.Amount)
	expected, ee := decimal.NewFromString(order.PriceAmount)
	if e.UpstreamOrderID == "" || (order.UpstreamOrderID != nil && *order.UpstreamOrderID != e.UpstreamOrderID) || e.ShopID != order.ShopID || e.ProductID != order.ProductID || (e.ChannelID != "" && e.ChannelID != order.ChannelID) || e.Quantity != 1 || ae != nil || ee != nil || !actual.IsPositive() || !actual.Equal(expected) || (e.Currency != "" && e.Currency != order.Currency) {
		return false
	}
	if catFKModeFromOrder(order) == operation_setting.CatFKModeDirect {
		return order.ExpectedContact != "" && e.Contact == order.ExpectedContact
	}
	if order.ExpectedContact != "" && e.Contact != "" && e.Contact != order.ExpectedContact {
		return false
	}
	return true
}
