package controller

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/thanhpk/randstr"
)

const (
	bepusdtSubTradeNoPrefix    = "BEPUSDT_SUB-"
	bepusdtMaxWebhookBodyBytes = 64 << 10 // 64 KiB
)

type BEpusdtPayRequest struct {
	Amount         int64  `json:"amount"`
	PayMethodIndex *int   `json:"pay_method_index"`
	PaymentMethod  string `json:"payment_method"`
	ChannelID      string `json:"channel_id"`
}

type SubscriptionBEpusdtPayRequest struct {
	PlanId         int    `json:"plan_id"`
	PayMethodIndex *int   `json:"pay_method_index"`
	PaymentMethod  string `json:"payment_method"`
	ChannelID      string `json:"channel_id"`
}

type TestBEpusdtRequest struct {
	ApiUrl   string `json:"api_url"`
	ApiToken string `json:"api_token"`
}

func getBEpusdtMinTopup(methodMin int) int64 {
	minTopup := max(operation_setting.MinTopUp, methodMin, 1)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dMin := decimal.NewFromInt(int64(minTopup))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		quota, err := common.WalletQuotaFromDecimalStrict(dMin.Mul(dQuotaPerUnit))
		if err != nil {
			return common.MaxWalletQuota
		}
		return int64(quota)
	}
	return int64(minTopup)
}

func getBEpusdtPayMoney(amount int64, group string) float64 {
	return decimal.NewFromFloat(getPayMoney(amount, group)).Round(2).InexactFloat64()
}

func normalizeBEpusdtTopUpAmount(amount int64) int64 {
	if operation_setting.GetQuotaDisplayType() != operation_setting.QuotaDisplayTypeTokens {
		return amount
	}
	normalized := decimal.NewFromInt(amount).
		Div(decimal.NewFromFloat(common.QuotaPerUnit)).
		IntPart()
	return max(normalized, 1)
}

func findBEpusdtGeneralEntry(paymentMethod string, channelID string, matchedIdx int) (map[string]string, bool) {
	expectedType := strings.ToLower(strings.TrimSpace(paymentMethod))
	if !strings.HasPrefix(expectedType, constant.BEpusdtPaymentMethodPrefix) ||
		len(expectedType) <= len(constant.BEpusdtPaymentMethodPrefix) {
		return nil, false
	}
	trimmedChannelID := strings.TrimSpace(channelID)
	for _, entry := range operation_setting.PayMethods {
		if !strings.EqualFold(strings.TrimSpace(entry["type"]), expectedType) {
			continue
		}
		entryChannelID := strings.TrimSpace(entry["channel_id"])
		if trimmedChannelID != "" && entryChannelID != "" && entryChannelID != trimmedChannelID {
			continue
		}
		if matchedIdx >= 0 && entryChannelID != "" && entryChannelID != strconv.Itoa(matchedIdx) {
			continue
		}
		return entry, true
	}
	return nil, false
}

func resolveBEpusdtPayMethod(index *int, paymentMethod string, channelID string) (constant.BEpusdtPayMethod, int, error) {
	methods := setting.GetBEpusdtPayMethods()
	trimmedMethod := strings.TrimSpace(paymentMethod)
	trimmedChannelID := strings.TrimSpace(channelID)

	matchedIdx := -1
	var matched constant.BEpusdtPayMethod

	if index != nil {
		if *index >= 0 && *index < len(methods) {
			matchedIdx = *index
			matched = methods[matchedIdx]
			if trimmedMethod != "" && !strings.EqualFold(constant.FormatBEpusdtPaymentMethodType(matched.TradeType), trimmedMethod) {
				return constant.BEpusdtPayMethod{}, 0, common.NewMessage("Unsupported payment method")
			}
			trimmedMethod = constant.FormatBEpusdtPaymentMethodType(matched.TradeType)
		} else if len(methods) > 0 || trimmedMethod == "" {
			return constant.BEpusdtPayMethod{}, 0, common.NewMessage("Unsupported payment method")
		}
	} else if trimmedChannelID != "" {
		if idx, err := strconv.Atoi(trimmedChannelID); err == nil && idx >= 0 && idx < len(methods) {
			candidate := methods[idx]
			candidateType := constant.FormatBEpusdtPaymentMethodType(candidate.TradeType)
			if trimmedMethod == "" || strings.EqualFold(candidateType, trimmedMethod) {
				matchedIdx = idx
				matched = candidate
				trimmedMethod = candidateType
			}
		}
	}

	if matchedIdx == -1 && trimmedMethod != "" {
		if !constant.IsBEpusdtPaymentMethod(trimmedMethod) {
			return constant.BEpusdtPayMethod{}, 0, common.NewMessage("Unsupported payment method")
		}
		fallbackIdx := -1
		for i, m := range methods {
			if !strings.EqualFold(constant.FormatBEpusdtPaymentMethodType(m.TradeType), trimmedMethod) {
				continue
			}
			if fallbackIdx == -1 {
				fallbackIdx = i
			}
			if _, ok := findBEpusdtGeneralEntry(trimmedMethod, trimmedChannelID, i); ok {
				matchedIdx = i
				matched = m
				break
			}
		}
		if matchedIdx == -1 && fallbackIdx >= 0 {
			matchedIdx = fallbackIdx
			matched = methods[fallbackIdx]
		}
	}

	// Just like JingSoft, a BEpusdt method must be explicitly enabled in General PayMethods.
	generalEntry, ok := findBEpusdtGeneralEntry(trimmedMethod, trimmedChannelID, matchedIdx)
	if !ok {
		return constant.BEpusdtPayMethod{}, 0, common.NewMessage("Unsupported payment method")
	}

	generalMinTopUp, _ := strconv.Atoi(strings.TrimSpace(generalEntry["min_topup"]))
	generalMinTopUp = max(generalMinTopUp, 0)
	if matchedIdx >= 0 {
		return matched, generalMinTopUp, nil
	}

	tradeType, validTradeType := constant.ParseBEpusdtPaymentMethodTradeType(trimmedMethod)
	if !validTradeType {
		return constant.BEpusdtPayMethod{}, 0, common.NewMessage("Unsupported payment method")
	}
	return constant.BEpusdtPayMethod{
		TradeType: tradeType,
	}, generalMinTopUp, nil
}

func resolveBEpusdtCallbackURLs(defaultReturnSuffix string) (notifyURL string, redirectURL string, err error) {
	callbackOrigin, originErr := setting.NormalizeBEpusdtCallbackOrigin(setting.BEpusdtCallbackAddress)
	if originErr != nil {
		return "", "", common.NewMessage("Callback URL configuration error")
	}
	if callbackOrigin == "" {
		callbackOrigin = strings.TrimRight(strings.TrimSpace(system_setting.ServerAddress), "/")
	}
	if callbackOrigin != "" {
		notifyURL = callbackOrigin + "/api/bepusdt/webhook"
	}
	redirectURL = paymentReturnPath(defaultReturnSuffix)
	for _, raw := range []string{notifyURL, redirectURL} {
		parsed, parseErr := url.ParseRequestURI(raw)
		if parseErr != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return "", "", common.NewMessage("Callback URL configuration error")
		}
	}
	return notifyURL, redirectURL, nil
}

func createBEpusdtGatewayOrder(
	ctx context.Context,
	method constant.BEpusdtPayMethod,
	tradeNo string,
	payMoney float64,
	fiat string,
	orderName string,
	notifyURL string,
	redirectURL string,
) (*service.BEpusdtOrderResponseData, error) {
	if constant.IsBEpusdtCashierMode(method.TradeType) {
		return service.CreateBEpusdtOrder(ctx, setting.BEpusdtApiUrl, setting.BEpusdtApiToken, &service.BEpusdtCreateOrderParams{
			OrderID:     tradeNo,
			Amount:      payMoney,
			Fiat:        fiat,
			Currencies:  method.Currencies,
			Name:        orderName,
			NotifyURL:   notifyURL,
			RedirectURL: redirectURL,
		})
	}
	return service.CreateBEpusdtTransaction(ctx, setting.BEpusdtApiUrl, setting.BEpusdtApiToken, &service.BEpusdtCreateTransactionParams{
		OrderID:     tradeNo,
		Amount:      payMoney,
		TradeType:   method.TradeType,
		Fiat:        fiat,
		Name:        orderName,
		NotifyURL:   notifyURL,
		RedirectURL: redirectURL,
		Address:     method.Address,
	})
}

func RequestBEpusdtAmount(c *gin.Context) {
	var req BEpusdtPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		paymentError(c, common.NewMessage("Invalid parameters"))
		return
	}

	methodMin := 0
	if req.PayMethodIndex != nil || strings.TrimSpace(req.PaymentMethod) != "" {
		_, generalMin, err := resolveBEpusdtPayMethod(req.PayMethodIndex, req.PaymentMethod, req.ChannelID)
		if err != nil {
			paymentError(c, err)
			return
		}
		methodMin = generalMin
	}

	minTopup := getBEpusdtMinTopup(methodMin)
	if req.Amount < minTopup {
		paymentError(c, common.NewMessage("Top-up amount cannot be less than {{min}}", map[string]any{"min": minTopup}))
		return
	}

	id := c.GetInt("id")
	if rejectInvalidTopUpQuota(c, id, req.Amount) {
		return
	}

	group, err := model.GetUserGroup(id, true)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to get the user group"))
		return
	}

	payMoney := getBEpusdtPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		paymentError(c, common.NewMessage("Payment amount is too low"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "success", "data": fmt.Sprintf("%.2f", payMoney)})
}

func RequestBEpusdtPay(c *gin.Context) {
	if !isBEpusdtTopUpEnabled() {
		paymentError(c, common.NewMessage("BEpusdt payment is not enabled"))
		return
	}

	var req BEpusdtPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		paymentError(c, common.NewMessage("Invalid parameters"))
		return
	}

	method, generalMin, err := resolveBEpusdtPayMethod(req.PayMethodIndex, req.PaymentMethod, req.ChannelID)
	if err != nil {
		paymentError(c, err)
		return
	}

	minTopup := getBEpusdtMinTopup(generalMin)
	if req.Amount < minTopup {
		paymentError(c, common.NewMessage("Top-up amount cannot be less than {{min}}", map[string]any{"min": minTopup}))
		return
	}

	id := c.GetInt("id")
	if rejectInvalidTopUpQuota(c, id, req.Amount) {
		return
	}

	group, err := model.GetUserGroup(id, true)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to get the user group"))
		return
	}

	payMoney := getBEpusdtPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		paymentError(c, common.NewMessage("Payment amount is too low"))
		return
	}

	notifyURL, redirectURL, err := resolveBEpusdtCallbackURLs("/wallet?show_history=true")
	if err != nil {
		paymentError(c, err)
		return
	}

	tradeNo := fmt.Sprintf("BEPUSDT-%d-%d-%s", id, time.Now().UnixMilli(), randstr.String(6))
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          normalizeBEpusdtTopUpAmount(req.Amount),
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodBEpusdt,
		PaymentProvider: model.PaymentProviderBEpusdt,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), common.LogText("BEpusdt failed to create top-up order user_id=%d trade_no=%s amount=%d error=%q", id, tradeNo, req.Amount, err.Error()))
		paymentError(c, common.NewMessage("Failed to create order"))
		return
	}

	orderResp, err := createBEpusdtGatewayOrder(
		c.Request.Context(),
		method,
		tradeNo,
		payMoney,
		constant.BEpusdtDefaultFiat,
		fmt.Sprintf("TUC%d", req.Amount),
		notifyURL,
		redirectURL,
	)
	if err != nil {
		logger.LogError(c.Request.Context(), common.LogText("BEpusdt failed to create gateway order user_id=%d trade_no=%s trade_type=%s error=%q", id, tradeNo, method.TradeType, err.Error()))
		topUp.Status = common.TopUpStatusFailed
		_ = topUp.Update()
		paymentError(c, common.NewMessage("Failed to start payment"))
		return
	}

	logger.LogInfo(c.Request.Context(), common.LogText("BEpusdt top-up order created user_id=%d trade_no=%s bepusdt_trade_id=%s trade_type=%s amount=%d money=%.2f", id, tradeNo, orderResp.TradeID, method.TradeType, req.Amount, payMoney))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"payment_url": orderResp.PaymentURL,
			"order_id":    tradeNo,
			"trade_id":    orderResp.TradeID,
		},
	})
}

func SubscriptionRequestBEpusdtPay(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	if !isBEpusdtTopUpEnabled() {
		common.ApiErrorT(c, "BEpusdt payment is not enabled")
		return
	}

	var req SubscriptionBEpusdtPayRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanId <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}

	method, _, err := resolveBEpusdtPayMethod(req.PayMethodIndex, req.PaymentMethod, req.ChannelID)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	plan, err := model.GetSubscriptionPlanById(req.PlanId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !plan.Enabled {
		common.ApiErrorT(c, "Subscription plan is not enabled")
		return
	}

	payMoney := decimal.NewFromFloat(plan.PriceAmount).Round(2).InexactFloat64()
	if payMoney < 0.01 {
		common.ApiErrorT(c, "Plan amount is too low")
		return
	}

	userId := c.GetInt("id")
	if plan.MaxPurchasePerUser > 0 {
		count, err := model.CountUserSubscriptionsByPlan(userId, plan.Id)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if count >= int64(plan.MaxPurchasePerUser) {
			common.ApiErrorT(c, "Purchase limit for this plan has been reached")
			return
		}
	}

	notifyURL, redirectURL, err := resolveBEpusdtCallbackURLs("/wallet")
	if err != nil {
		common.ApiError(c, err)
		return
	}

	fiat := strings.ToUpper(strings.TrimSpace(plan.Currency))
	if !constant.IsSupportedBEpusdtFiat(fiat) {
		fiat = constant.BEpusdtDefaultFiat
	}

	tradeNo := fmt.Sprintf("%s%d-%d-%s", bepusdtSubTradeNoPrefix, userId, time.Now().UnixMilli(), randstr.String(6))
	order := &model.SubscriptionOrder{
		UserId:          userId,
		PlanId:          plan.Id,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodBEpusdt,
		PaymentProvider: model.PaymentProviderBEpusdt,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := order.Insert(); err != nil {
		logger.LogError(c.Request.Context(), common.LogText("BEpusdt failed to create subscription order user_id=%d plan_id=%d trade_no=%s error=%q", userId, plan.Id, tradeNo, err.Error()))
		common.ApiErrorT(c, "Failed to create order")
		return
	}

	orderResp, err := createBEpusdtGatewayOrder(
		c.Request.Context(),
		method,
		tradeNo,
		payMoney,
		fiat,
		fmt.Sprintf("SUB:%s", plan.Title),
		notifyURL,
		redirectURL,
	)
	if err != nil {
		logger.LogError(c.Request.Context(), common.LogText("BEpusdt failed to start subscription payment user_id=%d plan_id=%d trade_no=%s error=%q", userId, plan.Id, tradeNo, err.Error()))
		_ = model.ExpireSubscriptionOrder(tradeNo, model.PaymentProviderBEpusdt)
		common.ApiErrorT(c, "Failed to start payment")
		return
	}

	logger.LogInfo(c.Request.Context(), common.LogText("BEpusdt subscription order created user_id=%d plan_id=%d trade_no=%s bepusdt_trade_id=%s trade_type=%s money=%.2f fiat=%s", userId, plan.Id, tradeNo, orderResp.TradeID, method.TradeType, payMoney, fiat))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"payment_url": orderResp.PaymentURL,
			"order_id":    tradeNo,
			"trade_id":    orderResp.TradeID,
		},
	})
}

func TestBEpusdtConnection(c *gin.Context) {
	var req TestBEpusdtRequest
	if c.Request.ContentLength > 0 {
		if err := common.DecodeJson(c.Request.Body, &req); err != nil {
			common.ApiErrorT(c, "Invalid parameters")
			return
		}
	}
	apiURL := strings.TrimSpace(req.ApiUrl)
	if apiURL == "" {
		apiURL = setting.BEpusdtApiUrl
	}
	apiToken := strings.TrimSpace(req.ApiToken)
	if apiToken == "" {
		apiToken = setting.BEpusdtApiToken
	}

	if err := service.TestBEpusdtConnection(c.Request.Context(), apiURL, apiToken); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func isBEpusdtAmountMatched(expected float64, actual float64) bool {
	diff := decimal.NewFromFloat(actual).Sub(decimal.NewFromFloat(expected)).Abs()
	return diff.LessThanOrEqual(decimal.NewFromFloat(0.01))
}

func BEpusdtWebhook(c *gin.Context) {
	ctx := c.Request.Context()
	if !isBEpusdtWebhookEnabled() {
		logger.LogWarn(ctx, common.LogText("BEpusdt webhook rejected reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.String(http.StatusForbidden, "fail")
		return
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(c.Request.Body, bepusdtMaxWebhookBodyBytes+1))
	if err != nil {
		logger.LogError(ctx, common.LogText("BEpusdt webhook failed to read body path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		c.String(http.StatusBadRequest, "fail")
		return
	}
	if len(bodyBytes) > bepusdtMaxWebhookBodyBytes {
		logger.LogWarn(ctx, common.LogText("BEpusdt webhook rejected oversized body path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.String(http.StatusRequestEntityTooLarge, "fail")
		return
	}

	payload, err := service.VerifyBEpusdtWebhook(bodyBytes, setting.BEpusdtApiToken)
	if err != nil {
		logger.LogWarn(ctx, common.LogText("BEpusdt webhook verification failed path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		c.String(http.StatusUnauthorized, "fail")
		return
	}

	tradeNo := strings.TrimSpace(payload.OrderID)
	isSubscription := strings.HasPrefix(tradeNo, bepusdtSubTradeNoPrefix)

	switch payload.Status {
	case service.BEpusdtOrderStatusWaiting, service.BEpusdtOrderStatusConfirming:
		c.String(http.StatusOK, "ok")
		return

	case service.BEpusdtOrderStatusExpired, service.BEpusdtOrderStatusCanceled, service.BEpusdtOrderStatusFailed:
		LockOrder(tradeNo)
		defer UnlockOrder(tradeNo)

		if isSubscription {
			if err := model.ExpireSubscriptionOrder(tradeNo, model.PaymentProviderBEpusdt); err != nil &&
				!errors.Is(err, model.ErrSubscriptionOrderNotFound) &&
				!errors.Is(err, model.ErrSubscriptionOrderStatusInvalid) &&
				!errors.Is(err, model.ErrPaymentMethodMismatch) {
				logger.LogError(ctx, common.LogText("BEpusdt webhook failed to expire subscription order trade_no=%s status=%d error=%q", tradeNo, payload.Status, err.Error()))
			}
		} else {
			targetStatus := common.TopUpStatusFailed
			if payload.Status == service.BEpusdtOrderStatusExpired {
				targetStatus = common.TopUpStatusExpired
			}
			if err := model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderBEpusdt, targetStatus); err != nil &&
				!errors.Is(err, model.ErrTopUpNotFound) &&
				!errors.Is(err, model.ErrTopUpStatusInvalid) &&
				!errors.Is(err, model.ErrPaymentMethodMismatch) {
				logger.LogError(ctx, common.LogText("BEpusdt webhook failed to update top-up status trade_no=%s status=%d target=%s error=%q", tradeNo, payload.Status, targetStatus, err.Error()))
			}
		}
		logger.LogInfo(ctx, common.LogText("BEpusdt webhook handled terminal non-success status trade_no=%s bepusdt_trade_id=%s status=%d client_ip=%s", tradeNo, payload.TradeID, payload.Status, c.ClientIP()))
		c.String(http.StatusOK, "ok")
		return

	case service.BEpusdtOrderStatusSuccess:
		LockOrder(tradeNo)
		defer UnlockOrder(tradeNo)

		if isSubscription {
			order := model.GetSubscriptionOrderByTradeNo(tradeNo)
			if order == nil || order.PaymentProvider != model.PaymentProviderBEpusdt {
				logger.LogWarn(ctx, common.LogText("BEpusdt webhook subscription order not found or provider mismatch trade_no=%s bepusdt_trade_id=%s client_ip=%s", tradeNo, payload.TradeID, c.ClientIP()))
				c.String(http.StatusBadRequest, "fail")
				return
			}
			if !isBEpusdtAmountMatched(order.Money, payload.Amount) {
				logger.LogError(ctx, common.LogText("BEpusdt webhook subscription amount mismatch trade_no=%s expected=%.2f actual=%.2f client_ip=%s", tradeNo, order.Money, payload.Amount, c.ClientIP()))
				c.String(http.StatusBadRequest, "fail")
				return
			}
			if err := model.CompleteSubscriptionOrder(tradeNo, string(bodyBytes), model.PaymentProviderBEpusdt, ""); err != nil {
				if errors.Is(err, model.ErrSubscriptionOrderNotFound) ||
					errors.Is(err, model.ErrSubscriptionOrderStatusInvalid) ||
					errors.Is(err, model.ErrPaymentMethodMismatch) {
					logger.LogWarn(ctx, common.LogText("BEpusdt webhook rejected subscription completion trade_no=%s error=%q", tradeNo, err.Error()))
					c.String(http.StatusBadRequest, "fail")
					return
				}
				logger.LogError(ctx, common.LogText("BEpusdt webhook subscription completion failed trade_no=%s error=%q", tradeNo, err.Error()))
				c.String(http.StatusInternalServerError, "fail")
				return
			}
			logger.LogInfo(ctx, common.LogText("BEpusdt subscription completed trade_no=%s bepusdt_trade_id=%s tx=%s client_ip=%s", tradeNo, payload.TradeID, payload.BlockTransactionID, c.ClientIP()))
			c.String(http.StatusOK, "ok")
			return
		}

		topUp := model.GetTopUpByTradeNo(tradeNo)
		if topUp == nil || topUp.PaymentProvider != model.PaymentProviderBEpusdt {
			logger.LogWarn(ctx, common.LogText("BEpusdt webhook top-up order not found or provider mismatch trade_no=%s bepusdt_trade_id=%s client_ip=%s", tradeNo, payload.TradeID, c.ClientIP()))
			c.String(http.StatusBadRequest, "fail")
			return
		}
		if !isBEpusdtAmountMatched(topUp.Money, payload.Amount) {
			logger.LogError(ctx, common.LogText("BEpusdt webhook top-up amount mismatch trade_no=%s expected=%.2f actual=%.2f client_ip=%s", tradeNo, topUp.Money, payload.Amount, c.ClientIP()))
			c.String(http.StatusBadRequest, "fail")
			return
		}
		alreadyDone, err := model.RechargeBEpusdt(tradeNo, c.ClientIP())
		if err != nil {
			if errors.Is(err, model.ErrTopUpNotFound) ||
				errors.Is(err, model.ErrPaymentMethodMismatch) ||
				errors.Is(err, model.ErrTopUpStatusInvalid) ||
				errors.Is(err, model.ErrInvalidTopUpQuota) ||
				errors.Is(err, model.ErrTopUpQuotaLimitExceeded) {
				logger.LogWarn(ctx, common.LogText("BEpusdt webhook rejected top-up settlement trade_no=%s error=%q", tradeNo, err.Error()))
				c.String(http.StatusBadRequest, "fail")
				return
			}
			logger.LogError(ctx, common.LogText("BEpusdt webhook top-up processing failed trade_no=%s error=%q", tradeNo, err.Error()))
			c.String(http.StatusInternalServerError, "fail")
			return
		}
		if alreadyDone {
			logger.LogInfo(ctx, common.LogText("BEpusdt duplicate callback ignored trade_no=%s bepusdt_trade_id=%s client_ip=%s", tradeNo, payload.TradeID, c.ClientIP()))
		} else {
			logger.LogInfo(ctx, common.LogText("BEpusdt top-up succeeded trade_no=%s bepusdt_trade_id=%s tx=%s client_ip=%s", tradeNo, payload.TradeID, payload.BlockTransactionID, c.ClientIP()))
		}
		c.String(http.StatusOK, "ok")
		return

	default:
		logger.LogInfo(ctx, common.LogText("BEpusdt webhook ignored unknown status trade_no=%s status=%d client_ip=%s", tradeNo, payload.Status, c.ClientIP()))
		c.String(http.StatusOK, "ok")
	}
}
