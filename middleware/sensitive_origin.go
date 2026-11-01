package middleware

import (
	"crypto/subtle"
	"net/http"
	"net/http/httptest"
	"os"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// SensitiveOperationOriginGuard accepts HTTPS forwarded only by a configured trusted proxy.
func isAllowedSensitiveOperationOrigin(c *gin.Context, origin string) bool {
	if isAllowedSessionOrigin(c.Request, origin) {
		return true
	}
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") != "https" || c.GetHeader("X-Forwarded-For") == "" {
		return false
	}
	trustedProxies, _, err := common.ResolveTrustedProxies(os.Getenv("TRUSTED_PROXIES"))
	if err != nil {
		return false
	}
	probe := gin.New()
	if err := common.ConfigureTrustedProxies(probe, trustedProxies); err != nil {
		return false
	}
	probe.Any("/*path", func(context *gin.Context) {
		if context.RemoteIP() != "172.18.0.1" {
			return
		}
		requestOrigin, err := common.NormalizeOrigin("https://" + context.Request.Host)
		if err == nil && subtle.ConstantTimeCompare([]byte(origin), []byte(requestOrigin)) == 1 {
			c.Set("sensitive_origin_trusted_proxy", true)
		}
	})
	probe.ServeHTTP(httptest.NewRecorder(), c.Request)
	return c.GetBool("sensitive_origin_trusted_proxy")
}

// SensitiveOperationOriginGuard applies the CSRF origin check regardless of
// SESSION_COOKIE_SECURE. Online deployment changes are high-impact operations;
// allowing a missing Origin/Referer in local HTTP mode would make a browser
// session vulnerable to cross-site requests.
func SensitiveOperationOriginGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin, ok := requestBrowserOrigin(c.Request)
		if !ok || !isAllowedSensitiveOperationOrigin(c, origin) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"success": false,
				"code":    "AUTH_ORIGIN_FORBIDDEN",
				"message": "request origin is not allowed",
			})
			return
		}
		c.Next()
	}
}
