package service

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelSelectAutoGroupsTest(t *testing.T) *gorm.DB {
	t.Helper()

	originalDB := model.DB
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	originalRetryTimes := common.RetryTimes
	originalAutoGroups := setting.AutoGroups2JsonString()
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalGroupRatios := ratio_setting.GroupRatio2JSONString()
	originalMaxTokenAutoGroups := setting.GetMaxTokenAutoGroups()

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))
	model.DB = db
	common.MemoryCacheEnabled = true
	common.RetryTimes = 0

	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`[]`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":2}`))
	require.NoError(t, setting.UpdateMaxTokenAutoGroups("2"))

	t.Cleanup(func() {
		model.DB = originalDB
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
		common.RetryTimes = originalRetryTimes
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAutoGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatios))
		require.NoError(t, setting.UpdateMaxTokenAutoGroups(fmt.Sprintf("%d", originalMaxTokenAutoGroups)))

		if originalMemoryCacheEnabled && originalDB != nil &&
			originalDB.Migrator().HasTable(&model.Channel{}) && originalDB.Migrator().HasTable(&model.Ability{}) {
			model.InitChannelCache()
		}
		sqlDB, err := db.DB()
		if err == nil {
			require.NoError(t, sqlDB.Close())
		}
	})

	return db
}

func createChannelSelectAutoGroupsChannel(t *testing.T, db *gorm.DB, id int, group, modelName string, priorities ...int64) {
	t.Helper()
	priority := int64(0)
	if len(priorities) > 0 {
		priority = priorities[0]
	}
	weight := uint(100)
	require.NoError(t, db.Create(&model.Channel{
		Id:       id,
		Type:     constant.ChannelTypeOpenAI,
		Key:      fmt.Sprintf("key-%d", id),
		Status:   common.ChannelStatusEnabled,
		Name:     fmt.Sprintf("channel-%d", id),
		Weight:   &weight,
		Models:   modelName,
		Group:    group,
		Priority: &priority,
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group:     group,
		Model:     modelName,
		ChannelId: id,
		Enabled:   true,
		Priority:  &priority,
		Weight:    weight,
	}).Error)
}

func TestCacheGetRandomSatisfiedChannelUsesTokenAutoGroupsWhenGlobalAutoIsEmpty(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	const modelName = "auto-groups-runtime-model"
	createChannelSelectAutoGroupsChannel(t, db, 2101, "vip", modelName)
	createChannelSelectAutoGroupsChannel(t, db, 2102, "default", modelName)
	model.InitChannelCache()

	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyTokenAutoGroups, []string{"vip", "default"})
	common.SetContextKey(ctx, constant.ContextKeyTokenCrossGroupRetry, true)

	retry := 0
	param := &RetryParam{
		Ctx:         ctx,
		TokenGroup:  "auto",
		ModelName:   modelName,
		RequestPath: "/v1/chat/completions",
		Retry:       &retry,
	}

	first, selectedGroup, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, first)
	assert.Equal(t, 2101, first.Id)
	assert.Equal(t, "vip", selectedGroup)
	assert.Equal(t, "vip", common.GetContextKeyString(ctx, constant.ContextKeyAutoGroup))
	assert.Empty(t, setting.GetAutoGroups(), "the selection must not depend on the global Auto list")

	require.True(t, param.AdvanceAfterFailure())
	second, selectedGroup, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, second)
	assert.Equal(t, 2102, second.Id)
	assert.Equal(t, "default", selectedGroup)
	assert.Equal(t, "default", common.GetContextKeyString(ctx, constant.ContextKeyAutoGroup))
}

// A multi-group token must fall back to its next group after the current
// group's retries are exhausted, including when RetryTimes is 0.
func TestRetryParamFallsBackThroughTokenGroupSequence(t *testing.T) {
	tests := []struct {
		name        string
		retryTimes  int
		crossGroup  bool
		wantBudgets []int
		wantGroups  []string
	}{
		{
			name:        "no retries still falls back to next group",
			retryTimes:  0,
			crossGroup:  true,
			wantBudgets: []int{1},
			wantGroups:  []string{"vip", "default"},
		},
		{
			name:        "retries stay in group before falling back",
			retryTimes:  2,
			crossGroup:  true,
			wantBudgets: []int{2, 1, 1, 2, 1},
			wantGroups:  []string{"vip", "vip", "vip", "default", "default", "default"},
		},
		{
			name:        "without cross-group retry no fallback",
			retryTimes:  0,
			crossGroup:  false,
			wantBudgets: nil,
			wantGroups:  []string{"vip"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db := setupChannelSelectAutoGroupsTest(t)
			const modelName = "token-group-fallback-model"
			createChannelSelectAutoGroupsChannel(t, db, 2201, "vip", modelName)
			createChannelSelectAutoGroupsChannel(t, db, 2202, "default", modelName)
			model.InitChannelCache()
			common.RetryTimes = tt.retryTimes

			gin.SetMode(gin.TestMode)
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
			common.SetContextKey(ctx, constant.ContextKeyTokenGroups, []string{"vip", "default"})
			common.SetContextKey(ctx, constant.ContextKeyTokenCrossGroupRetry, tt.crossGroup)
			param := &RetryParam{Ctx: ctx, TokenGroup: "vip", ModelName: modelName, Retry: common.GetPointer(0)}

			var budgets []int
			var groups []string
			for {
				channel, group, err := CacheGetRandomSatisfiedChannel(param)
				require.NoError(t, err)
				require.NotNil(t, channel)
				groups = append(groups, group)
				budget := param.RemainingRetryBudget()
				if budget == 0 {
					break
				}
				budgets = append(budgets, budget)
				require.True(t, param.AdvanceAfterFailure())
				if len(groups) > 10 {
					t.Fatal("retry loop did not terminate")
				}
			}
			assert.Equal(t, tt.wantGroups, groups)
			assert.Equal(t, tt.wantBudgets, budgets)
		})
	}
}

// Affinity uses an attempt without visiting a normal priority. Both HTTP's
// distributor handoff and WebSocket's shared selector must preserve that first
// priority, then start the next group with a fresh priority cursor.
func TestChannelRetryAfterAffinityPreservesPrioritiesAcrossGroups(t *testing.T) {
	for _, route := range []string{"single", "token groups", "auto"} {
		for _, transport := range []string{"HTTP", "WebSocket"} {
			t.Run(route+"/"+transport, func(t *testing.T) {
				db := setupChannelSelectAutoGroupsTest(t)
				common.RetryTimes = 2
				const modelName = "affinity-priority-model"
				createChannelSelectAutoGroupsChannel(t, db, 2301, "vip", modelName, 20)
				createChannelSelectAutoGroupsChannel(t, db, 2302, "vip", modelName, 10)
				createChannelSelectAutoGroupsChannel(t, db, 2303, "vip", modelName, 0)
				createChannelSelectAutoGroupsChannel(t, db, 2401, "default", modelName, 20)
				createChannelSelectAutoGroupsChannel(t, db, 2402, "default", modelName, 10)
				model.InitChannelCache()

				ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
				ctx.Request = httptest.NewRequest("POST", "/v1/responses", nil)
				ctx.Request.Header.Set("X-Affinity-Key", t.Name())
				common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
				common.SetContextKey(ctx, constant.ContextKeyTokenCrossGroupRetry, route != "single")
				tokenGroup := "vip"
				if route == "auto" {
					tokenGroup = "auto"
					common.SetContextKey(ctx, constant.ContextKeyTokenAutoGroups, []string{"vip", "default"})
				} else if route == "token groups" {
					common.SetContextKey(ctx, constant.ContextKeyTokenGroups, []string{"vip", "default"})
				}
				rule := operation_setting.ChannelAffinityRule{
					Name: "priority-regression", ModelRegex: []string{"^affinity-priority-model$"},
					KeySources:  []operation_setting.ChannelAffinityKeySource{{Type: "request_header", Key: "X-Affinity-Key"}},
					SessionMode: "prefer", IncludeUsingGroup: true, IncludeRuleName: true,
				}
				affinitySetting := operation_setting.GetChannelAffinitySetting()
				original := *affinitySetting
				affinitySetting.Enabled = true
				affinitySetting.Rules = []operation_setting.ChannelAffinityRule{rule}
				t.Cleanup(func() { *affinitySetting = original })
				cache := getChannelAffinityCache()
				key := buildChannelAffinityCacheKeySuffix(rule, modelName, tokenGroup, t.Name())
				require.NoError(t, cache.SetWithTTL(key, 2303, time.Minute))
				t.Cleanup(func() { _, _ = cache.DeleteMany([]string{key}) })

				param := &RetryParam{Ctx: ctx, TokenGroup: tokenGroup, ModelName: modelName, Retry: common.GetPointer(0)}
				channel, group, selectErr := SelectChannelForRequest(ctx, modelName, param)
				require.Nil(t, selectErr)
				require.NotNil(t, channel)
				assert.Equal(t, 2303, channel.Id)
				assert.Equal(t, "vip", group)
				if transport == "HTTP" {
					// The distributor selected affinity before the controller creates
					// its own RetryParam; selection state travels in the context.
					param = &RetryParam{Ctx: ctx, TokenGroup: tokenGroup, ModelName: modelName, Retry: common.GetPointer(0)}
				}
				want := []int{2301, 2302}
				if route != "single" {
					want = append(want, 2401, 2402, 2402)
				}
				for _, id := range want {
					require.Positive(t, param.RemainingRetryBudget())
					require.True(t, param.AdvanceAfterFailure())
					if transport == "HTTP" {
						var err error
						channel, group, err = CacheGetRandomSatisfiedChannel(param)
						require.NoError(t, err)
					} else {
						channel, group, selectErr = SelectChannelForRequest(ctx, modelName, param)
						require.Nil(t, selectErr)
					}
					require.NotNil(t, channel)
					assert.Equal(t, id, channel.Id)
					if id >= 2400 {
						assert.Equal(t, "default", group)
						assert.Zero(t, ctx.GetInt(ginKeyChannelAffinityRetryOffset))
					}
				}
				assert.Zero(t, param.RemainingRetryBudget())
				assert.False(t, param.AdvanceAfterFailure())
			})
		}
	}
}

func TestChannelRetrySkippingUnavailableGroupClearsAffinityOffset(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	common.RetryTimes = 1
	const modelName = "affinity-missing-group-model"
	createChannelSelectAutoGroupsChannel(t, db, 2501, "default", modelName, 20)
	createChannelSelectAutoGroupsChannel(t, db, 2502, "default", modelName, 10)
	model.InitChannelCache()
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyTokenGroups, []string{"vip", "default"})
	common.SetContextKey(ctx, constant.ContextKeyTokenCrossGroupRetry, true)
	ctx.Set(ginKeyChannelAffinityRetryOffset, 1)
	param := &RetryParam{Ctx: ctx, TokenGroup: "vip", ModelName: modelName, Retry: common.GetPointer(1)}

	channel, group, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, 2501, channel.Id)
	assert.Equal(t, "default", group)
	assert.Zero(t, ctx.GetInt(ginKeyChannelAffinityRetryOffset))
	require.True(t, param.AdvanceAfterFailure())
	channel, _, err = CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, 2502, channel.Id)
}

func TestChannelRetryExcludesFailedChannelAcrossPrioritiesAndGroups(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	common.RetryTimes = 2
	previousDBType := common.MainDatabaseType()
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	model.InitModelColumnNamesForTest()
	t.Cleanup(func() {
		common.SetMainDatabaseType(previousDBType)
		model.InitModelColumnNamesForTest()
	})
	const modelName = "failed-channel-exclusion-model"
	createChannelSelectAutoGroupsChannel(t, db, 2601, "vip", modelName, 20)
	createChannelSelectAutoGroupsChannel(t, db, 2602, "vip", modelName, 10)
	createChannelSelectAutoGroupsChannel(t, db, 2701, "default", modelName, 20)
	model.InitChannelCache()

	for _, cacheEnabled := range []bool{false, true} {
		t.Run(fmt.Sprintf("cache=%t", cacheEnabled), func(t *testing.T) {
			common.MemoryCacheEnabled = cacheEnabled
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
			common.SetContextKey(ctx, constant.ContextKeyTokenGroups, []string{"vip", "default"})
			common.SetContextKey(ctx, constant.ContextKeyTokenCrossGroupRetry, true)
			param := &RetryParam{Ctx: ctx, TokenGroup: "vip", ModelName: modelName, Retry: common.GetPointer(0)}
			first, group, err := CacheGetRandomSatisfiedChannel(param)
			require.NoError(t, err)
			require.NotNil(t, first)
			require.Equal(t, 2601, first.Id)
			assert.Equal(t, "vip", group)
			decision := PolicyDecision{Action: "retry", Reason: "retry_status_matched", Source: "global"}
			ExcludeFailedChannelForRetry(ctx, first.Id, decision)
			require.True(t, param.AdvanceAfterFailure())
			second, _, err := CacheGetRandomSatisfiedChannel(param)
			require.NoError(t, err)
			require.NotNil(t, second)
			assert.Equal(t, 2602, second.Id)
			ExcludeFailedChannelForRetry(ctx, second.Id, decision)
			require.True(t, param.AdvanceAfterFailure())
			assert.True(t, param.canMoveToNextGroup(), "another group is still available after both vip channels fail")
			param.groupIndex++
			param.SetRetry(0)
			third, group, err := CacheGetRandomSatisfiedChannel(param)
			require.NoError(t, err)
			require.NotNil(t, third)
			assert.Equal(t, 2701, third.Id)
			assert.Equal(t, "default", group)
		})
	}
}
