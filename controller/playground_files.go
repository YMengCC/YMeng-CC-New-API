package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

var (
	errPlaygroundFilesSessionOnly = common.NewMessage("Playground attachments require a browser session")
	errPlaygroundFilesTextMasking = common.NewMessage("Attachments are unavailable while text masking is enabled")
)

// playgroundTextMaskingEnabled reads the privacy setting UserAuth loaded,
// falling back to the cached user record.
func playgroundTextMaskingEnabled(c *gin.Context) (bool, error) {
	if setting, ok := common.GetContextKeyType[dto.UserSetting](c, constant.ContextKeyUserSetting); ok {
		return setting.TextMaskingEnabled, nil
	}
	user, err := model.GetUserCache(c.GetInt("id"))
	if err != nil {
		return false, err
	}
	user.WriteContext(c)
	return user.GetSetting().TextMaskingEnabled, nil
}

// UploadPlaygroundFile stores one raw file for the next playground chat
// request of the signed-in user.
func UploadPlaygroundFile(c *gin.Context) {
	if c.GetBool("use_access_token") {
		common.ApiErrorStatus(c, http.StatusForbidden, errPlaygroundFilesSessionOnly)
		return
	}
	masking, err := playgroundTextMaskingEnabled(c)
	if err != nil {
		common.ApiError(c, service.ErrPlaygroundFileUploadFailed)
		return
	}
	if masking {
		common.ApiError(c, errPlaygroundFilesTextMasking)
		return
	}

	// One file plus multipart framing; the file itself is bounded again below.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.PlaygroundFileMaxBytes+(1<<20))
	reader, err := c.Request.MultipartReader()
	if err != nil {
		common.ApiError(c, service.ErrPlaygroundFileUploadFailed)
		return
	}
	for {
		part, partErr := reader.NextPart()
		if partErr != nil {
			var maxBytesErr *http.MaxBytesError
			if errors.As(partErr, &maxBytesErr) {
				common.ApiErrorStatus(c, http.StatusRequestEntityTooLarge, service.ErrPlaygroundFileTooLarge)
				return
			}
			common.ApiError(c, service.ErrPlaygroundFileUploadFailed)
			return
		}
		if part.FormName() != "file" || part.FileName() == "" {
			_ = part.Close()
			continue
		}
		info, saveErr := service.SavePlaygroundFile(c.GetInt("id"), part.FileName(), part)
		_ = part.Close()
		if saveErr != nil {
			if errors.Is(saveErr, service.ErrPlaygroundFileTooLarge) {
				common.ApiErrorStatus(c, http.StatusRequestEntityTooLarge, saveErr)
				return
			}
			common.ApiError(c, saveErr)
			return
		}
		common.ApiSuccess(c, info)
		return
	}
}

// DeletePlaygroundFile cancels an upload that was never sent.
func DeletePlaygroundFile(c *gin.Context) {
	service.DeletePlaygroundFile(c.GetInt("id"), c.Param("id"))
	common.ApiSuccess(c, nil)
}

// PreparePlaygroundChatFiles runs before channel distribution so rule checks,
// retries and pass-through all read the expanded body. Claimed files are
// deleted when the request finishes, fails or is aborted.
func PreparePlaygroundChatFiles(c *gin.Context) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		// Relay reports the body error with its usual status.
		c.Next()
		return
	}
	body, err := storage.Bytes()
	// Access-token requests are rejected by Playground before any relay; leave
	// their uploads unclaimed.
	if err != nil || c.GetBool("use_access_token") || !service.PlaygroundChatUsesExtras(body) {
		c.Next()
		return
	}
	// Text masking cannot protect raw files or hosted search queries. The
	// masking middleware already rejects these fields; this keeps the rule even
	// if the chain changes, and runs before any upload is consumed.
	masking, settingErr := playgroundTextMaskingEnabled(c)
	if settingErr != nil || masking {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"message": i18n.T(c, i18n.MsgPrivacyUnsupportedRequest),
			"type":    "invalid_request_error",
			"code":    "text_masking_unsupported",
		}})
		return
	}
	expanded, release, err := service.ExpandPlaygroundChatFiles(c, c.GetInt("id"), body)
	defer release()
	if err != nil {
		abortPlaygroundChatFiles(c, err)
		return
	}
	if service.PlaygroundRequestCarriesFiles(c) {
		common.ReplaceRequestBody(c, expanded)
	}
	c.Next()
}

func abortPlaygroundChatFiles(c *gin.Context, err error) {
	status, code, key := http.StatusBadRequest, "playground_file_invalid", i18n.MsgPlaygroundFileInvalid
	switch {
	case errors.Is(err, service.ErrPlaygroundFileUnavailable):
		code, key = "playground_file_unavailable", i18n.MsgPlaygroundFileUnavailable
	case errors.Is(err, common.ErrRequestBodyTooLarge):
		c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"error": gin.H{
			"message": err.Error(),
			"type":    "invalid_request_error",
			"code":    "read_request_body_failed",
		}})
		return
	case !errors.Is(err, service.ErrPlaygroundFileInvalid):
		status, code, key = http.StatusInternalServerError, "playground_file_unavailable", i18n.MsgPlaygroundFileUnavailable
	}
	c.AbortWithStatusJSON(status, gin.H{"error": gin.H{
		"message": i18n.T(c, key),
		"type":    "invalid_request_error",
		"code":    code,
	}})
}
