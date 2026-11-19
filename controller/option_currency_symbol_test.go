package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gin-gonic/gin"
)

func TestUpdateOptionCustomCurrencySymbolAllowsTextAndImageURL(t *testing.T) {
	db := modelManagementDB(t, "sqlite", "")
	require.NoError(t, db.AutoMigrate(&model.Option{}))
	tests := []struct {
		name    string
		value   string
		success bool
	}{
		{name: "short text", value: " HK$ ", success: true},
		{name: "short url-like text", value: "a://b", success: true},
		{name: "eight multibyte characters", value: "一二三四五六七八", success: true},
		{name: "https image", value: " https://cdn.example.com/coin.svg?v=2 ", success: true},
		{name: "http image", value: "http://cdn.example.com/coin.png", success: true},
		{name: "long plain text", value: "abcdefghijk", success: false},
		{name: "relative URL", value: "/coin.svg", success: false},
		{name: "javascript URL", value: "javascript:alert(1)", success: false},
		{name: "too long", value: "https://cdn.example.com/" + strings.Repeat("a", 2048), success: false},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			body, err := common.Marshal(OptionUpdateRequest{
				Key:   "general_setting.custom_currency_symbol",
				Value: testCase.value,
			})
			require.NoError(t, err)
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPut, "/api/option/", strings.NewReader(string(body)))

			UpdateOption(context)

			assert.Equal(t, http.StatusOK, recorder.Code)
			if testCase.success {
				assert.Contains(t, recorder.Body.String(), `"success":true`)
				var saved model.Option
				require.NoError(t, db.Where(&model.Option{Key: "general_setting.custom_currency_symbol"}).First(&saved).Error)
				assert.Equal(t, strings.TrimSpace(testCase.value), saved.Value)
				return
			}
			assert.Contains(t, recorder.Body.String(), `"success":false`)
		})
	}
}

func TestGetStatusSeparatesCustomCurrencyImageURL(t *testing.T) {
	generalSetting := operation_setting.GetGeneralSetting()
	previousSymbol := generalSetting.CustomCurrencySymbol
	t.Cleanup(func() { generalSetting.CustomCurrencySymbol = previousSymbol })

	tests := []struct {
		name         string
		configured   string
		wantSymbol   string
		wantImageURL string
	}{
		{
			name:         "image URL",
			configured:   " https://cdn.example.com/coin.png ",
			wantSymbol:   "¤",
			wantImageURL: "https://cdn.example.com/coin.png",
		},
		{name: "text symbol", configured: "HK$", wantSymbol: "HK$", wantImageURL: ""},
		{name: "empty", configured: "", wantSymbol: "¤", wantImageURL: ""},
		{
			// Legacy data written before the console limited text to 8 characters.
			name:       "url-shaped legacy text",
			configured: "ftp://cdn.example.com/coin.png",
			wantSymbol: "¤",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			generalSetting.CustomCurrencySymbol = testCase.configured
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

			GetStatus(context)

			var payload struct {
				Success bool           `json:"success"`
				Data    map[string]any `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
			require.True(t, payload.Success)
			assert.Equal(t, testCase.wantSymbol, payload.Data["custom_currency_symbol"])
			assert.Equal(t, testCase.wantImageURL, payload.Data["custom_currency_image_url"])
		})
	}
}
