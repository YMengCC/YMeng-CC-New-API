package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// setupPlaygroundRelay prepares the same session-authenticated, temporary-token
// context that Playground uses before handing the request to a relay handler.
func setupPlaygroundRelay(c *gin.Context, relayFormat types.RelayFormat) *types.NewAPIError {
	if c.GetBool("playground_context_ready") {
		return nil
	}
	useAccessToken := c.GetBool("use_access_token")
	if useAccessToken {
		return types.NewError(errors.New(i18n.T(c, i18n.MsgRelayAccessTokenUnsupported)), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry())
	}

	relayInfo, err := relaycommon.GenRelayInfo(c, relayFormat, nil, nil)
	if err != nil {
		return types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}

	userId := c.GetInt("id")

	// Write user context to ensure acceptUnsetRatio is available
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		return types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
	}
	userCache.WriteContext(c)

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-%s", relayInfo.UsingGroup),
		Group:  relayInfo.UsingGroup,
	}
	if err := middleware.SetupContextForToken(c, tempToken); err != nil {
		return types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}
	c.Set("playground_context_ready", true)
	return nil
}

// PreparePlaygroundMedia runs after dashboard authentication and before plugin
// routing or distribution, which both need the validated group and token context.
func PreparePlaygroundMedia(c *gin.Context) {
	if strings.HasPrefix(c.Request.URL.Path, "/pg/chat/completions") {
		c.Next()
		return
	}
	group := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	if c.Request.Method == http.MethodPost {
		var request struct {
			Group string `json:"group"`
		}
		if err := common.UnmarshalBodyReusable(c, &request); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": gin.H{
				"message": i18n.T(c, i18n.MsgDistributorInvalidPlayground, map[string]any{"Error": err.Error()}),
			}})
			return
		}
		if request.Group != "" {
			if request.Group != group && !service.GroupInUserUsableGroups(group, request.Group) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{
					"message": i18n.T(c, i18n.MsgDistributorGroupAccessDenied),
				}})
				return
			}
			group = request.Group
		}
	}
	common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
	if err := setupPlaygroundRelay(c, types.RelayFormatTask); err != nil {
		c.AbortWithStatusJSON(err.StatusCode, gin.H{
			"error": err.ToOpenAIError(common.UpstreamAddresses(c)...),
		})
		return
	}
	c.Next()
}

// RewritePlaygroundPath maps a /pg media route onto its /v1 equivalent so the
// existing distributor, relay-mode resolution and task fetch builders keep
// working unchanged. The playground flag is preserved for billing. The chat
// route is left alone because it has its own relay-mode handling.
func RewritePlaygroundPath(c *gin.Context) {
	path := c.Request.URL.Path
	if !strings.HasPrefix(path, "/pg/") || strings.HasPrefix(path, "/pg/chat/completions") {
		return
	}
	c.Set("playground_request", true)
	c.Request.URL.Path = "/v1/" + strings.TrimPrefix(path, "/pg/")
	if c.Request.URL.RawPath != "" {
		c.Request.URL.RawPath = "/v1/" + strings.TrimPrefix(c.Request.URL.RawPath, "/pg/")
	}
	c.Request.RequestURI = c.Request.URL.RequestURI()
	c.Next()
}

func Playground(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToOpenAIError(common.UpstreamAddresses(c)...),
			})
		}
	}()

	newAPIError = setupPlaygroundRelay(c, types.RelayFormatOpenAI)
	if newAPIError != nil {
		return
	}

	Relay(c, types.RelayFormatOpenAI)
}

// PlaygroundImage handles unclaimed /pg/images/generations traffic by falling
// back to the OpenAI image relay. Claimed task-plugin requests are served by
// RelayTaskPluginEndpoint in the route's middleware chain.
func PlaygroundImage(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToOpenAIError(common.UpstreamAddresses(c)...),
			})
		}
	}()

	newAPIError = setupPlaygroundRelay(c, types.RelayFormatOpenAIImage)
	if newAPIError != nil {
		return
	}

	Relay(c, types.RelayFormatOpenAIImage)
}

// PlaygroundVideo submits a video generation task.
func PlaygroundVideo(c *gin.Context) {
	setupPlaygroundVideo(c, func() { RelayTask(c) })
}

// PlaygroundVideoFetch polls a video generation task by id.
func PlaygroundVideoFetch(c *gin.Context) {
	setupPlaygroundVideo(c, func() { RelayTaskFetch(c) })
}

func setupPlaygroundVideo(c *gin.Context, handler func()) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToOpenAIError(common.UpstreamAddresses(c)...),
			})
		}
	}()

	newAPIError = setupPlaygroundRelay(c, types.RelayFormatTask)
	if newAPIError != nil {
		return
	}

	handler()
}

// PlaygroundVideoContent proxies generated video content for the browser session.
func PlaygroundVideoContent(c *gin.Context) {
	setupPlaygroundVideo(c, func() { VideoProxy(c) })
}
