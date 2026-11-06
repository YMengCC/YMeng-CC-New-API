package controller

import (
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetWithdrawalProfile(c *gin.Context) {
	minimum, err := model.GetWithdrawalCurrencySnapshot().MinimumQuota()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	profile, err := model.GetWithdrawalProfile(c.GetInt("id"), false)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiSuccess(c, gin.H{"has_qr": false, "updated_at": 0, "minimum_quota": minimum})
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"has_qr": true, "updated_at": profile.UpdatedAt, "sha256": profile.Sha256, "minimum_quota": minimum})
}

func UpdateWithdrawalQR(c *gin.Context) {
	minimum, err := model.GetWithdrawalCurrencySnapshot().MinimumQuota()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.MaxPayoutQRSize+64*1024)
	if err := c.Request.ParseMultipartForm(service.MaxPayoutQRSize + 64*1024); err != nil {
		if c.Request.MultipartForm != nil {
			defer c.Request.MultipartForm.RemoveAll()
		}
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid payout QR image"))
		return
	}
	defer c.Request.MultipartForm.RemoveAll()
	files := c.Request.MultipartForm.File
	if len(files) != 1 || len(files["qr"]) != 1 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Payout QR upload must contain one PNG file"))
		return
	}
	uploaded, err := service.ReadPayoutQRUpload(files["qr"][0])
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid payout QR image"))
		return
	}
	profile := &model.WithdrawalProfile{
		Data: uploaded.Data, Width: uploaded.Width, Height: uploaded.Height,
		Size: int64(len(uploaded.Data)), Sha256: uploaded.Sha256,
	}
	if err := model.SaveWithdrawalProfile(c.GetInt("id"), profile); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"has_qr": true, "updated_at": profile.UpdatedAt, "sha256": profile.Sha256, "minimum_quota": minimum})
}

func GetWithdrawalProfileQR(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	profile, err := model.GetWithdrawalProfile(c.GetInt("id"), true)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiErrorStatus(c, http.StatusNotFound, common.NewMessage("Payout QR code not found"))
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.Data(http.StatusOK, "image/png", profile.Data)
}

func CreateWithdrawal(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	var request struct {
		Quota     int64  `json:"quota"`
		RequestId string `json:"request_id"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid withdrawal request"))
		return
	}
	application, err := model.CreateWithdrawal(c.GetInt("id"), request.Quota, request.RequestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, application)
}

func GetAllWithdrawals(c *gin.Context) {
	status := strings.TrimSpace(c.Query("status"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	validStatus := status == "" || status == model.WithdrawalStatusPending || status == model.WithdrawalStatusProcessing ||
		status == model.WithdrawalStatusCompleted || status == model.WithdrawalStatusRejected
	if len([]rune(keyword)) > 255 || !validStatus {
		common.ApiErrorMsg(c, "Invalid withdrawal filters")
		return
	}
	page := common.GetPageQuery(c)
	if err := validateInvoicePageQuery(c, page); err != nil || page.Page > math.MaxInt/page.PageSize {
		common.ApiErrorMsg(c, "Invalid withdrawal pagination")
		return
	}
	items, total, err := model.GetAllWithdrawals(keyword, status, page)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total, "p": page.Page, "page_size": page.PageSize})
}

// GetWithdrawalQR serves the applicant's latest profile QR code, not the
// snapshot taken when the application was created.
func GetWithdrawalQR(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	id, parseErr := strconv.Atoi(c.Param("id"))
	if parseErr != nil || id <= 0 {
		common.ApiErrorStatus(c, http.StatusNotFound, model.ErrWithdrawalNotFound)
		return
	}
	data, err := model.GetWithdrawalUserQR(id)
	if errors.Is(err, model.ErrWithdrawalNotFound) || errors.Is(err, model.ErrWithdrawalQRRequired) {
		common.ApiErrorStatus(c, http.StatusNotFound, model.ErrWithdrawalQRRequired)
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.Data(http.StatusOK, "image/png", data)
}

func GetWithdrawalProof(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	id, parseErr := strconv.Atoi(c.Param("id"))
	if parseErr != nil || id <= 0 {
		common.ApiErrorStatus(c, http.StatusNotFound, model.ErrWithdrawalNotFound)
		return
	}
	data, err := model.GetWithdrawalProof(id)
	if errors.Is(err, model.ErrWithdrawalNotFound) {
		common.ApiErrorStatus(c, http.StatusNotFound, model.ErrWithdrawalNotFound)
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.Data(http.StatusOK, "image/png", data)
}

func GetMyWithdrawals(c *gin.Context) {
	page := common.GetPageQuery(c)
	if err := validateInvoicePageQuery(c, page); err != nil || page.Page > math.MaxInt/page.PageSize {
		common.ApiErrorMsg(c, "Invalid withdrawal pagination")
		return
	}
	items, total, err := model.GetUserWithdrawals(c.GetInt("id"), page)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total, "p": page.Page, "page_size": page.PageSize})
}

func MarkWithdrawalProcessing(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiError(c, model.ErrWithdrawalNotFound)
		return
	}
	if err := model.MarkWithdrawalProcessing(id, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func UploadWithdrawalProof(c *gin.Context) {
	id, parseErr := strconv.Atoi(c.Param("id"))
	if parseErr != nil || id <= 0 {
		common.ApiError(c, model.ErrWithdrawalNotFound)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.MaxPayoutQRSize+64*1024)
	if err := c.Request.ParseMultipartForm(service.MaxPayoutQRSize + 64*1024); err != nil {
		if c.Request.MultipartForm != nil {
			defer c.Request.MultipartForm.RemoveAll()
		}
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid payout proof image"))
		return
	}
	defer c.Request.MultipartForm.RemoveAll()
	files := c.Request.MultipartForm.File
	if len(files) != 1 || len(files["proof"]) != 1 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Payout proof upload must contain one PNG file"))
		return
	}
	uploaded, err := service.ReadPayoutQRUpload(files["proof"][0])
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid payout proof image"))
		return
	}
	proof := &model.WithdrawalProof{Name: "withdrawal-proof.png", Data: uploaded.Data, Sha256: uploaded.Sha256}
	if err := model.CompleteWithdrawal(id, c.GetInt("id"), proof); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func RejectWithdrawal(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiError(c, model.ErrWithdrawalNotFound)
		return
	}
	var request struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid withdrawal request"))
		return
	}
	if err := model.RejectWithdrawal(id, id, request.Reason); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
