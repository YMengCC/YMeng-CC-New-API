package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/model"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRewritePlaygroundPathRewritesMediaRoutesOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cases := []struct {
		name     string
		path     string
		wantPath string
		wantFlag bool
	}{
		{
			name:     "image generation",
			path:     "/pg/images/generations",
			wantPath: "/v1/images/generations",
			wantFlag: true,
		},
		{
			name:     "video submit",
			path:     "/pg/videos",
			wantPath: "/v1/videos",
			wantFlag: true,
		},
		{
			name:     "video fetch",
			path:     "/pg/videos/task_123",
			wantPath: "/v1/videos/task_123",
			wantFlag: true,
		},
		{
			name:     "video content",
			path:     "/pg/videos/task_123/content",
			wantPath: "/v1/videos/task_123/content",
			wantFlag: true,
		},
		{
			name:     "chat keeps its path",
			path:     "/pg/chat/completions",
			wantPath: "/pg/chat/completions",
			wantFlag: false,
		},
		{
			name:     "unrelated path untouched",
			path:     "/api/status",
			wantPath: "/api/status",
			wantFlag: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodPost, tc.path, nil)

			controller.RewritePlaygroundPath(ctx)

			assert.Equal(t, tc.wantPath, ctx.Request.URL.Path)
			assert.Equal(t, tc.wantPath, ctx.Request.RequestURI)
			assert.Equal(t, tc.wantFlag, ctx.GetBool("playground_request"))
		})
	}
}

// The rewritten paths must match the branches in middleware/distributor.go so
// relay mode, channel selection and video task lookup keep working unchanged.
func TestRewrittenPathsMatchDistributorBranches(t *testing.T) {
	gin.SetMode(gin.TestMode)

	imageCtx, _ := gin.CreateTestContext(httptest.NewRecorder())
	imageCtx.Request = httptest.NewRequest(
		http.MethodPost, "/pg/images/generations", nil)
	controller.RewritePlaygroundPath(imageCtx)
	assert.True(t, strings.HasPrefix(imageCtx.Request.URL.Path, "/v1/images/generations"))
	assert.Equal(t, relayconstant.RelayModeImagesGenerations,
		relayconstant.Path2RelayMode(imageCtx.Request.URL.Path))

	videoCtx, _ := gin.CreateTestContext(httptest.NewRecorder())
	videoCtx.Request = httptest.NewRequest(
		http.MethodPost, "/pg/videos", nil)
	controller.RewritePlaygroundPath(videoCtx)
	assert.True(t, strings.Contains(videoCtx.Request.URL.Path, "/v1/videos"))

	fetchCtx, _ := gin.CreateTestContext(httptest.NewRecorder())
	fetchCtx.Request = httptest.NewRequest(
		http.MethodGet, "/pg/videos/task_123", nil)
	controller.RewritePlaygroundPath(fetchCtx)
	assert.True(t, strings.Contains(fetchCtx.Request.URL.Path, "/v1/videos"))
	assert.True(t, strings.HasSuffix(fetchCtx.Request.URL.Path, "/task_123"))
}

func TestPlaygroundMediaPreparationAppliesAllowedGroupBeforeRouting(t *testing.T) {
	setupRelayRouterTestDB(t)
	previousGroups := setting.UserUsableGroups2JSONString()
	t.Cleanup(func() { require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(previousGroups)) })
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	require.NoError(t, model.DB.Create(&model.User{Id: 9876, Username: "pg-release-group", Group: "default", Status: common.UserStatusEnabled, Role: common.RoleCommonUser}).Error)

	for _, path := range []string{"/pg/images/generations", "/pg/videos"} {
		t.Run(path, func(t *testing.T) {
			engine := gin.New()
			engine.POST(path, func(c *gin.Context) {
				c.Set("id", 9876)
				common.SetContextKey(c, constant.ContextKeyUserGroup, "default")
			}, controller.PreparePlaygroundMedia, controller.RewritePlaygroundPath, func(c *gin.Context) {
				assert.Equal(t, "vip", common.GetContextKeyString(c, constant.ContextKeyUsingGroup))
				assert.Equal(t, "vip", common.GetContextKeyString(c, constant.ContextKeyTokenGroup))
				assert.Equal(t, "playground-vip", c.GetString("token_name"))
				assert.True(t, c.GetBool("playground_context_ready"))
				assert.True(t, c.GetBool("playground_request"))
				assert.Equal(t, strings.Replace(path, "/pg/", "/v1/", 1), c.Request.RequestURI)
				var body map[string]any
				require.NoError(t, common.UnmarshalBodyReusable(c, &body))
				assert.Equal(t, "fixture-model", body["model"])
				c.Status(http.StatusNoContent)
			})
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"fixture-model","group":"vip","prompt":"fixture"}`))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, request)
			assert.Equal(t, http.StatusNoContent, recorder.Code, recorder.Body.String())
		})
	}

	engine := gin.New()
	engine.POST("/pg/videos", func(c *gin.Context) {
		c.Set("id", 9876)
		common.SetContextKey(c, constant.ContextKeyUserGroup, "default")
	}, controller.PreparePlaygroundMedia, func(c *gin.Context) {
		t.Error("unauthorized group reached routing")
	})
	request := httptest.NewRequest(http.MethodPost, "/pg/videos", strings.NewReader(`{"group":"not-authorized"}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusForbidden, recorder.Code)
}

func TestPlaygroundMediaRoutesAreRegistered(t *testing.T) {
	engine := newAccessTokenScopeTestEngine(t)

	registered := map[string]bool{}
	for _, route := range engine.Routes() {
		if strings.HasPrefix(route.Path, "/pg/") {
			registered[route.Method+" "+route.Path] = true
		}
	}

	for _, key := range []string{
		"POST /pg/chat/completions",
		"POST /pg/images/generations",
		"POST /pg/videos",
		"GET /pg/videos/:task_id",
		"GET /pg/videos/:task_id/content",
	} {
		require.True(t, registered[key], "playground route %s is not registered", key)
	}
}
