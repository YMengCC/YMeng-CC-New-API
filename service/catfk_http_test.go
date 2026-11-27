package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCatFKHTTPQuoteUsesStockOwnershipAndFeeInclusivePrice(t *testing.T) {
	for _, condition := range []string{"valid", "missing-stock", "wrong-shop", "disabled-channel"} {
		t.Run(condition, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var data any
				switch r.URL.Path {
				case "/shopApi/Shop/info":
					data = map[string]any{"token": "YMengCC", "nickname": "YMeng CC", "link": "https://catfk.com/shop/YMengCC"}
				case "/shopApi/Shop/goodsInfo":
					data = map[string]any{"goods_key": "goods", "goods_type": "card", "status": 1, "contact_format": "any", "user": map[string]any{"token": "YMengCC"}, "extend": map[string]any{"limit_count": 1}}
				case "/shopApi/Shop/goodsList":
					shop := "YMengCC"
					if condition == "wrong-shop" {
						shop = "other"
					}
					extend := map[string]any{"stock_count": 5}
					if condition == "missing-stock" {
						delete(extend, "stock_count")
					}
					data = map[string]any{"total": 1, "list": []any{map[string]any{"goods_key": "goods", "goods_type": "card", "user": map[string]any{"token": shop}, "extend": extend}}}
				case "/shopApi/Shop/getUserChannel":
					status := 1
					if condition == "disabled-channel" {
						status = 0
					}
					data = []any{
						map[string]any{"id": 1, "show_name": "Alipay", "status": status, "custom_status": 1, "paytype": map[string]any{"icon": "https://catfk.com/icon.png"}},
						map[string]any{"id": 2, "show_name": "WeChat Pay", "status": 1, "custom_status": 1, "paytype": map[string]any{"icon": "https://catfk.com/wechat.png"}},
						map[string]any{"id": 3, "show_name": "Unknown", "status": 1, "custom_status": 1},
					}
				case "/shopApi/Shop/getGoodsPrice":
					var request map[string]any
					require.NoError(t, common.DecodeJson(r.Body, &request))
					assert.Equal(t, float64(1), request["quantity"])
					assert.Equal(t, float64(1), request["channel_id"])
					data = map[string]any{"original_amount": 10, "fee": 0.18, "total_amount": 10.18}
				default:
					t.Errorf("unexpected endpoint %s", r.URL.Path)
				}
				body, err := common.Marshal(map[string]any{"code": 1, "data": data})
				require.NoError(t, err)
				_, _ = w.Write(body)
			}))
			defer server.Close()
			adapter := newCatFKHTTPAdapter()
			adapter.baseURL = server.URL
			offer, err := adapter.Quote(context.Background(), "https://catfk.com/shop/YMengCC", "goods", "1")
			if condition != "valid" {
				require.ErrorIs(t, err, ErrCatFKVerification)
				assert.Nil(t, offer)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, "10.18", offer.Amount)
			assert.Equal(t, "10", offer.OriginalAmount)
			assert.Equal(t, "0.18", offer.Fee)
			assert.Equal(t, "CNY", offer.Currency)
			assert.Equal(t, "YMengCC", offer.ShopID)
			assert.True(t, offer.InStock)
		})
	}
}

func TestCatFKHTTPChannelsClassifyPaymentNames(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/shopApi/Shop/getUserChannel", r.URL.Path)
		body, err := common.Marshal(map[string]any{"code": 1, "data": []any{
			map[string]any{"id": 1, "show_name": "Alipay", "status": 1, "custom_status": 1},
			map[string]any{"id": 2, "show_name": "微信支付", "status": 1, "custom_status": 1},
			map[string]any{"id": 3, "show_name": "Gift Card", "status": 1, "custom_status": 1},
			map[string]any{"id": 4, "show_name": "WeChat disabled", "status": 0, "custom_status": 1},
			map[string]any{"id": 5, "code": "WeixinNative", "show_name": "扫码通道A", "status": 1, "custom_status": 1},
			map[string]any{"id": 6, "code": "AlipayPc", "show_name": "官方收银B", "status": 1, "custom_status": 1},
			map[string]any{"id": 7, "code": "QQPay", "show_name": "微信支付", "status": 1, "custom_status": 1},
			map[string]any{"id": 8, "code": "AlipayPc", "show_name": "微信支付", "status": 1, "custom_status": 1},
		}})
		require.NoError(t, err)
		_, _ = w.Write(body)
	}))
	defer server.Close()

	adapter := newCatFKHTTPAdapter()
	adapter.baseURL = server.URL
	channels, err := adapter.Channels(context.Background(), "YMengCC")
	require.NoError(t, err)
	require.Len(t, channels, 7)
	assert.Equal(t, "alipay", channels[0].PaymentType)
	assert.Equal(t, "wxpay", channels[1].PaymentType)
	assert.Empty(t, channels[2].PaymentType)
	assert.Equal(t, "wxpay", channels[3].PaymentType)
	assert.Equal(t, "WeixinNative", channels[3].Code)
	assert.Equal(t, "alipay", channels[4].PaymentType)
	assert.Empty(t, channels[5].PaymentType, "unknown non-empty code must not be enabled by display name")
	assert.Empty(t, channels[6].PaymentType, "conflicting code and display name must not be enabled")
}

// The chain mirrors a captured Alipay desktop payment: a catfk redirect, an
// auto-submitted gateway form, gateway redirects, then the cashier page.
func TestCatFKHTTPPaymentQRCodeFollowsTheCashierChain(t *testing.T) {
	for _, condition := range []string{"cashier", "foreign-form", "redirect-loop", "no-code", "unsafe-code"} {
		t.Run(condition, func(t *testing.T) {
			var posted string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/shopApi/Pay/payment":
					http.Redirect(w, r, "/payApi/AlipayPc/pay.html?trade_no=CAT1", http.StatusFound)
				case "/payApi/AlipayPc/pay.html":
					action := "/gateway.do?charset=UTF-8"
					if condition == "foreign-form" {
						action = "https://gateway.example/gateway.do"
					}
					_, _ = w.Write([]byte(`<form id='alipaysubmit' action='` + action + `' method='POST'><input type='hidden' name='method' value='alipay.trade.page.pay'/><input type='hidden' name='biz_content' value='{"out_trade_no":"CAT1"}'/><input type='submit' value='ok' style='display:none;'></form><script>document.forms['alipaysubmit'].submit();</script>`))
				case "/gateway.do":
					require.NoError(t, r.ParseForm())
					posted = r.PostForm.Get("biz_content")
					http.Redirect(w, r, "/appAssign.htm", http.StatusFound)
				case "/appAssign.htm":
					target := "/standard/auth.htm?payOrderId=1"
					if condition == "redirect-loop" {
						target = "/appAssign.htm"
					}
					http.Redirect(w, r, target, http.StatusFound)
				case "/standard/auth.htm":
					code := "https://qr.alipay.com/upx-code"
					if condition == "unsafe-code" {
						code = "javascript:alert(1)"
					}
					page := `<html><body><div id="hidden-input-area" class="fn-hide"><input name="qrCode" type="hidden" value="` + code + `" id="J_qrCode" /><input name="qrImgUrl" type="hidden" value="https://mobilecodec.alipay.com/show.htm?code=upx-code" /></div></body></html>`
					if condition == "no-code" {
						page = `<html><body>cashier unavailable</body></html>`
					}
					_, _ = w.Write([]byte(page))
				default:
					t.Errorf("unexpected endpoint %s", r.URL.Path)
				}
			}))
			defer server.Close()
			adapter := newCatFKHTTPAdapter()
			adapter.baseURL = server.URL
			code, err := adapter.paymentQRCode(context.Background(), server.URL+"/shopApi/Pay/payment?trade_no=CAT1", &model.CatFKOrder{PaymentMethod: model.PaymentMethodCatFKAlipay})
			if condition != "cashier" {
				require.ErrorIs(t, err, ErrCatFKVerification)
				assert.Empty(t, code)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, "https://qr.alipay.com/upx-code", code)
			assert.Equal(t, `{"out_trade_no":"CAT1"}`, posted)
		})
	}
}

func TestCatFKHTTPWeChatCashierVerifiesQuotedTotal(t *testing.T) {
	const native = "weixin://wxpay/bizpayurl?pr=testToken"
	for _, tc := range []struct {
		name, price, payload string
		valid                bool
	}{
		{"exact total", "10.18", native, true},
		{"different total", "10.17", native, false},
		{"missing total", "", native, false},
		{"unexpected scheme", "10.18", "https://example.com/pay", false},
		{"unexpected argument", "10.18", native + "&extra=1", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "/payApi/WeixinNative/pay.html", r.URL.Path)
				image := "/payApi/common/generateQrcode.html?str=" + url.QueryEscape(url.QueryEscape(tc.payload))
				_, _ = w.Write([]byte(`<div class="price"><span>` + tc.price + `</span></div><img src="` + image + `">`))
			}))
			defer server.Close()
			adapter := newCatFKHTTPAdapter()
			adapter.baseURL = server.URL
			order := &model.CatFKOrder{PaymentMethod: model.PaymentMethodCatFKWeChat, Currency: "CNY", PriceAmount: "10.18"}
			code, err := adapter.paymentQRCode(context.Background(), server.URL+"/payApi/WeixinNative/pay.html", order)
			if tc.valid {
				require.NoError(t, err)
				assert.Equal(t, native, code)
			} else {
				require.ErrorIs(t, err, ErrCatFKVerification)
				assert.Empty(t, code)
			}
		})
	}
}

func TestCatFKHTTPPaymentQRCodeVisitsOnlyCatFKAndAlipay(t *testing.T) {
	adapter := newCatFKHTTPAdapter()
	for _, payURL := range []string{"https://payments.example/pay", "http://catfk.com/pay", "https://user@catfk.com/pay", "https://alipay.com.example/pay", "https://excashier.alipay.com:8443/pay", "http://excashier.alipay.com/pay"} {
		_, err := adapter.paymentQRCode(context.Background(), payURL, &model.CatFKOrder{PaymentMethod: model.PaymentMethodCatFKAlipay})
		require.ErrorIs(t, err, ErrCatFKVerification, payURL)
	}
}

func TestCatFKHTTPCreatePreservesIdentityAndCookiesWithoutResubmitting(t *testing.T) {
	var creates atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "visitor", r.Header.Get("Visitorid"))
		if r.URL.Path == "/shopApi/Pay/order" {
			creates.Add(1)
			var request map[string]any
			require.NoError(t, common.DecodeJson(r.Body, &request))
			assert.Equal(t, "123456", request["contact"])
			assert.Equal(t, "password", request["query_password"])
			http.SetCookie(w, &http.Cookie{Name: "session", Value: "recovery", Path: "/"})
			_, _ = w.Write([]byte(`{"code":1,"data":{"trade_no":"upstream-1","payurl":"https://catfk.com/pay/upstream-1","total_amount":10.18}}`))
			return
		}
		cookie, err := r.Cookie("session")
		require.NoError(t, err)
		assert.Equal(t, "recovery", cookie.Value)
		// Public order pages do not establish channel/currency evidence. These
		// fields must not be silently copied from the local purchase snapshot.
		_, _ = w.Write([]byte(`{"code":1,"data":{"trade_no":"upstream-1","status":0,"total_amount":10.18,"quantity":1,"sendout":0,"goods":{"goods_key":"goods","goods_type":"card"},"user":{"token":"YMengCC"}}}`))
	}))
	defer server.Close()
	adapter := newCatFKHTTPAdapter()
	adapter.baseURL = server.URL
	order := &model.CatFKOrder{ProductID: "goods", ChannelID: "1", ShopID: "YMengCC", PriceAmount: "10.18", Currency: "CNY"}
	created, err := adapter.Create(context.Background(), order, CatFKCredentials{Visitor: "visitor", Password: "password"}, "123456")
	require.NoError(t, err)
	require.NotNil(t, created)
	assert.Equal(t, "upstream-1", created.UpstreamOrderID)
	require.NotNil(t, created.Credentials)
	assert.Contains(t, created.Credentials.Cookie, "recovery")
	assert.EqualValues(t, 1, creates.Load())
}

func TestCatFKHTTPQueryAcceptsDocumentedReceiptAndChecksOptionalMetadata(t *testing.T) {
	for _, condition := range []string{"documented", "metadata", "wrong-channel", "wrong-currency", "payment-lag"} {
		t.Run(condition, func(t *testing.T) {
			receipt := map[string]any{"trade_no": "upstream-1", "status": 1, "total_amount": 10.18, "quantity": 1, "sendout": 0, "goods": map[string]any{"goods_key": "goods", "goods_type": "card"}, "user": map[string]any{"token": "YMengCC"}}
			if condition == "metadata" || condition == "wrong-channel" || condition == "wrong-currency" {
				receipt["channel_id"], receipt["currency"] = 1, "CNY"
			}
			if condition == "wrong-channel" {
				receipt["channel_id"] = 2
			}
			if condition == "wrong-currency" {
				receipt["currency"] = "USD"
			}
			body, err := common.Marshal(map[string]any{"code": 1, "data": receipt})
			require.NoError(t, err)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/shopApi/Pay/query" {
					if condition == "payment-lag" {
						_, _ = w.Write([]byte(`{"code":0,"msg":"not pay"}`))
					} else {
						_, _ = w.Write([]byte(`{"code":1,"data":null}`))
					}
					return
				}
				_, _ = w.Write(body)
			}))
			defer server.Close()
			adapter := newCatFKHTTPAdapter()
			adapter.baseURL = server.URL
			id := "upstream-1"
			order := &model.CatFKOrder{UpstreamOrderID: &id, ChannelID: "1", Currency: "CNY"}
			evidence, err := adapter.Query(context.Background(), order, CatFKCredentials{Visitor: "visitor", Password: "password"})
			if condition == "wrong-channel" || condition == "wrong-currency" {
				require.ErrorIs(t, err, ErrCatFKVerification)
				assert.Nil(t, evidence)
				return
			}
			if condition == "payment-lag" {
				require.ErrorIs(t, err, ErrCatFKOrderUnavailable)
				assert.Nil(t, evidence)
				return
			}
			require.NoError(t, err)
			require.NotNil(t, evidence)
			if condition == "documented" {
				assert.Empty(t, evidence.ChannelID)
				assert.Empty(t, evidence.Currency)
			} else {
				assert.Equal(t, "1", evidence.ChannelID)
				assert.Equal(t, "CNY", evidence.Currency)
			}
			assert.True(t, evidence.Paid)
			assert.False(t, evidence.Delivered)
		})
	}
}

func TestCatFKHTTPOrderEvidenceRejectsMissingOrMultipleCards(t *testing.T) {
	for _, cards := range []string{`["0123456789abcdef0123456789abcdef"]`, `[]`, `["0123456789abcdef0123456789abcdef","fedcba9876543210fedcba9876543210"]`} {
		t.Run(cards, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/shopApi/Pay/query" {
					_, _ = w.Write([]byte(`{"code":1,"data":null}`))
					return
				}
				_, _ = w.Write([]byte(`{"code":1,"data":{"trade_no":"upstream-1","status":1,"total_amount":"10.18","quantity":1,"sendout":1,"channel_id":1,"currency":"CNY","goods":{"goods_key":"goods","goods_type":"card"},"user":{"token":"YMengCC"},"response":{"cards":` + cards + `}}}`))
			}))
			defer server.Close()
			adapter := newCatFKHTTPAdapter()
			adapter.baseURL = server.URL
			id := "upstream-1"
			evidence, err := adapter.Query(context.Background(), &model.CatFKOrder{UpstreamOrderID: &id, ChannelID: "1", Currency: "CNY"}, CatFKCredentials{Visitor: "visitor", Password: "password"})
			if cards != `["0123456789abcdef0123456789abcdef"]` {
				require.ErrorIs(t, err, ErrCatFKVerification)
				return
			}
			require.NoError(t, err)
			assert.True(t, evidence.Paid)
			assert.True(t, evidence.Delivered)
			assert.Equal(t, "0123456789abcdef0123456789abcdef", evidence.RedemptionKey)
		})
	}
}

func TestCatFKHTTPReadRetryBudgetDoesNotRetryOrderCreationOrBusinessRejection(t *testing.T) {
	for _, condition := range []string{"transient-read", "malformed-read", "persistent-read", "business-rejection", "create-unavailable", "create-malformed", "cancelled-read"} {
		t.Run(condition, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				attempt := calls.Add(1)
				assert.Equal(t, "no-store", r.Header.Get("Cache-Control"))
				if condition == "business-rejection" {
					_, _ = w.Write([]byte(`{"code":0,"msg":"private rejection"}`))
					return
				}
				if attempt == 1 || condition == "persistent-read" {
					if condition == "malformed-read" || condition == "create-malformed" {
						_, _ = w.Write([]byte(`not JSON`))
					} else {
						w.WriteHeader(http.StatusServiceUnavailable)
					}
					return
				}
				_, _ = w.Write([]byte(`{"code":1,"data":[]}`))
			}))
			defer server.Close()
			adapter := newCatFKHTTPAdapter()
			adapter.baseURL = server.URL
			client, err := adapter.client(CatFKCredentials{})
			require.NoError(t, err)
			path := "/shopApi/Shop/getUserChannel"
			if condition == "create-unavailable" || condition == "create-malformed" {
				path = "/shopApi/Pay/order"
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if condition == "cancelled-read" {
				cancel()
			}
			var result []string
			err = adapter.post(ctx, client, "", path, map[string]any{}, &result)
			if condition == "transient-read" || condition == "malformed-read" {
				require.NoError(t, err)
				assert.EqualValues(t, 2, calls.Load())
				return
			}
			require.ErrorIs(t, err, ErrCatFKOrderUnavailable)
			if condition == "persistent-read" {
				assert.EqualValues(t, 3, calls.Load())
			} else if condition == "cancelled-read" {
				assert.Zero(t, calls.Load())
			} else {
				assert.EqualValues(t, 1, calls.Load())
			}
		})
	}
}

func TestCatFKHTTPTransportRejectsRedirectsAndHidesUpstreamMessages(t *testing.T) {
	var followed atomic.Int32
	for _, redirect := range []bool{false, true} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/leak" {
				followed.Add(1)
			}
			if redirect {
				http.Redirect(w, r, "/leak", http.StatusTemporaryRedirect)
				return
			}
			_, _ = w.Write([]byte(`{"code":0,"msg":"private upstream session value"}`))
		}))
		adapter := newCatFKHTTPAdapter()
		adapter.baseURL = server.URL
		_, err := adapter.Channels(context.Background(), "YMengCC")
		require.Error(t, err)
		assert.NotContains(t, err.Error(), "private upstream")
		server.Close()
	}
	assert.Zero(t, followed.Load())
}

func TestCatFKHTTPQueryProbesLightweightUntilPaidOrNearExpiry(t *testing.T) {
	var probeCalls, receiptCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/shopApi/Pay/query":
			probeCalls.Add(1)
			_, _ = w.Write([]byte(`{"code":0,"msg":"not pay"}`))
		case "/shopApi/Order/info":
			receiptCalls.Add(1)
			_, _ = w.Write([]byte(`{"code":1,"data":{"trade_no":"upstream-1","status":2,"total_amount":"10.18","quantity":1,"goods":{"goods_key":"goods","goods_type":"card"},"user":{"token":"YMengCC"}}}`))
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
		}
	}))
	defer server.Close()

	adapter := newCatFKHTTPAdapter()
	adapter.baseURL = server.URL
	now := int64(1700000100)
	adapter.now = func() time.Time { return time.Unix(now, 0) }
	id := "upstream-1"
	order := &model.CatFKOrder{
		UpstreamOrderID: &id,
		Status:          model.CatFKOrderStatusPending,
		PaymentMethod:   model.PaymentMethodCatFKWeChat,
		PaymentQRCode:   "weixin://wxpay/bizpayurl?pr=ready",
		ChannelID:       "1",
		Currency:        "CNY",
		CreatedAt:       now - 60,
	}

	// Ordinary fresh unpaid poll hits only /shopApi/Pay/query.
	evidence, err := adapter.Query(context.Background(), order, CatFKCredentials{Visitor: "v", Password: "p"})
	require.NoError(t, err)
	require.NotNil(t, evidence)
	assert.True(t, evidence.ProbeOnlyUnpaid)
	assert.False(t, evidence.Paid)
	assert.EqualValues(t, 1, probeCalls.Load())
	assert.Zero(t, receiptCalls.Load())

	// Near-expiry order (>= 5 min old) reconciles with /shopApi/Order/info and detects expiration.
	order.CreatedAt = now - 300
	evidence, err = adapter.Query(context.Background(), order, CatFKCredentials{Visitor: "v", Password: "p"})
	require.NoError(t, err)
	require.NotNil(t, evidence)
	assert.False(t, evidence.ProbeOnlyUnpaid)
	assert.True(t, evidence.Expired)
	assert.EqualValues(t, 2, probeCalls.Load())
	assert.EqualValues(t, 1, receiptCalls.Load())
}

func TestCatFKHTTPDirectSlotRestockPriceUpdateAndVisibilityChecks(t *testing.T) {
	for _, scenario := range []string{"success-with-fee", "restock-timeout-recovered", "public-goods-rejected"} {
		t.Run(scenario, func(t *testing.T) {
			var stock atomic.Int32
			stock.Store(2)
			var currentPrice atomic.Value
			currentPrice.Store("1.00")
			var addCalls, updateCalls atomic.Int32

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var data any
				switch r.URL.Path {
				case "/shopApi/Shop/info":
					data = map[string]any{"token": "YMengCC", "nickname": "YMeng CC", "link": "https://catfk.com/shop/YMengCC"}
				case "/shopApi/Shop/goodsInfo":
					data = map[string]any{
						"goods_key": "slot1", "goods_type": "card", "status": 1, "price": currentPrice.Load(),
						"contact_format": "any", "user": map[string]any{"token": "YMengCC"}, "extend": map[string]any{"limit_count": 1},
					}
				case "/shopApi/Shop/getUserChannel":
					data = []any{
						map[string]any{"id": 4, "code": "WeixinNative", "show_name": "微信", "rate": 2, "status": 1, "custom_status": 1},
					}
				case "/shopApi/Shop/getGoodsPrice":
					base, _ := strconv.ParseFloat(currentPrice.Load().(string), 64)
					fee := float64(int(base*2+0.5)) / 100
					data = map[string]any{"original_amount": base, "fee": fee, "total_amount": base + fee}
				case "/merchantApi/Goods/list":
					assert.Equal(t, "secret-merchant-token", r.Header.Get("merchant-token"))
					data = map[string]any{"total": 1, "list": []any{
						map[string]any{"id": 99, "goods_key": "slot1", "price": currentPrice.Load(), "status": 1, "extend": map[string]any{"stock_count": stock.Load()}},
					}}
				case "/merchantApi/Goods/info":
					assert.Equal(t, "secret-merchant-token", r.Header.Get("merchant-token"))
					show := 0
					if scenario == "public-goods-rejected" {
						show = 1
					}
					data = map[string]any{
						"id": 99, "goods_type": "card", "goods_key": "slot1", "category_id": 1, "name": "Direct Slot",
						"price": currentPrice.Load(), "market_price": currentPrice.Load(), "coupon_status": 1, "status": 1,
						"fee_payer": 1, "show": show, "contact_format": "any",
						"extend": map[string]any{"lock_card": 1, "limit_count": 1},
					}
				case "/merchantApi/GoodsCardStorage/add":
					assert.Equal(t, "secret-merchant-token", r.Header.Get("merchant-token"))
					call := addCalls.Add(1)
					stock.Add(10)
					if scenario == "restock-timeout-recovered" && call == 1 {
						w.WriteHeader(http.StatusGatewayTimeout)
						return
					}
					data = nil
				case "/merchantApi/Goods/update":
					assert.Equal(t, "secret-merchant-token", r.Header.Get("merchant-token"))
					updateCalls.Add(1)
					var payload map[string]any
					require.NoError(t, common.DecodeJson(r.Body, &payload))
					assert.Equal(t, float64(0), payload["coupon_status"])
					assert.Equal(t, float64(0), payload["show"])
					assert.Equal(t, "any", payload["contact_format"])
					ext := payload["extend"].(map[string]any)
					assert.Equal(t, float64(0), ext["lock_card"])
					currentPrice.Store("15.00")
					data = map[string]any{"id": 99, "goods_key": "slot1"}
				default:
					t.Errorf("unexpected endpoint %s", r.URL.Path)
				}
				body, err := common.Marshal(map[string]any{"code": 1, "data": data})
				require.NoError(t, err)
				_, _ = w.Write(body)
			}))
			defer server.Close()

			adapter := newCatFKHTTPAdapter()
			adapter.baseURL = server.URL

			quoted, err := adapter.QuoteDirect(context.Background(), "YMengCC", "secret-merchant-token", "slot1", "4", "15.00")
			if scenario == "public-goods-rejected" {
				require.ErrorIs(t, err, ErrCatFKVerification)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, "15.30", quoted.Amount)
			assert.Equal(t, "15.00", quoted.OriginalAmount)
			assert.Equal(t, "0.30", quoted.Fee)
			assert.Zero(t, updateCalls.Load(), "QuoteDirect must never mutate remote slot price")

			ready, err := adapter.PrepareDirectSlot(context.Background(), "YMengCC", "secret-merchant-token", "slot1", "4", "15.00", "", 5, 10)
			require.NoError(t, err)
			assert.Equal(t, "15.30", ready.Offer.Amount)
			assert.Equal(t, "15.00", ready.ConfirmedPrice)
			assert.EqualValues(t, 1, addCalls.Load(), "timeout recovery must check remote stock instead of re-sending card add")
			assert.EqualValues(t, 1, updateCalls.Load())
		})
	}
}
