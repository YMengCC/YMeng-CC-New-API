package setting

import (
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
)

var (
	BEpusdtEnabled   bool
	BEpusdtApiUrl    string
	BEpusdtApiToken  string
	BEpusdtFiat      string  = "CNY"
	BEpusdtUnitPrice float64 = 0 // 0 falls back to operation_setting.Price
	BEpusdtMinTopUp  int     = 1
	BEpusdtTimeout   int     = 1200
	BEpusdtRate      string
	BEpusdtNotifyUrl string
	BEpusdtReturnUrl string
)

func GetBEpusdtFiat() string {
	fiat := strings.ToUpper(strings.TrimSpace(BEpusdtFiat))
	if constant.IsSupportedBEpusdtFiat(fiat) {
		return fiat
	}
	return "CNY"
}

// NormalizeBEpusdtBaseURL validates and normalizes a BEpusdt gateway base URL.
// Self-hosted / reverse-proxied deployments (including private/loopback Docker
// networks) are permitted, while non-HTTP(S) schemes, userinfo, query strings,
// and fragments are rejected.
func NormalizeBEpusdtBaseURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", common.NewMessage("Invalid BEpusdt API URL")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if (scheme != "http" && scheme != "https") || parsed.Host == "" {
		return "", common.NewMessage("Invalid BEpusdt API URL")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", common.NewMessage("Invalid BEpusdt API URL")
	}
	return strings.TrimRight(trimmed, "/"), nil
}

func normalizeOptionalHTTPURL(raw string, errMsg string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", common.NewMessage(errMsg)
	}
	scheme := strings.ToLower(parsed.Scheme)
	if (scheme != "http" && scheme != "https") || parsed.Host == "" || parsed.User != nil {
		return "", common.NewMessage(errMsg)
	}
	return trimmed, nil
}

func ParseBEpusdtPayMethods(raw string) ([]constant.BEpusdtPayMethod, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []constant.BEpusdtPayMethod{}, nil
	}
	var methods []constant.BEpusdtPayMethod
	if err := common.UnmarshalJsonStr(trimmed, &methods); err != nil {
		return nil, common.NewMessage("Invalid BEpusdt payment methods configuration")
	}
	cleaned := make([]constant.BEpusdtPayMethod, 0, len(methods))
	for _, method := range methods {
		name := strings.TrimSpace(method.Name)
		if name == "" {
			return nil, common.NewMessage("BEpusdt payment method name cannot be empty")
		}
		if method.MinTopUp < 0 {
			return nil, common.NewMessage("BEpusdt payment method minimum top-up cannot be negative")
		}
		tradeType := strings.TrimSpace(method.TradeType)
		if tradeType == "" {
			tradeType = constant.BEpusdtTradeTypeCashier
		}
		cleaned = append(cleaned, constant.BEpusdtPayMethod{
			Name:       name,
			Icon:       strings.TrimSpace(method.Icon),
			TradeType:  tradeType,
			Address:    strings.TrimSpace(method.Address),
			Currencies: strings.TrimSpace(method.Currencies),
			Rate:       strings.TrimSpace(method.Rate),
			MinTopUp:   method.MinTopUp,
		})
	}
	return cleaned, nil
}

// GetBEpusdtPayMethods reads the configured BEpusdt payment methods from OptionMap.
func GetBEpusdtPayMethods() []constant.BEpusdtPayMethod {
	common.OptionMapRWMutex.RLock()
	jsonStr := common.OptionMap["BEpusdtPayMethods"]
	common.OptionMapRWMutex.RUnlock()

	methods, err := ParseBEpusdtPayMethods(jsonStr)
	if err != nil {
		return []constant.BEpusdtPayMethod{}
	}
	return methods
}

// GetPublicBEpusdtPayMethods strips merchant-internal fields (Address, Rate, Currencies)
// before returning BEpusdt methods to wallet clients.
func GetPublicBEpusdtPayMethods() []constant.PublicBEpusdtPayMethod {
	methods := GetBEpusdtPayMethods()
	publicMethods := make([]constant.PublicBEpusdtPayMethod, 0, len(methods))
	for _, m := range methods {
		publicMethods = append(publicMethods, constant.PublicBEpusdtPayMethod{
			Name:      m.Name,
			Icon:      m.Icon,
			TradeType: m.TradeType,
			MinTopUp:  m.MinTopUp,
		})
	}
	return publicMethods
}

// ValidateBEpusdtOption validates and normalizes BEpusdt gateway options written via PUT /api/option/.
func ValidateBEpusdtOption(key, value string) (string, error) {
	switch key {
	case "BEpusdtEnabled":
		if value != "true" && value != "false" {
			return "", common.NewMessage("Invalid BEpusdt settings")
		}
		return value, nil
	case "BEpusdtApiUrl":
		return NormalizeBEpusdtBaseURL(value)
	case "BEpusdtApiToken":
		trimmed := strings.TrimSpace(value)
		if strings.ContainsAny(trimmed, "\r\n") {
			return "", common.NewMessage("Invalid BEpusdt API token")
		}
		return trimmed, nil
	case "BEpusdtFiat":
		fiat := strings.ToUpper(strings.TrimSpace(value))
		if fiat == "" {
			return "CNY", nil
		}
		if !constant.IsSupportedBEpusdtFiat(fiat) {
			return "", common.NewMessage("Unsupported BEpusdt fiat currency")
		}
		return fiat, nil
	case "BEpusdtUnitPrice":
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return "0", nil
		}
		parsed, err := strconv.ParseFloat(trimmed, 64)
		if err != nil || parsed < 0 {
			return "", common.NewMessage("Invalid BEpusdt unit price")
		}
		return trimmed, nil
	case "BEpusdtMinTopUp":
		parsed, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || parsed < 1 {
			return "", common.NewMessage("BEpusdt minimum top-up must be at least 1")
		}
		return strconv.Itoa(parsed), nil
	case "BEpusdtTimeout":
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return "0", nil
		}
		parsed, err := strconv.Atoi(trimmed)
		if err != nil || (parsed != 0 && parsed < 180) {
			return "", common.NewMessage("BEpusdt order timeout must be 0 or at least 180 seconds")
		}
		return strconv.Itoa(parsed), nil
	case "BEpusdtRate":
		trimmed := strings.TrimSpace(value)
		if strings.ContainsAny(trimmed, "\r\n") {
			return "", common.NewMessage("Invalid BEpusdt rate")
		}
		return trimmed, nil
	case "BEpusdtNotifyUrl":
		return normalizeOptionalHTTPURL(value, "Invalid BEpusdt notify URL")
	case "BEpusdtReturnUrl":
		return normalizeOptionalHTTPURL(value, "Invalid BEpusdt return URL")
	case "BEpusdtPayMethods":
		methods, err := ParseBEpusdtPayMethods(value)
		if err != nil {
			return "", err
		}
		encoded, err := common.Marshal(methods)
		if err != nil {
			return "", common.NewMessage("Invalid BEpusdt payment methods configuration")
		}
		return string(encoded), nil
	default:
		return value, nil
	}
}
