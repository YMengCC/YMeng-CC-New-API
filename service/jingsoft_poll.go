package service

import (
	"context"
	"encoding/hex"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

type jingSoftPollHandler struct{}

func (jingSoftPollHandler) Type() string { return "jingsoft_order_poll" }

// Disabling new purchases never stops recovery of previously created orders.
// Protocol readiness and the encryption key still guard all background queries.
func (jingSoftPollHandler) Enabled() bool           { return JingSoftProtocolReady() }
func (jingSoftPollHandler) Interval() time.Duration { return 15 * time.Second }
func (jingSoftPollHandler) NewPayload() any         { return nil }
func (jingSoftPollHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	err := jingSoftProductionService().poll(ctx)
	if err != nil {
		failSystemTask(task, runnerID, jingSoftPublicError(err))
		return
	}
	if err = model.FinishSystemTask(task.TaskID, runnerID, model.SystemTaskStatusSucceeded, nil, ""); err != nil {
		logSystemTaskLockError(ctx, task, err)
	}
}
func init() { RegisterSystemTaskHandler(jingSoftPollHandler{}) }

func (s *jingSoftService) poll(ctx context.Context) error {
	if !s.adapter.Ready() {
		return ErrJingSoftProtocolUnverified
	}
	s.probeAutoMerchantTokenIfDue(ctx)
	key, err := s.key()
	if err != nil {
		return err
	}
	orders, err := s.store.Due(s.now().Unix(), 50)
	if err != nil {
		return err
	}
	for _, candidate := range orders {
		if err = ctx.Err(); err != nil {
			return err
		}
		order, claimed, claimErr := s.store.Claim(candidate.ID, s.now().Unix(), 120)
		if claimErr != nil {
			return claimErr
		}
		if !claimed {
			continue
		}
		if err = s.processClaimed(ctx, key, order, candidate.Status == model.JingSoftOrderStatusNew); err != nil {
			return err
		}
	}
	return nil
}

func (s *jingSoftService) configuredBaseURL() string {
	if s == nil || s.setting == nil {
		return ""
	}
	cfg := s.setting()
	if cfg == nil {
		return ""
	}
	return strings.TrimSpace(cfg.BaseURL)
}

// processClaimed checks one leased order with JingSoft and records the result.
func (s *jingSoftService) processClaimed(ctx context.Context, key []byte, order *model.JingSoftOrder, wasNew bool) error {
	// Polling may claim a never-submitted row after the creating worker died.
	// It deliberately never submits: no replay can cause a second purchase.
	if wasNew || order.Status == model.JingSoftOrderStatusSubmitting {
		_, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusCreationUnknown, FailureCode: "creation_unknown", NextQueryAt: s.now().Add(time.Minute).Unix()})
		return err
	}
	var credentials JingSoftCredentials
	if err := jingSoftOpen(key, jingSoftOrderSealPurpose(order.UserID, order.TradeNo), order.CredentialCiphertext, &credentials); err != nil {
		_, err = s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusNeedsAttention, FailureCode: "credential_unavailable"})
		return err
	}
	queryBaseURL := jingSoftOrderOrigin(order)
	if queryBaseURL == "" {
		queryBaseURL = s.configuredBaseURL()
	}
	queryCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	evidence, queryErr := s.adapter.Query(queryCtx, queryBaseURL, order, credentials)
	cancel()
	if errors.Is(queryErr, ErrJingSoftVerification) {
		_, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusNeedsAttention, FailureCode: "verification_mismatch"})
		return err
	}
	if queryErr != nil || evidence == nil {
		// A known order may be paid after a long wait. Its CAS version also
		// grows on successful unpaid reads, so it cannot count query failures.
		delay := min(int64(900), int64(15)<<min(max(order.Version/2, 0), 6))
		if order.Status == model.JingSoftOrderStatusPending || order.Status == model.JingSoftOrderStatusPaid {
			delay = min(delay, 60)
		}
		_, err := s.store.Retry(order.ID, order.Version, s.now().Unix()+delay)
		return err
	}
	if evidence.ProbeOnlyUnpaid {
		if order.Status == model.JingSoftOrderStatusPending && order.UpstreamOrderID != nil {
			_, err := s.store.Retry(order.ID, order.Version, s.now().Add(15*time.Second).Unix())
			return err
		}
		_, err := s.store.Retry(order.ID, order.Version, s.now().Add(time.Minute).Unix())
		return err
	}
	return s.applyEvidence(order, evidence)
}

// refresh checks a pending, paid or known-ID recovering order with JingSoft right
// away while its buyer watches the payment dialog, rather than waiting for the
// background poll. Reads are throttled per order; any failure leaves stored state.
func (s *jingSoftService) refresh(ctx context.Context, userID int, tradeNo string) (*model.JingSoftOrder, error) {
	order, err := s.store.Get(userID, tradeNo)
	if err != nil {
		return nil, err
	}
	now := s.now().Unix()
	waiting := order.Status == model.JingSoftOrderStatusPending ||
		order.Status == model.JingSoftOrderStatusPaid ||
		(order.Status == model.JingSoftOrderStatusCreationUnknown && order.UpstreamOrderID != nil)
	if !waiting || !s.adapter.Ready() || order.LeaseUntil > now || order.UpdatedAt > now-2 {
		return order, nil
	}
	key, err := s.key()
	if err != nil {
		return order, nil
	}
	if ok, err := s.store.Retry(order.ID, order.Version, now); err != nil || !ok {
		return order, nil
	}
	claimed, ok, err := s.store.Claim(order.ID, now, 120)
	if err != nil || !ok {
		return order, nil
	}
	if err = s.processClaimed(ctx, key, claimed, false); err != nil {
		return order, nil
	}
	if fresh, err := s.store.Get(userID, tradeNo); err == nil {
		return fresh, nil
	}
	return order, nil
}

func (s *jingSoftService) applyEvidence(order *model.JingSoftOrder, e *JingSoftOrderEvidence) error {
	if !jingSoftMatchesPurchase(order, e) {
		_, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusNeedsAttention, FailureCode: "verification_mismatch"})
		return err
	}
	allowedOrigin := jingSoftOrderOrigin(order)
	if allowedOrigin == "" {
		allowedOrigin = s.configuredBaseURL()
	}
	// Recover an ambiguous creation only after validating the complete purchase
	// identity; merely receiving an order identifier does not establish payment.
	verifiedQR := !e.Paid && !e.Expired && jingSoftValidPaymentQRCode(e.PaymentQRCode, order.PaymentMethod, allowedOrigin)
	recoveredPending := false
	if order.UpstreamOrderID == nil || order.Status == model.JingSoftOrderStatusCreationUnknown {
		recoverUpdate := model.JingSoftOrderUpdate{
			Status:          model.JingSoftOrderStatusPending,
			UpstreamOrderID: &e.UpstreamOrderID,
			NextQueryAt:     s.now().Add(15 * time.Second).Unix(),
		}
		if verifiedQR {
			recoverUpdate.PaymentQRCode = &e.PaymentQRCode
		}
		ok, err := s.store.Update(order.ID, order.Version, recoverUpdate)
		if err != nil || !ok {
			return err
		}
		order.Version++
		order.Status = model.JingSoftOrderStatusPending
		order.UpstreamOrderID = &e.UpstreamOrderID
		if verifiedQR {
			order.PaymentQRCode = e.PaymentQRCode
		}
		recoveredPending = true
	}
	if e.Expired && !e.Paid && order.Status != model.JingSoftOrderStatusPaid {
		_, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusExpired})
		return err
	}
	if !e.Paid {
		if order.Status == model.JingSoftOrderStatusPaid {
			_, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusNeedsAttention, FailureCode: "payment_regressed"})
			return err
		}
		if recoveredPending {
			return nil
		}
		nextQueryAt := s.now().Add(15 * time.Second).Unix()
		if verifiedQR {
			_, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusPending, PaymentQRCode: &e.PaymentQRCode, NextQueryAt: nextQueryAt})
			return err
		}
		_, err := s.store.Retry(order.ID, order.Version, nextQueryAt)
		return err
	}
	if order.Status != model.JingSoftOrderStatusPaid {
		ok, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusPaid, NextQueryAt: s.now().Add(15 * time.Second).Unix()})
		if err != nil || !ok {
			return err
		}
		order.Version++
		order.Status = model.JingSoftOrderStatusPaid
	}

	isDirect := jingSoftModeFromOrder(order) == operation_setting.JingSoftModeDirect
	redemptionKey := ""
	if isDirect {
		if e.TransactionID == "" {
			if !e.Delivered {
				_, err := s.store.Retry(order.ID, order.Version, s.now().Add(15*time.Second).Unix())
				return err
			}
			_, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusNeedsAttention, FailureCode: "verification_mismatch"})
			return err
		}
	} else {
		if !e.Delivered {
			_, err := s.store.Retry(order.ID, order.Version, s.now().Add(15*time.Second).Unix())
			return err
		}
		// New redemption orders also require a trustworthy upstream transaction ID;
		// pre-upgrade in-flight orders have empty ExpectedContact and keep their
		// original verified redemption-code settlement path.
		if order.ExpectedContact != "" && e.TransactionID == "" {
			_, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusNeedsAttention, FailureCode: "verification_mismatch"})
			return err
		}
		_, codeErr := hex.DecodeString(e.RedemptionKey)
		if len(e.RedemptionKey) != 32 || codeErr != nil {
			_, err := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusNeedsAttention, FailureCode: "delivery_invalid"})
			return err
		}
		redemptionKey = e.RedemptionKey
	}

	_, err := s.store.Complete(order.ID, order.Version, redemptionKey, e.TransactionID, "")
	if err != nil {
		// Definite business, denomination or replay failures require human attention.
		// Unknown driver failures remain paid and retry without consuming twice.
		if errors.Is(err, model.ErrRedemptionInvalid) ||
			errors.Is(err, model.ErrRedemptionUsed) ||
			errors.Is(err, model.ErrRedemptionExpired) ||
			errors.Is(err, model.ErrRedemptionQuotaMismatch) ||
			errors.Is(err, model.ErrTopUpQuotaLimitExceeded) ||
			errors.Is(err, model.ErrWalletQuotaLimitExceeded) ||
			errors.Is(err, model.ErrJingSoftTransactionRequired) ||
			errors.Is(err, model.ErrJingSoftTransactionReplay) {
			_, updateErr := s.store.Update(order.ID, order.Version, model.JingSoftOrderUpdate{Status: model.JingSoftOrderStatusNeedsAttention, FailureCode: "settlement_failed"})
			return updateErr
		}
		_, retryErr := s.store.Retry(order.ID, order.Version, s.now().Add(time.Minute).Unix())
		return retryErr
	}
	if isDirect {
		s.replenishAfterDirectSettlement(order.ShopID, order.ProductID)
	}
	return nil
}

func (s *jingSoftService) replenishAfterDirectSettlement(shopID, goodsKey string) {
	cfg := s.setting()
	if cfg == nil {
		return
	}
	baseURL, baseErr := operation_setting.NormalizeJingSoftBaseURL(cfg.BaseURL)
	if baseErr != nil || baseURL == "" {
		return
	}
	merchantToken := strings.TrimSpace(cfg.MerchantToken)
	if merchantToken == "" || s.healthTracker().isInvalid(baseURL, merchantToken) {
		return
	}
	storeToken, err := operation_setting.NormalizeJingSoftStoreTokenForBase(cfg.StoreToken, baseURL)
	if err != nil || storeToken == "" || storeToken != shopID {
		return
	}
	if !slices.Contains(jingSoftValidDirectSlotKeys(cfg), goodsKey) {
		return
	}
	minStock := cfg.AutoRestockMin
	if minStock <= 0 {
		minStock = operation_setting.JingSoftDefaultAutoRestockMin
	}
	restockBatch := cfg.AutoRestockBatch
	if restockBatch <= 0 {
		restockBatch = operation_setting.JingSoftDefaultAutoRestockBatch
	}
	s.runAsync(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if _, restockErr := s.adapter.ReplenishDirectSlot(ctx, baseURL, storeToken, merchantToken, goodsKey, minStock, restockBatch, false); errors.Is(restockErr, errJingSoftMerchantAuthExpired) {
			s.healthTracker().record(baseURL, merchantToken, false, s.now().Unix())
		}
	})
}
