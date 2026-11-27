package model

import (
	"errors"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

const (
	JingSoftOrderStatusNew             = "new"
	JingSoftOrderStatusSubmitting      = "submitting"
	JingSoftOrderStatusCreationUnknown = "creation_unknown"
	JingSoftOrderStatusPending         = "pending"
	JingSoftOrderStatusPaid            = "paid"
	JingSoftOrderStatusNeedsAttention  = "needs_attention"
	JingSoftOrderStatusCompleted       = "completed"
	JingSoftOrderStatusExpired         = "expired"
)

const (
	JingSoftOrderModeRedemption = "redemption"
	JingSoftOrderModeDirect     = "direct"
)

const (
	JingSoftSlotStatusIdle        = "idle"
	JingSoftSlotStatusLeased      = "leased"
	JingSoftSlotStatusQuarantined = "quarantined"
)

var (
	ErrJingSoftOrderConflict           = errors.New("jingsoft order changed or is not eligible")
	ErrJingSoftTransactionRequired     = errors.New("jingsoft transaction id is required")
	ErrJingSoftTransactionReplay       = errors.New("jingsoft transaction id already used")
	ErrJingSoftDirectOrderNoRedemption = errors.New("jingsoft direct order has no redemption code")
)

// JingSoftOrder contains immutable server-selected purchase/account snapshots.
// CredentialCiphertext must contain authenticated encryption, never a raw code.
// UpstreamOrderID is shop-scoped; NULL means no upstream order is bound yet.
// TransactionID is the payment provider's official trade number; NULL when unbound.
// Service callers must return an explicit public DTO rather than this record.
type JingSoftOrder struct {
	ID                   int     `json:"id"`
	TopUpID              int     `json:"topup_id" gorm:"uniqueIndex;not null"`
	UserID               int     `json:"user_id" gorm:"index;uniqueIndex:idx_jingsoft_user_idempotency,priority:1;not null"`
	TradeNo              string  `json:"trade_no" gorm:"type:varchar(191);uniqueIndex;not null"`
	TierID               string  `json:"tier_id" gorm:"type:varchar(191);not null"`
	ProductID            string  `json:"product_id" gorm:"type:varchar(191);not null"`
	ChannelID            string  `json:"channel_id" gorm:"type:varchar(191);not null"`
	ExpectedQuota        int     `json:"expected_quota" gorm:"not null"`
	PriceAmount          string  `json:"price_amount" gorm:"type:varchar(64);not null"`
	Currency             string  `json:"currency" gorm:"type:varchar(16);not null"`
	ShopID               string  `json:"-" gorm:"type:varchar(128);uniqueIndex:idx_jingsoft_shop_upstream,priority:1;not null"`
	ShopName             string  `json:"shop_name" gorm:"type:varchar(255)"`
	ShopURL              string  `json:"-" gorm:"type:text"`
	PaymentMethod        string  `json:"payment_method" gorm:"type:varchar(50)"`
	Mode                 string  `json:"mode" gorm:"type:varchar(16)"`
	ExpectedContact      string  `json:"-" gorm:"type:varchar(191)"`
	PaymentURL           string  `json:"payment_url" gorm:"type:text"`
	PaymentQRCode        string  `json:"-" gorm:"type:text"`
	UpstreamOrderID      *string `json:"-" gorm:"type:varchar(128);uniqueIndex:idx_jingsoft_shop_upstream,priority:2"`
	TransactionID        *string `json:"-" gorm:"type:varchar(191);uniqueIndex"`
	RedemptionID         *int    `json:"-" gorm:"uniqueIndex"`
	Status               string  `json:"status" gorm:"type:varchar(32);index:idx_jingsoft_due,priority:1;not null"`
	NextQueryAt          int64   `json:"-" gorm:"index:idx_jingsoft_due,priority:2;not null"`
	LeaseUntil           int64   `json:"-" gorm:"not null"`
	Version              int64   `json:"-" gorm:"not null"`
	CredentialCiphertext string  `json:"-" gorm:"type:text"`
	IdempotencyKey       string  `json:"-" gorm:"type:varchar(191);uniqueIndex:idx_jingsoft_user_idempotency,priority:2;not null"`
	FailureCode          string  `json:"failure_code" gorm:"type:varchar(64)"`
	CreatedAt            int64   `json:"created_at" gorm:"autoCreateTime:false;not null"`
	UpdatedAt            int64   `json:"updated_at" gorm:"autoUpdateTime:false;not null"`
}

func (JingSoftOrder) TableName() string { return "jingsoft_orders" }

// JingSoftPriceSlot coordinates multi-instance exclusive access to a dedicated
// JingSoft direct-credit slot product while updating its price and creating an
// upstream order. Expired leases are quarantined rather than blindly reused.
type JingSoftPriceSlot struct {
	ID             int    `json:"id"`
	ShopID         string `json:"shop_id" gorm:"type:varchar(128);uniqueIndex:idx_jingsoft_slot_shop_goods,priority:1;not null"`
	GoodsKey       string `json:"goods_key" gorm:"type:varchar(191);uniqueIndex:idx_jingsoft_slot_shop_goods,priority:2;not null"`
	Status         string `json:"status" gorm:"type:varchar(32);index;not null"`
	ConfirmedPrice string `json:"confirmed_price" gorm:"type:varchar(64)"`
	HolderToken    string `json:"-" gorm:"type:varchar(128)"`
	OrderTradeNo   string `json:"order_trade_no" gorm:"type:varchar(191)"`
	QuarantineCode string `json:"quarantine_code" gorm:"type:varchar(64)"`
	LeaseUntil     int64  `json:"lease_until" gorm:"not null"`
	Version        int64  `json:"-" gorm:"not null"`
	CreatedAt      int64  `json:"created_at" gorm:"autoCreateTime:false;not null"`
	UpdatedAt      int64  `json:"updated_at" gorm:"autoUpdateTime:false;not null"`
}

func (JingSoftPriceSlot) TableName() string { return "jingsoft_price_slots" }

// CreateJingSoftOrder atomically creates a TopUp and its detail. The service sets
// UserID from the authenticated session, never a client-supplied account ID.
// Repeating a user's idempotency key returns the original immutable purchase.
func CreateJingSoftOrder(order *JingSoftOrder) (existing *JingSoftOrder, alreadyExists bool, err error) {
	if order == nil || order.UserID <= 0 || order.IdempotencyKey == "" || len(order.IdempotencyKey) > 191 {
		return nil, false, errors.New("invalid jingsoft order identity")
	}
	existing = &JingSoftOrder{}
	if lookupErr := DB.Where("user_id = ? AND idempotency_key = ?", order.UserID, order.IdempotencyKey).First(existing).Error; lookupErr == nil {
		return existing, true, nil
	} else if !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
		return nil, false, lookupErr
	}
	price, priceErr := decimal.NewFromString(order.PriceAmount)
	validMode := order.Mode == "" || order.Mode == JingSoftOrderModeRedemption || order.Mode == JingSoftOrderModeDirect
	validContact := len(order.ExpectedContact) <= 191 && !strings.ContainsAny(order.ExpectedContact, "\r\n\t\x00") && (order.Mode != JingSoftOrderModeDirect || order.ExpectedContact == order.TradeNo)
	if order.ID != 0 || order.TopUpID != 0 || order.TradeNo == "" || len(order.TradeNo) > 191 || order.TierID == "" || order.ProductID == "" || order.ChannelID == "" || order.ShopID == "" || len(order.ShopID) > 128 || order.Currency == "" || len(order.Currency) > 16 || priceErr != nil || !price.IsPositive() || len(order.PriceAmount) > 64 || strings.ContainsAny(order.PriceAmount, "eE") || len(order.TierID) > 191 || len(order.ProductID) > 191 || len(order.ChannelID) > 191 || len(order.ShopName) > 255 || !validMode || !validContact {
		return nil, false, errors.New("invalid jingsoft purchase snapshot")
	}
	if order.ExpectedQuota <= 0 || common.ValidateWalletQuota(order.ExpectedQuota) != nil {
		return nil, false, ErrInvalidTopUpQuota
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := tx.Select("id").Where("id = ?", order.UserID).First(&user).Error; err != nil {
			return err
		}
		now := common.GetTimestamp()
		money, _ := price.Float64()
		paymentMethod := order.PaymentMethod
		if paymentMethod != PaymentMethodJingSoftAlipay && paymentMethod != PaymentMethodJingSoftWeChat {
			paymentMethod = PaymentMethodJingSoft
		}
		topup := &TopUp{UserId: order.UserID, TradeNo: order.TradeNo, Money: money, Amount: int64(order.ExpectedQuota), PaymentMethod: paymentMethod, PaymentProvider: PaymentProviderJingSoft, Status: common.TopUpStatusPending, CreateTime: now}
		if err := tx.Create(topup).Error; err != nil {
			return err
		}
		order.TopUpID = topup.Id
		order.PaymentMethod = paymentMethod
		order.Status = JingSoftOrderStatusNew
		order.UpstreamOrderID, order.TransactionID, order.RedemptionID = nil, nil, nil
		order.PaymentURL, order.FailureCode = "", ""
		order.Version, order.LeaseUntil = 0, 0
		order.NextQueryAt, order.CreatedAt, order.UpdatedAt = now, now, now
		return tx.Session(&gorm.Session{Logger: tx.Logger.LogMode(gormlogger.Silent)}).Create(order).Error
	})
	if err != nil {
		// A competing request can win the unique constraint after our lookup.
		existing = &JingSoftOrder{}
		if lookupErr := DB.Where("user_id = ? AND idempotency_key = ?", order.UserID, order.IdempotencyKey).First(existing).Error; lookupErr == nil {
			return existing, true, nil
		}
		return nil, false, err
	}
	return order, false, nil
}

func GetJingSoftOrderByTradeNo(tradeNo string) (*JingSoftOrder, error) {
	order := &JingSoftOrder{}
	err := DB.Where("trade_no = ?", tradeNo).First(order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		_ = syncLegacyJingSoftOrders(DB)
		err = DB.Where("trade_no = ?", tradeNo).First(order).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if mapped := remapLegacyTradeNo(tradeNo); mapped != tradeNo {
				err = DB.Where("trade_no = ?", mapped).First(order).Error
			}
		}
	}
	return order, err
}

func GetJingSoftOrderForUser(userID int, tradeNo string) (*JingSoftOrder, error) {
	order := &JingSoftOrder{}
	err := DB.Where("user_id = ? AND trade_no = ?", userID, tradeNo).First(order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		_ = syncLegacyJingSoftOrders(DB)
		err = DB.Where("user_id = ? AND trade_no = ?", userID, tradeNo).First(order).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if mapped := remapLegacyTradeNo(tradeNo); mapped != tradeNo {
				err = DB.Where("user_id = ? AND trade_no = ?", userID, mapped).First(order).Error
			}
		}
	}
	return order, err
}

// GetJingSoftRedemptionForUser returns the redemption a completed order of this
// user consumed. Soft-deleted codes stay readable as purchase records.
func GetJingSoftRedemptionForUser(userID int, tradeNo string) (*Redemption, error) {
	order, err := GetJingSoftOrderForUser(userID, tradeNo)
	if err != nil {
		return nil, err
	}
	return jingSoftRedemptionForOrder(order)
}

// GetJingSoftRedemptionByTradeNo reads the code consumed by one order without
// caller ownership. Callers MUST authorize staff access; the code is already
// used, so showing it grants nothing new.
func GetJingSoftRedemptionByTradeNo(tradeNo string) (*Redemption, error) {
	order, err := GetJingSoftOrderByTradeNo(tradeNo)
	if err != nil {
		return nil, err
	}
	return jingSoftRedemptionForOrder(order)
}

func jingSoftRedemptionForOrder(order *JingSoftOrder) (*Redemption, error) {
	if order.Mode == JingSoftOrderModeDirect {
		return nil, ErrJingSoftDirectOrderNoRedemption
	}
	if order.Status != JingSoftOrderStatusCompleted || order.RedemptionID == nil {
		return nil, ErrJingSoftOrderConflict
	}
	redemption := &Redemption{}
	err := DB.Unscoped().Where("id = ? AND used_user_id = ?", *order.RedemptionID, order.UserID).First(redemption).Error
	return redemption, err
}

// FindJingSoftOrderForRequest recovers a persisted purchase before revalidating a
// quote or current settings. A retry must not create a different purchase.
func FindJingSoftOrderForRequest(userID int, idempotencyKey string) (*JingSoftOrder, error) {
	order := &JingSoftOrder{}
	err := DB.Where("user_id = ? AND idempotency_key = ?", userID, idempotencyKey).First(order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		_ = syncLegacyJingSoftOrders(DB)
		err = DB.Where("user_id = ? AND idempotency_key = ?", userID, idempotencyKey).First(order).Error
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return order, err
}

func ListDueJingSoftOrders(now int64, limit int) ([]*JingSoftOrder, error) {
	orders := make([]*JingSoftOrder, 0)
	if limit <= 0 || limit > 1000 {
		return nil, errors.New("invalid jingsoft query limit")
	}
	_ = syncLegacyJingSoftOrders(DB)
	err := DB.Where("status IN ? AND next_query_at <= ? AND lease_until <= ?", []string{JingSoftOrderStatusNew, JingSoftOrderStatusSubmitting, JingSoftOrderStatusCreationUnknown, JingSoftOrderStatusPending, JingSoftOrderStatusPaid}, now, now).Order("next_query_at, id").Limit(limit).Find(&orders).Error
	return orders, err
}

// ClaimJingSoftOrder grants a bounded lease by CAS. Only New may submit a create
// request. A recovered Submitting becomes CreationUnknown and MUST be queried;
// the service must never replay an ambiguous upstream creation.
func ClaimJingSoftOrder(id int, now int64, leaseSeconds int64) (*JingSoftOrder, bool, error) {
	if id <= 0 || now <= 0 || leaseSeconds <= 0 || leaseSeconds > 3600 || now > (1<<63-1)-leaseSeconds {
		return nil, false, errors.New("invalid jingsoft claim")
	}
	order := &JingSoftOrder{}
	if err := DB.First(order, "id = ?", id).Error; err != nil {
		return nil, false, err
	}
	status := order.Status
	switch status {
	case JingSoftOrderStatusNew:
		status = JingSoftOrderStatusSubmitting
	case JingSoftOrderStatusSubmitting:
		status = JingSoftOrderStatusCreationUnknown
	case JingSoftOrderStatusCreationUnknown, JingSoftOrderStatusPending, JingSoftOrderStatusPaid:
	default:
		return order, false, nil
	}
	result := DB.Model(&JingSoftOrder{}).Where("id = ? AND version = ? AND status = ? AND next_query_at <= ? AND lease_until <= ?", id, order.Version, order.Status, now, now).Updates(map[string]any{"status": status, "lease_until": now + leaseSeconds, "version": gorm.Expr("version + 1"), "updated_at": now})
	if result.Error != nil || result.RowsAffected != 1 {
		return order, false, result.Error
	}
	order.Status, order.LeaseUntil, order.UpdatedAt = status, now+leaseSeconds, now
	order.Version++
	return order, true, nil
}

// JingSoftOrderUpdate contains only verified service results. It intentionally
// cannot change the account, purchase snapshot, redemption, or terminal success.
// FailureCode is a fixed internal category; never put upstream messages in it.
type JingSoftOrderUpdate struct {
	Status               string
	UpstreamOrderID      *string
	PaymentURL           *string
	PaymentQRCode        *string
	CredentialCiphertext *string
	NextQueryAt          int64
	FailureCode          string
}

func MarkJingSoftOrderCreated(id int, version int64, upstreamID string, paymentURL string, nextQueryAt int64) (bool, error) {
	return UpdateJingSoftOrder(id, version, JingSoftOrderUpdate{Status: JingSoftOrderStatusPending, UpstreamOrderID: &upstreamID, PaymentURL: &paymentURL, NextQueryAt: nextQueryAt})
}

func UpdateJingSoftOrder(id int, version int64, update JingSoftOrderUpdate) (bool, error) {
	order := &JingSoftOrder{}
	if err := DB.First(order, "id = ?", id).Error; err != nil {
		return false, err
	}
	if order.Version != version {
		return false, nil
	}
	allowed := false
	switch order.Status {
	case JingSoftOrderStatusSubmitting, JingSoftOrderStatusCreationUnknown:
		allowed = update.Status == order.Status || update.Status == JingSoftOrderStatusCreationUnknown || update.Status == JingSoftOrderStatusPending || update.Status == JingSoftOrderStatusNeedsAttention || update.Status == JingSoftOrderStatusExpired
	case JingSoftOrderStatusPending:
		allowed = update.Status == order.Status || update.Status == JingSoftOrderStatusPaid || update.Status == JingSoftOrderStatusNeedsAttention || update.Status == JingSoftOrderStatusExpired
	case JingSoftOrderStatusPaid:
		allowed = update.Status == JingSoftOrderStatusPaid || update.Status == JingSoftOrderStatusNeedsAttention
	}
	if !allowed || update.NextQueryAt < 0 || len(update.FailureCode) > 64 || strings.ContainsAny(update.FailureCode, " \t\r\n") {
		return false, ErrJingSoftOrderConflict
	}
	upstreamID := order.UpstreamOrderID
	if update.UpstreamOrderID != nil {
		if *update.UpstreamOrderID == "" || len(*update.UpstreamOrderID) > 128 || (upstreamID != nil && *upstreamID != *update.UpstreamOrderID) {
			return false, ErrJingSoftOrderConflict
		}
		upstreamID = update.UpstreamOrderID
	}
	if (update.Status == JingSoftOrderStatusPending || update.Status == JingSoftOrderStatusPaid) && upstreamID == nil {
		return false, ErrJingSoftOrderConflict
	}
	fields := map[string]any{"status": update.Status, "next_query_at": update.NextQueryAt, "failure_code": update.FailureCode, "lease_until": 0, "version": gorm.Expr("version + 1"), "updated_at": common.GetTimestamp()}
	if update.UpstreamOrderID != nil {
		fields["upstream_order_id"] = *update.UpstreamOrderID
	}
	if update.PaymentURL != nil {
		fields["payment_url"] = *update.PaymentURL
	}
	if update.PaymentQRCode != nil {
		fields["payment_qr_code"] = *update.PaymentQRCode
	}
	if update.CredentialCiphertext != nil {
		fields["credential_ciphertext"] = *update.CredentialCiphertext
	}
	// SQL logger must not print encrypted credentials or provider responses.
	result := DB.Session(&gorm.Session{Logger: DB.Logger.LogMode(gormlogger.Silent)}).Model(&JingSoftOrder{}).Where("id = ? AND version = ? AND status = ?", id, version, order.Status).Updates(fields)
	return result.RowsAffected == 1, result.Error
}

func RetryJingSoftOrder(id int, version int64, nextQueryAt int64) (bool, error) {
	if nextQueryAt <= 0 {
		return false, errors.New("invalid jingsoft retry time")
	}
	result := DB.Model(&JingSoftOrder{}).Where("id = ? AND version = ? AND status IN ?", id, version, []string{JingSoftOrderStatusSubmitting, JingSoftOrderStatusCreationUnknown, JingSoftOrderStatusPending, JingSoftOrderStatusPaid}).Updates(map[string]any{"next_query_at": nextQueryAt, "lease_until": 0, "version": gorm.Expr("version + 1"), "updated_at": common.GetTimestamp()})
	return result.RowsAffected == 1, result.Error
}

// CompleteVerifiedJingSoftOrder is an internal service boundary, NEVER a handler
// for client-supplied redemption codes. Before calling, the service must verify
// provider identity, paid status, shop/product/channel/currency/price snapshots,
// and either the local redemption code (redemption mode) or direct-credit
// invariants (direct mode), along with the official payment transaction ID.
// A stale worker cannot settle twice; any failure rolls back all writes.
func CompleteVerifiedJingSoftOrder(id int, version int64, redemptionKey string, transactionID string, callerIP string) (alreadyDone bool, err error) {
	txID := strings.TrimSpace(transactionID)
	order := &JingSoftOrder{}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(order, "id = ?", id).Error; err != nil {
			return err
		}
		if order.Status == JingSoftOrderStatusCompleted {
			if txID != "" && order.TransactionID != nil && *order.TransactionID != txID {
				return ErrJingSoftOrderConflict
			}
			alreadyDone = true
			return nil
		}
		if order.Status != JingSoftOrderStatusPaid || order.Version != version || order.UpstreamOrderID == nil || *order.UpstreamOrderID == "" || order.ExpectedQuota <= 0 {
			return ErrJingSoftOrderConflict
		}
		isDirect := order.Mode == JingSoftOrderModeDirect
		requireTx := isDirect || order.ExpectedContact != ""
		if requireTx && txID == "" {
			return ErrJingSoftTransactionRequired
		}
		if txID != "" {
			if len(txID) > 191 || strings.ContainsAny(txID, " \t\r\n\x00") || (order.TransactionID != nil && *order.TransactionID != txID) {
				return ErrJingSoftOrderConflict
			}
			var conflictCount int64
			if err := tx.Model(&JingSoftOrder{}).Where("transaction_id = ? AND id <> ?", txID, order.ID).Count(&conflictCount).Error; err != nil {
				return err
			}
			if conflictCount > 0 {
				return ErrJingSoftTransactionReplay
			}
		}
		topup := &TopUp{}
		if err := lockForUpdate(tx).First(topup, "id = ?", order.TopUpID).Error; err != nil {
			return err
		}
		mappedTopUpMethod := remapLegacyPaymentMethod(topup.PaymentMethod)
		mappedOrderMethod := remapLegacyPaymentMethod(order.PaymentMethod)
		validPaymentMethod := mappedTopUpMethod == PaymentMethodJingSoft || mappedTopUpMethod == PaymentMethodJingSoftAlipay || mappedTopUpMethod == PaymentMethodJingSoftWeChat
		validProvider := topup.PaymentProvider == PaymentProviderJingSoft || topup.PaymentProvider == "cat"+"fk"
		validTrade := topup.TradeNo == order.TradeNo || remapLegacyTradeNo(topup.TradeNo) == order.TradeNo
		if topup.UserId != order.UserID || !validTrade || !validProvider || mappedTopUpMethod != mappedOrderMethod || !validPaymentMethod || topup.Status != common.TopUpStatusPending {
			return ErrJingSoftOrderConflict
		}
		now := common.GetTimestamp()
		orderUpdates := map[string]any{
			"status":                JingSoftOrderStatusCompleted,
			"version":               gorm.Expr("version + 1"),
			"updated_at":            now,
			"lease_until":           0,
			"next_query_at":         0,
			"credential_ciphertext": "",
			"failure_code":          "",
		}
		if txID != "" {
			orderUpdates["transaction_id"] = txID
		}
		result := tx.Session(&gorm.Session{Logger: tx.Logger.LogMode(gormlogger.Silent)}).Model(&JingSoftOrder{}).Where("id = ? AND version = ? AND status = ?", id, version, JingSoftOrderStatusPaid).Updates(orderUpdates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrJingSoftOrderConflict
		}
		if isDirect {
			if err := creditTopUpQuota(tx, order.UserID, order.ExpectedQuota, nil); err != nil {
				return err
			}
		} else {
			redemption, err := redeemInTransaction(tx, redemptionKey, order.UserID, order.ExpectedQuota)
			if err != nil {
				return err
			}
			if err := tx.Model(&JingSoftOrder{}).Where("id = ?", id).Update("redemption_id", redemption.Id).Error; err != nil {
				return err
			}
		}
		invoiceAmount, err := InvoiceAmountFromQuota(order.ExpectedQuota)
		if err != nil {
			return err
		}
		result = tx.Model(&TopUp{}).Where("id = ? AND status = ?", topup.Id, common.TopUpStatusPending).Updates(map[string]any{
			"status":           common.TopUpStatusSuccess,
			"complete_time":    now,
			"credited_quota":   int64(order.ExpectedQuota),
			"invoice_amount":   invoiceAmount,
			"payment_provider": PaymentProviderJingSoft,
			"payment_method":   mappedOrderMethod,
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrJingSoftOrderConflict
		}
		return nil
	})
	if err != nil {
		if txID != "" && !errors.Is(err, ErrJingSoftTransactionReplay) {
			var conflictCount int64
			if DB.Model(&JingSoftOrder{}).Where("transaction_id = ? AND id <> ?", txID, id).Count(&conflictCount).Error == nil && conflictCount > 0 {
				return false, ErrJingSoftTransactionReplay
			}
		}
		return false, err
	}
	if alreadyDone {
		return true, nil
	}
	syncCreditUserQuotaCache(order.UserID, order.ExpectedQuota, "jingsoft topup")
	RecordTopupLog(order.UserID, common.NewMessage("Online top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}", map[string]any{"quota": logger.FormatQuota(order.ExpectedQuota), "amount": order.PriceAmount + " " + order.Currency}), callerIP, order.PaymentMethod, PaymentProviderJingSoft)
	return false, nil
}

// AcquireJingSoftPriceSlot grants exclusive versioned access to one idle direct
// slot for the given shop. Any slot whose prior lease expired without a clean
// release is moved to quarantined rather than reused while remote state is unknown.
func AcquireJingSoftPriceSlot(shopID string, goodsKeys []string, targetPrice string, orderTradeNo string, now int64, leaseSeconds int64) (*JingSoftPriceSlot, bool, error) {
	if shopID == "" || len(shopID) > 128 || len(goodsKeys) == 0 || now <= 0 || leaseSeconds <= 0 || leaseSeconds > 600 || now > (1<<63-1)-leaseSeconds {
		return nil, false, errors.New("invalid jingsoft slot lease request")
	}
	var existing []*JingSoftPriceSlot
	if err := DB.Where("shop_id = ? AND goods_key IN ?", shopID, goodsKeys).Order("id").Find(&existing).Error; err != nil {
		return nil, false, err
	}
	have := make(map[string]bool, len(existing))
	for _, slot := range existing {
		have[slot.GoodsKey] = true
	}
	for _, key := range goodsKeys {
		if key == "" || len(key) > 191 || have[key] {
			continue
		}
		row := &JingSoftPriceSlot{
			ShopID:    shopID,
			GoodsKey:  key,
			Status:    JingSoftSlotStatusIdle,
			CreatedAt: now,
			UpdatedAt: now,
		}
		_ = DB.Session(&gorm.Session{Logger: DB.Logger.LogMode(gormlogger.Silent)}).Create(row).Error
		have[key] = true
	}
	var slots []*JingSoftPriceSlot
	if err := DB.Where("shop_id = ? AND goods_key IN ?", shopID, goodsKeys).Order("id").Find(&slots).Error; err != nil {
		return nil, false, err
	}
	candidates := make([]*JingSoftPriceSlot, 0, len(slots))
	fallback := make([]*JingSoftPriceSlot, 0, len(slots))
	for _, slot := range slots {
		if slot.Status == JingSoftSlotStatusLeased && slot.LeaseUntil <= now {
			_ = DB.Model(&JingSoftPriceSlot{}).
				Where("id = ? AND version = ? AND status = ? AND lease_until <= ?", slot.ID, slot.Version, JingSoftSlotStatusLeased, now).
				Updates(map[string]any{
					"status":          JingSoftSlotStatusQuarantined,
					"confirmed_price": "",
					"holder_token":    "",
					"quarantine_code": "lease_expired",
					"lease_until":     0,
					"version":         gorm.Expr("version + 1"),
					"updated_at":      now,
				}).Error
			continue
		}
		if slot.Status != JingSoftSlotStatusIdle {
			continue
		}
		if targetPrice != "" && slot.ConfirmedPrice == targetPrice {
			candidates = append(candidates, slot)
		} else {
			fallback = append(fallback, slot)
		}
	}
	candidates = append(candidates, fallback...)
	for _, slot := range candidates {
		holder := common.GetUUID()
		result := DB.Model(&JingSoftPriceSlot{}).
			Where("id = ? AND version = ? AND status = ?", slot.ID, slot.Version, JingSoftSlotStatusIdle).
			Updates(map[string]any{
				"status":         JingSoftSlotStatusLeased,
				"holder_token":   holder,
				"order_trade_no": orderTradeNo,
				"lease_until":    now + leaseSeconds,
				"version":        gorm.Expr("version + 1"),
				"updated_at":     now,
			})
		if result.Error != nil {
			return nil, false, result.Error
		}
		if result.RowsAffected == 1 {
			slot.Status = JingSoftSlotStatusLeased
			slot.HolderToken = holder
			slot.OrderTradeNo = orderTradeNo
			slot.LeaseUntil = now + leaseSeconds
			slot.UpdatedAt = now
			slot.Version++
			return slot, true, nil
		}
	}
	return nil, false, nil
}

func ReleaseJingSoftPriceSlot(id int, version int64, holderToken string, confirmedPrice string, now int64) (bool, error) {
	if id <= 0 || holderToken == "" || now <= 0 {
		return false, errors.New("invalid jingsoft slot release")
	}
	result := DB.Model(&JingSoftPriceSlot{}).
		Where("id = ? AND version = ? AND status = ? AND holder_token = ? AND lease_until > ?", id, version, JingSoftSlotStatusLeased, holderToken, now).
		Updates(map[string]any{
			"status":          JingSoftSlotStatusIdle,
			"confirmed_price": confirmedPrice,
			"holder_token":    "",
			"order_trade_no":  "",
			"quarantine_code": "",
			"lease_until":     0,
			"version":         gorm.Expr("version + 1"),
			"updated_at":      now,
		})
	if result.Error != nil || result.RowsAffected == 1 {
		return result.RowsAffected == 1, result.Error
	}
	_, _ = QuarantineJingSoftPriceSlot(id, version, holderToken, "lease_expired", now)
	return false, nil
}

func QuarantineJingSoftPriceSlot(id int, version int64, holderToken string, code string, now int64) (bool, error) {
	if id <= 0 || holderToken == "" || now <= 0 || len(code) > 64 || strings.ContainsAny(code, " \t\r\n") {
		return false, errors.New("invalid jingsoft slot quarantine")
	}
	result := DB.Model(&JingSoftPriceSlot{}).
		Where("id = ? AND version = ? AND status = ? AND holder_token = ?", id, version, JingSoftSlotStatusLeased, holderToken).
		Updates(map[string]any{
			"status":          JingSoftSlotStatusQuarantined,
			"confirmed_price": "",
			"holder_token":    "",
			"quarantine_code": code,
			"lease_until":     0,
			"version":         gorm.Expr("version + 1"),
			"updated_at":      now,
		})
	return result.RowsAffected == 1, result.Error
}

func ResetQuarantinedJingSoftPriceSlots(shopID string, now int64) (int64, error) {
	if shopID == "" || now <= 0 {
		return 0, errors.New("invalid jingsoft slot reset")
	}
	_ = DB.Model(&JingSoftPriceSlot{}).
		Where("shop_id = ? AND status = ? AND lease_until <= ?", shopID, JingSoftSlotStatusLeased, now).
		Updates(map[string]any{
			"status":          JingSoftSlotStatusQuarantined,
			"confirmed_price": "",
			"holder_token":    "",
			"quarantine_code": "lease_expired",
			"lease_until":     0,
			"version":         gorm.Expr("version + 1"),
			"updated_at":      now,
		}).Error
	result := DB.Model(&JingSoftPriceSlot{}).
		Where("shop_id = ? AND status = ?", shopID, JingSoftSlotStatusQuarantined).
		Updates(map[string]any{
			"status":          JingSoftSlotStatusIdle,
			"confirmed_price": "",
			"holder_token":    "",
			"order_trade_no":  "",
			"quarantine_code": "",
			"lease_until":     0,
			"version":         gorm.Expr("version + 1"),
			"updated_at":      now,
		})
	return result.RowsAffected, result.Error
}

func remapLegacyPaymentMethod(method string) string {
	switch strings.ToLower(strings.TrimSpace(method)) {
	case "cat" + "fk":
		return PaymentMethodJingSoft
	case "cat" + "fk_alipay":
		return PaymentMethodJingSoftAlipay
	case "cat" + "fk_wxpay":
		return PaymentMethodJingSoftWeChat
	default:
		return method
	}
}

func remapLegacyTradeNo(tradeNo string) string {
	legacyPrefix := "cat" + "fk_"
	if rest, ok := strings.CutPrefix(tradeNo, legacyPrefix); ok {
		return "JingSoft_" + rest
	}
	return tradeNo
}

// syncLegacyJingSoftOrders imports any newly created legacy cat_fk_orders rows
// and mirrors upstream binding or terminal settlement updates produced by a
// draining v1.3.0 instance during blue-green cutover, without dropping legacy tables.
func syncLegacyJingSoftOrders(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	legacyOrderTable := db.NamingStrategy.TableName("cat_fk_orders")
	if !db.Migrator().HasTable(legacyOrderTable) || !db.Migrator().HasTable(&JingSoftOrder{}) {
		return nil
	}
	var unmigrated []JingSoftOrder
	if err := db.Table(legacyOrderTable).Where("top_up_id NOT IN (?)", db.Model(&JingSoftOrder{}).Select("top_up_id")).Order("id").Find(&unmigrated).Error; err != nil {
		return err
	}
	for i := range unmigrated {
		row := unmigrated[i]
		row.ID = 0
		row.PaymentMethod = remapLegacyPaymentMethod(row.PaymentMethod)
		if row.CredentialCiphertext == "" {
			oldTrade := row.TradeNo
			row.TradeNo = remapLegacyTradeNo(row.TradeNo)
			if row.ExpectedContact == oldTrade {
				row.ExpectedContact = row.TradeNo
			}
		}
		var count int64
		if err := db.Model(&JingSoftOrder{}).Where("top_up_id = ? OR trade_no = ?", row.TopUpID, row.TradeNo).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			if err := db.Session(&gorm.Session{Logger: db.Logger.LogMode(gormlogger.Silent)}).Create(&row).Error; err != nil {
				return err
			}
		}
	}

	var activeOrders []JingSoftOrder
	if err := db.Where("status IN ?", []string{JingSoftOrderStatusNew, JingSoftOrderStatusSubmitting, JingSoftOrderStatusCreationUnknown, JingSoftOrderStatusPending, JingSoftOrderStatusPaid}).Find(&activeOrders).Error; err != nil || len(activeOrders) == 0 {
		return err
	}
	topUpIDs := make([]int, 0, len(activeOrders))
	for i := range activeOrders {
		topUpIDs = append(topUpIDs, activeOrders[i].TopUpID)
	}
	var legacyRows []JingSoftOrder
	if err := db.Table(legacyOrderTable).Where("top_up_id IN ?", topUpIDs).Find(&legacyRows).Error; err != nil || len(legacyRows) == 0 {
		return err
	}
	legacyByTopUp := make(map[int]*JingSoftOrder, len(legacyRows))
	for i := range legacyRows {
		legacyByTopUp[legacyRows[i].TopUpID] = &legacyRows[i]
	}
	for i := range activeOrders {
		cur := &activeOrders[i]
		leg := legacyByTopUp[cur.TopUpID]
		if leg == nil {
			continue
		}
		if leg.Status == JingSoftOrderStatusCompleted || leg.Status == JingSoftOrderStatusExpired {
			updates := map[string]any{
				"status":                leg.Status,
				"next_query_at":         0,
				"lease_until":           0,
				"credential_ciphertext": "",
				"failure_code":          leg.FailureCode,
				"updated_at":            leg.UpdatedAt,
			}
			if leg.RedemptionID != nil {
				updates["redemption_id"] = *leg.RedemptionID
			}
			if leg.TransactionID != nil && *leg.TransactionID != "" {
				updates["transaction_id"] = *leg.TransactionID
			}
			_ = db.Session(&gorm.Session{Logger: db.Logger.LogMode(gormlogger.Silent)}).Model(&JingSoftOrder{}).Where("id = ? AND status = ?", cur.ID, cur.Status).Updates(updates).Error
			continue
		}
		if cur.UpstreamOrderID == nil && leg.UpstreamOrderID != nil && *leg.UpstreamOrderID != "" {
			updates := map[string]any{
				"upstream_order_id": *leg.UpstreamOrderID,
				"payment_url":       leg.PaymentURL,
				"payment_qr_code":   leg.PaymentQRCode,
				"status":            leg.Status,
				"updated_at":        leg.UpdatedAt,
			}
			if leg.CredentialCiphertext != "" {
				updates["credential_ciphertext"] = leg.CredentialCiphertext
			}
			_ = db.Session(&gorm.Session{Logger: db.Logger.LogMode(gormlogger.Silent)}).Model(&JingSoftOrder{}).Where("id = ? AND upstream_order_id IS NULL", cur.ID).Updates(updates).Error
		}
	}
	return nil
}

// MigrateLegacyJingSoftData upgrades pre-rename database tables, historical
// terminal top-up order identifiers/payment methods, and persisted options
// idempotently without dropping legacy tables or options needed by an active
// v1.3.0 instance during blue-green cutover or rollback.
func MigrateLegacyJingSoftData(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	legacyPrefix := "cat" + "fk"
	legacyOrderTable := db.NamingStrategy.TableName("cat_fk_orders")
	legacySlotTable := db.NamingStrategy.TableName("cat_fk_price_slots")
	var inferredBaseURL string

	if db.Migrator().HasTable(legacyOrderTable) {
		if err := syncLegacyJingSoftOrders(db); err != nil {
			return err
		}
		var legacyOrders []JingSoftOrder
		if err := db.Table(legacyOrderTable).Where("shop_url <> ''").Order("id").Limit(20).Find(&legacyOrders).Error; err == nil {
			for i := range legacyOrders {
				if parsed, pErr := url.Parse(legacyOrders[i].ShopURL); pErr == nil && parsed.Scheme == "https" && parsed.Host != "" {
					if normalized, nErr := operation_setting.NormalizeJingSoftBaseURL("https://" + parsed.Host); nErr == nil {
						inferredBaseURL = normalized
						break
					}
				}
			}
		}
	}

	if db.Migrator().HasTable(legacySlotTable) {
		var legacySlots []JingSoftPriceSlot
		if err := db.Table(legacySlotTable).Order("id").Find(&legacySlots).Error; err != nil {
			return err
		}
		for i := range legacySlots {
			slot := legacySlots[i]
			slot.ID = 0
			slot.OrderTradeNo = remapLegacyTradeNo(slot.OrderTradeNo)
			var count int64
			if err := db.Model(&JingSoftPriceSlot{}).Where("shop_id = ? AND goods_key = ?", slot.ShopID, slot.GoodsKey).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				if err := db.Session(&gorm.Session{Logger: db.Logger.LogMode(gormlogger.Silent)}).Create(&slot).Error; err != nil {
					return err
				}
			}
		}
	}

	if db.Migrator().HasTable(&TopUp{}) {
		encryptedTrades := make(map[string]bool)
		if db.Migrator().HasTable(&JingSoftOrder{}) {
			var active []string
			_ = db.Model(&JingSoftOrder{}).Where("credential_ciphertext <> ''").Pluck("trade_no", &active).Error
			for _, t := range active {
				encryptedTrades[t] = true
			}
		}
		// Keep in-flight pending TopUp rows untouched in DB until settlement so a
		// draining or rolled-back v1.3.0 instance can still settle them cleanly.
		var legacyTopUps []TopUp
		if err := db.Where("status <> ? AND (payment_provider = ? OR payment_method IN ? OR trade_no LIKE ?)", common.TopUpStatusPending, legacyPrefix, []string{legacyPrefix, legacyPrefix + "_alipay", legacyPrefix + "_wxpay"}, legacyPrefix+"_%").Find(&legacyTopUps).Error; err != nil {
			return err
		}
		for i := range legacyTopUps {
			item := &legacyTopUps[i]
			updates := map[string]any{}
			if item.PaymentProvider == legacyPrefix {
				updates["payment_provider"] = PaymentProviderJingSoft
			}
			if mapped := remapLegacyPaymentMethod(item.PaymentMethod); mapped != item.PaymentMethod {
				updates["payment_method"] = mapped
			}
			if !encryptedTrades[item.TradeNo] {
				if mappedTrade := remapLegacyTradeNo(item.TradeNo); mappedTrade != item.TradeNo {
					var conflict int64
					if db.Model(&TopUp{}).Where("trade_no = ? AND id <> ?", mappedTrade, item.Id).Count(&conflict).Error == nil && conflict == 0 {
						updates["trade_no"] = mappedTrade
					}
				}
			}
			if len(updates) > 0 {
				if err := db.Model(&TopUp{}).Where("id = ?", item.Id).Updates(updates).Error; err != nil {
					return err
				}
			}
		}
	}

	if db.Migrator().HasTable(&Option{}) {
		var legacyOpts []Option
		settingPrefix := legacyPrefix + "_setting."
		if err := db.Where(commonKeyCol+" LIKE ?", settingPrefix+"%").Find(&legacyOpts).Error; err != nil {
			return err
		}
		hadLegacySetting := false
		for _, opt := range legacyOpts {
			if suffix, ok := strings.CutPrefix(opt.Key, settingPrefix); ok {
				hadLegacySetting = true
				newKey := "jingsoft_setting." + suffix
				var existingCount int64
				if err := db.Model(&Option{}).Where(commonKeyCol+" = ?", newKey).Count(&existingCount).Error; err != nil {
					return err
				}
				if existingCount == 0 {
					if err := db.Create(&Option{Key: newKey, Value: opt.Value}).Error; err != nil {
						return err
					}
				}
			}
		}
		if hadLegacySetting && inferredBaseURL != "" {
			var baseCount int64
			if db.Model(&Option{}).Where(commonKeyCol+" = ?", "jingsoft_setting.base_url").Count(&baseCount).Error == nil && baseCount == 0 {
				_ = db.Create(&Option{Key: "jingsoft_setting.base_url", Value: inferredBaseURL}).Error
			}
		}
	}

	return nil
}
