package operation_setting

import (
	"math"
	"net"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

type JingSoftProduct struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	GoodsKey string  `json:"goods_key"`
	Amount   float64 `json:"amount"` // Expected credited balance in USD, not the selling price.
}

type JingSoftChannel struct {
	ID          string `json:"id"`
	Code        string `json:"code,omitempty"`
	Name        string `json:"name"`
	Icon        string `json:"icon"`
	PaymentType string `json:"payment_type,omitempty"`
}

const (
	JingSoftModeAuto       = "auto"
	JingSoftModeDirect     = "direct"
	JingSoftModeRedemption = "redemption"
)

func JingSoftModes() []string {
	return []string{
		JingSoftModeAuto,
		JingSoftModeDirect,
		JingSoftModeRedemption,
	}
}

const (
	JingSoftDefaultAutoRestockMin     = 5
	JingSoftDefaultAutoRestockBatch   = 20
	JingSoftDefaultMaxAmountCNY       = 5000.0
	JingSoftDefaultMaxOrdersPerMinute = 15
)

const (
	JingSoftPaymentMethodLegacy = "jingsoft"
	JingSoftPaymentMethodAlipay = "jingsoft_alipay"
	JingSoftPaymentMethodWeChat = "jingsoft_wxpay"
)

func JingSoftPaymentTypeForChannelName(name string) string {
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

func jingSoftPaymentTypeFromCode(code string) (paymentType string, present bool) {
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

// JingSoftClassifyChannel classifies a discovered upstream channel primarily by its
// machine code, rejecting unknown or conflicting codes. Legacy responses that
// omit code fall back to display-name classification.
func JingSoftClassifyChannel(code, paytypeCode, name string) string {
	codeType, codePresent := jingSoftPaymentTypeFromCode(code)
	payType, payPresent := jingSoftPaymentTypeFromCode(paytypeCode)
	if codePresent && payPresent && codeType != payType {
		return ""
	}
	if codePresent {
		if codeType == "" {
			return ""
		}
		if nameType := JingSoftPaymentTypeForChannelName(name); nameType != "" && nameType != codeType {
			return ""
		}
		return codeType
	}
	if payPresent {
		if payType == "" {
			return ""
		}
		if nameType := JingSoftPaymentTypeForChannelName(name); nameType != "" && nameType != payType {
			return ""
		}
		return payType
	}
	return JingSoftPaymentTypeForChannelName(name)
}

func IsJingSoftPaymentMethod(method string) bool {
	method = strings.ToLower(strings.TrimSpace(method))
	return method == JingSoftPaymentMethodLegacy || strings.HasPrefix(method, "jingsoft_")
}

type JingSoftSetting struct {
	Enabled            bool              `json:"enabled"`
	BaseURL            string            `json:"base_url"`
	StoreToken         string            `json:"store_token"`
	MerchantToken      string            `json:"merchant_token"`
	Products           []JingSoftProduct `json:"products"`
	DirectGoodsKeys    []string          `json:"direct_goods_keys"`
	AutoRestockMin     int               `json:"auto_restock_min"`
	AutoRestockBatch   int               `json:"auto_restock_batch"`
	MaxAmountCNY       float64           `json:"max_amount_cny"`
	MaxOrdersPerMinute int               `json:"max_orders_per_minute"`
	Channels           []JingSoftChannel `json:"channels"`
	Mode               string            `json:"mode"`
}

var jingSoftSetting = JingSoftSetting{
	Products:           []JingSoftProduct{},
	DirectGoodsKeys:    []string{},
	AutoRestockMin:     JingSoftDefaultAutoRestockMin,
	AutoRestockBatch:   JingSoftDefaultAutoRestockBatch,
	MaxAmountCNY:       JingSoftDefaultMaxAmountCNY,
	MaxOrdersPerMinute: JingSoftDefaultMaxOrdersPerMinute,
	Channels:           []JingSoftChannel{},
	Mode:               JingSoftModeAuto,
}

var (
	jingSoftProductIDPattern  = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
	jingSoftStoreTokenPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)
)

// NormalizeJingSoftBaseURL validates and normalizes an administrator-configured
// JingSoft platform origin (https://host[:port]), rejecting paths, credentials,
// local hostnames, and private/reserved IP literals.
func NormalizeJingSoftBaseURL(value string) (string, error) {
	if len(value) > 2048 || strings.ContainsAny(value, "\r\n\x00") {
		return "", common.NewMessage("Invalid JingSoft platform URL")
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", nil
	}
	u, err := url.Parse(trimmed)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.RawPath != "" {
		return "", common.NewMessage("Invalid JingSoft platform URL")
	}
	if strings.TrimSuffix(u.Path, "/") != "" {
		return "", common.NewMessage("Invalid JingSoft platform URL")
	}
	host := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return "", common.NewMessage("Invalid JingSoft platform URL")
	}
	port := 443
	if portText := u.Port(); portText != "" {
		parsedPort, portErr := strconv.Atoi(portText)
		if portErr != nil || parsedPort < 1 || parsedPort > 65535 {
			return "", common.NewMessage("Invalid JingSoft platform URL")
		}
		port = parsedPort
	}
	ssrf := &common.SSRFProtection{AllowPrivateIp: false}
	if err := ssrf.ValidateNetworkTarget(host, port); err != nil {
		return "", common.NewMessage("Invalid JingSoft platform URL")
	}
	if port == 443 {
		return "https://" + host, nil
	}
	return "https://" + net.JoinHostPort(host, strconv.Itoa(port)), nil
}

// NormalizeJingSoftStoreToken accepts the public shop identifier or a full
// /shop/<token> URL matching the configured platform URL (when set).
func NormalizeJingSoftStoreToken(value string) (string, error) {
	return NormalizeJingSoftStoreTokenForBase(value, jingSoftSetting.BaseURL)
}

func NormalizeJingSoftStoreTokenForBase(value, baseURL string) (string, error) {
	if len(value) > 4096 || strings.ContainsAny(value, "\r\n\x00") {
		return "", common.NewMessage("Invalid JingSoft settings")
	}
	token := strings.TrimSpace(value)
	if token == "" || jingSoftStoreTokenPattern.MatchString(token) {
		return token, nil
	}
	u, err := url.Parse(token)
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.RawPath != "" {
		return "", common.NewMessage("Invalid JingSoft settings")
	}
	if err := matchJingSoftLinkOrigin(u, baseURL); err != nil {
		return "", err
	}
	extracted, ok := strings.CutPrefix(strings.TrimSuffix(u.Path, "/"), "/shop/")
	if !ok || !jingSoftStoreTokenPattern.MatchString(extracted) {
		return "", common.NewMessage("Invalid JingSoft settings")
	}
	return extracted, nil
}

func NormalizeJingSoftGoodsKey(value string) (string, error) {
	return NormalizeJingSoftGoodsKeyForBase(value, jingSoftSetting.BaseURL)
}

func NormalizeJingSoftGoodsKeyForBase(value, baseURL string) (string, error) {
	if len(value) > 512 || strings.ContainsAny(value, "\r\n\x00") {
		return "", common.NewMessage("Invalid JingSoft settings")
	}
	trimmed := strings.TrimSpace(value)
	if jingSoftProductIDPattern.MatchString(trimmed) {
		return trimmed, nil
	}
	u, err := url.Parse(trimmed)
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.RawPath != "" {
		return "", common.NewMessage("Invalid JingSoft settings")
	}
	if err := matchJingSoftLinkOrigin(u, baseURL); err != nil {
		return "", err
	}
	key, ok := strings.CutPrefix(strings.TrimSuffix(u.Path, "/"), "/item/")
	if !ok || !jingSoftProductIDPattern.MatchString(key) {
		return "", common.NewMessage("Invalid JingSoft settings")
	}
	return key, nil
}

func matchJingSoftLinkOrigin(u *url.URL, baseURL string) error {
	trimmedBase := strings.TrimSpace(baseURL)
	if strings.HasPrefix(trimmedBase, "http://127.0.0.1:") || strings.HasPrefix(trimmedBase, "http://[::1]:") {
		if u.Scheme+"://"+u.Host == strings.TrimSuffix(trimmedBase, "/") {
			return nil
		}
		if u.Scheme != "https" {
			return common.NewMessage("Invalid JingSoft settings")
		}
		if _, err := NormalizeJingSoftBaseURL("https://" + u.Host); err != nil {
			return common.NewMessage("Invalid JingSoft settings")
		}
		return nil
	}
	parsedOrigin, err := NormalizeJingSoftBaseURL(u.Scheme + "://" + u.Host)
	if err != nil || parsedOrigin == "" {
		return common.NewMessage("Invalid JingSoft settings")
	}
	if trimmedBase != "" {
		expectedOrigin, expErr := NormalizeJingSoftBaseURL(trimmedBase)
		if expErr != nil || expectedOrigin == "" || parsedOrigin != expectedOrigin {
			return common.NewMessage("Invalid JingSoft settings")
		}
	}
	return nil
}

func init() { config.GlobalConfig.Register("jingsoft_setting", &jingSoftSetting) }

func GetJingSoftSetting() *JingSoftSetting { return &jingSoftSetting }

// ValidateJingSoftOption protects persisted mappings even when callers bypass the UI.
func ValidateJingSoftOption(key, value string) error {
	if !strings.HasPrefix(key, "jingsoft_setting.") {
		return nil
	}
	switch key {
	case "jingsoft_setting.enabled":
		if value != "true" && value != "false" {
			return common.NewMessage("Invalid JingSoft settings")
		}
	case "jingsoft_setting.base_url":
		if _, err := NormalizeJingSoftBaseURL(value); err != nil {
			return err
		}
	case "jingsoft_setting.store_token":
		if _, err := NormalizeJingSoftStoreToken(value); err != nil {
			return err
		}
	case "jingsoft_setting.merchant_token":
		if len(value) > 4096 || strings.ContainsAny(value, "\r\n\x00") {
			return common.NewMessage("Invalid JingSoft settings")
		}
	case "jingsoft_setting.products":
		var products []JingSoftProduct
		if common.UnmarshalJsonStr(value, &products) != nil || products == nil || len(products) > 100 {
			return common.NewMessage("Invalid JingSoft product mappings")
		}
		ids := make(map[string]bool, len(products))
		for _, product := range products {
			goodsKey, keyErr := NormalizeJingSoftGoodsKey(product.GoodsKey)
			if keyErr != nil || !jingSoftProductIDPattern.MatchString(product.ID) || ids[product.ID] || strings.TrimSpace(product.Name) == "" || len(product.Name) > 200 || goodsKey == "" || math.IsNaN(product.Amount) || math.IsInf(product.Amount, 0) || product.Amount <= 0 || product.Amount > 1000000 || slices.Contains(jingSoftSetting.DirectGoodsKeys, goodsKey) {
				return common.NewMessage("Invalid JingSoft product mappings")
			}
			ids[product.ID] = true
		}
	case "jingsoft_setting.direct_goods_keys":
		var keys []string
		if common.UnmarshalJsonStr(value, &keys) != nil || keys == nil || len(keys) > 20 {
			return common.NewMessage("Invalid JingSoft direct slot settings")
		}
		seen := make(map[string]bool, len(keys))
		for _, raw := range keys {
			normalized, err := NormalizeJingSoftGoodsKey(raw)
			if err != nil || seen[normalized] {
				return common.NewMessage("Invalid JingSoft direct slot settings")
			}
			for _, product := range jingSoftSetting.Products {
				existingKey, _ := NormalizeJingSoftGoodsKey(product.GoodsKey)
				if existingKey == "" {
					existingKey = strings.TrimSpace(product.GoodsKey)
				}
				if existingKey == normalized {
					return common.NewMessage("Direct-credit slot keys cannot overlap with redemption product keys")
				}
			}
			seen[normalized] = true
		}
	case "jingsoft_setting.auto_restock_min":
		n, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || n < 1 || n > 1000 {
			return common.NewMessage("Invalid JingSoft settings")
		}
	case "jingsoft_setting.auto_restock_batch":
		n, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || n < 1 || n > 500 {
			return common.NewMessage("Invalid JingSoft settings")
		}
	case "jingsoft_setting.max_amount_cny":
		amount, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil || math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 1 || amount > 1000000 {
			return common.NewMessage("Invalid JingSoft settings")
		}
	case "jingsoft_setting.max_orders_per_minute":
		n, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || n < 1 || n > 600 {
			return common.NewMessage("Invalid JingSoft settings")
		}
	case "jingsoft_setting.mode":
		if !slices.Contains(JingSoftModes(), value) {
			return common.NewMessage("Invalid JingSoft settings")
		}
	case "jingsoft_setting.channels":
		var channels []JingSoftChannel
		if common.UnmarshalJsonStr(value, &channels) != nil || channels == nil || len(channels) > 100 {
			return common.NewMessage("Invalid JingSoft payment channels")
		}
		ids := make(map[string]bool, len(channels))
		for _, channel := range channels {
			validPaymentType := channel.PaymentType == "" || channel.PaymentType == "alipay" || channel.PaymentType == "wxpay"
			if strings.TrimSpace(channel.ID) == "" || len(channel.ID) > 128 || ids[channel.ID] || len(channel.Code) > 128 || strings.ContainsAny(channel.Code, "\r\n\x00") || strings.TrimSpace(channel.Name) == "" || len(channel.Name) > 200 || len(channel.Icon) > 2048 || !validPaymentType {
				return common.NewMessage("Invalid JingSoft payment channels")
			}
			ids[channel.ID] = true
		}
	default:
		return common.NewMessage("Invalid JingSoft settings")
	}
	return nil
}
