package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

const catFKResponseLimit = 2 << 20

type catFKHTTPAdapter struct {
	baseURL string
	now     func() time.Time
}

func newCatFKHTTPAdapter() *catFKHTTPAdapter {
	return &catFKHTTPAdapter{baseURL: "https://catfk.com", now: time.Now}
}

func (a *catFKHTTPAdapter) currentTime() time.Time {
	if a.now != nil {
		return a.now()
	}
	return time.Now()
}

// The documented order receipt binds trade, shop, goods, amount and quantity.
// Channel and currency are optional upstream fields, never invented evidence.
func (*catFKHTTPAdapter) Ready() bool { return true }

func (a *catFKHTTPAdapter) client(credentials CatFKCredentials) (*http.Client, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, ErrCatFKOrderUnavailable
	}
	origin, err := url.Parse(a.baseURL)
	if err != nil {
		return nil, ErrCatFKOrderUnavailable
	}
	if credentials.Cookie != "" {
		var cookies []*http.Cookie
		if common.UnmarshalJsonStr(credentials.Cookie, &cookies) != nil {
			return nil, ErrCatFKVerification
		}
		jar.SetCookies(origin, cookies)
	}
	return &http.Client{Timeout: 25 * time.Second, Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, nil
}

type catFKEnvelope struct {
	Code *int            `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

func catFKIsSingleAttemptWritePath(path string) bool {
	return path == "/shopApi/Pay/order" ||
		path == "/merchantApi/Goods/update" ||
		path == "/merchantApi/GoodsCardStorage/add"
}

// Reads share a 15-second budget and at most three attempts. State-changing
// writes always get exactly one attempt, even if upstream accepted before disconnect.
func (a *catFKHTTPAdapter) post(ctx context.Context, client *http.Client, visitor, path string, request, result any) error {
	return a.postWithHeaders(ctx, client, visitor, path, nil, request, result)
}

func (a *catFKHTTPAdapter) postWithHeaders(ctx context.Context, client *http.Client, visitor, path string, extraHeaders map[string]string, request, result any) error {
	body, err := common.Marshal(request)
	if err != nil {
		return ErrCatFKInvalidRequest
	}
	attempts := 3
	if catFKIsSingleAttemptWritePath(path) {
		attempts = 1
	} else {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
	}
	for attempt := range attempts {
		if ctx.Err() != nil {
			return ErrCatFKOrderUnavailable
		}
		attemptCtx := ctx
		cancel := func() {}
		if attempts > 1 {
			attemptCtx, cancel = context.WithTimeout(ctx, 5*time.Second)
		}
		envelope, retry, callErr := a.postOnce(attemptCtx, client, visitor, path, extraHeaders, body)
		cancel()
		if callErr != nil {
			if retry && attempt+1 < attempts {
				continue
			}
			return callErr
		}
		if path == "/shopApi/Pay/query" {
			// Payment confirmation is represented by the envelope code itself.
			payment, ok := result.(*catFKEnvelope)
			if !ok {
				return ErrCatFKInvalidRequest
			}
			*payment = *envelope
			return nil
		}
		if *envelope.Code != 1 {
			return ErrCatFKOrderUnavailable
		}
		if result != nil && common.Unmarshal(envelope.Data, result) != nil {
			return ErrCatFKVerification
		}
		return nil
	}
	return ErrCatFKOrderUnavailable
}

func (a *catFKHTTPAdapter) postOnce(ctx context.Context, client *http.Client, visitor, path string, extraHeaders map[string]string, body []byte) (*catFKEnvelope, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, false, ErrCatFKOrderUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cache-Control", "no-store")
	req.Header.Set("Origin", a.baseURL)
	req.Header.Set("Referer", a.baseURL+"/")
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
		return nil, true, ErrCatFKOrderUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		retry := response.StatusCode == http.StatusRequestTimeout || response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500
		return nil, retry, ErrCatFKOrderUnavailable
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, catFKResponseLimit+1))
	if err != nil || len(data) > catFKResponseLimit {
		return nil, err != nil, ErrCatFKOrderUnavailable
	}
	var envelope catFKEnvelope
	if common.Unmarshal(data, &envelope) != nil || envelope.Code == nil {
		return nil, true, ErrCatFKOrderUnavailable
	}
	return &envelope, false, nil
}

type catFKShop struct {
	Token    string `json:"token"`
	Nickname string `json:"nickname"`
	Link     string `json:"link"`
}

type catFKGoods struct {
	Key           string           `json:"goods_key"`
	Type          string           `json:"goods_type"`
	Status        int              `json:"status"`
	Price         *decimal.Decimal `json:"price"`
	ContactFormat string           `json:"contact_format"`
	User          catFKShop        `json:"user"`
	Extend        struct {
		StockCount *int `json:"stock_count"`
		LimitCount int  `json:"limit_count"`
	} `json:"extend"`
}

type catFKMerchantGoodsItem struct {
	ID       int              `json:"id"`
	GoodsKey string           `json:"goods_key"`
	Price    *decimal.Decimal `json:"price"`
	Status   int              `json:"status"`
	Extend   struct {
		StockCount *int `json:"stock_count"`
	} `json:"extend"`
}

type catFKMerchantGoodsDetail struct {
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

type catFKChannelWire struct {
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

func (a *catFKHTTPAdapter) fetchRawChannels(ctx context.Context, client *http.Client, token string) ([]catFKChannelWire, error) {
	var wire []catFKChannelWire
	if err := a.post(ctx, client, "", "/shopApi/Shop/getUserChannel", map[string]any{"token": token}, &wire); err != nil {
		return nil, err
	}
	return wire, nil
}

func (a *catFKHTTPAdapter) Channels(ctx context.Context, token string) ([]operation_setting.CatFKChannel, error) {
	token, err := operation_setting.NormalizeCatFKStoreToken(token)
	if err != nil || token == "" {
		return nil, ErrCatFKInvalidRequest
	}
	client, err := a.client(CatFKCredentials{})
	if err != nil {
		return nil, err
	}
	wire, err := a.fetchRawChannels(ctx, client, token)
	if err != nil {
		return nil, err
	}
	channels := make([]operation_setting.CatFKChannel, 0, len(wire))
	seen := make(map[int]bool, len(wire))
	for _, channel := range wire {
		if channel.ID <= 0 || channel.Status != 1 || channel.CustomStatus != 1 {
			continue
		}
		if seen[channel.ID] {
			return nil, ErrCatFKVerification
		}
		seen[channel.ID] = true
		name := channel.ShowName
		if name == "" {
			name = channel.Name
		}
		if name == "" {
			return nil, ErrCatFKVerification
		}
		code := strings.TrimSpace(channel.Code)
		if len(code) > 128 || strings.ContainsAny(code, "\r\n\x00") {
			return nil, ErrCatFKVerification
		}
		icon := channel.Paytype.Icon
		if !catFKValidPaymentURL(icon) {
			icon = ""
		}
		channels = append(channels, operation_setting.CatFKChannel{
			ID:          strconv.Itoa(channel.ID),
			Code:        code,
			Name:        name,
			Icon:        icon,
			PaymentType: operation_setting.CatFKClassifyChannel(code, channel.Paytype.Code, name),
		})
	}
	return channels, nil
}

func (a *catFKHTTPAdapter) merchantHeaders(merchantToken, refererPath string) map[string]string {
	return map[string]string{
		"merchant-token": merchantToken,
		"Referer":        a.baseURL + refererPath,
	}
}

func (a *catFKHTTPAdapter) lookupMerchantGoodsItem(ctx context.Context, client *http.Client, merchantToken, goodsKey string) (*catFKMerchantGoodsItem, error) {
	for page := 1; page <= 20; page++ {
		var list struct {
			Total int                      `json:"total"`
			List  []catFKMerchantGoodsItem `json:"list"`
		}
		err := a.postWithHeaders(ctx, client, "", "/merchantApi/Goods/list", a.merchantHeaders(merchantToken, "/merchant/goods/list?is_proxy=0"), map[string]any{
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
		for i := range list.List {
			if list.List[i].GoodsKey == goodsKey {
				if list.List[i].ID <= 0 || list.List[i].Extend.StockCount == nil || *list.List[i].Extend.StockCount < 0 {
					return nil, ErrCatFKVerification
				}
				return &list.List[i], nil
			}
		}
		if len(list.List) == 0 || page*100 >= list.Total {
			break
		}
	}
	return nil, ErrCatFKVerification
}

func (a *catFKHTTPAdapter) fetchVerifiedDirectGoods(ctx context.Context, client *http.Client, storeToken, merchantToken, slotGoodsKey string) (*catFKShop, *catFKGoods, *catFKMerchantGoodsItem, *catFKMerchantGoodsDetail, error) {
	var shop catFKShop
	if err := a.post(ctx, client, "", "/shopApi/Shop/info", map[string]any{"token": storeToken}, &shop); err != nil {
		return nil, nil, nil, nil, err
	}
	if shop.Token != storeToken || shop.Link != "https://catfk.com/shop/"+storeToken {
		return nil, nil, nil, nil, ErrCatFKVerification
	}
	var goods catFKGoods
	if err := a.post(ctx, client, "", "/shopApi/Shop/goodsInfo", map[string]any{"goods_key": slotGoodsKey}, &goods); err != nil {
		return nil, nil, nil, nil, err
	}
	// Dedicated direct-credit slots must allow non-QQ order identifiers ("any")
	// and belong to the configured shop.
	if goods.Key != slotGoodsKey || goods.User.Token != storeToken || goods.Type != "card" || goods.Status != 1 || goods.ContactFormat != "any" || goods.Extend.LimitCount != 1 {
		return nil, nil, nil, nil, ErrCatFKVerification
	}
	item, err := a.lookupMerchantGoodsItem(ctx, client, merchantToken, slotGoodsKey)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	var detail catFKMerchantGoodsDetail
	err = a.postWithHeaders(ctx, client, "", "/merchantApi/Goods/info", a.merchantHeaders(merchantToken, fmt.Sprintf("/merchant/goods/create?goods_type=card&id=%d", item.ID)), map[string]any{"id": strconv.Itoa(item.ID)}, &detail)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	// Dedicated direct-credit slots must be hidden from the public shop listing
	// (show == 0) so external visitors cannot buy placeholder cards, and prevents
	// accidental mutation of public real-code products.
	if detail.ID != item.ID || detail.GoodsKey != slotGoodsKey || detail.GoodsType != "card" || detail.Show != 0 || detail.ContactFormat != "any" || detail.Extend.LimitCount != 1 {
		return nil, nil, nil, nil, ErrCatFKVerification
	}
	return &shop, &goods, item, &detail, nil
}

func (a *catFKHTTPAdapter) QuoteDirect(ctx context.Context, storeToken, merchantToken, slotGoodsKey, channelID, baseAmount string) (*CatFKOffer, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	storeToken, err := operation_setting.NormalizeCatFKStoreToken(storeToken)
	merchantToken = strings.TrimSpace(merchantToken)
	id, idErr := strconv.Atoi(channelID)
	baseDecimal, baseErr := decimal.NewFromString(baseAmount)
	if err != nil || storeToken == "" || merchantToken == "" || slotGoodsKey == "" || idErr != nil || id <= 0 || strconv.Itoa(id) != channelID || baseErr != nil || !baseDecimal.IsPositive() {
		return nil, ErrCatFKInvalidRequest
	}
	client, err := a.client(CatFKCredentials{})
	if err != nil {
		return nil, err
	}
	shop, _, _, detail, err := a.fetchVerifiedDirectGoods(ctx, client, storeToken, merchantToken, slotGoodsKey)
	if err != nil {
		return nil, err
	}
	rawChannels, err := a.fetchRawChannels(ctx, client, storeToken)
	if err != nil {
		return nil, err
	}
	var matchedChannel *catFKChannelWire
	for i := range rawChannels {
		ch := &rawChannels[i]
		if ch.ID == id && ch.Status == 1 && ch.CustomStatus == 1 {
			name := ch.ShowName
			if name == "" {
				name = ch.Name
			}
			if operation_setting.CatFKClassifyChannel(ch.Code, ch.Paytype.Code, name) != "" {
				matchedChannel = ch
				break
			}
		}
	}
	if matchedChannel == nil {
		return nil, ErrCatFKVerification
	}
	var samplePrice struct {
		OriginalAmount *decimal.Decimal `json:"original_amount"`
		Fee            *decimal.Decimal `json:"fee"`
		TotalAmount    *decimal.Decimal `json:"total_amount"`
	}
	if err = a.post(ctx, client, "", "/shopApi/Shop/getGoodsPrice", map[string]any{"goods_key": slotGoodsKey, "quantity": 1, "coupon_code": "", "channel_id": id}, &samplePrice); err != nil {
		return nil, err
	}
	if samplePrice.TotalAmount == nil || !samplePrice.TotalAmount.IsPositive() {
		return nil, ErrCatFKVerification
	}
	fee := decimal.Zero
	buyerPaysFee := detail.FeePayer == 1 || (detail.FeePayer == -1 && samplePrice.Fee != nil && samplePrice.Fee.IsPositive())
	if buyerPaysFee {
		if matchedChannel.Rate != nil && !matchedChannel.Rate.IsNegative() {
			fee = baseDecimal.Mul(*matchedChannel.Rate).Div(decimal.NewFromInt(100)).Round(2)
		} else if samplePrice.OriginalAmount != nil && samplePrice.OriginalAmount.IsPositive() && samplePrice.Fee != nil && !samplePrice.Fee.IsNegative() {
			fee = baseDecimal.Mul(*samplePrice.Fee).Div(*samplePrice.OriginalAmount).Round(2)
		} else {
			return nil, ErrCatFKVerification
		}
	}
	total := baseDecimal.Add(fee)
	if !total.IsPositive() || total.GreaterThan(decimal.NewFromInt(1000000000)) {
		return nil, ErrCatFKVerification
	}
	return &CatFKOffer{
		ShopID:         storeToken,
		ShopName:       shop.Nickname,
		ShopURL:        shop.Link,
		ProductID:      slotGoodsKey,
		ChannelID:      channelID,
		Amount:         total.StringFixed(2),
		OriginalAmount: baseDecimal.StringFixed(2),
		Fee:            fee.StringFixed(2),
		Currency:       "CNY",
		Quantity:       1,
		InStock:        true,
	}, nil
}

func (a *catFKHTTPAdapter) PrepareDirectSlot(ctx context.Context, storeToken, merchantToken, slotGoodsKey, channelID, baseAmount, knownConfirmedPrice string, minStock, restockBatch int) (*CatFKDynamicSlotReady, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	storeToken, err := operation_setting.NormalizeCatFKStoreToken(storeToken)
	merchantToken = strings.TrimSpace(merchantToken)
	id, idErr := strconv.Atoi(channelID)
	baseDecimal, baseErr := decimal.NewFromString(baseAmount)
	if err != nil || storeToken == "" || merchantToken == "" || slotGoodsKey == "" || idErr != nil || id <= 0 || strconv.Itoa(id) != channelID || baseErr != nil || !baseDecimal.IsPositive() || minStock < 1 || restockBatch < 1 {
		return nil, ErrCatFKInvalidRequest
	}
	client, err := a.client(CatFKCredentials{})
	if err != nil {
		return nil, err
	}
	shop, _, item, detail, err := a.fetchVerifiedDirectGoods(ctx, client, storeToken, merchantToken, slotGoodsKey)
	if err != nil {
		return nil, err
	}
	beforeStock := *item.Extend.StockCount
	if beforeStock < minStock {
		batchTag := strings.ToUpper(strconv.FormatInt(a.currentTime().Unix(), 36))
		var builder strings.Builder
		for i := range restockBatch {
			if i > 0 {
				builder.WriteByte('\n')
			}
			builder.WriteString(fmt.Sprintf("DIRECT-%s-%03d-%s", batchTag, i+1, common.GetRandomString(8)))
		}
		addErr := a.postWithHeaders(ctx, client, "", "/merchantApi/GoodsCardStorage/add", a.merchantHeaders(merchantToken, "/merchant/goods/goods_card_storage_add"), map[string]any{
			"goods_id":      detail.ID,
			"content":       builder.String(),
			"first":         0,
			"remove_repeat": 0,
		}, nil)
		if addErr != nil {
			// On timeout or disconnect, check remote stock first instead of blindly re-adding.
			rechecked, checkErr := a.lookupMerchantGoodsItem(ctx, client, merchantToken, slotGoodsKey)
			if checkErr != nil {
				return nil, fmt.Errorf("%w: %v", errCatFKSlotAmbiguous, addErr)
			}
			afterStock := *rechecked.Extend.StockCount
			if afterStock <= 0 {
				return nil, ErrCatFKOrderUnavailable
			}
		}
	}

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
		if updateErr := a.postWithHeaders(ctx, client, "", "/merchantApi/Goods/update", a.merchantHeaders(merchantToken, fmt.Sprintf("/merchant/goods/create?goods_type=card&id=%d", detail.ID)), payload, nil); updateErr != nil {
			return nil, fmt.Errorf("%w: %v", errCatFKSlotAmbiguous, updateErr)
		}
	}

	// Read back both storefront goodsInfo and getGoodsPrice to prove the updated
	// price is live before submitting /shopApi/Pay/order.
	var goodsAfter catFKGoods
	if err = a.post(ctx, client, "", "/shopApi/Shop/goodsInfo", map[string]any{"goods_key": slotGoodsKey}, &goodsAfter); err != nil {
		return nil, fmt.Errorf("%w: %v", errCatFKSlotAmbiguous, err)
	}
	if goodsAfter.Key != slotGoodsKey || goodsAfter.User.Token != storeToken || goodsAfter.Status != 1 || goodsAfter.ContactFormat != "any" || (goodsAfter.Price != nil && !goodsAfter.Price.Equal(baseDecimal)) {
		return nil, errCatFKSlotAmbiguous
	}
	var livePrice struct {
		OriginalAmount *decimal.Decimal `json:"original_amount"`
		Fee            *decimal.Decimal `json:"fee"`
		TotalAmount    *decimal.Decimal `json:"total_amount"`
	}
	if err = a.post(ctx, client, "", "/shopApi/Shop/getGoodsPrice", map[string]any{"goods_key": slotGoodsKey, "quantity": 1, "coupon_code": "", "channel_id": id}, &livePrice); err != nil {
		return nil, fmt.Errorf("%w: %v", errCatFKSlotAmbiguous, err)
	}
	if livePrice.TotalAmount == nil || !livePrice.TotalAmount.IsPositive() || livePrice.TotalAmount.GreaterThan(decimal.NewFromInt(1000000000)) {
		return nil, errCatFKSlotAmbiguous
	}
	if livePrice.OriginalAmount != nil && !livePrice.OriginalAmount.Equal(baseDecimal) {
		return nil, errCatFKSlotAmbiguous
	}
	offer := CatFKOffer{
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
	return &CatFKDynamicSlotReady{Offer: offer, ConfirmedPrice: baseDecimal.StringFixed(2)}, nil
}

func (a *catFKHTTPAdapter) Quote(ctx context.Context, token, goodsKey, channelID string) (*CatFKOffer, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	token, err := operation_setting.NormalizeCatFKStoreToken(token)
	id, idErr := strconv.Atoi(channelID)
	if err != nil || token == "" || goodsKey == "" || idErr != nil || id <= 0 || strconv.Itoa(id) != channelID {
		return nil, ErrCatFKInvalidRequest
	}
	client, err := a.client(CatFKCredentials{})
	if err != nil {
		return nil, err
	}
	var shop catFKShop
	if err = a.post(ctx, client, "", "/shopApi/Shop/info", map[string]any{"token": token}, &shop); err != nil {
		return nil, err
	}
	if shop.Token != token || shop.Link != "https://catfk.com/shop/"+token {
		return nil, ErrCatFKVerification
	}
	var goods catFKGoods
	if err = a.post(ctx, client, "", "/shopApi/Shop/goodsInfo", map[string]any{"goods_key": goodsKey}, &goods); err != nil {
		return nil, err
	}
	if goods.Key != goodsKey || goods.User.Token != token || goods.Type != "card" || goods.Status != 1 || (goods.ContactFormat != "any" && goods.ContactFormat != "qq") || goods.Extend.LimitCount != 1 {
		return nil, ErrCatFKVerification
	}
	// The detail endpoint omits stock. Verify the exact product in the shop's
	// paginated list; a missing stock field is not proof of availability.
	inStock := false
	found := false
	for page := 1; page <= 50; page++ {
		var list struct {
			Total int          `json:"total"`
			List  []catFKGoods `json:"list"`
		}
		if err = a.post(ctx, client, "", "/shopApi/Shop/goodsList", map[string]any{"token": token, "goods_type": "card", "current": page, "pageSize": 20}, &list); err != nil {
			return nil, err
		}
		for _, item := range list.List {
			if item.Key != goodsKey {
				continue
			}
			if found || item.Type != "card" || item.User.Token != token || item.Extend.StockCount == nil || *item.Extend.StockCount < 0 {
				return nil, ErrCatFKVerification
			}
			found = true
			inStock = *item.Extend.StockCount > 0
		}
		if found || len(list.List) == 0 || page*20 >= list.Total {
			break
		}
	}
	if !found {
		return nil, ErrCatFKVerification
	}
	channels, err := a.Channels(ctx, token)
	if err != nil {
		return nil, err
	}
	available := false
	for _, channel := range channels {
		if channel.ID == channelID {
			available = true
			break
		}
	}
	if !available {
		return nil, ErrCatFKVerification
	}
	var price struct {
		OriginalAmount *decimal.Decimal `json:"original_amount"`
		Fee            *decimal.Decimal `json:"fee"`
		TotalAmount    *decimal.Decimal `json:"total_amount"`
	}
	if err = a.post(ctx, client, "", "/shopApi/Shop/getGoodsPrice", map[string]any{"goods_key": goodsKey, "quantity": 1, "coupon_code": "", "channel_id": id}, &price); err != nil {
		return nil, err
	}
	if price.TotalAmount == nil || !price.TotalAmount.IsPositive() || price.TotalAmount.GreaterThan(decimal.NewFromInt(1000000000)) {
		return nil, ErrCatFKVerification
	}
	offer := &CatFKOffer{ShopID: token, ShopName: shop.Nickname, ShopURL: shop.Link, ProductID: goodsKey, ChannelID: channelID, Amount: price.TotalAmount.String(), Currency: "CNY", Quantity: 1, InStock: inStock}
	// The fee is display-only; it is kept only when the breakdown adds up.
	if price.OriginalAmount != nil && price.Fee != nil && price.OriginalAmount.IsPositive() && !price.Fee.IsNegative() && price.OriginalAmount.Add(*price.Fee).Equal(*price.TotalAmount) {
		offer.OriginalAmount, offer.Fee = price.OriginalAmount.String(), price.Fee.String()
	}
	return offer, nil
}

var catFKDirectContactPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,191}$`)

func (a *catFKHTTPAdapter) Create(ctx context.Context, order *model.CatFKOrder, credentials CatFKCredentials, contact string) (*CatFKCreatedOrder, error) {
	channelID, err := strconv.Atoi(order.ChannelID)
	if err != nil || channelID <= 0 || strconv.Itoa(channelID) != order.ChannelID || credentials.Visitor == "" || credentials.Password == "" {
		return nil, ErrCatFKInvalidRequest
	}
	if catFKModeFromOrder(order) == operation_setting.CatFKModeDirect {
		if contact == "" || contact != order.TradeNo || !catFKDirectContactPattern.MatchString(contact) {
			return nil, ErrCatFKInvalidRequest
		}
	} else if !isValidCatFKQQ(contact) {
		return nil, ErrCatFKInvalidRequest
	}
	client, err := a.client(credentials)
	if err != nil {
		return nil, err
	}
	var wire struct {
		TradeNo     string           `json:"trade_no"`
		PayURL      string           `json:"payurl"`
		TotalAmount *decimal.Decimal `json:"total_amount"`
	}
	err = a.post(ctx, client, credentials.Visitor, "/shopApi/Pay/order", map[string]any{"goods_key": order.ProductID, "quantity": 1, "coupon_code": "", "channel_id": channelID, "contact": contact, "query_password": credentials.Password, "select_cards_ids": []int{}, "extend": map[string]any{}}, &wire)
	origin, _ := url.Parse(a.baseURL)
	cookies, sealErr := common.Marshal(client.Jar.Cookies(origin))
	if sealErr != nil {
		return nil, ErrCatFKOrderUnavailable
	}
	credentials.Cookie = string(cookies)
	result := &CatFKCreatedOrder{UpstreamOrderID: wire.TradeNo, PaymentURL: wire.PayURL, Credentials: &credentials}
	if err != nil {
		return result, err
	}
	if wire.TradeNo == "" || !catFKValidPaymentURL(wire.PayURL) || wire.TotalAmount == nil {
		return result, ErrCatFKVerification
	}
	expected, priceErr := decimal.NewFromString(order.PriceAmount)
	if priceErr != nil || !wire.TotalAmount.Equal(expected) {
		return result, ErrCatFKVerification
	}
	orderCopy := *order
	orderCopy.UpstreamOrderID = &wire.TradeNo
	evidence, err := a.query(ctx, &orderCopy, credentials, client, nil)
	if evidence != nil {
		result.Evidence = *evidence
	}
	if err == nil && evidence != nil && !evidence.Paid && !evidence.Expired && catFKMatchesPurchase(&orderCopy, evidence) {
		if order.PaymentMethod == model.PaymentMethodCatFKWeChat {
			result.PaymentQRCode, err = a.paymentQRCode(ctx, wire.PayURL, order)
		} else {
			result.PaymentQRCode, _ = a.paymentQRCode(ctx, wire.PayURL, order)
		}
	}
	// Capture cookies from both creation and its immediate verification query.
	cookies, sealErr = common.Marshal(client.Jar.Cookies(origin))
	if sealErr != nil {
		return result, ErrCatFKOrderUnavailable
	}
	credentials.Cookie = string(cookies)
	return result, err
}

// paymentQRCode follows the cashier chain without executing scripts or fetching QR data.
func (a *catFKHTTPAdapter) paymentQRCode(ctx context.Context, payURL string, order *model.CatFKOrder) (string, error) {
	wechat := order.PaymentMethod == model.PaymentMethodCatFKWeChat
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	origin, err := url.Parse(a.baseURL)
	if err != nil {
		return "", ErrCatFKOrderUnavailable
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		return "", ErrCatFKOrderUnavailable
	}
	client := &http.Client{Timeout: 15 * time.Second, Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	method, target, form := http.MethodGet, payURL, url.Values(nil)
	for range 8 {
		u, err := url.Parse(target)
		if err != nil || u.User != nil || !(u.Scheme == origin.Scheme && u.Host == origin.Host || !wechat && u.Scheme == "https" && strings.HasSuffix(u.Hostname(), ".alipay.com") && u.Port() == "") {
			return "", ErrCatFKVerification
		}
		var body io.Reader
		if method == http.MethodPost {
			body = strings.NewReader(form.Encode())
		}
		req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
		if err != nil {
			return "", ErrCatFKOrderUnavailable
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
		req.Header.Set("Accept", "text/html,application/xhtml+xml")
		if method == http.MethodPost {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		response, err := client.Do(req)
		if err != nil {
			return "", ErrCatFKOrderUnavailable
		}
		data, err := io.ReadAll(io.LimitReader(response.Body, catFKResponseLimit+1))
		response.Body.Close()
		if err != nil || len(data) > catFKResponseLimit {
			return "", ErrCatFKOrderUnavailable
		}
		if response.StatusCode >= 300 && response.StatusCode < 400 {
			next, err := u.Parse(response.Header.Get("Location"))
			if err != nil || response.Header.Get("Location") == "" {
				return "", ErrCatFKVerification
			}
			method, target, form = http.MethodGet, next.String(), nil
			continue
		}
		if response.StatusCode != http.StatusOK {
			return "", ErrCatFKOrderUnavailable
		}
		doc, err := html.Parse(bytes.NewReader(data))
		if err != nil {
			return "", ErrCatFKVerification
		}
		if wechat {
			if u.Path != "/payApi/WeixinNative/pay.html" {
				return "", ErrCatFKVerification
			}
			return catFKWeChatCashierQR(doc, u, order)
		}
		var formNode *html.Node
		for n := range doc.Descendants() {
			if n.Type != html.ElementNode {
				continue
			}
			if n.DataAtom == atom.Input && catFKHTMLAttr(n, "name") == "qrCode" {
				code := strings.TrimSpace(catFKHTMLAttr(n, "value"))
				if len(code) > 2048 || !catFKValidPaymentURL(code) {
					return "", ErrCatFKVerification
				}
				return code, nil
			}
			if n.DataAtom == atom.Form && formNode == nil {
				formNode = n
			}
		}
		if formNode == nil {
			return "", ErrCatFKVerification
		}
		next, err := u.Parse(catFKHTMLAttr(formNode, "action"))
		if err != nil {
			return "", ErrCatFKVerification
		}
		form = url.Values{}
		for n := range formNode.Descendants() {
			if n.Type == html.ElementNode && n.DataAtom == atom.Input && catFKHTMLAttr(n, "name") != "" && catFKHTMLAttr(n, "type") != "submit" {
				form.Add(catFKHTMLAttr(n, "name"), catFKHTMLAttr(n, "value"))
			}
		}
		method, target = http.MethodGet, next.String()
		if strings.EqualFold(catFKHTMLAttr(formNode, "method"), http.MethodPost) {
			method = http.MethodPost
		} else {
			next.RawQuery = form.Encode()
			target, form = next.String(), nil
		}
	}
	return "", ErrCatFKVerification
}

var catFKWeChatQRPattern = regexp.MustCompile(`^weixin://wxpay/bizpayurl\?pr=[A-Za-z0-9_-]+$`)
var catFKCashierPricePattern = regexp.MustCompile(`^[0-9]{1,16}(\.[0-9]{1,2})?$`)

func catFKWeChatCashierQR(doc *html.Node, page *url.URL, order *model.CatFKOrder) (string, error) {
	var code, price string
	for n := range doc.Descendants() {
		if n.Type != html.ElementNode {
			continue
		}
		if n.DataAtom == atom.Span && n.Parent != nil && n.Parent.DataAtom == atom.Div && slices.Contains(strings.Fields(catFKHTMLAttr(n.Parent, "class")), "price") {
			if n.FirstChild != nil && n.FirstChild == n.LastChild && n.FirstChild.Type == html.TextNode && strings.TrimSpace(n.FirstChild.Data) == "元" {
				continue
			}
			if price != "" || n.FirstChild == nil || n.FirstChild != n.LastChild || n.FirstChild.Type != html.TextNode {
				return "", ErrCatFKVerification
			}
			price = strings.TrimSpace(n.FirstChild.Data)
			if !catFKCashierPricePattern.MatchString(price) {
				return "", ErrCatFKVerification
			}
		}
		if n.DataAtom != atom.Img {
			continue
		}
		image, err := page.Parse(catFKHTMLAttr(n, "src"))
		if err != nil || image.Path != "/payApi/common/generateQrcode.html" {
			continue
		}
		params, err := url.ParseQuery(image.RawQuery)
		if err != nil || len(params) != 1 || len(params["str"]) != 1 || code != "" || image.Host != page.Host || image.Scheme != page.Scheme || image.User != nil {
			return "", ErrCatFKVerification
		}
		code = params.Get("str")
		for range 2 {
			if strings.HasPrefix(code, "weixin://") {
				break
			}
			decoded, unescapeErr := url.QueryUnescape(code)
			if unescapeErr != nil {
				return "", ErrCatFKVerification
			}
			if decoded == code {
				break
			}
			code = decoded
		}
		if len(code) > 2048 || !catFKWeChatQRPattern.MatchString(code) {
			return "", ErrCatFKVerification
		}
	}
	amount, err := decimal.NewFromString(price)
	expected, expectedErr := decimal.NewFromString(order.PriceAmount)
	if code == "" || order.Currency != "CNY" || err != nil || expectedErr != nil || !amount.IsPositive() || !amount.Equal(expected) {
		return "", ErrCatFKVerification
	}
	return code, nil
}

func catFKHTMLAttr(n *html.Node, key string) string {
	for _, attr := range n.Attr {
		if attr.Key == key {
			return attr.Val
		}
	}
	return ""
}

func (a *catFKHTTPAdapter) Query(ctx context.Context, order *model.CatFKOrder, credentials CatFKCredentials) (*CatFKOrderEvidence, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	client, err := a.client(credentials)
	if err != nil {
		return nil, err
	}
	if order.UpstreamOrderID == nil || *order.UpstreamOrderID == "" {
		return nil, ErrCatFKOrderUnavailable
	}
	// Probe first so ordinary unpaid polling avoids the heavier card receipt.
	// Read the full receipt when paid, ambiguous, recovering state/QR, or near expiry.
	var probe catFKEnvelope
	if err := a.post(ctx, client, credentials.Visitor, "/shopApi/Pay/query", map[string]any{"trade_no": *order.UpstreamOrderID}, &probe); err != nil {
		return nil, err
	}
	paid := probe.Code != nil && *probe.Code == 1
	ambiguousProbe := probe.Code == nil || (*probe.Code != 0 && *probe.Code != 1)
	nearExpiry := order.CreatedAt > 0 && a.currentTime().Unix()-order.CreatedAt >= 5*60
	needReceipt := paid || ambiguousProbe || nearExpiry || order.Status != model.CatFKOrderStatusPending || (order.PaymentMethod == model.PaymentMethodCatFKWeChat && order.PaymentQRCode == "")
	if !needReceipt {
		return &CatFKOrderEvidence{ProbeOnlyUnpaid: true}, nil
	}
	evidence, err := a.query(ctx, order, credentials, client, &probe)
	if err != nil || evidence.Paid || evidence.Expired || paid || order.Status == model.CatFKOrderStatusPaid || order.PaymentMethod != model.PaymentMethodCatFKWeChat || order.PaymentURL == "" || !catFKMatchesPurchase(order, evidence) {
		return evidence, err
	}
	evidence.PaymentQRCode, err = a.paymentQRCode(ctx, order.PaymentURL, order)
	return evidence, err
}

func (a *catFKHTTPAdapter) query(ctx context.Context, order *model.CatFKOrder, credentials CatFKCredentials, client *http.Client, payment *catFKEnvelope) (*CatFKOrderEvidence, error) {
	if order.UpstreamOrderID == nil || *order.UpstreamOrderID == "" {
		// The platform has no verified lookup by our local idempotency key.
		return nil, ErrCatFKOrderUnavailable
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
		Goods         catFKGoods       `json:"goods"`
		User          catFKShop        `json:"user"`
		Response      struct {
			Cards []string `json:"cards"`
		} `json:"response"`
	}
	if err := a.post(ctx, client, credentials.Visitor, "/shopApi/Order/info", map[string]any{"trade_no": *order.UpstreamOrderID, "query_password": credentials.Password, "dump": 1}, &wire); err != nil {
		return nil, err
	}
	if wire.TradeNo != *order.UpstreamOrderID || wire.Status == nil || wire.TotalAmount == nil || !wire.TotalAmount.IsPositive() || wire.Quantity == nil || *wire.Quantity != 1 || wire.Goods.Type != "card" || wire.Goods.Key == "" || wire.User.Token == "" || (wire.ChannelID != nil && (*wire.ChannelID <= 0 || strconv.Itoa(*wire.ChannelID) != order.ChannelID)) || (wire.Currency != "" && wire.Currency != order.Currency) {
		return nil, ErrCatFKVerification
	}
	if *wire.Status < 0 || *wire.Status > 3 || *wire.Status == 3 {
		return nil, ErrCatFKVerification
	}
	txID := strings.TrimSpace(wire.TransactionID)
	if len(txID) > 191 || strings.ContainsAny(txID, " \t\r\n\x00") {
		return nil, ErrCatFKVerification
	}
	channelID := ""
	if wire.ChannelID != nil {
		channelID = strconv.Itoa(*wire.ChannelID)
	}
	evidence := &CatFKOrderEvidence{
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
			payment = &catFKEnvelope{}
			if err := a.post(ctx, client, credentials.Visitor, "/shopApi/Pay/query", map[string]any{"trade_no": *order.UpstreamOrderID}, payment); err != nil {
				return nil, err
			}
		}
		if *payment.Code != 1 {
			// Payment and order endpoints may update at different times. Never
			// settle on a redirect, a user assertion, or one stale paid response.
			return nil, ErrCatFKOrderUnavailable
		}
		if catFKModeFromOrder(order) == operation_setting.CatFKModeDirect {
			evidence.Delivered = wire.Sendout != nil && *wire.Sendout == 1
			return evidence, nil
		}
		if wire.Sendout == nil || *wire.Sendout < 0 || *wire.Sendout > 1 || len(wire.Response.Cards) > 1 {
			return nil, ErrCatFKVerification
		}
		evidence.Delivered = *wire.Sendout == 1
		if evidence.Delivered {
			if len(wire.Response.Cards) != 1 {
				return nil, ErrCatFKVerification
			}
			evidence.RedemptionKey = wire.Response.Cards[0]
		}
	}
	return evidence, nil
}
