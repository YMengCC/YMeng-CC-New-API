package middleware

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var textMaskTokenPattern = regexp.MustCompile(`\[\[TM:[a-f0-9]{32}:\d+\]\]`)

func TestTextMaskingRestoresJSONResponseFromRequestScopedToken(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.POST("/v1/chat/completions", func(c *gin.Context) {
		setting := dto.UserSetting{TextMaskingEnabled: true}
		common.SetContextKey(c, constant.ContextKeyUserSetting, setting)
		c.Next()
	}, TextMasking(), func(c *gin.Context) {
		body, err := common.GetBodyStorage(c)
		require.NoError(t, err)
		masked, err := io.ReadAll(body)
		require.NoError(t, err)
		assert.NotContains(t, string(masked), "alice@example.com")
		token := textMaskTokenPattern.FindString(string(masked))
		require.NotEmpty(t, token)
		c.Header("Content-Type", "application/json")
		c.JSON(http.StatusOK, gin.H{"choices": []any{gin.H{
			"index":         0,
			"message":       gin.H{"role": "assistant", "content": "Contact " + token},
			"finish_reason": "stop",
		}}})
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"test-model","messages":[{"role":"user","content":"Email alice@example.com"}]}`))
	request.Header.Set("Content-Type", "application/json")
	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "Contact alice@example.com")
}

func TestTextMaskingRestoresPlaceholderSplitAcrossSSEEvents(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.POST("/v1/chat/completions", func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyUserSetting, dto.UserSetting{TextMaskingEnabled: true})
		c.Next()
	}, TextMasking(), func(c *gin.Context) {
		body, err := common.GetBodyStorage(c)
		require.NoError(t, err)
		masked, err := io.ReadAll(body)
		require.NoError(t, err)
		token := textMaskTokenPattern.FindString(string(masked))
		require.NotEmpty(t, token)
		c.Header("Content-Type", "text/event-stream")
		_, err = fmt.Fprintf(c.Writer, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":%q}}]}\n\n", token[:len(token)/2])
		require.NoError(t, err)
		_, err = fmt.Fprintf(c.Writer, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":%q}}]}\n\n", token[len(token)/2:])
		require.NoError(t, err)
		_, err = fmt.Fprint(c.Writer, "data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n")
		require.NoError(t, err)
		_, err = fmt.Fprint(c.Writer, "data: [DONE]\n\n")
		require.NoError(t, err)
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"test-model","stream":true,"messages":[{"role":"user","content":"Email alice@example.com"}]}`))
	request.Header.Set("Content-Type", "application/json")
	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"content":"alice@example.com"`)
	assert.Contains(t, recorder.Body.String(), "[DONE]")
}

func TestTextMaskingDisabledLeavesBodyAndResponseUntouched(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	original := `{"input":"alice@example.com","opaque":"anything"}`
	engine.POST("/v1/audio/speech", func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyUserSetting, dto.UserSetting{})
		c.Next()
	}, TextMasking(), func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		require.NoError(t, err)
		assert.Equal(t, original, string(body))
		c.Data(http.StatusOK, "application/octet-stream", body)
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/audio/speech", strings.NewReader(original))
	engine.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, original, recorder.Body.String())
}

func TestTextMaskingBlocksTaskOwnedResponsesBeforePluginHooks(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	called := false
	engine.POST("/v1/responses", func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyUserSetting, dto.UserSetting{TextMaskingEnabled: true})
		c.Set(pluginruntime.ContextKeyPinnedEndpoint, pluginruntime.PinnedEndpoint{})
		c.Next()
	}, TextMasking(), TextMaskingTaskGuard(), func(c *gin.Context) { called = true })
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(`{"model":"m","input":"alice@example.com"}`))
	request.Header.Set("Content-Type", "application/json")
	engine.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.False(t, called)
	assert.Contains(t, recorder.Body.String(), "text_masking_unsupported")
}

func TestTextMaskingRejectsMissingAuthenticatedUserSettings(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	called := false
	engine.POST("/v1/chat/completions", TextMasking(), func(c *gin.Context) { called = true })

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"test-model","messages":[]}`))
	request.Header.Set("Content-Type", "application/json")
	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	assert.False(t, called)
	assert.Contains(t, recorder.Body.String(), "text_masking_settings_unavailable")
}

func TestTextMaskingRejectsUnsupportedRelayEndpointBeforeHandler(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	called := false
	engine.POST("/v1/audio/speech", func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyUserSetting, dto.UserSetting{TextMaskingEnabled: true})
		c.Next()
	}, TextMasking(), func(c *gin.Context) { called = true })

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/audio/speech", strings.NewReader(`{"model":"test-model","input":"alice@example.com"}`))
	request.Header.Set("Content-Type", "application/json")
	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.False(t, called)
	assert.Contains(t, recorder.Body.String(), "text_masking_unsupported")
}
