package controller

import (
	"errors"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/pkg/siteupdate"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetSystemReleaseFeed(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	feed, err := service.GetSystemReleaseFeed(c.Request.Context())
	if err != nil {
		if c.Request.Context().Err() != nil {
			return
		}
		common.ApiErrorStatus(c, http.StatusServiceUnavailable, common.NewMessage(err.Error()), gin.H{"data": feed})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": feed})
}

func GetSystemUpdateStatus(c *gin.Context) {
	status, err := service.SystemUpdateStatus(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
}

func GetSystemUpdateReleases(c *gin.Context) {
	var releases siteupdate.ReleaseList
	if err := service.SystemUpdateRequest(c.Request.Context(), http.MethodGet, "/v1/releases", nil, &releases); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": releases})
}

func CleanupSystemUpdate(c *gin.Context) {
	operatorID := c.GetInt("id")
	if c.GetInt("role") != common.RoleRootUser {
		common.SysLog(common.LogText("managed update cleanup rejected: user_id=%d reason=permission", operatorID))
		common.ApiErrorStatus(c, http.StatusForbidden, common.NewMessage("You do not have permission to perform this action."))
		return
	}
	if c.GetHeader("X-Requested-With") != "YMeng-Update" {
		common.SysLog(common.LogText("managed update cleanup rejected: user_id=%d reason=request_header", operatorID))
		common.ApiErrorStatus(c, http.StatusForbidden, common.NewMessage("update request header is required"))
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 4096))
	var fields map[string]any
	if err != nil || common.Unmarshal(body, &fields) != nil || len(fields) != 1 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid retained instance cleanup request."))
		return
	}
	cleanupID, ok := fields["cleanup_id"].(string)
	if !ok {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid retained instance cleanup request."))
		return
	}
	request := siteupdate.CleanupRequest{CleanupID: cleanupID}
	proofContext, err := common.Marshal(service.SystemUpdateCleanupContext{CleanupID: cleanupID})
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Please try again later."))
		return
	}
	operation := service.VerificationOperation{Scope: service.VerificationScopeSystemUpdateCleanup, Context: proofContext}
	if _, err := service.BindVerificationOperation(operation); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid retained instance cleanup request."))
		return
	}
	if middleware.RequireSecurityProof(c, operation) == nil {
		common.SysLog(common.LogText("managed update cleanup rejected: user_id=%d cleanup_id=%s reason=verification", operatorID, cleanupID))
		return
	}
	var status siteupdate.Status
	if err := service.SystemUpdateRequest(c.Request.Context(), http.MethodPost, "/v1/cleanup", request, &status); err != nil {
		common.SysLog(common.LogText("managed update cleanup rejected: user_id=%d cleanup_id=%s reason=controller", operatorID, cleanupID))
		var rejection *service.SystemUpdateControllerError
		if errors.As(err, &rejection) {
			common.ApiErrorStatus(c, rejection.StatusCode, common.NewMessage(rejection.Message), gin.H{"code": rejection.Code})
			return
		}
		common.ApiErrorStatus(c, http.StatusServiceUnavailable, common.NewMessage("The update controller is unavailable. Check the update status before retrying cleanup."))
		return
	}
	common.SysLog(common.LogText("managed update cleanup accepted: user_id=%d cleanup_id=%s", operatorID, cleanupID))
	c.JSON(http.StatusAccepted, gin.H{"success": true, "data": status})
}

func StartSystemUpdate(c *gin.Context) {
	// A custom header cannot be sent by cross-origin HTML forms. Dashboard
	// authorization is required independently by the route's RootAuth middleware.
	if c.GetHeader("X-Requested-With") != "YMeng-Update" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "update request header is required"})
		return
	}
	var request siteupdate.UpdateRequest
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 4096), &request); err != nil || request.Tag == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid update version"})
		return
	}
	var status siteupdate.Status
	if err := service.SystemUpdateRequest(c.Request.Context(), http.MethodPost, "/v1/update", request, &status); err != nil {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "data": status})
}
