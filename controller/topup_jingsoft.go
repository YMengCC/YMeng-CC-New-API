package controller

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func RequestJingSoftQuote(c *gin.Context) {
	if !operation_setting.IsPaymentComplianceConfirmed() {
		common.ApiErrorT(c, "Payment compliance confirmation is required")
		return
	}
	var req service.JingSoftQuoteRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.ChannelID == "" || (req.ProductID == "" && req.Amount == nil) {
		common.ApiErrorT(c, "Invalid JingSoft payment request")
		return
	}
	quote, err := service.QuoteJingSoftRequest(c.Request.Context(), c.GetInt("id"), req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, quote)
}

func RequestJingSoftPay(c *gin.Context) {
	if !operation_setting.IsPaymentComplianceConfirmed() {
		common.ApiErrorT(c, "Payment compliance confirmation is required")
		return
	}
	var req service.JingSoftPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorT(c, "Invalid JingSoft payment request")
		return
	}
	payment, err := service.CreateJingSoftPaymentWithIP(c.Request.Context(), c.GetInt("id"), req, c.ClientIP())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, payment)
}

func GetJingSoftPayment(c *gin.Context) {
	// Existing orders remain readable when new purchases are disabled.
	payment, err := service.GetUserJingSoftPayment(c.Request.Context(), c.GetInt("id"), c.Param("trade_no"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, payment)
}

func GetJingSoftRedemption(c *gin.Context) {
	redemption, err := service.GetJingSoftOrderRedemption(
		c.GetInt("id"),
		c.Param("trade_no"),
		c.GetInt("role") >= common.RoleAdminUser,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, redemption)
}

func ListJingSoftPaymentChannels(c *gin.Context) {
	var req struct {
		BaseURL    string `json:"base_url"`
		StoreToken string `json:"store_token"`
		Token      string `json:"token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorT(c, "Invalid JingSoft payment request")
		return
	}
	token := strings.TrimSpace(req.StoreToken)
	if token == "" {
		token = strings.TrimSpace(req.Token)
	}
	channels, err := service.ListJingSoftChannels(c.Request.Context(), req.BaseURL, token)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, channels)
}

func ResetJingSoftPriceSlots(c *gin.Context) {
	resetCount, err := service.ResetQuarantinedJingSoftSlots()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"reset_count": resetCount})
}

func CheckJingSoftMerchantToken(c *gin.Context) {
	var req struct {
		BaseURL       string `json:"base_url"`
		MerchantToken string `json:"merchant_token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorT(c, "Invalid JingSoft payment request")
		return
	}
	status, err := service.CheckJingSoftMerchantTokenStatus(c.Request.Context(), req.BaseURL, req.MerchantToken)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, status)
}

func CheckJingSoftCompatibility(c *gin.Context) {
	var req struct {
		BaseURL       string `json:"base_url"`
		StoreToken    string `json:"store_token"`
		MerchantToken string `json:"merchant_token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorT(c, "Invalid JingSoft payment request")
		return
	}
	result, err := service.CheckJingSoftPlatformCompatibility(c.Request.Context(), req.BaseURL, req.StoreToken, req.MerchantToken)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func DiscoverJingSoftProducts(c *gin.Context) {
	var req struct {
		BaseURL    string `json:"base_url"`
		StoreToken string `json:"store_token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorT(c, "Invalid JingSoft payment request")
		return
	}
	products, err := service.DiscoverJingSoftStoreProducts(c.Request.Context(), req.BaseURL, req.StoreToken)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, products)
}

func DiscoverJingSoftDirectSlots(c *gin.Context) {
	var req struct {
		BaseURL       string `json:"base_url"`
		MerchantToken string `json:"merchant_token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorT(c, "Invalid JingSoft payment request")
		return
	}
	slots, err := service.DiscoverJingSoftDirectSlots(c.Request.Context(), req.BaseURL, req.MerchantToken)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, slots)
}
