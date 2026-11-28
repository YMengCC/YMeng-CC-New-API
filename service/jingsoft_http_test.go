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
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestJingSoftHTTPQuoteUsesStockOwnershipAndFeeInclusivePrice(t *testing.T) {
	for _, condition := range []string{"valid", "missing-stock", "wrong-shop", "disabled-channel"} {
		t.Run(condition, func(t *testing.T) {
			var upstreamCalls atomic.Int32
			var stockCount atomic.Int32
			stockCount.Store(5)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				upstreamCalls.Add(1)
				var data any
				switch r.URL.Path {
				case "/shopApi/Shop/info":
					data = map[string]any{"token": "YMengCC", "nickname": "YMeng CC", "link": "https://wzyp.cn/shop/YMengCC"}
				case "/shopApi/Shop/goodsInfo":
					data = map[string]any{"goods_key": "goods", "goods_type": "card", "status": 1, "contact_format": "any", "user": map[string]any{"token": "YMengCC"}}
				case "/shopApi/Shop/goodsList":
					shop := "YMengCC"
					if condition == "wrong-shop" {
						shop = "other"
					}
					extend := map[string]any{"stock_count": stockCount.Load()}
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
						map[string]any{"id": 1, "show_name": "Alipay", "status": status, "custom_status": 1, "paytype": map[string]any{"icon": "https://wzyp.cn/icon.png"}},
						map[string]any{"id": 2, "show_name": "WeChat Pay", "status": 1, "custom_status": 1, "paytype": map[string]any{"icon": "https://wzyp.cn/wechat.png"}},
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
			adapter := newJingSoftHTTPAdapter()
			adapter.baseURL = server.URL
			offer, err := adapter.Quote(context.Background(), "https://wzyp.cn", "https://wzyp.cn/shop/YMengCC", "goods", "1")
			if condition != "valid" {
				require.ErrorIs(t, err, ErrJingSoftVerification)
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

			callsAfterFirst := upstreamCalls.Load()
			assert.EqualValues(t, 5, callsAfterFirst)
			stockCount.Store(0)
			recheckedOffer, err := adapter.Quote(context.Background(), "https://wzyp.cn", "YMengCC", "goods", "1")
			require.NoError(t, err)
			assert.False(t, recheckedOffer.InStock, "Mode 1 Quote must re-verify live stock before order creation")
			assert.EqualValues(t, callsAfterFirst+3, upstreamCalls.Load(), "warm Mode 1 Quote reuses cached Shop/info and getUserChannel while checking live stock and price")
		})
	}
}

func TestJingSoftHTTPCheckCompatibilityAndProductDiscovery(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/shopApi/Shop/info":
			var req map[string]any
			require.NoError(t, common.DecodeJson(r.Body, &req))
			tok, _ := req["token"].(string)
			if tok == "" {
				_, _ = w.Write([]byte(`{"code":0,"msg":"token required","data":null}`))
				return
			}
			if tok != "YMengCC" {
				_, _ = w.Write([]byte(`{"code":0,"msg":"store not found","data":null}`))
				return
			}
			_, _ = w.Write([]byte(`{"code":1,"data":{"token":"YMengCC","nickname":"YMeng Store","link":"https://wzyp.cn/shop/YMengCC"}}`))
		case "/shopApi/Shop/getUserChannel":
			var req map[string]any
			require.NoError(t, common.DecodeJson(r.Body, &req))
			if req["token"] == "" {
				_, _ = w.Write([]byte(`{"code":0,"msg":"token required","data":null}`))
				return
			}
			_, _ = w.Write([]byte(`{"code":1,"data":[{"id":1,"code":"AlipayPc","show_name":"支付宝","status":1,"custom_status":1},{"id":2,"code":"WeixinNative","show_name":"微信支付","status":1,"custom_status":1},{"id":3,"code":"CustomOther","show_name":"其他","status":1,"custom_status":1}]}`))
		case "/shopApi/Shop/goodsList":
			_, _ = w.Write([]byte(`{"code":1,"data":{"total":2,"list":[{"goods_key":"tier_10","goods_type":"card","name":"$10 充值卡","status":1,"price":"72.00","user":{"token":"YMengCC"},"extend":{"stock_count":8}},{"goods_key":"bad_limit","goods_type":"card","name":"不兼容商品","status":1,"price":"15.00","user":{"token":"YMengCC"},"extend":{"stock_count":0}}]}}`))
		case "/shopApi/Shop/goodsInfo":
			var req map[string]any
			require.NoError(t, common.DecodeJson(r.Body, &req))
			if req["goods_key"] == "tier_10" {
				_, _ = w.Write([]byte(`{"code":1,"data":{"goods_key":"tier_10","goods_type":"card","name":"$10 充值卡","status":1,"price":"72.00","contact_format":"any","user":{"token":"YMengCC"},"extend":{"limit_count":1}}}`))
				return
			}
			_, _ = w.Write([]byte(`{"code":1,"data":{"goods_key":"bad_limit","goods_type":"card","name":"不兼容商品","status":1,"price":"15.00","contact_format":"email","user":{"token":"YMengCC"},"extend":{"limit_count":5}}}`))
		case "/merchantApi/user/checkToken":
			if r.Header.Get("merchant-token") == "valid-merchant" {
				_, _ = w.Write([]byte(`{"code":1,"data":null,"msg":"ok"}`))
				return
			}
			_, _ = w.Write([]byte(`{"code":0,"data":null,"msg":"expired"}`))
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
		}
	}))
	defer server.Close()

	adapter := newJingSoftHTTPAdapter()
	adapter.baseURL = server.URL

	// 1. Platform URL probe without store token detects JingSoft API.
	probeOnly, err := adapter.CheckCompatibility(context.Background(), "https://wzyp.cn", "", "")
	require.NoError(t, err)
	assert.True(t, probeOnly.Compatible)
	assert.True(t, probeOnly.ProtocolVerified)
	assert.False(t, probeOnly.StoreVerified)

	// 2. Full store + merchant token verification returns store summary.
	fullCheck, err := adapter.CheckCompatibility(context.Background(), "https://wzyp.cn", "YMengCC", "valid-merchant")
	require.NoError(t, err)
	assert.True(t, fullCheck.Compatible)
	assert.True(t, fullCheck.StoreVerified)
	assert.Equal(t, "YMeng Store", fullCheck.ShopName)
	assert.Equal(t, 3, fullCheck.ChannelCount)
	assert.Equal(t, 2, fullCheck.SupportedChannelCount)
	assert.Equal(t, 2, fullCheck.ProductCount)
	assert.True(t, fullCheck.MerchantTokenChecked)
	assert.True(t, fullCheck.MerchantTokenValid)

	// 3. Unknown store token reports incompatible store token message.
	wrongStore, err := adapter.CheckCompatibility(context.Background(), "https://wzyp.cn", "UnknownShop", "")
	require.NoError(t, err)
	assert.False(t, wrongStore.Compatible)
	assert.True(t, wrongStore.ProtocolVerified)
	assert.Equal(t, "JingSoft API is reachable, but the store token was not found on this platform", wrongStore.MessageKey)

	// 4. Product discovery returns card products enriched with goodsInfo compatibility metadata.
	products, err := adapter.DiscoverProducts(context.Background(), "https://wzyp.cn", "YMengCC")
	require.NoError(t, err)
	require.Len(t, products, 2)
	assert.Equal(t, "tier_10", products[0].GoodsKey)
	assert.Equal(t, "72.00", products[0].PriceCNY)
	assert.Equal(t, 8, products[0].StockCount)
	assert.True(t, products[0].InStock)
	assert.True(t, products[0].Compatible)

	assert.Equal(t, "bad_limit", products[1].GoodsKey)
	assert.False(t, products[1].InStock)
	assert.False(t, products[1].Compatible)
}

func TestJingSoftHTTPDiscoverDirectSlotsFiltersHiddenCardProductsOnly(t *testing.T) {
	var detailCalls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("merchant-token") != "valid-merchant" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/merchantApi/Goods/list":
			_, _ = w.Write([]byte(`{"code":1,"data":{"total":5,"list":[
				{"id":10,"goods_type":"card","goods_key":"public_redeem","name":"Public Card","price":"72.00","status":1,"show":1,"extend":{"stock_count":5}},
				{"id":11,"goods_type":"card","goods_key":"slot_ok","name":"Hidden Slot 1","price":"1.00","status":1,"show":0,"extend":{"stock_count":12}},
				{"id":12,"goods_type":"card","goods_key":"slot_qq","name":"Hidden QQ Slot","price":"1.00","status":1,"extend":{"stock_count":3}},
				{"id":13,"goods_type":"card","goods_key":"slot_offsale","name":"Hidden Off-sale","price":"1.00","status":0,"show":0,"extend":{"stock_count":0}},
				{"id":14,"goods_type":"card","goods_key":"public_no_show_in_list","name":"Public Omitted Show","price":"10.00","status":1,"extend":{"stock_count":9}}
			]}}`))
		case "/merchantApi/Goods/info":
			var req map[string]any
			require.NoError(t, common.DecodeJson(r.Body, &req))
			id, _ := req["id"].(string)
			detailCalls = append(detailCalls, id)
			switch id {
			case "11":
				_, _ = w.Write([]byte(`{"code":1,"data":{"id":11,"goods_type":"card","goods_key":"slot_ok","name":"Hidden Slot 1","price":"1.00","status":1,"show":0,"contact_format":"any"}}`))
			case "12":
				_, _ = w.Write([]byte(`{"code":1,"data":{"id":12,"goods_type":"card","goods_key":"slot_qq","name":"Hidden QQ Slot","price":"1.00","status":1,"show":0,"contact_format":"qq"}}`))
			case "13":
				_, _ = w.Write([]byte(`{"code":1,"data":{"id":13,"goods_type":"card","goods_key":"slot_offsale","name":"Hidden Off-sale","price":"1.00","status":0,"show":0,"contact_format":"any"}}`))
			case "14":
				_, _ = w.Write([]byte(`{"code":1,"data":{"id":14,"goods_type":"card","goods_key":"public_no_show_in_list","name":"Public Omitted Show","price":"10.00","status":1,"show":1,"contact_format":"any"}}`))
			default:
				t.Errorf("unexpected goods info id %s", id)
			}
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
		}
	}))
	defer server.Close()

	adapter := newJingSoftHTTPAdapter()
	adapter.baseURL = server.URL

	slots, err := adapter.DiscoverDirectSlots(context.Background(), "https://wzyp.cn", "valid-merchant")
	require.NoError(t, err)
	assert.Equal(t, []string{"11", "12", "13", "14"}, detailCalls)
	require.Len(t, slots, 3)

	assert.Equal(t, "slot_ok", slots[0].GoodsKey)
	assert.True(t, slots[0].Compatible)
	assert.Equal(t, 12, slots[0].StockCount)
	assert.True(t, slots[0].InStock)

	assert.Equal(t, "slot_qq", slots[1].GoodsKey)
	assert.Equal(t, "qq", slots[1].ContactFormat)
	assert.False(t, slots[1].Compatible)

	assert.Equal(t, "slot_offsale", slots[2].GoodsKey)
	assert.Equal(t, "any", slots[2].ContactFormat)
	assert.False(t, slots[2].Compatible)

	_, err = adapter.DiscoverDirectSlots(context.Background(), "https://wzyp.cn", "expired-merchant")
	assert.ErrorIs(t, err, errJingSoftMerchantAuthExpired)
}

func TestJingSoftHTTPChannelsClassifyPaymentNames(t *testing.T) {
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

	adapter := newJingSoftHTTPAdapter()
	adapter.baseURL = server.URL
	channels, err := adapter.Channels(context.Background(), "https://wzyp.cn", "YMengCC")
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

// The chain mirrors a captured Alipay desktop payment: a JingSoft redirect, an
// auto-submitted gateway form, gateway redirects, then the cashier page.
func TestJingSoftHTTPPaymentQRCodeFollowsTheCashierChain(t *testing.T) {
	for _, condition := range []string{"cashier", "foreign-form", "redirect-loop", "no-code", "unsafe-code"} {
		t.Run(condition, func(t *testing.T) {
			var posted string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/shopApi/Pay/payment":
					http.Redirect(w, r, "/payApi/AlipayPc/pay.html?trade_no=JS1", http.StatusFound)
				case "/payApi/AlipayPc/pay.html":
					action := "/gateway.do?charset=UTF-8"
					if condition == "foreign-form" {
						action = "https://gateway.example/gateway.do"
					}
					_, _ = w.Write([]byte(`<form id='alipaysubmit' action='` + action + `' method='POST'><input type='hidden' name='method' value='alipay.trade.page.pay'/><input type='hidden' name='biz_content' value='{"out_trade_no":"JS1"}'/><input type='submit' value='ok' style='display:none;'></form><script>document.forms['alipaysubmit'].submit();</script>`))
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
			adapter := newJingSoftHTTPAdapter()
			adapter.baseURL = server.URL
			code, err := adapter.paymentQRCode(context.Background(), server.URL, false, server.URL+"/shopApi/Pay/payment?trade_no=JS1", &model.JingSoftOrder{PaymentMethod: model.PaymentMethodJingSoftAlipay})
			if condition != "cashier" {
				require.ErrorIs(t, err, ErrJingSoftVerification)
				assert.Empty(t, code)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, "https://qr.alipay.com/upx-code", code)
			assert.Equal(t, `{"out_trade_no":"JS1"}`, posted)
		})
	}
}

func TestJingSoftHTTPWeChatCashierVerifiesQuotedTotal(t *testing.T) {
	const native = "weixin://wxpay/bizpayurl?pr=testToken"
	for _, tc := range []struct {
		name, path, price, payload string
		valid                      bool
	}{
		{"exact total native", "/payApi/WeixinNative/pay.html", "10.18", native, true},
		{"different total", "/payApi/WeixinNative/pay.html", "10.17", native, false},
		{"missing total", "/payApi/WeixinNative/pay.html", "", native, false},
		{"unexpected scheme", "/payApi/WeixinNative/pay.html", "10.18", "https://example.com/pay", false},
		{"unexpected argument", "/payApi/WeixinNative/pay.html", "10.18", native + "&extra=1", false},
		{"exact total jspay", "/payApi/WeixinJspay/pay.html?trade_no=JS1", "10.18", "__SELF_JSPAY_JS1__", true},
		{"jspay mismatched trade_no", "/payApi/WeixinJspay/pay.html?trade_no=JS1", "10.18", "__SELF_JSPAY_OTHER__", false},
		{"jspay url on native path", "/payApi/WeixinNative/pay.html", "10.18", "__SELF_JSPAY_JS1__", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var serverURL string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				payload := tc.payload
				switch payload {
				case "__SELF_JSPAY_JS1__":
					payload = serverURL + "/payApi/WeixinJspay/pay.html?trade_no=JS1"
				case "__SELF_JSPAY_OTHER__":
					payload = serverURL + "/payApi/WeixinJspay/pay.html?trade_no=JS2"
				}
				image := "/payApi/common/generateQrcode.html?str=" + url.QueryEscape(url.QueryEscape(payload))
				_, _ = w.Write([]byte(`<div class="price"><span>` + tc.price + `</span> <span>元</span></div><img src="` + image + `">`))
			}))
			serverURL = server.URL
			defer server.Close()
			adapter := newJingSoftHTTPAdapter()
			adapter.baseURL = server.URL
			upstreamID := "JS1"
			order := &model.JingSoftOrder{UpstreamOrderID: &upstreamID, PaymentMethod: model.PaymentMethodJingSoftWeChat, Currency: "CNY", PriceAmount: "10.18"}
			code, err := adapter.paymentQRCode(context.Background(), server.URL, false, server.URL+tc.path, order)
			if tc.valid {
				require.NoError(t, err)
				if tc.payload == "__SELF_JSPAY_JS1__" {
					assert.Equal(t, server.URL+"/payApi/WeixinJspay/pay.html?trade_no=JS1", code)
				} else {
					assert.Equal(t, native, code)
				}
			} else {
				require.ErrorIs(t, err, ErrJingSoftVerification)
				assert.Empty(t, code)
			}
		})
	}
	assert.True(t, jingSoftValidPaymentQRCode("https://wzyp.cn/payApi/WeixinJspay/pay.html?trade_no=JS261127LW6MJE", model.PaymentMethodJingSoftWeChat, "https://wzyp.cn"))
	assert.False(t, jingSoftValidPaymentQRCode("https://example.com/payApi/WeixinJspay/pay.html?trade_no=JS261127LW6MJE", model.PaymentMethodJingSoftWeChat, "https://wzyp.cn"))
	assert.False(t, jingSoftValidPaymentQRCode("https://wzyp.cn/shop/YMengCC", model.PaymentMethodJingSoftWeChat, "https://wzyp.cn"))
}

func TestJingSoftHTTPPaymentQRCodeVisitsOnlyConfiguredOriginAndAlipay(t *testing.T) {
	adapter := newJingSoftHTTPAdapter()
	for _, payURL := range []string{"https://payments.example/pay", "http://wzyp.cn/pay", "https://user@wzyp.cn/pay", "https://alipay.com.example/pay", "https://excashier.alipay.com:8443/pay", "http://excashier.alipay.com/pay"} {
		_, err := adapter.paymentQRCode(context.Background(), "https://wzyp.cn", false, payURL, &model.JingSoftOrder{PaymentMethod: model.PaymentMethodJingSoftAlipay})
		require.ErrorIs(t, err, ErrJingSoftVerification, payURL)
	}
}

func TestJingSoftHTTPCreatePreservesIdentityAndCookiesWithoutResubmitting(t *testing.T) {
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
			_, _ = w.Write([]byte(`{"code":1,"data":{"trade_no":"upstream-1","payurl":"https://wzyp.cn/pay/upstream-1","total_amount":10.18}}`))
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
	adapter := newJingSoftHTTPAdapter()
	adapter.baseURL = server.URL
	order := &model.JingSoftOrder{ProductID: "goods", ChannelID: "1", ShopID: "YMengCC", PriceAmount: "10.18", Currency: "CNY"}
	created, err := adapter.Create(context.Background(), "https://wzyp.cn", order, JingSoftCredentials{Visitor: "visitor", Password: "password"}, "123456")
	require.NoError(t, err)
	require.NotNil(t, created)
	assert.Equal(t, "upstream-1", created.UpstreamOrderID)
	require.NotNil(t, created.Credentials)
	assert.Contains(t, created.Credentials.Cookie, "recovery")
	assert.EqualValues(t, 1, creates.Load())
}

func TestJingSoftHTTPQueryAcceptsDocumentedReceiptAndChecksOptionalMetadata(t *testing.T) {
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
			adapter := newJingSoftHTTPAdapter()
			adapter.baseURL = server.URL
			id := "upstream-1"
			order := &model.JingSoftOrder{UpstreamOrderID: &id, ChannelID: "1", Currency: "CNY"}
			evidence, err := adapter.Query(context.Background(), "https://wzyp.cn", order, JingSoftCredentials{Visitor: "visitor", Password: "password"})
			if condition == "wrong-channel" || condition == "wrong-currency" {
				require.ErrorIs(t, err, ErrJingSoftVerification)
				assert.Nil(t, evidence)
				return
			}
			if condition == "payment-lag" {
				require.ErrorIs(t, err, ErrJingSoftOrderUnavailable)
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

func TestJingSoftHTTPOrderEvidenceRejectsMissingOrMultipleCards(t *testing.T) {
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
			adapter := newJingSoftHTTPAdapter()
			adapter.baseURL = server.URL
			id := "upstream-1"
			evidence, err := adapter.Query(context.Background(), "https://wzyp.cn", &model.JingSoftOrder{UpstreamOrderID: &id, ChannelID: "1", Currency: "CNY"}, JingSoftCredentials{Visitor: "visitor", Password: "password"})
			if cards != `["0123456789abcdef0123456789abcdef"]` {
				require.ErrorIs(t, err, ErrJingSoftVerification)
				return
			}
			require.NoError(t, err)
			assert.True(t, evidence.Paid)
			assert.True(t, evidence.Delivered)
			assert.Equal(t, "0123456789abcdef0123456789abcdef", evidence.RedemptionKey)
		})
	}
}

func TestJingSoftHTTPReadRetryBudgetDoesNotRetryOrderCreationOrBusinessRejection(t *testing.T) {
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
			adapter := newJingSoftHTTPAdapter()
			adapter.baseURL = server.URL
			client, err := adapter.client(server.URL, false, JingSoftCredentials{})
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
			err = adapter.post(ctx, client, server.URL, "", path, map[string]any{}, &result)
			if condition == "transient-read" || condition == "malformed-read" {
				require.NoError(t, err)
				assert.EqualValues(t, 2, calls.Load())
				return
			}
			require.ErrorIs(t, err, ErrJingSoftOrderUnavailable)
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

func TestJingSoftHTTPTransportRejectsRedirectsAndHidesUpstreamMessages(t *testing.T) {
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
		adapter := newJingSoftHTTPAdapter()
		adapter.baseURL = server.URL
		_, err := adapter.Channels(context.Background(), "https://wzyp.cn", "YMengCC")
		require.Error(t, err)
		assert.NotContains(t, err.Error(), "private upstream")
		server.Close()
	}
	assert.Zero(t, followed.Load())
}

func TestJingSoftHTTPQueryProbesLightweightUntilPaidOrNearExpiry(t *testing.T) {
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

	adapter := newJingSoftHTTPAdapter()
	adapter.baseURL = server.URL
	now := int64(1700000100)
	adapter.now = func() time.Time { return time.Unix(now, 0) }
	id := "upstream-1"
	order := &model.JingSoftOrder{
		UpstreamOrderID: &id,
		Status:          model.JingSoftOrderStatusPending,
		PaymentMethod:   model.PaymentMethodJingSoftWeChat,
		PaymentQRCode:   "weixin://wxpay/bizpayurl?pr=ready",
		ChannelID:       "1",
		Currency:        "CNY",
		CreatedAt:       now - 60,
	}

	// Ordinary fresh unpaid poll hits only /shopApi/Pay/query.
	evidence, err := adapter.Query(context.Background(), "https://wzyp.cn", order, JingSoftCredentials{Visitor: "v", Password: "p"})
	require.NoError(t, err)
	require.NotNil(t, evidence)
	assert.True(t, evidence.ProbeOnlyUnpaid)
	assert.False(t, evidence.Paid)
	assert.EqualValues(t, 1, probeCalls.Load())
	assert.Zero(t, receiptCalls.Load())

	// Near-expiry order (>= 5 min old) reconciles with /shopApi/Order/info and detects expiration.
	order.CreatedAt = now - 300
	evidence, err = adapter.Query(context.Background(), "https://wzyp.cn", order, JingSoftCredentials{Visitor: "v", Password: "p"})
	require.NoError(t, err)
	require.NotNil(t, evidence)
	assert.False(t, evidence.ProbeOnlyUnpaid)
	assert.True(t, evidence.Expired)
	assert.EqualValues(t, 2, probeCalls.Load())
	assert.EqualValues(t, 1, receiptCalls.Load())
}

func TestJingSoftHTTPDirectSlotRestockPriceUpdateAndVisibilityChecks(t *testing.T) {
	for _, scenario := range []string{"success-with-fee", "seller-pays-fee-default", "restock-timeout-recovered", "public-goods-rejected"} {
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
					data = map[string]any{"token": "YMengCC", "nickname": "YMeng CC", "link": "https://wzyp.cn/shop/YMengCC"}
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
					if scenario == "seller-pays-fee-default" {
						data = map[string]any{"original_amount": base, "fee": fee, "fee_payer": 0, "total_amount": base}
					} else {
						data = map[string]any{"original_amount": base, "fee": fee, "fee_payer": 1, "total_amount": base + fee}
					}
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
					feePayer := 1
					if scenario == "seller-pays-fee-default" {
						feePayer = -1
					}
					data = map[string]any{
						"id": 99, "goods_type": "card", "goods_key": "slot1", "category_id": 1, "name": "Direct Slot",
						"price": currentPrice.Load(), "market_price": currentPrice.Load(), "coupon_status": 1, "status": 1,
						"fee_payer": feePayer, "show": show, "contact_format": "any",
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

			adapter := newJingSoftHTTPAdapter()
			adapter.baseURL = server.URL

			quoted, err := adapter.QuoteDirect(context.Background(), "https://wzyp.cn", "YMengCC", "secret-merchant-token", "slot1", "4", "15.00")
			if scenario == "public-goods-rejected" {
				require.ErrorIs(t, err, ErrJingSoftVerification)
				return
			}
			require.NoError(t, err)
			if scenario == "seller-pays-fee-default" {
				assert.Equal(t, "15.00", quoted.Amount)
				assert.Empty(t, quoted.OriginalAmount)
				assert.Empty(t, quoted.Fee)
			} else {
				assert.Equal(t, "15.30", quoted.Amount)
				assert.Equal(t, "15.00", quoted.OriginalAmount)
				assert.Equal(t, "0.30", quoted.Fee)
			}
			assert.Zero(t, updateCalls.Load(), "QuoteDirect must never mutate remote slot price")

			ready, err := adapter.PrepareDirectSlot(context.Background(), "https://wzyp.cn", "YMengCC", "secret-merchant-token", "slot1", "4", "15.00", "", 5, 10)
			require.NoError(t, err)
			assert.Equal(t, quoted.Amount, ready.Offer.Amount)
			assert.Equal(t, "15.00", ready.ConfirmedPrice)
			assert.EqualValues(t, 1, addCalls.Load(), "timeout recovery must check remote stock instead of re-sending card add")
			assert.EqualValues(t, 1, updateCalls.Load())
		})
	}
}

func TestJingSoftHTTPCheckMerchantTokenAndAuthExpiryDetection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := r.Header.Get("merchant-token")
		switch r.URL.Path {
		case "/merchantApi/user/checkToken":
			if tok == "valid-token" {
				_, _ = w.Write([]byte(`{"code":1,"data":null,"msg":"success"}`))
				return
			}
			_, _ = w.Write([]byte(`{"code":0,"data":null,"msg":"Token失效！"}`))
		case "/shopApi/Shop/info":
			_, _ = w.Write([]byte(`{"code":1,"data":{"token":"YMengCC","nickname":"YMeng CC","link":"https://wzyp.cn/shop/YMengCC"}}`))
		case "/shopApi/Shop/goodsInfo":
			_, _ = w.Write([]byte(`{"code":1,"data":{"goods_key":"slot1","goods_type":"card","status":1,"price":"10.00","contact_format":"any","user":{"token":"YMengCC"},"extend":{"limit_count":1}}}`))
		case "/merchantApi/Goods/list":
			_, _ = w.Write([]byte(`{"code":401,"data":null,"msg":"请先登录！"}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	adapter := newJingSoftHTTPAdapter()
	adapter.baseURL = server.URL

	valid, err := adapter.CheckMerchantToken(context.Background(), "https://wzyp.cn", "valid-token")
	require.NoError(t, err)
	assert.True(t, valid)

	valid, err = adapter.CheckMerchantToken(context.Background(), "https://wzyp.cn", "expired-token")
	require.NoError(t, err)
	assert.False(t, valid)

	_, err = adapter.QuoteDirect(context.Background(), "https://wzyp.cn", "YMengCC", "expired-token", "slot1", "1", "10.00")
	require.ErrorIs(t, err, errJingSoftMerchantAuthExpired)
}

func TestJingSoftHTTPMerchantTemplateCacheAndOutOfStockSentinel(t *testing.T) {
	var shopCalls, goodsInfoCalls, channelCalls, priceCalls, listCalls, detailCalls, orderCalls atomic.Int32
	var sampleFeePayer atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var data any
		switch r.URL.Path {
		case "/shopApi/Shop/info":
			shopCalls.Add(1)
			data = map[string]any{"token": "YMengCC", "nickname": "YMeng CC", "link": "https://wzyp.cn/shop/YMengCC"}
		case "/shopApi/Shop/goodsInfo":
			goodsInfoCalls.Add(1)
			data = map[string]any{
				"goods_key": "slot1", "goods_type": "card", "status": 1, "price": "10.00",
				"contact_format": "any", "user": map[string]any{"token": "YMengCC"}, "extend": map[string]any{"limit_count": 1},
			}
		case "/shopApi/Shop/getUserChannel":
			channelCalls.Add(1)
			data = []any{
				map[string]any{"id": 1, "code": "AlipayPc", "show_name": "支付宝", "rate": 1.8, "status": 1, "custom_status": 1},
			}
		case "/shopApi/Shop/getGoodsPrice":
			priceCalls.Add(1)
			fp := sampleFeePayer.Load()
			total := 10.0
			if fp == 1 {
				total = 10.18
			}
			data = map[string]any{"original_amount": 10.0, "fee": 0.18, "fee_payer": fp, "total_amount": total}
		case "/merchantApi/Goods/list":
			listCalls.Add(1)
			data = map[string]any{"total": 1, "list": []any{
				map[string]any{"id": 77, "goods_key": "slot1", "price": "10.00", "status": 1, "extend": map[string]any{"stock_count": 10}},
			}}
		case "/merchantApi/Goods/info":
			detailCalls.Add(1)
			data = map[string]any{
				"id": 77, "goods_type": "card", "goods_key": "slot1", "category_id": 1, "name": "Direct Slot",
				"price": "10.00", "market_price": "10.00", "coupon_status": 0, "status": 1,
				"fee_payer": -1, "show": 0, "contact_format": "any",
				"extend": map[string]any{"lock_card": 0, "limit_count": 1},
			}
		case "/shopApi/Pay/order":
			orderCalls.Add(1)
			_, _ = w.Write([]byte(`{"code":0,"msg":"商品库存不足！","data":null}`))
			return
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
		}
		body, err := common.Marshal(map[string]any{"code": 1, "data": data})
		require.NoError(t, err)
		_, _ = w.Write(body)
	}))
	defer server.Close()

	adapter := newJingSoftHTTPAdapter()
	adapter.baseURL = server.URL
	now := time.Unix(1700000000, 0)
	adapter.now = func() time.Time { return now }

	// Shared HTTP transport reuses connection pooling while isolating cookie jars per client.
	c1, err := adapter.client(server.URL, false, JingSoftCredentials{})
	require.NoError(t, err)
	c2, err := adapter.client(server.URL, false, JingSoftCredentials{})
	require.NoError(t, err)
	assert.Same(t, c1.Transport, c2.Transport)
	assert.NotSame(t, c1.Jar, c2.Jar)

	// First QuoteDirect warms shop, channels, goods_id, merchant detail, direct goods, and price sample caches.
	_, err = adapter.QuoteDirect(context.Background(), "https://wzyp.cn", "YMengCC", "valid-merchant-token", "slot1", "1", "10.00")
	require.NoError(t, err)
	assert.EqualValues(t, 1, shopCalls.Load())
	assert.EqualValues(t, 1, goodsInfoCalls.Load())
	assert.EqualValues(t, 1, channelCalls.Load())
	assert.EqualValues(t, 1, priceCalls.Load())
	assert.EqualValues(t, 1, listCalls.Load())
	assert.EqualValues(t, 1, detailCalls.Load())

	// Second QuoteDirect reuses cached metadata and makes zero upstream API calls.
	quotedBefore, err := adapter.QuoteDirect(context.Background(), "https://wzyp.cn", "YMengCC", "valid-merchant-token", "slot1", "1", "20.00")
	require.NoError(t, err)
	assert.Equal(t, "20.00", quotedBefore.Amount)
	assert.EqualValues(t, 1, shopCalls.Load())
	assert.EqualValues(t, 1, goodsInfoCalls.Load())
	assert.EqualValues(t, 1, channelCalls.Load())
	assert.EqualValues(t, 1, priceCalls.Load())
	assert.EqualValues(t, 1, listCalls.Load())
	assert.EqualValues(t, 1, detailCalls.Load())

	// PrepareDirectSlot checks live stock via Goods/list and refreshes cached priceSamples when upstream fee_payer changes.
	sampleFeePayer.Store(1)
	ready, err := adapter.PrepareDirectSlot(context.Background(), "https://wzyp.cn", "YMengCC", "valid-merchant-token", "slot1", "1", "10.00", "10.00", 5, 10)
	require.NoError(t, err)
	assert.Equal(t, "10.18", ready.Offer.Amount)
	assert.EqualValues(t, 1, shopCalls.Load())
	assert.EqualValues(t, 2, listCalls.Load())
	assert.EqualValues(t, 1, detailCalls.Load())

	quotedAfter, err := adapter.QuoteDirect(context.Background(), "https://wzyp.cn", "YMengCC", "valid-merchant-token", "slot1", "1", "20.00")
	require.NoError(t, err)
	assert.Equal(t, "20.36", quotedAfter.Amount, "PrepareDirectSlot live readback must update cached fee_payer sample")

	// Out-of-stock rejection on /shopApi/Pay/order surfaces errJingSoftOutOfStock when no trade_no was created.
	order := &model.JingSoftOrder{
		TradeNo:       "JingSoft_123456",
		ProductID:     "slot1",
		ChannelID:     "1",
		PriceAmount:   "10.00",
		Currency:      "CNY",
		ShopID:        "YMengCC",
		PaymentMethod: model.PaymentMethodJingSoftAlipay,
		Mode:          operation_setting.JingSoftModeDirect,
	}
	created, err := adapter.Create(context.Background(), "https://wzyp.cn", order, JingSoftCredentials{Visitor: "v1", Password: "p1"}, "JingSoft_123456")
	require.ErrorIs(t, err, errJingSoftOutOfStock)
	require.NotNil(t, created)
	assert.Empty(t, created.UpstreamOrderID)
	assert.EqualValues(t, 1, orderCalls.Load())
}

func TestNotifyJingSoftMerchantTokenUpdatedResetsStateWithoutUnlockPanic(t *testing.T) {
	defaultJingSoftMerchantHealth.record("https://wzyp.cn", "expired-token", false, 1700000000)
	require.True(t, defaultJingSoftMerchantHealth.isInvalid("https://wzyp.cn", "expired-token"))
	defaultJingSoftHTTPAdapter.cache.setShop("scope", jingSoftShop{Token: "YMengCC"}, time.Now())

	require.NotPanics(t, func() {
		NotifyJingSoftMerchantTokenUpdated()
	})

	assert.False(t, defaultJingSoftMerchantHealth.isInvalid("https://wzyp.cn", "expired-token"))
	assert.True(t, defaultJingSoftMerchantHealth.shouldProbe("https://wzyp.cn", "expired-token", 1700000001))
	_, ok := defaultJingSoftHTTPAdapter.cache.getShop("scope", time.Now())
	assert.False(t, ok)
}
