package constant

import (
	"slices"
	"strings"
)

const (
	// BEpusdtTradeTypeCashier switches order creation from /api/v1/order/create-transaction
	// to /api/v1/order/create-order so the payer chooses coin & network on BEpusdt's checkout page.
	BEpusdtTradeTypeCashier = "cashier"

	// BEpusdtDefaultFiat is the fixed settlement fiat currency for wallet top-ups,
	// matching the system's General recharge price (operation_setting.Price).
	BEpusdtDefaultFiat = "CNY"

	// BEpusdtPaymentMethodPrefix prefixes BEpusdt identifiers inside General PayMethods
	// (for example "bepusdt_usdt.trc20" or "bepusdt_cashier") to distinguish them from Epay methods.
	BEpusdtPaymentMethodPrefix = "bepusdt_"
	BEpusdtPaymentMethodLegacy = "bepusdt"
)

// BEpusdtTradeTypes lists all trade types supported by BEpusdt v1.24.2.
var BEpusdtTradeTypes = []string{
	"usdt.trc20",
	"usdc.trc20",
	"tron.trx",
	"usdt.erc20",
	"usdc.erc20",
	"ethereum.eth",
	"usdt.polygon",
	"usdc.polygon",
	"usdt.bep20",
	"usdc.bep20",
	"bsc.bnb",
	"usdt.aptos",
	"usdc.aptos",
	"usdt.solana",
	"usdc.solana",
	"usdt.xlayer",
	"usdc.xlayer",
	"usdt.arbitrum",
	"usdc.arbitrum",
	"usdc.base",
	"usdt.plasma",
	"usdt.ton",
	"ton.gram",
}

// BEpusdtSupportedFiats lists the fiat currencies accepted by BEpusdt.
var BEpusdtSupportedFiats = []string{
	"CNY",
	"USD",
	"EUR",
	"GBP",
	"JPY",
}

// BEpusdtPayMethod describes a single operator-configured BEpusdt channel.
// Display name, icon, and optional per-method minimum top-up are configured
// in General -> Payment methods (PayMethods).
type BEpusdtPayMethod struct {
	TradeType  string `json:"trade_type"`
	Address    string `json:"address,omitempty"`
	Currencies string `json:"currencies,omitempty"`
}

func IsSupportedBEpusdtFiat(fiat string) bool {
	return slices.Contains(BEpusdtSupportedFiats, fiat)
}

func IsBEpusdtCashierMode(tradeType string) bool {
	return tradeType == "" || tradeType == BEpusdtTradeTypeCashier
}

func FormatBEpusdtPaymentMethodType(tradeType string) string {
	trimmed := strings.TrimSpace(tradeType)
	if IsBEpusdtCashierMode(trimmed) {
		return BEpusdtPaymentMethodPrefix + BEpusdtTradeTypeCashier
	}
	return BEpusdtPaymentMethodPrefix + trimmed
}

func IsBEpusdtPaymentMethod(method string) bool {
	normalized := strings.ToLower(strings.TrimSpace(method))
	return normalized == BEpusdtPaymentMethodLegacy || strings.HasPrefix(normalized, BEpusdtPaymentMethodPrefix)
}

func ParseBEpusdtPaymentMethodTradeType(method string) (string, bool) {
	trimmed := strings.TrimSpace(method)
	lower := strings.ToLower(trimmed)
	if lower == BEpusdtPaymentMethodLegacy {
		return BEpusdtTradeTypeCashier, true
	}
	if !strings.HasPrefix(lower, BEpusdtPaymentMethodPrefix) {
		return "", false
	}
	rest := strings.TrimSpace(trimmed[len(BEpusdtPaymentMethodPrefix):])
	if rest == "" {
		return BEpusdtTradeTypeCashier, true
	}
	return rest, true
}
