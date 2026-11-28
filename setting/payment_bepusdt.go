package setting

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
)

var (
	BEpusdtEnabled         bool
	BEpusdtApiUrl          string
	BEpusdtApiToken        string
	BEpusdtCallbackAddress string
)

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

// NormalizeBEpusdtCallbackOrigin validates and normalizes the optional BEpusdt
// callback origin (scheme + host[:port] only, without any path, query, or fragment).
// When empty, orders fall back to system_setting.ServerAddress.
func NormalizeBEpusdtCallbackOrigin(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", common.NewMessage("BEpusdt callback address must be a valid site origin without a path")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if (scheme != "http" && scheme != "https") || parsed.Host == "" {
		return "", common.NewMessage("BEpusdt callback address must be a valid site origin without a path")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", common.NewMessage("BEpusdt callback address must be a valid site origin without a path")
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return "", common.NewMessage("BEpusdt callback address must be a valid site origin without a path")
	}
	return fmt.Sprintf("%s://%s", scheme, parsed.Host), nil
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
		tradeType := strings.TrimSpace(method.TradeType)
		if tradeType == "" {
			tradeType = constant.BEpusdtTradeTypeCashier
		}
		cleaned = append(cleaned, constant.BEpusdtPayMethod{
			TradeType:  tradeType,
			Address:    strings.TrimSpace(method.Address),
			Currencies: strings.TrimSpace(method.Currencies),
		})
	}
	return cleaned, nil
}

// GetBEpusdtPayMethods reads the configured BEpusdt payment channels from OptionMap.
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
	case "BEpusdtCallbackAddress":
		return NormalizeBEpusdtCallbackOrigin(value)
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
