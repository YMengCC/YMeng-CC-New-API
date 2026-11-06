package controller

import (
	"bytes"
	"image"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func avatarRequest(t *testing.T, engine *gin.Engine, content []byte, filename string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("avatar", filename)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	request := httptest.NewRequest(http.MethodPut, "/api/user/avatar/self", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	return recorder
}

func TestAvatarLifecycleAndValidation(t *testing.T) {
	user, identity := setupSecurityEnrollmentTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.UserAvatar{}))
	engine := gin.New()
	engine.Use(func(c *gin.Context) { c.Set("id", user.Id); c.Next() })
	engine.PUT("/api/user/avatar/self", UpdateSelfAvatar)
	engine.DELETE("/api/user/avatar/self", DeleteSelfAvatar)
	engine.GET("/api/user/avatar/:id", GetUserAvatar)
	var pngData, jpegData, oversized bytes.Buffer
	require.NoError(t, png.Encode(&pngData, image.NewRGBA(image.Rect(0, 0, 64, 64))))
	require.NoError(t, jpeg.Encode(&jpegData, image.NewRGBA(image.Rect(0, 0, 32, 32)), nil))
	require.NoError(t, png.Encode(&oversized, image.NewRGBA(image.Rect(0, 0, 513, 8))))

	for _, tc := range []struct {
		name string
		data []byte
	}{
		{"empty", nil},
		{"script disguised as image", []byte("<svg onload='alert(1)'/>")},
		{"gif", []byte("GIF89a")},
		{"truncated PNG", pngData.Bytes()[:40]},
		{"over 1 MiB", bytes.Repeat([]byte{0}, int(service.MaxAvatarSize)+1)},
		{"over 512 pixels", oversized.Bytes()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response := avatarRequest(t, engine, tc.data, "avatar.png")
			assert.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
			var count int64
			require.NoError(t, model.DB.Model(&model.UserAvatar{}).Count(&count).Error)
			assert.Zero(t, count)
		})
	}
	for i, content := range [][]byte{pngData.Bytes(), jpegData.Bytes()} {
		// The filename and declared application/octet-stream are untrusted.
		response := avatarRequest(t, engine, content, "untrusted.svg")
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var result struct {
			Success bool `json:"success"`
			Data    struct {
				Version int64 `json:"avatar_version"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
		require.True(t, result.Success)
		assert.EqualValues(t, i+1, result.Data.Version)
		path := "/api/user/avatar/" + strconv.Itoa(user.Id)
		request := httptest.NewRequest(http.MethodGet, path, nil)
		fetched := httptest.NewRecorder()
		engine.ServeHTTP(fetched, request)
		assert.Equal(t, content, fetched.Body.Bytes())
		assert.Equal(t, "nosniff", fetched.Header().Get("X-Content-Type-Options"))
		assert.Equal(t, "private, max-age=300", fetched.Header().Get("Cache-Control"))
		assert.Equal(t, "Authorization", fetched.Header().Get("Vary"))
		request.Header.Set("If-None-Match", `"another", W/`+fetched.Header().Get("ETag"))
		revalidated := httptest.NewRecorder()
		engine.ServeHTTP(revalidated, request)
		assert.Equal(t, http.StatusNotModified, revalidated.Code)
		assert.Empty(t, revalidated.Body.String())
	}
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/user/avatar/self", nil))
	assert.Contains(t, response.Body.String(), `"avatar_version":3`)
	missing := httptest.NewRecorder()
	engine.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/user/avatar/"+strconv.Itoa(user.Id), nil))
	assert.Equal(t, http.StatusNotFound, missing.Code)
	after, err := model.GetSelfUserById(user.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 3, after.AvatarVersion)
	assert.Equal(t, user.AuthVersion, after.AuthVersion)
	_, _, err = service.ValidateLoginSession(identity)
	require.NoError(t, err)
}

func TestAvatarRequiresLoginAndAllowsAnotherLoggedInUser(t *testing.T) {
	user, _ := setupSecurityEnrollmentTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.UserAvatar{}))
	_, err := model.SaveUserAvatar(user.Id, &model.UserAvatar{MimeType: "image/png", Data: []byte("avatar"), Sha256: strings.Repeat("a", 64)})
	require.NoError(t, err)
	other := model.User{Username: "avatar-viewer", Status: common.UserStatusEnabled, Role: common.RoleCommonUser, AuthVersion: 1, AffCode: "avatar-viewer"}
	require.NoError(t, model.DB.Create(&other).Error)
	bundle, err := service.CreateLoginSession(other.Id, "password", "127.0.0.1", "avatar-test")
	require.NoError(t, err)
	engine := gin.New()
	engine.GET("/api/user/avatar/:id", middleware.UserAuth(), GetUserAvatar)
	path := "/api/user/avatar/" + strconv.Itoa(user.Id)
	for _, token := range []string{"", "invalid", bundle.AccessToken} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		if token != "" {
			request.Header.Set("Authorization", "Bearer "+token)
		}
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, request)
		if token == bundle.AccessToken {
			assert.Equal(t, http.StatusOK, response.Code)
			assert.Equal(t, "avatar", response.Body.String())
		} else {
			assert.Equal(t, http.StatusUnauthorized, response.Code)
		}
	}
}

func TestProfileDisplayNameNormalization(t *testing.T) {
	user, identity := setupSecurityEnrollmentTest(t)
	for _, tc := range []struct {
		input, want string
	}{
		{`{"display_name":"  Alice  ","role":100,"status":2,"quota":999999}`, "Alice"},
		{`{"display_name":""}`, ""},
		{`{"display_name":"  "}`, ""},
	} {
		response := securityEnrollmentRequest(http.MethodPut, "/api/user/self", tc.input, "", identity, UpdateSelf)
		var result struct {
			Success bool `json:"success"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
		require.True(t, result.Success, response.Body.String())
		stored, err := model.GetUserById(user.Id, true)
		require.NoError(t, err)
		assert.Equal(t, tc.want, stored.DisplayName)
		assert.Equal(t, user.Role, stored.Role)
		assert.Equal(t, user.Status, stored.Status)
		assert.Equal(t, user.Quota, stored.Quota)
		assert.Equal(t, user.AuthVersion, stored.AuthVersion)
	}
	response := securityEnrollmentRequest(http.MethodPut, "/api/user/self", `{"display_name":null}`, "", identity, UpdateSelf)
	assert.Contains(t, response.Body.String(), `"success":false`)
}

func TestAvatarMigration(t *testing.T) {
	dialect := os.Getenv("TEST_SECURITY_DIALECT")
	if dialect == "" {
		dialect = "sqlite"
	}
	for _, upgrade := range []bool{false, true} {
		name := "fresh"
		if upgrade {
			name = "upgrade"
		}
		t.Run(name, func(t *testing.T) {
			db, _ := newAuditTestDatabase(t, dialect, os.Getenv("TEST_"+strings.ToUpper(dialect)+"_DSN"))
			var version string
			query := "SELECT VERSION()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("database: %s %s", dialect, version)
			require.NoError(t, db.AutoMigrate(&model.User{}))
			user := model.User{Username: "migration-avatar", Password: "retained", DisplayName: "Before", AffCode: "migration-avatar", AuthVersion: 7}
			require.NoError(t, db.Create(&user).Error)
			if upgrade {
				// This reproduces the pre-feature users schema without the new column.
				require.NoError(t, db.Migrator().DropColumn(&model.User{}, "avatar_version"))
			}
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserAvatar{}))
			}
			var retained model.User
			require.NoError(t, db.First(&retained, user.Id).Error)
			assert.Equal(t, user.Username, retained.Username)
			assert.Equal(t, user.Password, retained.Password)
			assert.Equal(t, user.AuthVersion, retained.AuthVersion)
			assert.Zero(t, retained.AvatarVersion)
			assert.True(t, db.Migrator().HasIndex(&model.User{}, "idx_users_username"))
			assert.True(t, db.Migrator().HasTable(&model.UserAvatar{}))
		})
	}
}
