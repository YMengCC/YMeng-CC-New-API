package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestSensitiveOperationOriginGuardRejectsMissingOrigin(t *testing.T) {
	previousTrustedURLs := common.SessionCookieTrustedURLs
	common.SessionCookieTrustedURLs = nil
	t.Cleanup(func() { common.SessionCookieTrustedURLs = previousTrustedURLs })

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/update", SensitiveOperationOriginGuard(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "https://panel.example.com/update", nil)
	request.Host = "panel.example.com"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusForbidden, response.Code)
}

func TestSensitiveOperationOriginGuardTrustedHTTPSProxy(t *testing.T) {
	for _, test := range []struct {
		name     string
		trusted  string
		origin   string
		remote   string
		expected int
	}{
		{name: "trusted proxy same origin", trusted: "172.16.0.0/12", origin: "https://panel.example.com", remote: "172.18.0.4:12345", expected: http.StatusNoContent},
		{name: "trusted single proxy address", trusted: "172.18.0.7", origin: "https://panel.example.com", remote: "172.18.0.7:12345", expected: http.StatusNoContent},
		{name: "default proxy list not trusted", trusted: "", origin: "https://panel.example.com", remote: "172.18.0.4:12345", expected: http.StatusForbidden},
		{name: "untrusted peer rejected", trusted: "172.16.0.0/12", origin: "https://panel.example.com", remote: "203.0.113.9:12345", expected: http.StatusForbidden},
		{name: "proxies disabled", trusted: "none", origin: "https://panel.example.com", remote: "172.18.0.4:12345", expected: http.StatusForbidden},
		{name: "cross origin still rejected", trusted: "172.16.0.0/12", origin: "https://evil.example.com", remote: "172.18.0.4:12345", expected: http.StatusForbidden},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("TRUSTED_PROXIES", test.trusted)
			previousTrustedURLs := common.SessionCookieTrustedURLs
			common.SessionCookieTrustedURLs = nil
			t.Cleanup(func() { common.SessionCookieTrustedURLs = previousTrustedURLs })
			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.POST("/update", SensitiveOperationOriginGuard(), func(c *gin.Context) { c.Status(http.StatusNoContent) })
			request := httptest.NewRequest(http.MethodPost, "http://panel.example.com/update", nil)
			request.RemoteAddr = test.remote
			request.Host = "panel.example.com"
			request.Header.Set("Origin", test.origin)
			request.Header.Set("X-Forwarded-Proto", "https")
			request.Header.Set("X-Forwarded-For", "172.18.0.1, 203.0.113.1")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			require.Equal(t, test.expected, response.Code)
		})
	}
}

func TestSensitiveOperationOriginGuardAllowsExactSameOrigin(t *testing.T) {
	previousTrustedURLs := common.SessionCookieTrustedURLs
	common.SessionCookieTrustedURLs = nil
	t.Cleanup(func() { common.SessionCookieTrustedURLs = previousTrustedURLs })

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/update", SensitiveOperationOriginGuard(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "https://panel.example.com/update", nil)
	request.Host = "panel.example.com"
	request.Header.Set("Origin", "https://panel.example.com")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusNoContent, response.Code)
}
