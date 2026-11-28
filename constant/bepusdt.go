package constant

import (
	"slices"
	"strings"
)

const (
	// BEpusdtTradeTypeCashier switches order creation from /api/v1/order/create-transaction
	// to /api/v1/order/create-order so the payer chooses coin & network on BEpusdt's checkout page.
	BEpusdtTradeTypeCashier = "cashier"

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

// BEpusdtPayMethod describes a single operator-configured BEpusdt payment entry.
// When TradeType is empty or BEpusdtTradeTypeCashier, order creation uses
// /api/v1/order/create-order; otherwise it uses /api/v1/order/create-transaction.
type BEpusdtPayMethod struct {
	Name       string `json:"name"`
	Icon       string `json:"icon,omitempty"`
	TradeType  string `json:"trade_type"`
	Address    string `json:"address,omitempty"`
	Currencies string `json:"currencies,omitempty"`
	Rate       string `json:"rate,omitempty"`
	MinTopUp   int    `json:"min_topup,omitempty"`
}

// PublicBEpusdtPayMethod is the sanitized projection returned to wallet users.
// Merchant-internal fields (Address, Rate, Currencies) are intentionally omitted.
type PublicBEpusdtPayMethod struct {
	Name      string `json:"name"`
	Icon      string `json:"icon,omitempty"`
	TradeType string `json:"trade_type"`
	MinTopUp  int    `json:"min_topup,omitempty"`
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
