package controller

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service/office"

	"github.com/gin-gonic/gin"
)

// Office mode is admin only and browser-session only (the access-token rule
// for /api/office rejects personal access tokens). The gateway proxies the
// office worker, which owns the workspaces and runs the sandboxed agent.

const (
	maxOfficePromptLength = 64_000
	maxOfficeUploadBytes  = 20 << 20
	officeUploadTimeout   = 5 * time.Minute
)

var (
	errOfficeNotConfigured = common.NewMessage("Office mode is not configured")
	errOfficeTurnInvalid   = common.NewMessage("Prompt and model are required")
	errOfficeUploadTooBig  = common.NewMessage("File is too large")
	errOfficeUploadMissing = common.NewMessage("File is required")
)

// OfficeStatus tells the console whether the office mode is available.
func OfficeStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"enabled": office.Enabled(),
		},
	})
}

// requireOffice answers the request when office mode is not configured.
func requireOffice(c *gin.Context) bool {
	if !office.Enabled() {
		common.ApiError(c, errOfficeNotConfigured)
		return false
	}
	return true
}

// officeSession validates the :id path parameter of an office session route.
func officeSession(c *gin.Context) (userId int, sessionId string, ok bool) {
	sessionId = c.Param("id")
	if !office.ValidSessionID(sessionId) {
		common.ApiErrorStatus(c, http.StatusNotFound, errOfficeSessionNotFound)
		return 0, "", false
	}
	return c.GetInt("id"), sessionId, true
}

var errOfficeSessionNotFound = common.NewMessage("Office session not found")

// proxyOffice forwards a worker call and returns its data untouched.
func proxyOffice(c *gin.Context, call func(out any) error) {
	var data common.RawMessage
	if err := call(&data); err != nil {
		respondOfficeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": data})
}

// respondOfficeError maps worker failures to console messages. Worker
// messages are English source text shared with the web console locale files.
func respondOfficeError(c *gin.Context, err error) {
	var workerError *office.WorkerError
	var message *common.Message
	switch {
	case errors.As(err, &workerError):
		common.ApiErrorStatus(c, workerError.Status, common.NewMessage(workerError.Message))
	case errors.Is(err, office.ErrTurnRunning):
		common.ApiErrorStatus(c, http.StatusConflict, common.NewMessage(err.Error()))
	case errors.As(err, &message):
		common.ApiError(c, err)
	default:
		common.ApiErrorStatus(c, http.StatusInternalServerError, err)
	}
}

func CreateOfficeSession(c *gin.Context) {
	if !requireOffice(c) {
		return
	}
	proxyOffice(c, func(out any) error {
		return office.CreateSession(c.Request.Context(), c.GetInt("id"), out)
	})
}

func ListOfficeSessions(c *gin.Context) {
	if !requireOffice(c) {
		return
	}
	proxyOffice(c, func(out any) error {
		return office.ListSessions(c.Request.Context(), c.GetInt("id"), out)
	})
}

func DeleteOfficeSession(c *gin.Context) {
	if !requireOffice(c) {
		return
	}
	userId, sessionId, ok := officeSession(c)
	if !ok {
		return
	}
	// A running turn in this session is stopped first; otherwise the worker
	// would keep writing into a session that no longer exists.
	office.StopTurn(userId, sessionId)
	proxyOffice(c, func(out any) error {
		return office.DeleteSession(c.Request.Context(), userId, sessionId)
	})
}

func GetOfficeSessionEvents(c *gin.Context) {
	if !requireOffice(c) {
		return
	}
	userId, sessionId, ok := officeSession(c)
	if !ok {
		return
	}
	proxyOffice(c, func(out any) error {
		return office.SessionEvents(c.Request.Context(), userId, sessionId, out)
	})
}

func ListOfficeSessionFiles(c *gin.Context) {
	if !requireOffice(c) {
		return
	}
	userId, sessionId, ok := officeSession(c)
	if !ok {
		return
	}
	proxyOffice(c, func(out any) error {
		return office.ListFiles(c.Request.Context(), userId, sessionId, out)
	})
}

// UploadOfficeSessionFile forwards one multipart file into the workspace.
func UploadOfficeSessionFile(c *gin.Context) {
	if !requireOffice(c) {
		return
	}
	userId, sessionId, ok := officeSession(c)
	if !ok {
		return
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		common.ApiError(c, errOfficeUploadMissing)
		return
	}
	if fileHeader.Size > maxOfficeUploadBytes {
		common.ApiErrorStatus(c, http.StatusRequestEntityTooLarge, errOfficeUploadTooBig)
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		common.ApiError(c, errOfficeUploadMissing)
		return
	}
	defer file.Close()
	relative := fileHeader.Filename
	if path := c.PostForm("path"); path != "" {
		relative = path
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), officeUploadTimeout)
	defer cancel()
	if err := office.UploadFile(ctx, userId, sessionId, relative, file); err != nil {
		respondOfficeError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// DownloadOfficeSessionFile streams a workspace file back to the browser.
func DownloadOfficeSessionFile(c *gin.Context) {
	if !requireOffice(c) {
		return
	}
	userId, sessionId, ok := officeSession(c)
	if !ok {
		return
	}
	response, err := office.DownloadFile(c.Request.Context(), userId, sessionId, c.Query("path"))
	if err != nil {
		respondOfficeError(c, err)
		return
	}
	defer response.Body.Close()
	contentType := response.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	headers := map[string]string{}
	if disposition := response.Header.Get("Content-Disposition"); disposition != "" {
		headers["Content-Disposition"] = disposition
	}
	c.DataFromReader(http.StatusOK, response.ContentLength, contentType, response.Body, headers)
}

// StartOfficeTurn runs one Codex turn for a session and streams its events
// as server-sent events. Each turn runs on a short-lived token of the admin,
// so the model calls are billed and logged as that admin's own requests.
func StartOfficeTurn(c *gin.Context) {
	if !requireOffice(c) {
		return
	}
	userId, sessionId, ok := officeSession(c)
	if !ok {
		return
	}
	var request struct {
		Prompt string `json:"prompt"`
		Model  string `json:"model"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.Prompt == "" || request.Model == "" || len(request.Prompt) > maxOfficePromptLength {
		common.ApiError(c, errOfficeTurnInvalid)
		return
	}
	// The slot is tied to the browser connection: when it closes, the turn
	// is cancelled here and the worker stops the agent.
	turnCtx, err := office.BeginTurn(userId, sessionId, c.Request.Context())
	if err != nil {
		respondOfficeError(c, err)
		return
	}
	defer office.EndTurn(userId)

	token, err := office.IssueTurnToken(userId, office.TurnTimeout())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer office.RevokeTurnToken(token)

	stream, err := office.StartTurn(turnCtx, sessionId, office.TurnRequest{
		UserId:    userId,
		Prompt:    request.Prompt,
		APIKey:    token.GetFullKey(),
		Model:     request.Model,
		TimeoutMs: office.TurnTimeout().Milliseconds(),
	})
	if err != nil {
		respondOfficeError(c, err)
		return
	}
	defer stream.Close()

	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	c.Writer.Flush()
	office.StreamEvents(turnCtx, stream, func(frame []byte) error {
		if _, err := c.Writer.Write(frame); err != nil {
			return err
		}
		c.Writer.Flush()
		return nil
	})
}

// StopOfficeTurn cancels the running turn of the admin.
func StopOfficeTurn(c *gin.Context) {
	if !requireOffice(c) {
		return
	}
	userId, sessionId, ok := officeSession(c)
	if !ok {
		return
	}
	stopped := office.StopTurn(userId, sessionId)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"stopped": stopped}})
}
