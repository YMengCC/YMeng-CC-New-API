package service

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
)

const (
	BEpusdtOrderStatusWaiting    = 1
	BEpusdtOrderStatusSuccess    = 2
	BEpusdtOrderStatusExpired    = 3
	BEpusdtOrderStatusCanceled   = 4
	BEpusdtOrderStatusConfirming = 5
	BEpusdtOrderStatusFailed     = 6

	bepusdtMaxResponseBytes = 1 << 20 // 1 MiB
)

var bepusdtHTTPClient = &http.Client{
	Timeout:       15 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

type BEpusdtCreateTransactionParams struct {
	OrderID     string  `json:"order_id"`
	Amount      float64 `json:"amount"`
	TradeType   string  `json:"trade_type,omitempty"`
	Fiat        string  `json:"fiat,omitempty"`
	Name        string  `json:"name,omitempty"`
	NotifyURL   string  `json:"notify_url"`
	RedirectURL string  `json:"redirect_url"`
	Timeout     int64   `json:"timeout,omitempty"`
	Address     string  `json:"address,omitempty"`
	Rate        string  `json:"rate,omitempty"`
	Signature   string  `json:"signature,omitempty"`
}

type BEpusdtCreateOrderParams struct {
	OrderID     string  `json:"order_id"`
	Amount      float64 `json:"amount"`
	Fiat        string  `json:"fiat,omitempty"`
	Currencies  string  `json:"currencies,omitempty"`
	Name        string  `json:"name,omitempty"`
	NotifyURL   string  `json:"notify_url"`
	RedirectURL string  `json:"redirect_url"`
	Timeout     int64   `json:"timeout,omitempty"`
	Signature   string  `json:"signature,omitempty"`
}

type BEpusdtOrderResponseData struct {
	TradeID        string `json:"trade_id"`
	OrderID        string `json:"order_id"`
	TradeType      string `json:"trade_type"`
	Fiat           string `json:"fiat"`
	Token          string `json:"token"`
	ActualAmount   string `json:"actual_amount"`
	PaymentURL     string `json:"payment_url"`
	ExpirationTime int64  `json:"expiration_time"`
}

type bepusdtAPIResponse struct {
	StatusCode int                      `json:"status_code"`
	Message    string                   `json:"message"`
	Data       BEpusdtOrderResponseData `json:"data"`
}

type BEpusdtWebhookPayload struct {
	TradeID            string  `json:"trade_id"`
	OrderID            string  `json:"order_id"`
	Amount             float64 `json:"amount"`
	ActualAmount       any     `json:"actual_amount"`
	Token              string  `json:"token"`
	BlockTransactionID string  `json:"block_transaction_id"`
	Signature          string  `json:"signature"`
	Status             int     `json:"status"`
}

// SignBEpusdtParams implements BEpusdt's utils.EpusdtSign algorithm:
// exclude "signature", nil, and empty strings; sort remaining keys in ascending
// lexicographical order; join as k=v with "&"; append token; lowercase MD5 hex.
func SignBEpusdtParams(data map[string]any, token string) string {
	keys := make([]string, 0, len(data))
	for k := range data {
		if k == "signature" {
			continue
		}
		keys = append(keys, k)
	}
	slices.Sort(keys)

	var builder strings.Builder
	for _, k := range keys {
		v := data[k]
		if v == nil || v == "" {
			continue
		}
		builder.WriteString(k)
		builder.WriteByte('=')
		builder.WriteString(fmt.Sprintf("%v", v))
		builder.WriteByte('&')
	}

	signString := strings.TrimRight(builder.String(), "&")
	sum := md5.Sum([]byte(signString + token))
	return hex.EncodeToString(sum[:])
}

// marshalSignedBEpusdtPayload serializes a request payload to JSON, re-decodes it
// into map[string]any so numeric formatting matches BEpusdt's SignVerify middleware
// identically, computes the MD5 signature, and returns the final signed JSON bytes.
func marshalSignedBEpusdtPayload(payload any, token string) ([]byte, error) {
	unsignedBytes, err := common.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var fields map[string]any
	if err := common.Unmarshal(unsignedBytes, &fields); err != nil {
		return nil, err
	}
	delete(fields, "signature")
	fields["signature"] = SignBEpusdtParams(fields, token)
	return common.Marshal(fields)
}

// VerifyBEpusdtWebhook verifies the MD5 signature of a BEpusdt webhook JSON body
// in constant time and unmarshals the verified payload.
func VerifyBEpusdtWebhook(rawBody []byte, token string) (*BEpusdtWebhookPayload, error) {
	if strings.TrimSpace(token) == "" {
		return nil, errors.New("BEpusdt API token is not configured")
	}
	var fields map[string]any
	if err := common.Unmarshal(rawBody, &fields); err != nil {
		return nil, fmt.Errorf("invalid BEpusdt webhook JSON: %w", err)
	}
	rawSig, ok := fields["signature"].(string)
	if !ok || strings.TrimSpace(rawSig) == "" {
		return nil, errors.New("missing BEpusdt webhook signature")
	}
	expected := SignBEpusdtParams(fields, token)
	actual := strings.ToLower(strings.TrimSpace(rawSig))
	if subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) != 1 {
		return nil, errors.New("BEpusdt webhook signature mismatch")
	}

	var payload BEpusdtWebhookPayload
	if err := common.Unmarshal(rawBody, &payload); err != nil {
		return nil, fmt.Errorf("invalid BEpusdt webhook payload: %w", err)
	}
	if strings.TrimSpace(payload.OrderID) == "" {
		return nil, errors.New("missing BEpusdt webhook order_id")
	}
	return &payload, nil
}

func validateBEpusdtCheckoutURL(rawURL string) (string, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return "", errors.New("BEpusdt returned empty payment_url")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", fmt.Errorf("invalid BEpusdt payment_url: %w", err)
	}
	scheme := strings.ToLower(parsed.Scheme)
	if (scheme != "http" && scheme != "https") || parsed.Host == "" {
		return "", errors.New("BEpusdt returned unsafe payment_url scheme")
	}
	return trimmed, nil
}

func postBEpusdtOrderEndpoint(ctx context.Context, baseURL, token, endpoint string, payload any) (*BEpusdtOrderResponseData, error) {
	normalizedURL, err := setting.NormalizeBEpusdtBaseURL(baseURL)
	if err != nil || normalizedURL == "" {
		return nil, errors.New("BEpusdt API URL is not configured")
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, errors.New("BEpusdt API token is not configured")
	}

	bodyBytes, err := marshalSignedBEpusdtPayload(payload, token)
	if err != nil {
		return nil, fmt.Errorf("encode BEpusdt request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, normalizedURL+endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("build BEpusdt request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := bepusdtHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request BEpusdt gateway: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, bepusdtMaxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("read BEpusdt response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("BEpusdt returned HTTP %d", resp.StatusCode)
	}

	var parsed bepusdtAPIResponse
	if err := common.Unmarshal(respBytes, &parsed); err != nil {
		return nil, fmt.Errorf("decode BEpusdt response: %w", err)
	}
	if parsed.StatusCode != http.StatusOK {
		msg := strings.TrimSpace(parsed.Message)
		if msg == "" {
			msg = fmt.Sprintf("status_code %d", parsed.StatusCode)
		}
		return nil, fmt.Errorf("BEpusdt rejected order: %s", msg)
	}

	paymentURL, err := validateBEpusdtCheckoutURL(parsed.Data.PaymentURL)
	if err != nil {
		return nil, err
	}
	parsed.Data.PaymentURL = paymentURL
	return &parsed.Data, nil
}

// CreateBEpusdtTransaction creates a chain-specific order via POST /api/v1/order/create-transaction.
func CreateBEpusdtTransaction(ctx context.Context, baseURL, token string, params *BEpusdtCreateTransactionParams) (*BEpusdtOrderResponseData, error) {
	if params == nil {
		return nil, errors.New("missing BEpusdt transaction params")
	}
	return postBEpusdtOrderEndpoint(ctx, baseURL, token, "/api/v1/order/create-transaction", params)
}

// CreateBEpusdtOrder creates a unified cashier order via POST /api/v1/order/create-order.
func CreateBEpusdtOrder(ctx context.Context, baseURL, token string, params *BEpusdtCreateOrderParams) (*BEpusdtOrderResponseData, error) {
	if params == nil {
		return nil, errors.New("missing BEpusdt order params")
	}
	return postBEpusdtOrderEndpoint(ctx, baseURL, token, "/api/v1/order/create-order", params)
}

// TestBEpusdtConnection probes BEpusdt's built-in /api/v1/pay/notify signature-check
// endpoint with a signed ping payload. It verifies both reachability and token validity
// without creating any database order on BEpusdt.
func TestBEpusdtConnection(ctx context.Context, baseURL, token string) error {
	normalizedURL, err := setting.NormalizeBEpusdtBaseURL(baseURL)
	if err != nil || normalizedURL == "" {
		return common.NewMessage("Invalid BEpusdt API URL")
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return common.NewMessage("BEpusdt API token is required")
	}

	probe := map[string]any{
		"order_id": "new-api-probe",
		"status":   BEpusdtOrderStatusWaiting,
	}
	bodyBytes, err := marshalSignedBEpusdtPayload(probe, token)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, normalizedURL+"/api/v1/pay/notify", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := bepusdtHTTPClient.Do(req)
	if err != nil {
		return common.NewMessage("Failed to connect to BEpusdt gateway")
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return common.NewMessage("Failed to read BEpusdt response")
	}
	if resp.StatusCode != http.StatusOK {
		return common.NewMessage("BEpusdt gateway returned HTTP {{status}}", map[string]any{"status": resp.StatusCode})
	}
	if strings.EqualFold(strings.TrimSpace(string(respBytes)), "ok") {
		return nil
	}
	return common.NewMessage("BEpusdt API token verification failed")
}
