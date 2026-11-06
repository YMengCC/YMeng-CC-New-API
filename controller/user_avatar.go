package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// UpdateSelfAvatar stores the caller's avatar. The file is validated from its
// bytes: the declared filename, extension, and part content type are not used.
func UpdateSelfAvatar(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		c.Status(http.StatusUnauthorized)
		return
	}
	// Bound the multipart parser, not only the part: an oversized request must
	// fail before Gin buffers it.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.MaxAvatarSize+64*1024)
	if err := c.Request.ParseMultipartForm(service.MaxAvatarSize + 64*1024); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid avatar image"))
		return
	}
	defer c.Request.MultipartForm.RemoveAll()
	files := c.Request.MultipartForm.File
	if len(files) != 1 || len(files["avatar"]) != 1 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Avatar upload must contain an image file"))
		return
	}
	uploaded, err := service.ReadAvatarUpload(files["avatar"][0])
	if err != nil {
		message := common.NewMessage("Invalid avatar image")
		common.ApiErrorStatus(c, http.StatusBadRequest, message)
		return
	}
	version, err := model.SaveUserAvatar(userId, &model.UserAvatar{
		MimeType: uploaded.MimeType,
		Size:     int64(len(uploaded.Data)),
		Width:    uploaded.Width,
		Height:   uploaded.Height,
		Sha256:   uploaded.Sha256,
		Data:     uploaded.Data,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccessT(c, "Avatar updated successfully", gin.H{"avatar_version": version})
}

// DeleteSelfAvatar removes the caller's avatar and returns the new version so
// every avatar consumer drops its cached copy.
func DeleteSelfAvatar(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		c.Status(http.StatusUnauthorized)
		return
	}
	version, err := model.DeleteUserAvatar(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccessT(c, "Avatar removed successfully", gin.H{"avatar_version": version})
}

// GetUserAvatar serves an avatar as an opaque image to signed-in dashboard
// users. The strong ETag is the stored content hash, so clients can revalidate
// while the URL stays stable across uploads.
func GetUserAvatar(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId <= 0 {
		c.Status(http.StatusNotFound)
		return
	}
	avatar, err := model.GetUserAvatar(userId)
	if errors.Is(err, model.ErrUserAvatarNotFound) {
		c.Status(http.StatusNotFound)
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	etag := `"` + avatar.Sha256 + `"`
	c.Header("ETag", etag)
	c.Header("Cache-Control", "private, max-age=300")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Vary", "Authorization")
	if etagMatches(c.GetHeader("If-None-Match"), etag) {
		c.Status(http.StatusNotModified)
		return
	}
	c.Header("Content-Length", strconv.FormatInt(int64(len(avatar.Data)), 10))
	c.Data(http.StatusOK, avatar.MimeType, avatar.Data)
}

// etagMatches handles the wildcard, a single tag, and a comma-separated list.
func etagMatches(header string, etag string) bool {
	for raw := range strings.SplitSeq(header, ",") {
		candidate := strings.TrimSpace(raw)
		if candidate == "*" || strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}
