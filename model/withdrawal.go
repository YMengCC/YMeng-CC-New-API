package model

import (
	"errors"
	"math"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	WithdrawalStatusPending    = "pending"
	WithdrawalStatusProcessing = "processing"
	WithdrawalStatusCompleted  = "completed"
	WithdrawalStatusRejected   = "rejected"

	WithdrawalMaxRejectReasonLength = 500
)

var (
	ErrWithdrawalAmountTooLow     = common.NewMessage("Minimum withdrawal amount is 10")
	ErrWithdrawalAmountNotInteger = common.NewMessage("Withdrawal amount must be an integer")
	ErrWithdrawalQuotaInvalid     = common.NewMessage("Withdrawal quota must be a positive safe integer")
	ErrWithdrawalInsufficient     = common.NewMessage("Invitation quota is insufficient!")
	ErrWithdrawalRequestInvalid   = common.NewMessage("Withdrawal request ID must be a UUID")
	ErrWithdrawalRequestConflict  = common.NewMessage("Withdrawal request ID was already used for a different amount")
	ErrWithdrawalQRRequired       = common.NewMessage("Upload a payout QR code before requesting a withdrawal")
	ErrWithdrawalNotFound         = common.NewMessage("Withdrawal application not found")
	ErrWithdrawalStatusInvalid    = common.NewMessage("Withdrawal status transition is invalid")
	ErrWithdrawalRejectReason     = common.NewMessage("Withdrawal rejection reason is required and must be 500 characters or fewer")
)

// WithdrawalProfile keeps private payout images out of user and session reads.
type WithdrawalProfile struct {
	UserId    int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	Data      []byte `json:"-" gorm:"not null"`
	Width     int    `json:"-" gorm:"not null"`
	Height    int    `json:"-" gorm:"not null"`
	Size      int64  `json:"-" gorm:"not null"`
	Sha256    string `json:"sha256" gorm:"type:char(64);not null"`
	UpdatedAt int64  `json:"updated_at" gorm:"type:bigint;not null"`
}

// WithdrawalCurrencySnapshot is embedded as portable scalar columns, while JSON
// preserves the full CurrencyConfig object expected by the console formatter.
type WithdrawalCurrencySnapshot struct {
	DisplayInCurrency          bool    `json:"displayInCurrency"`
	QuotaDisplayType           string  `json:"quotaDisplayType" gorm:"type:varchar(16)"`
	QuotaPerUnit               float64 `json:"quotaPerUnit"`
	USDExchangeRate            float64 `json:"usdExchangeRate"`
	CustomCurrencySymbol       string  `json:"customCurrencySymbol" gorm:"type:varchar(255)"`
	CustomCurrencyExchangeRate float64 `json:"customCurrencyExchangeRate"`
}

func GetWithdrawalCurrencySnapshot() WithdrawalCurrencySnapshot {
	settings := *operation_setting.GetGeneralSetting()
	return WithdrawalCurrencySnapshot{
		DisplayInCurrency: settings.QuotaDisplayType != operation_setting.QuotaDisplayTypeTokens,
		QuotaDisplayType:  settings.QuotaDisplayType, QuotaPerUnit: common.QuotaPerUnit,
		USDExchangeRate:      operation_setting.USDExchangeRate,
		CustomCurrencySymbol: settings.CustomCurrencySymbol, CustomCurrencyExchangeRate: settings.CustomCurrencyExchangeRate,
	}
}

// MinimumQuota returns the smallest safe integer quota worth at least 10 in
// this display configuration. Exact quotient/remainder avoids rounding a
// repeating division or a large floating-point value across the boundary.
func (snapshot WithdrawalCurrencySnapshot) MinimumQuota() (int64, error) {
	if snapshot.QuotaDisplayType == operation_setting.QuotaDisplayTypeTokens {
		return 10, nil
	}
	rate := 1.0
	switch snapshot.QuotaDisplayType {
	case operation_setting.QuotaDisplayTypeCNY:
		rate = snapshot.USDExchangeRate
	case operation_setting.QuotaDisplayTypeCustom:
		if snapshot.CustomCurrencyExchangeRate > 0 {
			rate = snapshot.CustomCurrencyExchangeRate
		}
	}
	if snapshot.QuotaPerUnit <= 0 || math.IsNaN(snapshot.QuotaPerUnit) || math.IsInf(snapshot.QuotaPerUnit, 0) || rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) {
		return 0, ErrWithdrawalQuotaInvalid
	}
	minimum, remainder := decimal.NewFromInt(10).Mul(decimal.NewFromFloat(snapshot.QuotaPerUnit)).QuoRem(decimal.NewFromFloat(rate), 0)
	if remainder.IsPositive() {
		minimum = minimum.Add(decimal.NewFromInt(1))
	}
	quota, err := common.WalletQuotaFromDecimalStrict(minimum)
	if err != nil {
		return 0, ErrWithdrawalQuotaInvalid
	}
	return int64(quota), nil
}

// WithoutCents reports whether quota maps to a whole displayed amount. Quota is
// an integer, so an exact whole amount is not always representable (for example
// 10 CNY at a 7.3 rate); values within half a displayed cent of a whole number
// are accepted, matching the console's two-decimal display. TOKENS already
// count in whole units.
func (snapshot WithdrawalCurrencySnapshot) WithoutCents(quota int64) bool {
	if snapshot.QuotaDisplayType == operation_setting.QuotaDisplayTypeTokens {
		return true
	}
	rate := 1.0
	switch snapshot.QuotaDisplayType {
	case operation_setting.QuotaDisplayTypeCNY:
		rate = snapshot.USDExchangeRate
	case operation_setting.QuotaDisplayTypeCustom:
		if snapshot.CustomCurrencyExchangeRate > 0 {
			rate = snapshot.CustomCurrencyExchangeRate
		}
	}
	if snapshot.QuotaPerUnit <= 0 || math.IsNaN(snapshot.QuotaPerUnit) || math.IsInf(snapshot.QuotaPerUnit, 0) || rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) {
		return false
	}
	amount := decimal.NewFromInt(quota).
		Mul(decimal.NewFromFloat(rate)).
		Div(decimal.NewFromFloat(snapshot.QuotaPerUnit))
	offBy := amount.Sub(amount.Round(0)).Abs()
	return offBy.LessThan(decimal.NewFromFloat(0.005))
}

type Withdrawal struct {
	Id               int                        `json:"id"`
	UserId           int                        `json:"user_id" gorm:"not null;uniqueIndex:idx_withdrawal_user_request,priority:1;index"`
	Username         string                     `json:"username" gorm:"-"`
	Quota            int64                      `json:"quota" gorm:"type:bigint;not null"`
	RequestId        string                     `json:"-" gorm:"type:char(36);not null;uniqueIndex:idx_withdrawal_user_request,priority:2"`
	Status           string                     `json:"status" gorm:"type:varchar(16);not null;index"`
	CreatedAt        int64                      `json:"created_at" gorm:"type:bigint;not null;index"`
	UpdatedAt        int64                      `json:"updated_at" gorm:"type:bigint;not null"`
	UpdatedBy        int                        `json:"updated_by" gorm:"not null"`
	CurrencySnapshot WithdrawalCurrencySnapshot `json:"currency_snapshot" gorm:"embedded;embeddedPrefix:currency_"`
	RejectReason     string                     `json:"reject_reason,omitempty" gorm:"type:text"`
	RejectedAt       int64                      `json:"rejected_at,omitempty" gorm:"type:bigint"`
	ProofName        string                     `json:"proof_name,omitempty" gorm:"type:varchar(255)"`
	ProofSize        int64                      `json:"proof_size,omitempty" gorm:"type:bigint"`
	ProofSha256      string                     `json:"-" gorm:"type:char(64)"`
	QRData           []byte                     `json:"-" gorm:"not null"`
	ProofData        []byte                     `json:"-"`
}

func SaveWithdrawalProfile(userId int, profile *WithdrawalProfile) error {
	if userId <= 0 || profile == nil || len(profile.Data) == 0 {
		return ErrWithdrawalQRRequired
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").First(&user, userId).Error; err != nil {
			return err
		}
		profile.UserId = userId
		profile.UpdatedAt = common.GetTimestamp()
		return tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(profile).Error
	})
}

func GetWithdrawalProfile(userId int, includeData bool) (*WithdrawalProfile, error) {
	if userId <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	query := DB.Where("user_id = ?", userId)
	if !includeData {
		query = query.Omit("data")
	}
	var profile WithdrawalProfile
	err := query.First(&profile).Error
	return &profile, err
}

func CreateWithdrawal(userId int, quota int64, requestId string) (*Withdrawal, error) {
	if quota <= 0 || quota > common.MaxWalletQuota {
		return nil, ErrWithdrawalQuotaInvalid
	}
	parsed, err := uuid.Parse(requestId)
	if err != nil || len(requestId) != 36 || parsed == uuid.Nil {
		return nil, ErrWithdrawalRequestInvalid
	}
	requestId = parsed.String()
	application := &Withdrawal{}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "username").First(&user, userId).Error; err != nil {
			return err
		}
		result := tx.Omit("qr_data").Where("user_id = ? AND request_id = ?", userId, requestId).First(application)
		if result.Error == nil {
			if application.Quota != quota {
				return ErrWithdrawalRequestConflict
			}
			application.Username = user.Username
			return nil
		}
		if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return result.Error
		}
		snapshot := GetWithdrawalCurrencySnapshot()
		// Apply today's minimum only to new requests. Existing applications must
		// remain replayable even after the minimum or display settings change.
		minimum, err := snapshot.MinimumQuota()
		if err != nil {
			return err
		}
		if quota < minimum {
			return ErrWithdrawalAmountTooLow
		}
		if !snapshot.WithoutCents(quota) {
			return ErrWithdrawalAmountNotInteger
		}
		var profile WithdrawalProfile
		if err := tx.Where("user_id = ?", userId).First(&profile).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrWithdrawalQRRequired
			}
			return err
		}
		result = tx.Model(&User{}).Where("id = ? AND invite_quota >= ?", userId, quota).
			UpdateColumn("invite_quota", gorm.Expr("invite_quota - ?", quota))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrWithdrawalInsufficient
		}
		now := common.GetTimestamp()
		application = &Withdrawal{
			UserId: userId, Username: user.Username, Quota: quota, RequestId: requestId,
			Status: WithdrawalStatusPending, CreatedAt: now, UpdatedAt: now, QRData: profile.Data,
			CurrencySnapshot: snapshot,
		}
		return tx.Create(application).Error
	})
	if err != nil {
		return nil, err
	}
	application.QRData = nil
	return application, nil
}

func GetAllWithdrawals(keyword, status string, page *common.PageInfo) ([]*Withdrawal, int64, error) {
	query := DB.Model(&Withdrawal{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		users := DB.Model(&User{}).Select("id").Where("LOWER(username) LIKE ? ESCAPE '!'", invoiceLikePattern(keyword))
		if id, err := strconv.Atoi(keyword); err == nil && id > 0 {
			query = query.Where("user_id = ? OR user_id IN (?)", id, users)
		} else {
			query = query.Where("user_id IN (?)", users)
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]*Withdrawal, 0)
	if err := query.Omit("qr_data", "proof_data").Order("id DESC").Offset(page.GetStartIdx()).Limit(page.GetPageSize()).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	ids := make([]int, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.UserId)
	}
	if len(ids) > 0 {
		var users []User
		if err := DB.Unscoped().Select("id", "username").Where("id IN ?", ids).Find(&users).Error; err != nil {
			return nil, 0, err
		}
		names := make(map[int]string, len(users))
		for _, user := range users {
			names[user.Id] = user.Username
		}
		for _, item := range items {
			item.Username = names[item.UserId]
		}
	}
	return items, total, nil
}

// GetWithdrawalUserQR serves the applicant's current payout QR from their
// profile. The application keeps its own snapshot for audit, but administrators
// always see the latest profile image.
func GetWithdrawalUserQR(id int) ([]byte, error) {
	var application Withdrawal
	if err := DB.Select("id", "user_id").First(&application, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWithdrawalNotFound
		}
		return nil, err
	}
	profile, err := GetWithdrawalProfile(application.UserId, true)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWithdrawalQRRequired
		}
		return nil, err
	}
	return profile.Data, nil
}

func GetWithdrawalProof(id int) ([]byte, error) {
	var application Withdrawal
	if err := DB.Select("id", "proof_data").First(&application, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWithdrawalNotFound
		}
		return nil, err
	}
	if len(application.ProofData) == 0 {
		return nil, ErrWithdrawalNotFound
	}
	return application.ProofData, nil
}

// GetUserWithdrawals lists the caller's own applications for the wallet record
// dialog. Binary columns never leave the database.
func GetUserWithdrawals(userId int, page *common.PageInfo) ([]*Withdrawal, int64, error) {
	query := DB.Model(&Withdrawal{}).Where("user_id = ?", userId)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]*Withdrawal, 0)
	if err := query.Omit("qr_data", "proof_data", "request_id").
		Order("id DESC").Offset(page.GetStartIdx()).Limit(page.GetPageSize()).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func MarkWithdrawalProcessing(id, adminId int) error {
	result := DB.Model(&Withdrawal{}).
		Where("id = ? AND status = ?", id, WithdrawalStatusPending).
		Updates(map[string]any{
			"status": WithdrawalStatusProcessing, "updated_at": common.GetTimestamp(), "updated_by": adminId,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrWithdrawalStatusInvalid
	}
	return nil
}

func CompleteWithdrawal(id, adminId int, proof *WithdrawalProof) error {
	if proof == nil || len(proof.Data) == 0 {
		return ErrWithdrawalQRRequired
	}
	now := common.GetTimestamp()
	result := DB.Model(&Withdrawal{}).
		Where("id = ? AND status = ?", id, WithdrawalStatusProcessing).
		Updates(map[string]any{
			"status":       WithdrawalStatusCompleted,
			"updated_at":   now,
			"updated_by":   adminId,
			"proof_name":   proof.Name,
			"proof_size":   int64(len(proof.Data)),
			"proof_sha256": proof.Sha256,
			"proof_data":   proof.Data,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrWithdrawalStatusInvalid
	}
	return nil
}

// WithdrawalProof is the administrator's payment receipt uploaded on completion.
type WithdrawalProof struct {
	Name   string
	Data   []byte
	Sha256 string
}

// RejectWithdrawal refuses an application and refunds its amount to the
// referral balance exactly once, in the same transaction as the status change.
func RejectWithdrawal(id, adminId int, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" || len([]rune(reason)) > WithdrawalMaxRejectReasonLength {
		return ErrWithdrawalRejectReason
	}
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		var application Withdrawal
		if err := lockForUpdate(tx).Select("id", "user_id", "quota", "status").First(&application, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrWithdrawalNotFound
			}
			return err
		}
		result := tx.Model(&Withdrawal{}).
			Where("id = ? AND status IN ?", id, []string{WithdrawalStatusPending, WithdrawalStatusProcessing}).
			Updates(map[string]any{
				"status":        WithdrawalStatusRejected,
				"reject_reason": reason,
				"rejected_at":   now,
				"updated_at":    now,
				"updated_by":    adminId,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrWithdrawalStatusInvalid
		}
		return tx.Model(&User{}).Where("id = ?", application.UserId).
			UpdateColumn("invite_quota", gorm.Expr("invite_quota + ?", application.Quota)).Error
	})
}
