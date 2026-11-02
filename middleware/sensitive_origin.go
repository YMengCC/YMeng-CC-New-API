package middleware

import (
	"crypto/subtle"
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// isExplicitTrustedProxy reports whether the direct peer is listed in an
// explicitly configured TRUSTED_PROXIES. The compatibility defaults are not
// enough to trust a forwarded scheme for deployment changes.
func isExplicitTrustedProxy(remote string) bool {
	raw := strings.TrimSpace(os.Getenv("TRUSTED_PROXIES"))
	if raw == "" {
		return false
	}
	trustedProxies, _, err := common.ResolveTrustedProxies(raw)
	if err != nil {
		return false
	}
	ip := net.ParseIP(remote)
	if ip == nil {
		return false
	}
	for _, trustedProxy := range trustedProxies {
		if _, network, err := net.ParseCIDR(trustedProxy); err == nil {
			if network.Contains(ip) {
				return true
			}
			continue
		}
		if proxyIP := net.ParseIP(trustedProxy); proxyIP != nil && proxyIP.Equal(ip) {
			return true
		}
	}
	return false
}

// isAllowedSensitiveOperationOrigin also accepts the HTTPS origin forwarded by
// an explicitly trusted TLS-terminating proxy.
func isAllowedSensitiveOperationOrigin(c *gin.Context, origin string) bool {
	if isAllowedSessionOrigin(c.Request, origin) {
		return true
	}
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") != "https" || !isExplicitTrustedProxy(c.RemoteIP()) {
		return false
	}
	requestOrigin, err := common.NormalizeOrigin("https://" + c.Request.Host)
	return err == nil && subtle.ConstantTimeCompare([]byte(origin), []byte(requestOrigin)) == 1
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
