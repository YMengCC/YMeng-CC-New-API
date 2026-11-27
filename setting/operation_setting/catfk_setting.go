package operation_setting

import (
	"math"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

type CatFKProduct struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	GoodsKey string  `json:"goods_key"`
	Amount   float64 `json:"amount"` // Expected credited balance in USD, not the selling price.
}

type CatFKChannel struct {
	ID          string `json:"id"`
	Code        string `json:"code,omitempty"`
	Name        string `json:"name"`
	Icon        string `json:"icon"`
	PaymentType string `json:"payment_type,omitempty"`
}

const (
	CatFKModeRedemption = "redemption"
	CatFKModeDirect     = "direct"
)

const (
	CatFKDefaultAutoRestockMin   = 5
	CatFKDefaultAutoRestockBatch = 20
)

const (
	CatFKPaymentMethodLegacy = "catfk"
	CatFKPaymentMethodAlipay = "catfk_alipay"
	CatFKPaymentMethodWeChat = "catfk_wxpay"
)

func CatFKPaymentTypeForChannelName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	hasWeChat := strings.Contains(name, "微信") || strings.Contains(name, "wechat") || strings.Contains(name, "weixin")
	hasAlipay := strings.Contains(name, "支付宝") || strings.Contains(name, "alipay")
	if hasWeChat && hasAlipay {
		return ""
	}
	if hasWeChat {
		return "wxpay"
	}
	if hasAlipay {
		return "alipay"
	}
	return ""
}

func catFKPaymentTypeFromCode(code string) (paymentType string, present bool) {
	code = strings.ToLower(strings.TrimSpace(code))
	if code == "" {
		return "", false
	}
	hasWeChat := strings.Contains(code, "wxpay") || strings.Contains(code, "weixin") || strings.Contains(code, "wechat")
	hasAlipay := strings.Contains(code, "alipay") || strings.Contains(code, "zfb")
	if hasWeChat && hasAlipay {
		return "", true
	}
	if hasWeChat {
		return "wxpay", true
	}
	if hasAlipay {
		return "alipay", true
	}
	return "", true
}

// CatFKClassifyChannel classifies a discovered upstream channel primarily by its
// machine code, rejecting unknown or conflicting codes. Legacy responses that
// omit code fall back to display-name classification.
func CatFKClassifyChannel(code, paytypeCode, name string) string {
	codeType, codePresent := catFKPaymentTypeFromCode(code)
	payType, payPresent := catFKPaymentTypeFromCode(paytypeCode)
	if codePresent && payPresent && codeType != payType {
		return ""
	}
	if codePresent {
		if codeType == "" {
			return ""
		}
		if nameType := CatFKPaymentTypeForChannelName(name); nameType != "" && nameType != codeType {
			return ""
		}
		return codeType
	}
	if payPresent {
		if payType == "" {
			return ""
		}
		if nameType := CatFKPaymentTypeForChannelName(name); nameType != "" && nameType != payType {
			return ""
		}
		return payType
	}
	return CatFKPaymentTypeForChannelName(name)
}

func IsCatFKPaymentMethod(method string) bool {
	method = strings.ToLower(strings.TrimSpace(method))
	return method == CatFKPaymentMethodLegacy || strings.HasPrefix(method, "catfk_")
}

type CatFKSetting struct {
	Enabled          bool           `json:"enabled"`
	StoreToken       string         `json:"store_token"`
	MerchantToken    string         `json:"merchant_token"`
	Products         []CatFKProduct `json:"products"`
	DirectGoodsKeys  []string       `json:"direct_goods_keys"`
	AutoRestockMin   int            `json:"auto_restock_min"`
	AutoRestockBatch int            `json:"auto_restock_batch"`
	Channels         []CatFKChannel `json:"channels"`
	Mode             string         `json:"mode"`
}

var catfkSetting = CatFKSetting{
	Products:         []CatFKProduct{},
	DirectGoodsKeys:  []string{},
	AutoRestockMin:   CatFKDefaultAutoRestockMin,
	AutoRestockBatch: CatFKDefaultAutoRestockBatch,
	Channels:         []CatFKChannel{},
	Mode:             CatFKModeRedemption,
}
var catfkProductIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
var catfkStoreTokenPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)

// NormalizeCatFKStoreToken accepts the public shop identifier or its canonical
// platform URL. It never accepts an administrator-selected upstream host.
func NormalizeCatFKStoreToken(value string) (string, error) {
	if len(value) > 4096 || strings.ContainsAny(value, "\r\n\x00") {
		return "", common.NewMessage("Invalid CatFK settings")
	}
	token := strings.TrimSpace(value)
	if token == "" || catfkStoreTokenPattern.MatchString(token) {
		return token, nil
	}
	u, err := url.Parse(token)
	if err != nil || u.Scheme != "https" || u.Host != "catfk.com" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.RawPath != "" {
		return "", common.NewMessage("Invalid CatFK settings")
	}
	token, ok := strings.CutPrefix(strings.TrimSuffix(u.Path, "/"), "/shop/")
	if !ok || !catfkStoreTokenPattern.MatchString(token) {
		return "", common.NewMessage("Invalid CatFK settings")
	}
	return token, nil
}

func NormalizeCatFKGoodsKey(value string) (string, error) {
	if len(value) > 512 || strings.ContainsAny(value, "\r\n\x00") {
		return "", common.NewMessage("Invalid CatFK settings")
	}
	trimmed := strings.TrimSpace(value)
	if catfkProductIDPattern.MatchString(trimmed) {
		return trimmed, nil
	}
	u, err := url.Parse(trimmed)
	if err != nil || u.Scheme != "https" || u.Host != "catfk.com" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.RawPath != "" {
		return "", common.NewMessage("Invalid CatFK settings")
	}
	key, ok := strings.CutPrefix(strings.TrimSuffix(u.Path, "/"), "/item/")
	if !ok || !catfkProductIDPattern.MatchString(key) {
		return "", common.NewMessage("Invalid CatFK settings")
	}
	return key, nil
}

func init() { config.GlobalConfig.Register("catfk_setting", &catfkSetting) }

func GetCatFKSetting() *CatFKSetting { return &catfkSetting }

// ValidateCatFKOption protects persisted mappings even when callers bypass the UI.
func ValidateCatFKOption(key, value string) error {
	if !strings.HasPrefix(key, "catfk_setting.") {
		return nil
	}
	switch key {
	case "catfk_setting.enabled":
		if value != "true" && value != "false" {
			return common.NewMessage("Invalid CatFK settings")
		}
	case "catfk_setting.store_token":
		if _, err := NormalizeCatFKStoreToken(value); err != nil {
			return err
		}
	case "catfk_setting.merchant_token":
		if len(value) > 4096 || strings.ContainsAny(value, "\r\n\x00") {
			return common.NewMessage("Invalid CatFK settings")
		}
	case "catfk_setting.products":
		var products []CatFKProduct
		if common.UnmarshalJsonStr(value, &products) != nil || products == nil || len(products) > 100 {
			return common.NewMessage("Invalid CatFK product mappings")
		}
		ids := make(map[string]bool, len(products))
		for _, product := range products {
			goodsKey := strings.TrimSpace(product.GoodsKey)
			if !catfkProductIDPattern.MatchString(product.ID) || ids[product.ID] || strings.TrimSpace(product.Name) == "" || len(product.Name) > 200 || goodsKey == "" || len(goodsKey) > 512 || math.IsNaN(product.Amount) || math.IsInf(product.Amount, 0) || product.Amount <= 0 || product.Amount > 1000000 || slices.Contains(catfkSetting.DirectGoodsKeys, goodsKey) {
				return common.NewMessage("Invalid CatFK product mappings")
			}
			ids[product.ID] = true
		}
	case "catfk_setting.direct_goods_keys":
		var keys []string
		if common.UnmarshalJsonStr(value, &keys) != nil || keys == nil || len(keys) > 20 {
			return common.NewMessage("Invalid CatFK direct slot settings")
		}
		seen := make(map[string]bool, len(keys))
		for _, raw := range keys {
			normalized, err := NormalizeCatFKGoodsKey(raw)
			if err != nil || seen[normalized] {
				return common.NewMessage("Invalid CatFK direct slot settings")
			}
			for _, product := range catfkSetting.Products {
				if strings.TrimSpace(product.GoodsKey) == normalized {
					return common.NewMessage("Direct-credit slot keys cannot overlap with redemption product keys")
				}
			}
			seen[normalized] = true
		}
	case "catfk_setting.auto_restock_min":
		n, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || n < 1 || n > 1000 {
			return common.NewMessage("Invalid CatFK settings")
		}
	case "catfk_setting.auto_restock_batch":
		n, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || n < 1 || n > 500 {
			return common.NewMessage("Invalid CatFK settings")
		}
	case "catfk_setting.mode":
		if value != CatFKModeRedemption && value != CatFKModeDirect {
			return common.NewMessage("Invalid CatFK settings")
		}
	case "catfk_setting.channels":
		var channels []CatFKChannel
		if common.UnmarshalJsonStr(value, &channels) != nil || channels == nil || len(channels) > 100 {
			return common.NewMessage("Invalid CatFK payment channels")
		}
		ids := make(map[string]bool, len(channels))
		for _, channel := range channels {
			validPaymentType := channel.PaymentType == "" || channel.PaymentType == "alipay" || channel.PaymentType == "wxpay"
			if strings.TrimSpace(channel.ID) == "" || len(channel.ID) > 128 || ids[channel.ID] || len(channel.Code) > 128 || strings.ContainsAny(channel.Code, "\r\n\x00") || strings.TrimSpace(channel.Name) == "" || len(channel.Name) > 200 || len(channel.Icon) > 2048 || !validPaymentType {
				return common.NewMessage("Invalid CatFK payment channels")
			}
			ids[channel.ID] = true
		}
	default:
		return common.NewMessage("Invalid CatFK settings")
	}
	return nil
}
