package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

const (
	jingSoftResponseLimit  = 2 << 20
	jingSoftShopCacheTTL   = 5 * time.Minute
	jingSoftDetailCacheTTL = 5 * time.Minute
	jingSoftGoodsIDTTL     = 10 * time.Minute
	jingSoftPriceSampleTTL = 45 * time.Second
)

type jingSoftPriceSample struct {
	OriginalAmount *decimal.Decimal `json:"original_amount"`
	Fee            *decimal.Decimal `json:"fee"`
	FeePayer       *int             `json:"fee_payer"`
	TotalAmount    *decimal.Decimal `json:"total_amount"`
}

type jingSoftCachedShop struct {
	shop      jingSoftShop
	expiresAt time.Time
}

type jingSoftCachedChannels struct {
	channels  []jingSoftChannelWire
	expiresAt time.Time
}

type jingSoftCachedGoodsID struct {
	id        int
	expiresAt time.Time
}

type jingSoftCachedDetail struct {
	detail    jingSoftMerchantGoodsDetail
	expiresAt time.Time
}

type jingSoftCachedDirectGoods struct {
	goods     jingSoftGoods
	expiresAt time.Time
}

type jingSoftCachedPriceSample struct {
	sample    jingSoftPriceSample
	expiresAt time.Time
}

type jingSoftMerchantCache struct {
	mu           sync.Mutex
	shops        map[string]jingSoftCachedShop
	channels     map[string]jingSoftCachedChannels
	goodsIDs     map[string]jingSoftCachedGoodsID
	details      map[string]jingSoftCachedDetail
	directGoods  map[string]jingSoftCachedDirectGoods
	priceSamples map[string]jingSoftCachedPriceSample
}

func newJingSoftMerchantCache() *jingSoftMerchantCache {
	return &jingSoftMerchantCache{
		shops:        make(map[string]jingSoftCachedShop),
		channels:     make(map[string]jingSoftCachedChannels),
		goodsIDs:     make(map[string]jingSoftCachedGoodsID),
		details:      make(map[string]jingSoftCachedDetail),
		directGoods:  make(map[string]jingSoftCachedDirectGoods),
		priceSamples: make(map[string]jingSoftCachedPriceSample),
	}
}

func (c *jingSoftMerchantCache) reset() {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.shops = make(map[string]jingSoftCachedShop)
	c.channels = make(map[string]jingSoftCachedChannels)
	c.goodsIDs = make(map[string]jingSoftCachedGoodsID)
	c.details = make(map[string]jingSoftCachedDetail)
	c.directGoods = make(map[string]jingSoftCachedDirectGoods)
	c.priceSamples = make(map[string]jingSoftCachedPriceSample)
}

func (c *jingSoftMerchantCache) getShop(cacheKey string, now time.Time) (jingSoftShop, bool) {
	if c == nil {
		return jingSoftShop{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.shops[cacheKey]
	if !ok || !now.Before(entry.expiresAt) {
		return jingSoftShop{}, false
	}
	return entry.shop, true
}

func (c *jingSoftMerchantCache) setShop(cacheKey string, shop jingSoftShop, now time.Time) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.shops[cacheKey] = jingSoftCachedShop{shop: shop, expiresAt: now.Add(jingSoftShopCacheTTL)}
}

func (c *jingSoftMerchantCache) getChannels(cacheKey string, now time.Time) ([]jingSoftChannelWire, bool) {
	if c == nil {
		return nil, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.channels[cacheKey]
	if !ok || !now.Before(entry.expiresAt) {
		return nil, false
	}
	copied := make([]jingSoftChannelWire, len(entry.channels))
	copy(copied, entry.channels)
	return copied, true
}

func (c *jingSoftMerchantCache) setChannels(cacheKey string, channels []jingSoftChannelWire, now time.Time) {
	if c == nil {
		return
	}
	copied := make([]jingSoftChannelWire, len(channels))
	copy(copied, channels)
	c.mu.Lock()
	defer c.mu.Unlock()
	c.channels[cacheKey] = jingSoftCachedChannels{channels: copied, expiresAt: now.Add(jingSoftShopCacheTTL)}
}

func (c *jingSoftMerchantCache) getGoodsID(scope, goodsKey string, now time.Time) (int, bool) {
	if c == nil {
		return 0, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.goodsIDs[scope+":"+goodsKey]
	if !ok || !now.Before(entry.expiresAt) {
		return 0, false
	}
	return entry.id, true
}

func (c *jingSoftMerchantCache) setGoodsID(scope, goodsKey string, id int, now time.Time) {
	if c == nil || id <= 0 || goodsKey == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.goodsIDs[scope+":"+goodsKey] = jingSoftCachedGoodsID{id: id, expiresAt: now.Add(jingSoftGoodsIDTTL)}
}

func (c *jingSoftMerchantCache) getDetail(scope string, goodsID int, now time.Time) (jingSoftMerchantGoodsDetail, bool) {
	if c == nil {
		return jingSoftMerchantGoodsDetail{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.details[scope+":"+strconv.Itoa(goodsID)]
	if !ok || !now.Before(entry.expiresAt) {
		return jingSoftMerchantGoodsDetail{}, false
	}
	return entry.detail, true
}

func (c *jingSoftMerchantCache) setDetail(scope string, detail jingSoftMerchantGoodsDetail, now time.Time) {
	if c == nil || detail.ID <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.details[scope+":"+strconv.Itoa(detail.ID)] = jingSoftCachedDetail{detail: detail, expiresAt: now.Add(jingSoftDetailCacheTTL)}
}

func (c *jingSoftMerchantCache) invalidateDetail(scope string, goodsID int) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.details, scope+":"+strconv.Itoa(goodsID))
}

func (c *jingSoftMerchantCache) invalidateScope(scope string) {
	if c == nil || scope == "" {
		return
	}
	prefix := scope + ":"
	c.mu.Lock()
	defer c.mu.Unlock()
	for k := range c.goodsIDs {
		if strings.HasPrefix(k, prefix) {
			delete(c.goodsIDs, k)
		}
	}
	for k := range c.details {
		if strings.HasPrefix(k, prefix) {
			delete(c.details, k)
		}
	}
}

func (c *jingSoftMerchantCache) getDirectGoods(cacheKey string, now time.Time) (jingSoftGoods, bool) {
	if c == nil {
		return jingSoftGoods{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.directGoods[cacheKey]
	if !ok || !now.Before(entry.expiresAt) {
		return jingSoftGoods{}, false
	}
	return entry.goods, true
}

func (c *jingSoftMerchantCache) setDirectGoods(cacheKey string, goods jingSoftGoods, now time.Time) {
	if c == nil || cacheKey == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.directGoods[cacheKey] = jingSoftCachedDirectGoods{goods: goods, expiresAt: now.Add(jingSoftDetailCacheTTL)}
}

func (c *jingSoftMerchantCache) getPriceSample(cacheKey string, now time.Time) (jingSoftPriceSample, bool) {
	if c == nil {
		return jingSoftPriceSample{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.priceSamples[cacheKey]
	if !ok || !now.Before(entry.expiresAt) {
		return jingSoftPriceSample{}, false
	}
	return entry.sample, true
}

func (c *jingSoftMerchantCache) setPriceSample(cacheKey string, sample jingSoftPriceSample, now time.Time) {
	if c == nil || cacheKey == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.priceSamples[cacheKey] = jingSoftCachedPriceSample{sample: sample, expiresAt: now.Add(jingSoftPriceSampleTTL)}
}

func (c *jingSoftMerchantCache) invalidateSlotPriceSamples(slotPrefix string) {
	if c == nil || slotPrefix == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for k := range c.priceSamples {
		if strings.HasPrefix(k, slotPrefix) {
			delete(c.priceSamples, k)
		}
	}
}

type jingSoftHTTPAdapter struct {
	baseURL       string // Test-only override for local httptest servers; empty in production.
	ssrfProtect   bool
	now           func() time.Time
	cache         *jingSoftMerchantCache
	transportMu   sync.Mutex
	protectedRT   http.RoundTripper
	unprotectedRT http.RoundTripper
	restockMu     sync.Mutex
	restockLocks  map[string]*sync.Mutex
}

func newJingSoftHTTPAdapter() *jingSoftHTTPAdapter {
	return &jingSoftHTTPAdapter{
		ssrfProtect:  true,
		now:          time.Now,
		cache:        newJingSoftMerchantCache(),
		restockLocks: make(map[string]*sync.Mutex),
	}
}

func (a *jingSoftHTTPAdapter) ResetCache() {
	if a != nil && a.cache != nil {
		a.cache.reset()
	}
}

func (a *jingSoftHTTPAdapter) lockRestockKey(key string) func() {
	a.restockMu.Lock()
	if a.restockLocks == nil {
		a.restockLocks = make(map[string]*sync.Mutex)
	}
	m, ok := a.restockLocks[key]
	if !ok {
		m = &sync.Mutex{}
		a.restockLocks[key] = m
	}
	a.restockMu.Unlock()
	m.Lock()
	return m.Unlock
}

func (a *jingSoftHTTPAdapter) currentTime() time.Time {
	if a.now != nil {
		return a.now()
	}
	return time.Now()
}

func (a *jingSoftHTTPAdapter) resolveBaseURL(candidate string) (resolved string, useSSRF bool, err error) {
	if a != nil && strings.TrimSpace(a.baseURL) != "" {
		override := strings.TrimSuffix(strings.TrimSpace(a.baseURL), "/")
		u, parseErr := url.Parse(override)
		if parseErr != nil || u.Hostname() == "" || u.User != nil {
			return "", false, ErrJingSoftInvalidBaseURL
		}
		isLocalTest := (u.Scheme == "http" || u.Scheme == "https") && (u.Hostname() == "127.0.0.1" || u.Hostname() == "::1")
		return override, a.ssrfProtect && !isLocalTest, nil
	}
	normalized, normErr := operation_setting.NormalizeJingSoftBaseURL(candidate)
	if normErr != nil || normalized == "" {
		return "", false, ErrJingSoftInvalidBaseURL
	}
	return normalized, a == nil || a.ssrfProtect, nil
}

// The documented order receipt binds trade, shop, goods, amount and quantity.
// Channel and currency are optional upstream fields, never invented evidence.
func (*jingSoftHTTPAdapter) Ready() bool { return true }

func (a *jingSoftHTTPAdapter) newHTTPTransport(useSSRF bool) http.RoundTripper {
	netDialer := &net.Dialer{
		Timeout:   15 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	if !useSSRF {
		return &http.Transport{
			Proxy:               http.ProxyFromEnvironment,
			DialContext:         netDialer.DialContext,
			ForceAttemptHTTP2:   true,
			MaxIdleConns:        64,
			MaxIdleConnsPerHost: 16,
			IdleConnTimeout:     90 * time.Second,
			TLSHandshakeTimeout: 10 * time.Second,
		}
	}
	dialer := &protectedFetchDialer{
		resolver:    net.DefaultResolver,
		dialContext: netDialer.DialContext,
		getProtection: func() (*common.SSRFProtection, bool, error) {
			return &common.SSRFProtection{
				AllowPrivateIp:         false,
				ApplyIPFilterForDomain: true,
			}, true, nil
		},
	}
	return &http.Transport{
		DialContext:         dialer.DialContext,
		ForceAttemptHTTP2:   true,
		MaxIdleConns:        64,
		MaxIdleConnsPerHost: 16,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
	}
}

func (a *jingSoftHTTPAdapter) sharedTransport(useSSRF bool) http.RoundTripper {
	if a == nil {
		return (&jingSoftHTTPAdapter{ssrfProtect: true}).newHTTPTransport(useSSRF)
	}
	a.transportMu.Lock()
	defer a.transportMu.Unlock()
	if useSSRF {
		if a.protectedRT == nil {
			a.protectedRT = a.newHTTPTransport(true)
		}
		return a.protectedRT
	}
	if a.unprotectedRT == nil {
		a.unprotectedRT = a.newHTTPTransport(false)
	}
	return a.unprotectedRT
}

func (a *jingSoftHTTPAdapter) client(resolvedBaseURL string, useSSRF bool, credentials JingSoftCredentials) (*http.Client, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, ErrJingSoftOrderUnavailable
	}
	origin, err := url.Parse(resolvedBaseURL)
	if err != nil {
		return nil, ErrJingSoftOrderUnavailable
	}
	if credentials.Cookie != "" {
		var cookies []*http.Cookie
		if common.UnmarshalJsonStr(credentials.Cookie, &cookies) != nil {
			return nil, ErrJingSoftVerification
		}
		jar.SetCookies(origin, cookies)
	}
	return &http.Client{
		Timeout:       25 * time.Second,
		Jar:           jar,
		Transport:     a.sharedTransport(useSSRF),
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}, nil
}

type jingSoftEnvelope struct {
	Code *int            `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

func jingSoftIsOutOfStockMsg(msg string) bool {
	trimmed := strings.TrimSpace(msg)
	if trimmed == "" {
		return false
	}
	lower := strings.ToLower(trimmed)
	return strings.Contains(trimmed, "库存") ||
		strings.Contains(trimmed, "卡密") ||
		strings.Contains(trimmed, "不足") ||
		strings.Contains(trimmed, "售罄") ||
		strings.Contains(trimmed, "缺货") ||
		strings.Contains(lower, "out of stock") ||
		strings.Contains(lower, "sold out")
}

func jingSoftIsSingleAttemptWritePath(path string) bool {
	return path == "/shopApi/Pay/order" ||
		path == "/merchantApi/Goods/update" ||
		path == "/merchantApi/GoodsCardStorage/add"
}

// Reads share a 15-second budget and at most three attempts. State-changing
// writes always get exactly one attempt, even if upstream accepted before disconnect.
func (a *jingSoftHTTPAdapter) post(ctx context.Context, client *http.Client, resolvedBaseURL, visitor, path string, request, result any) error {
	return a.postWithHeaders(ctx, client, resolvedBaseURL, visitor, path, nil, request, result)
}

func (a *jingSoftHTTPAdapter) postWithHeaders(ctx context.Context, client *http.Client, resolvedBaseURL, visitor, path string, extraHeaders map[string]string, request, result any) error {
	body, err := common.Marshal(request)
	if err != nil {
		return ErrJingSoftInvalidRequest
	}
	attempts := 3
	if jingSoftIsSingleAttemptWritePath(path) {
		attempts = 1
	} else {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
	}
	for attempt := range attempts {
		if ctx.Err() != nil {
			return ErrJingSoftOrderUnavailable
		}
		attemptCtx := ctx
		cancel := func() {}
		if attempts > 1 {
			attemptCtx, cancel = context.WithTimeout(ctx, 5*time.Second)
		}
		envelope, retry, callErr := a.postOnce(attemptCtx, client, resolvedBaseURL, visitor, path, extraHeaders, body)
		cancel()
		if callErr != nil {
			if retry && attempt+1 < attempts {
				continue
			}
			return callErr
		}
		if path == "/shopApi/Pay/query" || path == "/merchantApi/user/checkToken" {
			// Status probes expose confirmation via the envelope code itself.
			payment, ok := result.(*jingSoftEnvelope)
			if !ok {
				return ErrJingSoftInvalidRequest
			}
			*payment = *envelope
			return nil
		}
		if strings.HasPrefix(path, "/merchantApi/") && (*envelope.Code == 401 || *envelope.Code == -1) {
			return errJingSoftMerchantAuthExpired
		}
		if path == "/shopApi/Pay/order" && *envelope.Code != 1 && jingSoftIsOutOfStockMsg(envelope.Msg) {
			return errJingSoftOutOfStock
		}
		if *envelope.Code != 1 {
			return ErrJingSoftOrderUnavailable
		}
		if result != nil && common.Unmarshal(envelope.Data, result) != nil {
			return ErrJingSoftVerification
		}
		return nil
	}
	return ErrJingSoftOrderUnavailable
}

func (a *jingSoftHTTPAdapter) postOnce(ctx context.Context, client *http.Client, resolvedBaseURL, visitor, path string, extraHeaders map[string]string, body []byte) (*jingSoftEnvelope, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resolvedBaseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, false, ErrJingSoftOrderUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cache-Control", "no-store")
	req.Header.Set("Origin", resolvedBaseURL)
	req.Header.Set("Referer", resolvedBaseURL+"/")
	if visitor != "" {
		req.Header.Set("Visitorid", visitor)
	}
	for k, v := range extraHeaders {
		if v != "" {
			req.Header.Set(k, v)
		}
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, true, ErrJingSoftOrderUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		if strings.HasPrefix(path, "/merchantApi/") && (response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden) {
			return nil, false, errJingSoftMerchantAuthExpired
		}
		retry := response.StatusCode == http.StatusRequestTimeout || response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500
		return nil, retry, ErrJingSoftOrderUnavailable
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, jingSoftResponseLimit+1))
	if err != nil || len(data) > jingSoftResponseLimit {
		return nil, err != nil, ErrJingSoftOrderUnavailable
	}
	var envelope jingSoftEnvelope
	if common.Unmarshal(data, &envelope) != nil || envelope.Code == nil {
		return nil, true, ErrJingSoftOrderUnavailable
	}
	return &envelope, false, nil
}

type jingSoftShop struct {
	Token    string `json:"token"`
	Nickname string `json:"nickname"`
	Link     string `json:"link"`
}

type jingSoftGoods struct {
	Key           string           `json:"goods_key"`
	Type          string           `json:"goods_type"`
	Name          string           `json:"name"`
	Status        int              `json:"status"`
	Price         *decimal.Decimal `json:"price"`
	ContactFormat string           `json:"contact_format"`
	User          jingSoftShop     `json:"user"`
	Extend        struct {
		StockCount *int `json:"stock_count"`
		LimitCount int  `json:"limit_count"`
	} `json:"extend"`
}

type jingSoftMerchantGoodsItem struct {
	ID        int              `json:"id"`
	GoodsType string           `json:"goods_type"`
	GoodsKey  string           `json:"goods_key"`
	Name      string           `json:"name"`
	Price     *decimal.Decimal `json:"price"`
	Status    int              `json:"status"`
	Show      *int             `json:"show"`
	Extend    struct {
		StockCount *int `json:"stock_count"`
	} `json:"extend"`
}

type jingSoftMerchantGoodsDetail struct {
	ID              int             `json:"id"`
	GoodsType       string          `json:"goods_type"`
	GoodsKey        string          `json:"goods_key"`
	CategoryID      int             `json:"category_id"`
	Name            string          `json:"name"`
	Image           string          `json:"image"`
	Price           decimal.Decimal `json:"price"`
	MarketPrice     decimal.Decimal `json:"market_price"`
	CostPrice       decimal.Decimal `json:"cost_price"`
	Description     string          `json:"description"`
	Sort            int             `json:"sort"`
	CouponStatus    int             `json:"coupon_status"`
	Status          int             `json:"status"`
	FeePayer        int             `json:"fee_payer"`
	Show            int             `json:"show"`
	ContactFormat   string          `json:"contact_format"`
	AgentStatus     int             `json:"agent_status"`
	AgentPrice1     decimal.Decimal `json:"agent_price1"`
	AgentPrice2     decimal.Decimal `json:"agent_price2"`
	AgentPrice3     decimal.Decimal `json:"agent_price3"`
	AgentPriceLimit decimal.Decimal `json:"agent_price_limit"`
	DescriptionSync int             `json:"description_sync"`
	NameSync        int             `json:"name_sync"`
	ParentID        int             `json:"parent_id"`
	AddType         int             `json:"add_type"`
	AddRate         decimal.Decimal `json:"add_rate"`
	AddPrice        decimal.Decimal `json:"add_price"`
	Extend          struct {
		Instructions        string `json:"instructions"`
		StockNotice         int    `json:"stock_notice"`
		LockCard            int    `json:"lock_card"`
		LimitCount          int    `json:"limit_count"`
		LimitCountMax       int    `json:"limit_count_max"`
		ShowStockType       int    `json:"show_stock_type"`
		SendOrder           int    `json:"send_order"`
		QueryPasswordStatus int    `json:"query_password_status"`
	} `json:"extend"`
}

type jingSoftChannelWire struct {
	ID           int              `json:"id"`
	Code         string           `json:"code"`
	Name         string           `json:"name"`
	ShowName     string           `json:"show_name"`
	Rate         *decimal.Decimal `json:"rate"`
	Status       int              `json:"status"`
	CustomStatus int              `json:"custom_status"`
	Paytype      struct {
		Code string `json:"code"`
		Icon string `json:"icon"`
	} `json:"paytype"`
}

func jingSoftMatchesShopLink(resolvedBaseURL, storeToken, shopLink string) bool {
	expectedPath := "/shop/" + storeToken
	if shopLink == resolvedBaseURL+expectedPath {
		return true
	}
	u, err := url.Parse(strings.TrimSpace(shopLink))
	if err != nil || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	if strings.TrimSuffix(u.Path, "/") != expectedPath {
		return false
	}
	if strings.HasPrefix(resolvedBaseURL, "http://127.0.0.1:") || strings.HasPrefix(resolvedBaseURL, "http://[::1]:") {
		return u.Scheme == "https" && u.Hostname() != "" || (u.Scheme+"://"+u.Host == resolvedBaseURL)
	}
	baseParsed, baseErr := url.Parse(resolvedBaseURL)
	return baseErr == nil && u.Scheme == baseParsed.Scheme && strings.EqualFold(u.Host, baseParsed.Host)
}

func jingSoftShopCacheKey(resolvedBaseURL, storeToken string) string {
	return resolvedBaseURL + "|" + storeToken
}

func (a *jingSoftHTTPAdapter) fetchRawChannels(ctx context.Context, client *http.Client, resolvedBaseURL, token string) ([]jingSoftChannelWire, error) {
	var wire []jingSoftChannelWire
	if err := a.post(ctx, client, resolvedBaseURL, "", "/shopApi/Shop/getUserChannel", map[string]any{"token": token}, &wire); err != nil {
		return nil, err
	}
	return wire, nil
}

func normalizeDiscoveredChannels(wire []jingSoftChannelWire) ([]operation_setting.JingSoftChannel, error) {
	channels := make([]operation_setting.JingSoftChannel, 0, len(wire))
	seen := make(map[int]bool, len(wire))
	for _, channel := range wire {
		if channel.ID <= 0 || channel.Status != 1 || channel.CustomStatus != 1 {
			continue
		}
		if seen[channel.ID] {
			return nil, ErrJingSoftVerification
		}
		seen[channel.ID] = true
		name := channel.ShowName
		if name == "" {
			name = channel.Name
		}
		if name == "" {
			return nil, ErrJingSoftVerification
		}
		code := strings.TrimSpace(channel.Code)
		if len(code) > 128 || strings.ContainsAny(code, "\r\n\x00") {
			return nil, ErrJingSoftVerification
		}
		icon := channel.Paytype.Icon
		if !jingSoftValidPaymentURL(icon) {
			icon = ""
		}
		channels = append(channels, operation_setting.JingSoftChannel{
			ID:          strconv.Itoa(channel.ID),
			Code:        code,
			Name:        name,
			Icon:        icon,
			PaymentType: operation_setting.JingSoftClassifyChannel(code, channel.Paytype.Code, name),
		})
	}
	return channels, nil
}

func (a *jingSoftHTTPAdapter) Channels(ctx context.Context, baseURL, token string) ([]operation_setting.JingSoftChannel, error) {
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	token, err = operation_setting.NormalizeJingSoftStoreTokenForBase(token, resolvedBase)
	if err != nil || token == "" {
		return nil, ErrJingSoftInvalidRequest
	}
	client, err := a.client(resolvedBase, useSSRF, JingSoftCredentials{})
	if err != nil {
		return nil, err
	}
	wire, err := a.fetchRawChannels(ctx, client, resolvedBase, token)
	if err != nil {
		return nil, err
	}
	channels, err := normalizeDiscoveredChannels(wire)
	if err != nil {
		return nil, err
	}
	a.cache.setChannels(jingSoftShopCacheKey(resolvedBase, token), wire, a.currentTime())
	return channels, nil
}

func (a *jingSoftHTTPAdapter) CheckCompatibility(ctx context.Context, baseURL, storeToken, merchantToken string) (*JingSoftCompatibilityResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	client, err := a.client(resolvedBase, useSSRF, JingSoftCredentials{})
	if err != nil {
		return nil, err
	}
	result := &JingSoftCompatibilityResult{
		BaseURL: resolvedBase,
	}

	probeEndpoint := func(path string, payload map[string]any) (*jingSoftEnvelope, bool) {
		body, mErr := common.Marshal(payload)
		if mErr != nil {
			return nil, false
		}
		probeCtx, pCancel := context.WithTimeout(ctx, 6*time.Second)
		defer pCancel()
		env, _, pErr := a.postOnce(probeCtx, client, resolvedBase, "", path, nil, body)
		if pErr != nil || env == nil || env.Code == nil {
			return nil, false
		}
		return env, true
	}

	storeToken = strings.TrimSpace(storeToken)
	if storeToken != "" {
		normalizedToken, tokenErr := operation_setting.NormalizeJingSoftStoreTokenForBase(storeToken, resolvedBase)
		if tokenErr != nil || normalizedToken == "" {
			return nil, ErrJingSoftInvalidRequest
		}
		storeToken = normalizedToken
	}

	if storeToken == "" {
		shopEnv, shopOK := probeEndpoint("/shopApi/Shop/info", map[string]any{"token": ""})
		chanEnv, chanOK := probeEndpoint("/shopApi/Shop/getUserChannel", map[string]any{"token": ""})
		validCodes := shopOK && chanOK && (*shopEnv.Code == 0 || *shopEnv.Code == 1) && (*chanEnv.Code == 0 || *chanEnv.Code == 1)
		if !validCodes {
			result.Compatible = false
			result.MessageKey = "The target URL did not respond with a compatible JingSoft store API"
			return result, nil
		}
		result.Compatible = true
		result.ProtocolVerified = true
		result.MessageKey = "JingSoft store API detected. Enter a store token to verify store channels and products."
	} else {
		shopEnv, shopOK := probeEndpoint("/shopApi/Shop/info", map[string]any{"token": storeToken})
		if !shopOK {
			result.Compatible = false
			result.MessageKey = "The target URL did not respond with a compatible JingSoft store API"
			return result, nil
		}
		result.ProtocolVerified = true
		var shop jingSoftShop
		if *shopEnv.Code != 1 || common.Unmarshal(shopEnv.Data, &shop) != nil || shop.Token != storeToken || !jingSoftMatchesShopLink(resolvedBase, storeToken, shop.Link) {
			result.Compatible = false
			result.MessageKey = "JingSoft API is reachable, but the store token was not found on this platform"
			return result, nil
		}
		wire, chanErr := a.fetchRawChannels(ctx, client, resolvedBase, storeToken)
		if chanErr != nil {
			result.Compatible = false
			result.MessageKey = "The target URL did not respond with a compatible JingSoft store API"
			return result, nil
		}
		channels, normErr := normalizeDiscoveredChannels(wire)
		if normErr != nil {
			result.Compatible = false
			result.MessageKey = "The target URL did not respond with a compatible JingSoft store API"
			return result, nil
		}
		supported := 0
		for _, ch := range channels {
			if ch.PaymentType == "alipay" || ch.PaymentType == "wxpay" {
				supported++
			}
		}
		var goodsList struct {
			Total int             `json:"total"`
			List  []jingSoftGoods `json:"list"`
		}
		if err := a.post(ctx, client, resolvedBase, "", "/shopApi/Shop/goodsList", map[string]any{"token": storeToken, "goods_type": "card", "current": 1, "pageSize": 20}, &goodsList); err != nil {
			result.Compatible = false
			result.MessageKey = "The target URL did not respond with a compatible JingSoft store API"
			return result, nil
		}
		result.Compatible = true
		result.StoreVerified = true
		result.ShopName = shop.Nickname
		result.ChannelCount = len(channels)
		result.SupportedChannelCount = supported
		result.ProductCount = max(goodsList.Total, len(goodsList.List))
		result.MessageKey = "JingSoft store compatibility verified"
	}

	if trimmedMerchant := strings.TrimSpace(merchantToken); trimmedMerchant != "" {
		valid, mErr := a.CheckMerchantToken(ctx, resolvedBase, trimmedMerchant)
		if mErr == nil {
			result.MerchantTokenChecked = true
			result.MerchantTokenValid = valid
		}
	}
	return result, nil
}

func (a *jingSoftHTTPAdapter) DiscoverProducts(ctx context.Context, baseURL, storeToken string) ([]JingSoftDiscoveredProduct, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	storeToken, err = operation_setting.NormalizeJingSoftStoreTokenForBase(storeToken, resolvedBase)
	if err != nil || storeToken == "" {
		return nil, ErrJingSoftInvalidRequest
	}
	client, err := a.client(resolvedBase, useSSRF, JingSoftCredentials{})
	if err != nil {
		return nil, err
	}
	if _, err := a.getShopInfo(ctx, client, resolvedBase, storeToken); err != nil {
		return nil, err
	}
	discovered := make([]JingSoftDiscoveredProduct, 0)
	seen := make(map[string]bool)
	for page := 1; page <= 4; page++ {
		var list struct {
			Total int             `json:"total"`
			List  []jingSoftGoods `json:"list"`
		}
		if err := a.post(ctx, client, resolvedBase, "", "/shopApi/Shop/goodsList", map[string]any{"token": storeToken, "goods_type": "card", "current": page, "pageSize": 50}, &list); err != nil {
			return nil, err
		}
		for _, item := range list.List {
			key := strings.TrimSpace(item.Key)
			if key == "" || seen[key] || item.Type != "card" || item.User.Token != storeToken {
				continue
			}
			seen[key] = true
			detail := item
			// Detail endpoint provides authoritative contact_format and price when omitted by list.
			if (detail.ContactFormat == "" || detail.Name == "" || detail.Price == nil) && len(discovered) < 40 {
				var full jingSoftGoods
				if infoErr := a.post(ctx, client, resolvedBase, "", "/shopApi/Shop/goodsInfo", map[string]any{"goods_key": key}, &full); infoErr == nil && full.Key == key && full.User.Token == storeToken {
					if detail.Name == "" {
						detail.Name = full.Name
					}
					if detail.Price == nil {
						detail.Price = full.Price
					}
					if detail.ContactFormat == "" {
						detail.ContactFormat = full.ContactFormat
					}
					if detail.Status == 0 {
						detail.Status = full.Status
					}
					if detail.Extend.LimitCount == 0 {
						detail.Extend.LimitCount = full.Extend.LimitCount
					}
				}
			}
			stock := 0
			if item.Extend.StockCount != nil && *item.Extend.StockCount > 0 {
				stock = *item.Extend.StockCount
			}
			priceCNY := ""
			if detail.Price != nil && detail.Price.IsPositive() {
				priceCNY = detail.Price.StringFixed(2)
			}
			name := strings.TrimSpace(detail.Name)
			if name == "" {
				name = key
			}
			statusOK := detail.Status == 0 || detail.Status == 1
			contactOK := detail.ContactFormat == "" || detail.ContactFormat == "any" || detail.ContactFormat == "qq"
			discovered = append(discovered, JingSoftDiscoveredProduct{
				GoodsKey:      key,
				Name:          name,
				PriceCNY:      priceCNY,
				StockCount:    stock,
				InStock:       stock > 0,
				ContactFormat: detail.ContactFormat,
				LimitCount:    detail.Extend.LimitCount,
				Compatible:    statusOK && contactOK,
			})
		}
		if len(list.List) == 0 || page*50 >= list.Total {
			break
		}
	}
	return discovered, nil
}

func (a *jingSoftHTTPAdapter) DiscoverDirectSlots(ctx context.Context, baseURL, merchantToken string) ([]JingSoftDiscoveredProduct, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	merchantToken = strings.TrimSpace(merchantToken)
	if merchantToken == "" {
		return nil, ErrJingSoftInvalidRequest
	}
	client, err := a.client(resolvedBase, useSSRF, JingSoftCredentials{})
	if err != nil {
		return nil, err
	}
	discovered := make([]JingSoftDiscoveredProduct, 0)
	seen := make(map[string]bool)
	inspected := 0
	for page := 1; page <= 5 && inspected < 40; page++ {
		var list struct {
			Total int                         `json:"total"`
			List  []jingSoftMerchantGoodsItem `json:"list"`
		}
		err := a.postWithHeaders(ctx, client, resolvedBase, "", "/merchantApi/Goods/list", a.merchantHeaders(resolvedBase, merchantToken, "/merchant/goods/list?is_proxy=0"), map[string]any{
			"current":    page,
			"pageSize":   100,
			"goods_type": "card",
			"status":     999,
			"name":       "",
			"is_proxy":   "0",
		}, &list)
		if err != nil {
			return nil, err
		}
		for _, item := range list.List {
			key := strings.TrimSpace(item.GoodsKey)
			if item.ID <= 0 || key == "" || seen[key] {
				continue
			}
			if item.GoodsType != "" && item.GoodsType != "card" {
				continue
			}
			// Skip products already known to be publicly visible on the storefront.
			if item.Show != nil && *item.Show != 0 {
				continue
			}
			seen[key] = true
			if inspected >= 40 {
				break
			}
			inspected++
			var detail jingSoftMerchantGoodsDetail
			infoErr := a.postWithHeaders(ctx, client, resolvedBase, "", "/merchantApi/Goods/info", a.merchantHeaders(resolvedBase, merchantToken, fmt.Sprintf("/merchant/goods/create?goods_type=card&id=%d", item.ID)), map[string]any{"id": strconv.Itoa(item.ID)}, &detail)
			if infoErr != nil {
				if errors.Is(infoErr, errJingSoftMerchantAuthExpired) {
					return nil, infoErr
				}
				continue
			}
			// Direct-credit slot discovery strictly includes storefront-hidden (show == 0) card products only.
			if detail.ID != item.ID || detail.GoodsKey != key || detail.GoodsType != "card" || detail.Show != 0 {
				continue
			}
			stock := 0
			if item.Extend.StockCount != nil && *item.Extend.StockCount > 0 {
				stock = *item.Extend.StockCount
			}
			priceCNY := ""
			if detail.Price.IsPositive() {
				priceCNY = detail.Price.StringFixed(2)
			} else if item.Price != nil && item.Price.IsPositive() {
				priceCNY = item.Price.StringFixed(2)
			}
			name := strings.TrimSpace(detail.Name)
			if name == "" {
				name = strings.TrimSpace(item.Name)
			}
			if name == "" {
				name = key
			}
			discovered = append(discovered, JingSoftDiscoveredProduct{
				GoodsKey:      key,
				Name:          name,
				PriceCNY:      priceCNY,
				StockCount:    stock,
				InStock:       stock > 0,
				ContactFormat: detail.ContactFormat,
				LimitCount:    detail.Extend.LimitCount,
				Compatible:    detail.Status == 1 && detail.ContactFormat == "any",
			})
		}
		if len(list.List) == 0 || page*100 >= list.Total {
			break
		}
	}
	return discovered, nil
}

func (a *jingSoftHTTPAdapter) merchantHeaders(resolvedBaseURL, merchantToken, refererPath string) map[string]string {
	return map[string]string{
		"merchant-token": merchantToken,
		"Referer":        resolvedBaseURL + refererPath,
	}
}

func (a *jingSoftHTTPAdapter) CheckMerchantToken(ctx context.Context, baseURL, merchantToken string) (bool, error) {
	merchantToken = strings.TrimSpace(merchantToken)
	if merchantToken == "" {
		return false, ErrJingSoftInvalidRequest
	}
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return false, err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	client, err := a.client(resolvedBase, useSSRF, JingSoftCredentials{})
	if err != nil {
		return false, err
	}
	var probe jingSoftEnvelope
	err = a.postWithHeaders(ctx, client, resolvedBase, "", "/merchantApi/user/checkToken", a.merchantHeaders(resolvedBase, merchantToken, "/merchant/dashboard/workplace"), map[string]any{}, &probe)
	if errors.Is(err, errJingSoftMerchantAuthExpired) {
		return false, nil
	}
	if err != nil || probe.Code == nil {
		return false, ErrJingSoftOrderUnavailable
	}
	if *probe.Code == 1 {
		return true, nil
	}
	if *probe.Code == 0 || *probe.Code == 401 || *probe.Code == -1 {
		return false, nil
	}
	return false, ErrJingSoftOrderUnavailable
}

func jingSoftMerchantScope(resolvedBaseURL, storeToken, merchantToken string) string {
	return resolvedBaseURL + "|" + storeToken + ":" + jingSoftMerchantTokenHash(merchantToken)
}

func (a *jingSoftHTTPAdapter) getShopInfo(ctx context.Context, client *http.Client, resolvedBaseURL, storeToken string) (*jingSoftShop, error) {
	now := a.currentTime()
	cacheKey := jingSoftShopCacheKey(resolvedBaseURL, storeToken)
	if cached, ok := a.cache.getShop(cacheKey, now); ok {
		return &cached, nil
	}
	var shop jingSoftShop
	if err := a.post(ctx, client, resolvedBaseURL, "", "/shopApi/Shop/info", map[string]any{"token": storeToken}, &shop); err != nil {
		return nil, err
	}
	if shop.Token != storeToken || !jingSoftMatchesShopLink(resolvedBaseURL, storeToken, shop.Link) {
		return nil, ErrJingSoftVerification
	}
	a.cache.setShop(cacheKey, shop, now)
	return &shop, nil
}

func (a *jingSoftHTTPAdapter) getCachedRawChannels(ctx context.Context, client *http.Client, resolvedBaseURL, storeToken string) ([]jingSoftChannelWire, error) {
	now := a.currentTime()
	cacheKey := jingSoftShopCacheKey(resolvedBaseURL, storeToken)
	if cached, ok := a.cache.getChannels(cacheKey, now); ok {
		return cached, nil
	}
	wire, err := a.fetchRawChannels(ctx, client, resolvedBaseURL, storeToken)
	if err != nil {
		return nil, err
	}
	a.cache.setChannels(cacheKey, wire, now)
	return wire, nil
}

func (a *jingSoftHTTPAdapter) lookupMerchantGoodsItem(ctx context.Context, client *http.Client, resolvedBaseURL, scope, merchantToken, goodsKey string) (*jingSoftMerchantGoodsItem, error) {
	now := a.currentTime()
	for page := 1; page <= 20; page++ {
		var list struct {
			Total int                         `json:"total"`
			List  []jingSoftMerchantGoodsItem `json:"list"`
		}
		err := a.postWithHeaders(ctx, client, resolvedBaseURL, "", "/merchantApi/Goods/list", a.merchantHeaders(resolvedBaseURL, merchantToken, "/merchant/goods/list?is_proxy=0"), map[string]any{
			"current":    page,
			"pageSize":   100,
			"goods_type": "card",
			"status":     999,
			"name":       "",
			"is_proxy":   "0",
		}, &list)
		if err != nil {
			if errors.Is(err, errJingSoftMerchantAuthExpired) {
				a.cache.invalidateScope(scope)
			}
			return nil, err
		}
		var matched *jingSoftMerchantGoodsItem
		for i := range list.List {
			if list.List[i].ID > 0 && list.List[i].GoodsKey != "" {
				a.cache.setGoodsID(scope, list.List[i].GoodsKey, list.List[i].ID, now)
			}
			if list.List[i].GoodsKey == goodsKey {
				if list.List[i].ID <= 0 || list.List[i].Extend.StockCount == nil || *list.List[i].Extend.StockCount < 0 {
					return nil, ErrJingSoftVerification
				}
				matched = &list.List[i]
			}
		}
		if matched != nil {
			return matched, nil
		}
		if len(list.List) == 0 || page*100 >= list.Total {
			break
		}
	}
	return nil, ErrJingSoftVerification
}

func (a *jingSoftHTTPAdapter) resolveMerchantGoodsID(ctx context.Context, client *http.Client, resolvedBaseURL, scope, merchantToken, goodsKey string) (int, error) {
	if cachedID, ok := a.cache.getGoodsID(scope, goodsKey, a.currentTime()); ok {
		return cachedID, nil
	}
	item, err := a.lookupMerchantGoodsItem(ctx, client, resolvedBaseURL, scope, merchantToken, goodsKey)
	if err != nil {
		return 0, err
	}
	return item.ID, nil
}

func (a *jingSoftHTTPAdapter) getVerifiedMerchantDetail(ctx context.Context, client *http.Client, resolvedBaseURL, scope, merchantToken, slotGoodsKey string, goodsID int) (*jingSoftMerchantGoodsDetail, error) {
	now := a.currentTime()
	if cached, ok := a.cache.getDetail(scope, goodsID, now); ok {
		if cached.ID == goodsID && cached.GoodsKey == slotGoodsKey && cached.GoodsType == "card" && cached.Show == 0 && cached.ContactFormat == "any" {
			return &cached, nil
		}
		a.cache.invalidateDetail(scope, goodsID)
	}
	var detail jingSoftMerchantGoodsDetail
	err := a.postWithHeaders(ctx, client, resolvedBaseURL, "", "/merchantApi/Goods/info", a.merchantHeaders(resolvedBaseURL, merchantToken, fmt.Sprintf("/merchant/goods/create?goods_type=card&id=%d", goodsID)), map[string]any{"id": strconv.Itoa(goodsID)}, &detail)
	if err != nil {
		if errors.Is(err, errJingSoftMerchantAuthExpired) {
			a.cache.invalidateScope(scope)
		}
		return nil, err
	}
	// Dedicated direct-credit slots must be hidden from the public shop listing
	// (show == 0) so external visitors cannot buy placeholder cards, and prevents
	// accidental mutation of public real-code products.
	if detail.ID != goodsID || detail.GoodsKey != slotGoodsKey || detail.GoodsType != "card" || detail.Show != 0 || detail.ContactFormat != "any" {
		return nil, ErrJingSoftVerification
	}
	a.cache.setDetail(scope, detail, now)
	return &detail, nil
}

func (a *jingSoftHTTPAdapter) fetchVerifiedStorefrontDirectGoods(ctx context.Context, client *http.Client, resolvedBaseURL, storeToken, slotGoodsKey string) (*jingSoftShop, *jingSoftGoods, error) {
	shop, err := a.getShopInfo(ctx, client, resolvedBaseURL, storeToken)
	if err != nil {
		return nil, nil, err
	}
	var goods jingSoftGoods
	if err := a.post(ctx, client, resolvedBaseURL, "", "/shopApi/Shop/goodsInfo", map[string]any{"goods_key": slotGoodsKey}, &goods); err != nil {
		return nil, nil, err
	}
	// Dedicated direct-credit slots must allow non-QQ order identifiers ("any")
	// and belong to the configured shop.
	if goods.Key != slotGoodsKey || goods.User.Token != storeToken || goods.Type != "card" || goods.Status != 1 || goods.ContactFormat != "any" {
		return nil, nil, ErrJingSoftVerification
	}
	a.cache.setDirectGoods(jingSoftShopCacheKey(resolvedBaseURL, storeToken)+":"+slotGoodsKey, goods, a.currentTime())
	return shop, &goods, nil
}

func (a *jingSoftHTTPAdapter) getCachedVerifiedDirectGoods(ctx context.Context, client *http.Client, resolvedBaseURL, storeToken, slotGoodsKey string) (*jingSoftShop, *jingSoftGoods, error) {
	shop, err := a.getShopInfo(ctx, client, resolvedBaseURL, storeToken)
	if err != nil {
		return nil, nil, err
	}
	goodsKey := jingSoftShopCacheKey(resolvedBaseURL, storeToken) + ":" + slotGoodsKey
	if cached, ok := a.cache.getDirectGoods(goodsKey, a.currentTime()); ok {
		if cached.Key == slotGoodsKey && cached.User.Token == storeToken && cached.Type == "card" && cached.Status == 1 && cached.ContactFormat == "any" {
			return shop, &cached, nil
		}
	}
	return a.fetchVerifiedStorefrontDirectGoods(ctx, client, resolvedBaseURL, storeToken, slotGoodsKey)
}

func (a *jingSoftHTTPAdapter) getCachedPriceSample(ctx context.Context, client *http.Client, resolvedBaseURL, storeToken, slotGoodsKey string, channelID int) (jingSoftPriceSample, error) {
	sampleKey := jingSoftShopCacheKey(resolvedBaseURL, storeToken) + ":" + slotGoodsKey + "#" + strconv.Itoa(channelID)
	now := a.currentTime()
	if cached, ok := a.cache.getPriceSample(sampleKey, now); ok {
		return cached, nil
	}
	var sample jingSoftPriceSample
	if err := a.post(ctx, client, resolvedBaseURL, "", "/shopApi/Shop/getGoodsPrice", map[string]any{"goods_key": slotGoodsKey, "quantity": 1, "coupon_code": "", "channel_id": channelID}, &sample); err != nil {
		return jingSoftPriceSample{}, err
	}
	if sample.TotalAmount == nil || !sample.TotalAmount.IsPositive() {
		return jingSoftPriceSample{}, ErrJingSoftVerification
	}
	a.cache.setPriceSample(sampleKey, sample, now)
	return sample, nil
}

func (a *jingSoftHTTPAdapter) replenishPlaceholderStock(ctx context.Context, client *http.Client, resolvedBaseURL, scope, merchantToken, slotGoodsKey string, goodsID, restockBatch int) error {
	batchTag := strings.ToUpper(strconv.FormatInt(a.currentTime().Unix(), 36))
	var builder strings.Builder
	for i := range restockBatch {
		if i > 0 {
			builder.WriteByte('\n')
		}
		builder.WriteString(fmt.Sprintf("DIRECT-%s-%03d-%s", batchTag, i+1, common.GetRandomString(8)))
	}
	addErr := a.postWithHeaders(ctx, client, resolvedBaseURL, "", "/merchantApi/GoodsCardStorage/add", a.merchantHeaders(resolvedBaseURL, merchantToken, "/merchant/goods/goods_card_storage_add"), map[string]any{
		"goods_id":      goodsID,
		"content":       builder.String(),
		"first":         0,
		"remove_repeat": 0,
	}, nil)
	if addErr != nil {
		if errors.Is(addErr, errJingSoftMerchantAuthExpired) {
			a.cache.invalidateScope(scope)
			return addErr
		}
		// On timeout or disconnect, check remote stock first instead of blindly re-adding.
		rechecked, checkErr := a.lookupMerchantGoodsItem(ctx, client, resolvedBaseURL, scope, merchantToken, slotGoodsKey)
		if checkErr != nil {
			return fmt.Errorf("%w: %v", errJingSoftSlotAmbiguous, addErr)
		}
		if *rechecked.Extend.StockCount <= 0 {
			return ErrJingSoftOrderUnavailable
		}
	}
	return nil
}

func (a *jingSoftHTTPAdapter) ReplenishDirectSlot(ctx context.Context, baseURL, storeToken, merchantToken, slotGoodsKey string, minStock, restockBatch int, force bool) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return 0, err
	}
	storeToken, err = operation_setting.NormalizeJingSoftStoreTokenForBase(storeToken, resolvedBase)
	merchantToken = strings.TrimSpace(merchantToken)
	if err != nil || storeToken == "" || merchantToken == "" || slotGoodsKey == "" || minStock < 1 || restockBatch < 1 {
		return 0, ErrJingSoftInvalidRequest
	}
	unlock := a.lockRestockKey(resolvedBase + "|" + storeToken + ":" + slotGoodsKey)
	defer unlock()
	client, err := a.client(resolvedBase, useSSRF, JingSoftCredentials{})
	if err != nil {
		return 0, err
	}
	scope := jingSoftMerchantScope(resolvedBase, storeToken, merchantToken)
	item, err := a.lookupMerchantGoodsItem(ctx, client, resolvedBase, scope, merchantToken, slotGoodsKey)
	if err != nil {
		return 0, err
	}
	detail, err := a.getVerifiedMerchantDetail(ctx, client, resolvedBase, scope, merchantToken, slotGoodsKey, item.ID)
	if err != nil {
		return 0, err
	}
	if !force && *item.Extend.StockCount >= minStock {
		return 0, nil
	}
	if err := a.replenishPlaceholderStock(ctx, client, resolvedBase, scope, merchantToken, slotGoodsKey, detail.ID, restockBatch); err != nil {
		return 0, err
	}
	return restockBatch, nil
}

func (a *jingSoftHTTPAdapter) QuoteDirect(ctx context.Context, baseURL, storeToken, merchantToken, slotGoodsKey, channelID, baseAmount string) (*JingSoftOffer, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	storeToken, err = operation_setting.NormalizeJingSoftStoreTokenForBase(storeToken, resolvedBase)
	merchantToken = strings.TrimSpace(merchantToken)
	id, idErr := strconv.Atoi(channelID)
	baseDecimal, baseErr := decimal.NewFromString(baseAmount)
	if err != nil || storeToken == "" || merchantToken == "" || slotGoodsKey == "" || idErr != nil || id <= 0 || strconv.Itoa(id) != channelID || baseErr != nil || !baseDecimal.IsPositive() {
		return nil, ErrJingSoftInvalidRequest
	}
	client, err := a.client(resolvedBase, useSSRF, JingSoftCredentials{})
	if err != nil {
		return nil, err
	}
	scope := jingSoftMerchantScope(resolvedBase, storeToken, merchantToken)
	var (
		shop         *jingSoftShop
		detail       *jingSoftMerchantGoodsDetail
		storeErr     error
		merchantErr  error
		validateWait sync.WaitGroup
	)
	validateWait.Go(func() {
		shop, _, storeErr = a.getCachedVerifiedDirectGoods(ctx, client, resolvedBase, storeToken, slotGoodsKey)
	})
	validateWait.Go(func() {
		goodsID, resolveErr := a.resolveMerchantGoodsID(ctx, client, resolvedBase, scope, merchantToken, slotGoodsKey)
		if resolveErr != nil {
			merchantErr = resolveErr
			return
		}
		detail, merchantErr = a.getVerifiedMerchantDetail(ctx, client, resolvedBase, scope, merchantToken, slotGoodsKey, goodsID)
	})
	validateWait.Wait()
	if errors.Is(merchantErr, errJingSoftMerchantAuthExpired) {
		return nil, merchantErr
	}
	if storeErr != nil {
		return nil, storeErr
	}
	if merchantErr != nil {
		return nil, merchantErr
	}

	var (
		rawChannels []jingSoftChannelWire
		samplePrice jingSoftPriceSample
		chanErr     error
		priceErr    error
		quoteWait   sync.WaitGroup
	)
	quoteWait.Go(func() {
		rawChannels, chanErr = a.getCachedRawChannels(ctx, client, resolvedBase, storeToken)
	})
	quoteWait.Go(func() {
		samplePrice, priceErr = a.getCachedPriceSample(ctx, client, resolvedBase, storeToken, slotGoodsKey, id)
	})
	quoteWait.Wait()
	if chanErr != nil {
		return nil, chanErr
	}
	var matchedChannel *jingSoftChannelWire
	for i := range rawChannels {
		ch := &rawChannels[i]
		if ch.ID == id && ch.Status == 1 && ch.CustomStatus == 1 {
			name := ch.ShowName
			if name == "" {
				name = ch.Name
			}
			if operation_setting.JingSoftClassifyChannel(ch.Code, ch.Paytype.Code, name) != "" {
				matchedChannel = ch
				break
			}
		}
	}
	if matchedChannel == nil {
		return nil, ErrJingSoftVerification
	}
	if priceErr != nil {
		return nil, priceErr
	}
	var buyerPaysFee bool
	if samplePrice.FeePayer != nil {
		switch *samplePrice.FeePayer {
		case 1:
			buyerPaysFee = true
		case 0:
			buyerPaysFee = false
		default:
			return nil, ErrJingSoftVerification
		}
	} else {
		switch detail.FeePayer {
		case 1:
			buyerPaysFee = true
		case 0:
			buyerPaysFee = false
		case -1:
			buyerPaysFee = samplePrice.OriginalAmount != nil && samplePrice.Fee != nil && samplePrice.Fee.IsPositive() && samplePrice.OriginalAmount.Add(*samplePrice.Fee).Equal(*samplePrice.TotalAmount)
		default:
			return nil, ErrJingSoftVerification
		}
	}
	fee := decimal.Zero
	if buyerPaysFee {
		if matchedChannel.Rate != nil && !matchedChannel.Rate.IsNegative() {
			fee = baseDecimal.Mul(*matchedChannel.Rate).Div(decimal.NewFromInt(100)).Round(2)
		} else if samplePrice.OriginalAmount != nil && samplePrice.OriginalAmount.IsPositive() && samplePrice.Fee != nil && !samplePrice.Fee.IsNegative() {
			fee = baseDecimal.Mul(*samplePrice.Fee).Div(*samplePrice.OriginalAmount).Round(2)
		} else {
			return nil, ErrJingSoftVerification
		}
	}
	total := baseDecimal.Add(fee)
	if !total.IsPositive() || total.GreaterThan(decimal.NewFromInt(1000000000)) {
		return nil, ErrJingSoftVerification
	}
	offer := &JingSoftOffer{
		ShopID:    storeToken,
		ShopName:  shop.Nickname,
		ShopURL:   shop.Link,
		ProductID: slotGoodsKey,
		ChannelID: channelID,
		Amount:    total.StringFixed(2),
		Currency:  "CNY",
		Quantity:  1,
		InStock:   true,
	}
	if fee.IsPositive() {
		offer.OriginalAmount = baseDecimal.StringFixed(2)
		offer.Fee = fee.StringFixed(2)
	}
	return offer, nil
}

func (a *jingSoftHTTPAdapter) PrepareDirectSlot(ctx context.Context, baseURL, storeToken, merchantToken, slotGoodsKey, channelID, baseAmount, knownConfirmedPrice string, minStock, restockBatch int) (*JingSoftDynamicSlotReady, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	storeToken, err = operation_setting.NormalizeJingSoftStoreTokenForBase(storeToken, resolvedBase)
	merchantToken = strings.TrimSpace(merchantToken)
	id, idErr := strconv.Atoi(channelID)
	baseDecimal, baseErr := decimal.NewFromString(baseAmount)
	if err != nil || storeToken == "" || merchantToken == "" || slotGoodsKey == "" || idErr != nil || id <= 0 || strconv.Itoa(id) != channelID || baseErr != nil || !baseDecimal.IsPositive() || minStock < 1 || restockBatch < 1 {
		return nil, ErrJingSoftInvalidRequest
	}
	client, err := a.client(resolvedBase, useSSRF, JingSoftCredentials{})
	if err != nil {
		return nil, err
	}
	shop, _, err := a.fetchVerifiedStorefrontDirectGoods(ctx, client, resolvedBase, storeToken, slotGoodsKey)
	if err != nil {
		return nil, err
	}
	scope := jingSoftMerchantScope(resolvedBase, storeToken, merchantToken)
	unlock := a.lockRestockKey(resolvedBase + "|" + storeToken + ":" + slotGoodsKey)
	item, err := a.lookupMerchantGoodsItem(ctx, client, resolvedBase, scope, merchantToken, slotGoodsKey)
	if err != nil {
		unlock()
		return nil, err
	}
	detail, err := a.getVerifiedMerchantDetail(ctx, client, resolvedBase, scope, merchantToken, slotGoodsKey, item.ID)
	if err != nil {
		unlock()
		return nil, err
	}
	if *item.Extend.StockCount < minStock {
		if restockErr := a.replenishPlaceholderStock(ctx, client, resolvedBase, scope, merchantToken, slotGoodsKey, detail.ID, restockBatch); restockErr != nil {
			unlock()
			return nil, restockErr
		}
	}
	unlock()

	needPriceUpdate := knownConfirmedPrice != baseDecimal.StringFixed(2) ||
		!detail.Price.Equal(baseDecimal) ||
		!detail.MarketPrice.Equal(baseDecimal) ||
		detail.CouponStatus != 0 ||
		detail.Status != 1 ||
		detail.Extend.LockCard != 0
	if needPriceUpdate {
		priceFloat, _ := baseDecimal.Float64()
		payload := map[string]any{
			"goods_type":        detail.GoodsType,
			"id":                detail.ID,
			"name":              detail.Name,
			"image":             detail.Image,
			"category_id":       detail.CategoryID,
			"price":             priceFloat,
			"market_price":      priceFloat,
			"description":       detail.Description,
			"sort":              detail.Sort,
			"coupon_status":     0,
			"status":            1,
			"fee_payer":         detail.FeePayer,
			"show":              0,
			"contact_format":    "any",
			"agent_status":      detail.AgentStatus,
			"agent_price1":      detail.AgentPrice1,
			"agent_price2":      detail.AgentPrice2,
			"agent_price3":      detail.AgentPrice3,
			"agent_price_limit": detail.AgentPriceLimit,
			"description_sync":  detail.DescriptionSync,
			"name_sync":         detail.NameSync,
			"parent_id":         detail.ParentID,
			"cost_price":        detail.CostPrice,
			"add_type":          detail.AddType,
			"add_rate":          detail.AddRate,
			"add_price":         detail.AddPrice,
			"extend": map[string]any{
				"instructions":          detail.Extend.Instructions,
				"stock_notice":          detail.Extend.StockNotice,
				"lock_card":             0,
				"limit_count":           detail.Extend.LimitCount,
				"limit_count_max":       detail.Extend.LimitCountMax,
				"show_stock_type":       detail.Extend.ShowStockType,
				"send_order":            detail.Extend.SendOrder,
				"query_password_status": detail.Extend.QueryPasswordStatus,
			},
		}
		if updateErr := a.postWithHeaders(ctx, client, resolvedBase, "", "/merchantApi/Goods/update", a.merchantHeaders(resolvedBase, merchantToken, fmt.Sprintf("/merchant/goods/create?goods_type=card&id=%d", detail.ID)), payload, nil); updateErr != nil {
			a.cache.invalidateDetail(scope, detail.ID)
			if errors.Is(updateErr, errJingSoftMerchantAuthExpired) {
				a.cache.invalidateScope(scope)
				return nil, updateErr
			}
			return nil, fmt.Errorf("%w: %v", errJingSoftSlotAmbiguous, updateErr)
		}
		updatedDetail := *detail
		updatedDetail.Price = baseDecimal
		updatedDetail.MarketPrice = baseDecimal
		updatedDetail.CouponStatus = 0
		updatedDetail.Status = 1
		updatedDetail.Show = 0
		updatedDetail.ContactFormat = "any"
		updatedDetail.Extend.LockCard = 0
		a.cache.setDetail(scope, updatedDetail, a.currentTime())
		a.cache.invalidateSlotPriceSamples(jingSoftShopCacheKey(resolvedBase, storeToken) + ":" + slotGoodsKey + "#")
	}

	// Read back both storefront goodsInfo and getGoodsPrice to prove the updated
	// price is live before submitting /shopApi/Pay/order.
	var goodsAfter jingSoftGoods
	if err = a.post(ctx, client, resolvedBase, "", "/shopApi/Shop/goodsInfo", map[string]any{"goods_key": slotGoodsKey}, &goodsAfter); err != nil {
		return nil, fmt.Errorf("%w: %v", errJingSoftSlotAmbiguous, err)
	}
	if goodsAfter.Key != slotGoodsKey || goodsAfter.User.Token != storeToken || goodsAfter.Status != 1 || goodsAfter.ContactFormat != "any" || (goodsAfter.Price != nil && !goodsAfter.Price.Equal(baseDecimal)) {
		return nil, errJingSoftSlotAmbiguous
	}
	var livePrice jingSoftPriceSample
	if err = a.post(ctx, client, resolvedBase, "", "/shopApi/Shop/getGoodsPrice", map[string]any{"goods_key": slotGoodsKey, "quantity": 1, "coupon_code": "", "channel_id": id}, &livePrice); err != nil {
		return nil, fmt.Errorf("%w: %v", errJingSoftSlotAmbiguous, err)
	}
	if livePrice.TotalAmount == nil || !livePrice.TotalAmount.IsPositive() || livePrice.TotalAmount.GreaterThan(decimal.NewFromInt(1000000000)) {
		return nil, errJingSoftSlotAmbiguous
	}
	if livePrice.OriginalAmount != nil && !livePrice.OriginalAmount.Equal(baseDecimal) {
		return nil, errJingSoftSlotAmbiguous
	}
	now := a.currentTime()
	if goodsAfter.Type == "card" {
		a.cache.setDirectGoods(jingSoftShopCacheKey(resolvedBase, storeToken)+":"+slotGoodsKey, goodsAfter, now)
	}
	a.cache.setPriceSample(jingSoftShopCacheKey(resolvedBase, storeToken)+":"+slotGoodsKey+"#"+strconv.Itoa(id), livePrice, now)
	offer := JingSoftOffer{
		ShopID:    storeToken,
		ShopName:  shop.Nickname,
		ShopURL:   shop.Link,
		ProductID: slotGoodsKey,
		ChannelID: channelID,
		Amount:    livePrice.TotalAmount.StringFixed(2),
		Currency:  "CNY",
		Quantity:  1,
		InStock:   true,
	}
	if livePrice.OriginalAmount != nil && livePrice.Fee != nil && livePrice.OriginalAmount.IsPositive() && !livePrice.Fee.IsNegative() && livePrice.OriginalAmount.Add(*livePrice.Fee).Equal(*livePrice.TotalAmount) {
		offer.OriginalAmount = livePrice.OriginalAmount.StringFixed(2)
		offer.Fee = livePrice.Fee.StringFixed(2)
	}
	return &JingSoftDynamicSlotReady{Offer: offer, ConfirmedPrice: baseDecimal.StringFixed(2)}, nil
}

func (a *jingSoftHTTPAdapter) Quote(ctx context.Context, baseURL, token, goodsKey, channelID string) (*JingSoftOffer, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	token, err = operation_setting.NormalizeJingSoftStoreTokenForBase(token, resolvedBase)
	goodsKey, keyErr := operation_setting.NormalizeJingSoftGoodsKeyForBase(goodsKey, resolvedBase)
	id, idErr := strconv.Atoi(channelID)
	if err != nil || keyErr != nil || token == "" || goodsKey == "" || idErr != nil || id <= 0 || strconv.Itoa(id) != channelID {
		return nil, ErrJingSoftInvalidRequest
	}
	client, err := a.client(resolvedBase, useSSRF, JingSoftCredentials{})
	if err != nil {
		return nil, err
	}
	var (
		shop        *jingSoftShop
		goods       jingSoftGoods
		inStock     bool
		found       bool
		channels    []operation_setting.JingSoftChannel
		price       jingSoftPriceSample
		shopErr     error
		goodsErr    error
		stockErr    error
		channelsErr error
		priceErr    error
		wg          sync.WaitGroup
	)
	wg.Go(func() {
		shop, shopErr = a.getShopInfo(ctx, client, resolvedBase, token)
	})
	wg.Go(func() {
		if callErr := a.post(ctx, client, resolvedBase, "", "/shopApi/Shop/goodsInfo", map[string]any{"goods_key": goodsKey}, &goods); callErr != nil {
			goodsErr = callErr
			return
		}
		if goods.Key != goodsKey || goods.User.Token != token || goods.Type != "card" || goods.Status != 1 || (goods.ContactFormat != "any" && goods.ContactFormat != "qq") {
			goodsErr = ErrJingSoftVerification
		}
	})
	// The detail endpoint omits stock. Verify the exact product in the shop's
	// paginated list; a missing stock field is not proof of availability.
	wg.Go(func() {
		for page := 1; page <= 50; page++ {
			var list struct {
				Total int             `json:"total"`
				List  []jingSoftGoods `json:"list"`
			}
			if callErr := a.post(ctx, client, resolvedBase, "", "/shopApi/Shop/goodsList", map[string]any{"token": token, "goods_type": "card", "current": page, "pageSize": 50}, &list); callErr != nil {
				stockErr = callErr
				return
			}
			for _, item := range list.List {
				if item.Key != goodsKey {
					continue
				}
				if found || item.Type != "card" || item.User.Token != token || item.Extend.StockCount == nil || *item.Extend.StockCount < 0 {
					stockErr = ErrJingSoftVerification
					return
				}
				found = true
				inStock = *item.Extend.StockCount > 0
			}
			if found || len(list.List) == 0 || page*50 >= list.Total {
				break
			}
		}
		if !found {
			stockErr = ErrJingSoftVerification
		}
	})
	wg.Go(func() {
		raw, callErr := a.getCachedRawChannels(ctx, client, resolvedBase, token)
		if callErr != nil {
			channelsErr = callErr
			return
		}
		channels, channelsErr = normalizeDiscoveredChannels(raw)
	})
	wg.Go(func() {
		priceErr = a.post(ctx, client, resolvedBase, "", "/shopApi/Shop/getGoodsPrice", map[string]any{"goods_key": goodsKey, "quantity": 1, "coupon_code": "", "channel_id": id}, &price)
	})
	wg.Wait()

	for _, stepErr := range []error{shopErr, goodsErr, stockErr, channelsErr, priceErr} {
		if stepErr != nil {
			return nil, stepErr
		}
	}
	available := false
	for _, channel := range channels {
		if channel.ID == channelID {
			available = true
			break
		}
	}
	if !available {
		return nil, ErrJingSoftVerification
	}
	if price.TotalAmount == nil || !price.TotalAmount.IsPositive() || price.TotalAmount.GreaterThan(decimal.NewFromInt(1000000000)) {
		return nil, ErrJingSoftVerification
	}
	offer := &JingSoftOffer{ShopID: token, ShopName: shop.Nickname, ShopURL: shop.Link, ProductID: goodsKey, ChannelID: channelID, Amount: price.TotalAmount.String(), Currency: "CNY", Quantity: 1, InStock: inStock}
	// The fee is display-only; it is kept only when the breakdown adds up.
	if price.OriginalAmount != nil && price.Fee != nil && price.OriginalAmount.IsPositive() && !price.Fee.IsNegative() && price.OriginalAmount.Add(*price.Fee).Equal(*price.TotalAmount) {
		offer.OriginalAmount, offer.Fee = price.OriginalAmount.String(), price.Fee.String()
	}
	return offer, nil
}

var jingSoftDirectContactPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,191}$`)

func (a *jingSoftHTTPAdapter) Create(ctx context.Context, baseURL string, order *model.JingSoftOrder, credentials JingSoftCredentials, contact string) (*JingSoftCreatedOrder, error) {
	resolvedBase, useSSRF, err := a.resolveBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	channelID, err := strconv.Atoi(order.ChannelID)
	if err != nil || channelID <= 0 || strconv.Itoa(channelID) != order.ChannelID || credentials.Visitor == "" || credentials.Password == "" {
		return nil, ErrJingSoftInvalidRequest
	}
	if jingSoftModeFromOrder(order) == operation_setting.JingSoftModeDirect {
		if contact == "" || contact != order.TradeNo || !jingSoftDirectContactPattern.MatchString(contact) {
			return nil, ErrJingSoftInvalidRequest
		}
	} else if !isValidJingSoftQQ(contact) {
		return nil, ErrJingSoftInvalidRequest
	}
	client, err := a.client(resolvedBase, useSSRF, credentials)
	if err != nil {
		return nil, err
	}
	var wire struct {
		TradeNo     string           `json:"trade_no"`
		PayURL      string           `json:"payurl"`
		TotalAmount *decimal.Decimal `json:"total_amount"`
	}
	err = a.post(ctx, client, resolvedBase, credentials.Visitor, "/shopApi/Pay/order", map[string]any{"goods_key": order.ProductID, "quantity": 1, "coupon_code": "", "channel_id": channelID, "contact": contact, "query_password": credentials.Password, "select_cards_ids": []int{}, "extend": map[string]any{}}, &wire)
	origin, _ := url.Parse(resolvedBase)
	cookies, sealErr := common.Marshal(client.Jar.Cookies(origin))
	if sealErr != nil {
		return nil, ErrJingSoftOrderUnavailable
	}
	credentials.Cookie = string(cookies)
	result := &JingSoftCreatedOrder{UpstreamOrderID: wire.TradeNo, PaymentURL: wire.PayURL, Credentials: &credentials}
	if err != nil {
		if errors.Is(err, errJingSoftOutOfStock) && wire.TradeNo != "" {
			return result, ErrJingSoftOrderUnavailable
		}
		return result, err
	}
	if wire.TradeNo == "" || !jingSoftValidPaymentURL(wire.PayURL) || wire.TotalAmount == nil {
		return result, ErrJingSoftVerification
	}
	expected, priceErr := decimal.NewFromString(order.PriceAmount)
	if priceErr != nil || !wire.TotalAmount.Equal(expected) {
		return result, ErrJingSoftVerification
	}
	orderCopy := *order
	orderCopy.UpstreamOrderID = &wire.TradeNo
	evidence, err := a.query(ctx, resolvedBase, &orderCopy, credentials, client, nil)
	if evidence != nil {
		result.Evidence = *evidence
	}
	if err == nil && evidence != nil && !evidence.Paid && !evidence.Expired && jingSoftMatchesPurchase(&orderCopy, evidence) {
		if order.PaymentMethod == model.PaymentMethodJingSoftWeChat {
			result.PaymentQRCode, err = a.paymentQRCode(ctx, resolvedBase, useSSRF, wire.PayURL, &orderCopy)
		} else {
			result.PaymentQRCode, _ = a.paymentQRCode(ctx, resolvedBase, useSSRF, wire.PayURL, &orderCopy)
		}
	}
	// Capture cookies from both creation and its immediate verification query.
	cookies, sealErr = common.Marshal(client.Jar.Cookies(origin))
	if sealErr != nil {
		return result, ErrJingSoftOrderUnavailable
	}
	credentials.Cookie = string(cookies)
	return result, err
}

// paymentQRCode follows the cashier chain without executing scripts or fetching QR data.
func (a *jingSoftHTTPAdapter) paymentQRCode(ctx context.Context, resolvedBaseURL string, useSSRF bool, payURL string, order *model.JingSoftOrder) (string, error) {
	wechat := order.PaymentMethod == model.PaymentMethodJingSoftWeChat
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	origin, err := url.Parse(resolvedBaseURL)
	if err != nil {
		return "", ErrJingSoftOrderUnavailable
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		return "", ErrJingSoftOrderUnavailable
	}
	client := &http.Client{
		Timeout:       15 * time.Second,
		Jar:           jar,
		Transport:     a.sharedTransport(useSSRF),
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	method, target, form := http.MethodGet, payURL, url.Values(nil)
	for range 8 {
		u, err := url.Parse(target)
		if err != nil || u.User != nil || !(u.Scheme == origin.Scheme && u.Host == origin.Host || !wechat && u.Scheme == "https" && strings.HasSuffix(u.Hostname(), ".alipay.com") && u.Port() == "") {
			return "", ErrJingSoftVerification
		}
		var body io.Reader
		if method == http.MethodPost {
			body = strings.NewReader(form.Encode())
		}
		req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
		if err != nil {
			return "", ErrJingSoftOrderUnavailable
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
		req.Header.Set("Accept", "text/html,application/xhtml+xml")
		if method == http.MethodPost {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		response, err := client.Do(req)
		if err != nil {
			return "", ErrJingSoftOrderUnavailable
		}
		data, err := io.ReadAll(io.LimitReader(response.Body, jingSoftResponseLimit+1))
		response.Body.Close()
		if err != nil || len(data) > jingSoftResponseLimit {
			return "", ErrJingSoftOrderUnavailable
		}
		if response.StatusCode >= 300 && response.StatusCode < 400 {
			next, err := u.Parse(response.Header.Get("Location"))
			if err != nil || response.Header.Get("Location") == "" {
				return "", ErrJingSoftVerification
			}
			method, target, form = http.MethodGet, next.String(), nil
			continue
		}
		if response.StatusCode != http.StatusOK {
			return "", ErrJingSoftOrderUnavailable
		}
		doc, err := html.Parse(bytes.NewReader(data))
		if err != nil {
			return "", ErrJingSoftVerification
		}
		if wechat {
			if u.Path != "/payApi/WeixinNative/pay.html" && u.Path != "/payApi/WeixinJspay/pay.html" {
				return "", ErrJingSoftVerification
			}
			return jingSoftWeChatCashierQR(doc, u, order)
		}
		var formNode *html.Node
		for n := range doc.Descendants() {
			if n.Type != html.ElementNode {
				continue
			}
			if n.DataAtom == atom.Input && jingSoftHTMLAttr(n, "name") == "qrCode" {
				code := strings.TrimSpace(jingSoftHTMLAttr(n, "value"))
				if len(code) > 2048 || !jingSoftValidPaymentURL(code) {
					return "", ErrJingSoftVerification
				}
				return code, nil
			}
			if n.DataAtom == atom.Form && formNode == nil {
				formNode = n
			}
		}
		if formNode == nil {
			return "", ErrJingSoftVerification
		}
		next, err := u.Parse(jingSoftHTMLAttr(formNode, "action"))
		if err != nil {
			return "", ErrJingSoftVerification
		}
		form = url.Values{}
		for n := range formNode.Descendants() {
			if n.Type == html.ElementNode && n.DataAtom == atom.Input && jingSoftHTMLAttr(n, "name") != "" && jingSoftHTMLAttr(n, "type") != "submit" {
				form.Add(jingSoftHTMLAttr(n, "name"), jingSoftHTMLAttr(n, "value"))
			}
		}
		method, target = http.MethodGet, next.String()
		if strings.EqualFold(jingSoftHTMLAttr(formNode, "method"), http.MethodPost) {
			method = http.MethodPost
		} else {
			next.RawQuery = form.Encode()
			target, form = next.String(), nil
		}
	}
	return "", ErrJingSoftVerification
}

var (
	jingSoftWeChatQRPattern       = regexp.MustCompile(`^weixin://wxpay/bizpayurl\?pr=[A-Za-z0-9_-]+$`)
	jingSoftCashierPricePattern   = regexp.MustCompile(`^[0-9]{1,16}(\.[0-9]{1,2})?$`)
	jingSoftCashierTradeNoPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
)

func jingSoftValidExtractedWeChatQR(code string, page *url.URL, order *model.JingSoftOrder) bool {
	if jingSoftWeChatQRPattern.MatchString(code) {
		return true
	}
	if page.Path != "/payApi/WeixinJspay/pay.html" {
		return false
	}
	qrURL, err := url.Parse(code)
	if err != nil || qrURL.Scheme != page.Scheme || qrURL.Host != page.Host || qrURL.User != nil || qrURL.Fragment != "" || qrURL.RawPath != "" || qrURL.Path != "/payApi/WeixinJspay/pay.html" {
		return false
	}
	qrParams, err := url.ParseQuery(qrURL.RawQuery)
	if err != nil || len(qrParams) != 1 || len(qrParams["trade_no"]) != 1 {
		return false
	}
	tradeNo := qrParams.Get("trade_no")
	if !jingSoftCashierTradeNoPattern.MatchString(tradeNo) {
		return false
	}
	if order != nil && order.UpstreamOrderID != nil && *order.UpstreamOrderID != "" && tradeNo != *order.UpstreamOrderID {
		return false
	}
	if pageParams, pageErr := url.ParseQuery(page.RawQuery); pageErr == nil && pageParams.Get("trade_no") != "" && tradeNo != pageParams.Get("trade_no") {
		return false
	}
	return true
}

func jingSoftWeChatCashierQR(doc *html.Node, page *url.URL, order *model.JingSoftOrder) (string, error) {
	var code, price string
	for n := range doc.Descendants() {
		if n.Type != html.ElementNode {
			continue
		}
		if n.DataAtom == atom.Span && n.Parent != nil && n.Parent.DataAtom == atom.Div && slices.Contains(strings.Fields(jingSoftHTMLAttr(n.Parent, "class")), "price") {
			if n.FirstChild != nil && n.FirstChild == n.LastChild && n.FirstChild.Type == html.TextNode && strings.TrimSpace(n.FirstChild.Data) == "元" {
				continue
			}
			if price != "" || n.FirstChild == nil || n.FirstChild != n.LastChild || n.FirstChild.Type != html.TextNode {
				return "", ErrJingSoftVerification
			}
			price = strings.TrimSpace(n.FirstChild.Data)
			if !jingSoftCashierPricePattern.MatchString(price) {
				return "", ErrJingSoftVerification
			}
		}
		if n.DataAtom != atom.Img {
			continue
		}
		image, err := page.Parse(jingSoftHTMLAttr(n, "src"))
		if err != nil || image.Path != "/payApi/common/generateQrcode.html" {
			continue
		}
		params, err := url.ParseQuery(image.RawQuery)
		if err != nil || len(params) != 1 || len(params["str"]) != 1 || code != "" || image.Host != page.Host || image.Scheme != page.Scheme || image.User != nil {
			return "", ErrJingSoftVerification
		}
		code = params.Get("str")
		for range 2 {
			if strings.HasPrefix(code, "weixin://") || strings.HasPrefix(code, "https://") || strings.HasPrefix(code, "http://") {
				break
			}
			decoded, unescapeErr := url.QueryUnescape(code)
			if unescapeErr != nil {
				return "", ErrJingSoftVerification
			}
			if decoded == code {
				break
			}
			code = decoded
		}
		if len(code) > 2048 || !jingSoftValidExtractedWeChatQR(code, page, order) {
			return "", ErrJingSoftVerification
		}
	}
	amount, err := decimal.NewFromString(price)
	expected, expectedErr := decimal.NewFromString(order.PriceAmount)
	if code == "" || order.Currency != "CNY" || err != nil || expectedErr != nil || !amount.IsPositive() || !amount.Equal(expected) {
		return "", ErrJingSoftVerification
	}
	return code, nil
}

func jingSoftHTMLAttr(n *html.Node, key string) string {
	for _, attr := range n.Attr {
		if attr.Key == key {
			return attr.Val
		}
	}
	return ""
}

func (a *jingSoftHTTPAdapter) Query(ctx context.Context, baseURL string, order *model.JingSoftOrder, credentials JingSoftCredentials) (*JingSoftOrderEvidence, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	candidateBase := baseURL
	if orderOrigin := jingSoftOrderOrigin(order); orderOrigin != "" {
		candidateBase = orderOrigin
	}
	resolvedBase, useSSRF, err := a.resolveBaseURL(candidateBase)
	if err != nil {
		return nil, err
	}
	client, err := a.client(resolvedBase, useSSRF, credentials)
	if err != nil {
		return nil, err
	}
	if order.UpstreamOrderID == nil || *order.UpstreamOrderID == "" {
		return nil, ErrJingSoftOrderUnavailable
	}
	// Probe first so ordinary unpaid polling avoids the heavier card receipt.
	// Read the full receipt when paid, ambiguous, recovering state/QR, or near expiry.
	var probe jingSoftEnvelope
	if err := a.post(ctx, client, resolvedBase, credentials.Visitor, "/shopApi/Pay/query", map[string]any{"trade_no": *order.UpstreamOrderID}, &probe); err != nil {
		return nil, err
	}
	paid := probe.Code != nil && *probe.Code == 1
	ambiguousProbe := probe.Code == nil || (*probe.Code != 0 && *probe.Code != 1)
	nearExpiry := order.CreatedAt > 0 && a.currentTime().Unix()-order.CreatedAt >= 5*60
	needReceipt := paid || ambiguousProbe || nearExpiry || order.Status != model.JingSoftOrderStatusPending || (order.PaymentMethod == model.PaymentMethodJingSoftWeChat && order.PaymentQRCode == "")
	if !needReceipt {
		return &JingSoftOrderEvidence{ProbeOnlyUnpaid: true}, nil
	}
	evidence, err := a.query(ctx, resolvedBase, order, credentials, client, &probe)
	if err != nil || evidence.Paid || evidence.Expired || paid || order.Status == model.JingSoftOrderStatusPaid || order.PaymentMethod != model.PaymentMethodJingSoftWeChat || order.PaymentURL == "" || !jingSoftMatchesPurchase(order, evidence) {
		return evidence, err
	}
	evidence.PaymentQRCode, err = a.paymentQRCode(ctx, resolvedBase, useSSRF, order.PaymentURL, order)
	return evidence, err
}

func (a *jingSoftHTTPAdapter) query(ctx context.Context, resolvedBaseURL string, order *model.JingSoftOrder, credentials JingSoftCredentials, client *http.Client, payment *jingSoftEnvelope) (*JingSoftOrderEvidence, error) {
	if order.UpstreamOrderID == nil || *order.UpstreamOrderID == "" {
		return nil, ErrJingSoftOrderUnavailable
	}
	var wire struct {
		TradeNo       string           `json:"trade_no"`
		Status        *int             `json:"status"`
		TotalAmount   *decimal.Decimal `json:"total_amount"`
		Quantity      *int             `json:"quantity"`
		Sendout       *int             `json:"sendout"`
		ChannelID     *int             `json:"channel_id"`
		Currency      string           `json:"currency"`
		Contact       string           `json:"contact"`
		TransactionID string           `json:"transaction_id"`
		Goods         jingSoftGoods    `json:"goods"`
		User          jingSoftShop     `json:"user"`
		Response      struct {
			Cards []string `json:"cards"`
		} `json:"response"`
	}
	if err := a.post(ctx, client, resolvedBaseURL, credentials.Visitor, "/shopApi/Order/info", map[string]any{"trade_no": *order.UpstreamOrderID, "query_password": credentials.Password, "dump": 1}, &wire); err != nil {
		return nil, err
	}
	if wire.TradeNo != *order.UpstreamOrderID || wire.Status == nil || wire.TotalAmount == nil || !wire.TotalAmount.IsPositive() || wire.Quantity == nil || *wire.Quantity != 1 || wire.Goods.Type != "card" || wire.Goods.Key == "" || wire.User.Token == "" || (wire.ChannelID != nil && (*wire.ChannelID <= 0 || strconv.Itoa(*wire.ChannelID) != order.ChannelID)) || (wire.Currency != "" && wire.Currency != order.Currency) {
		return nil, ErrJingSoftVerification
	}
	if *wire.Status < 0 || *wire.Status > 3 || *wire.Status == 3 {
		return nil, ErrJingSoftVerification
	}
	txID := strings.TrimSpace(wire.TransactionID)
	if len(txID) > 191 || strings.ContainsAny(txID, " \t\r\n\x00") {
		return nil, ErrJingSoftVerification
	}
	channelID := ""
	if wire.ChannelID != nil {
		channelID = strconv.Itoa(*wire.ChannelID)
	}
	evidence := &JingSoftOrderEvidence{
		UpstreamOrderID: wire.TradeNo,
		TransactionID:   txID,
		Contact:         wire.Contact,
		ShopID:          wire.User.Token,
		ProductID:       wire.Goods.Key,
		ChannelID:       channelID,
		Quantity:        *wire.Quantity,
		Amount:          wire.TotalAmount.String(),
		Currency:        wire.Currency,
		Paid:            *wire.Status == 1,
		Expired:         *wire.Status == 2,
	}
	if evidence.Paid {
		if payment == nil {
			payment = &jingSoftEnvelope{}
			if err := a.post(ctx, client, resolvedBaseURL, credentials.Visitor, "/shopApi/Pay/query", map[string]any{"trade_no": *order.UpstreamOrderID}, payment); err != nil {
				return nil, err
			}
		}
		if *payment.Code != 1 {
			// Payment and order endpoints may update at different times. Never
			// settle on a redirect, a user assertion, or one stale paid response.
			return nil, ErrJingSoftOrderUnavailable
		}
		if jingSoftModeFromOrder(order) == operation_setting.JingSoftModeDirect {
			evidence.Delivered = wire.Sendout != nil && *wire.Sendout == 1
			return evidence, nil
		}
		if wire.Sendout == nil || *wire.Sendout < 0 || *wire.Sendout > 1 || len(wire.Response.Cards) > 1 {
			return nil, ErrJingSoftVerification
		}
		evidence.Delivered = *wire.Sendout == 1
		if evidence.Delivered {
			if len(wire.Response.Cards) != 1 {
				return nil, ErrJingSoftVerification
			}
			evidence.RedemptionKey = wire.Response.Cards[0]
		}
	}
	return evidence, nil
}
