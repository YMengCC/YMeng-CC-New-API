package service

import (
	"bytes"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

var (
	testPNG = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{1}, 64)...)
	testPDF = []byte("%PDF-1.7\n" + strings.Repeat("playground pdf body ", 16))
)

func usePlaygroundFileStore(t *testing.T) *playgroundFileStore {
	t.Helper()
	store := newPlaygroundFileStore(t.TempDir())
	previous := playgroundFiles
	playgroundFiles = store
	t.Cleanup(func() { playgroundFiles = previous })
	return store
}

func newPlaygroundTestContext(t *testing.T) *gin.Context {
	t.Helper()
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	return c
}

func storedPlaygroundFileCount(t *testing.T, store *playgroundFileStore) int {
	t.Helper()
	if store.dir == "" {
		return 0
	}
	entries, err := os.ReadDir(store.dir)
	require.NoError(t, err)
	return len(entries)
}

func playgroundChatBody(ids ...string) []byte {
	var parts strings.Builder
	parts.WriteString(`{"type":"text","text":"read these"}`)
	for _, id := range ids {
		parts.WriteString(`,{"type":"playground_file","playground_file":{"id":"` + id + `"}}`)
	}
	return []byte(`{"model":"gpt-test","stream":true,"messages":[{"role":"system","content":"be brief"},{"role":"user","content":[` + parts.String() + `]}]}`)
}

func TestSavePlaygroundFileSniffsContentAndBoundsSize(t *testing.T) {
	usePlaygroundFileStore(t)
	tests := []struct {
		name     string
		filename string
		content  []byte
		wantMime string
		wantName string
		wantErr  error
	}{
		{name: "png", filename: "photo.txt", content: testPNG, wantMime: "image/png", wantName: "photo.txt"},
		{name: "pdf with path in name", filename: `..\..\docs/report` + "\x00" + `.pdf`, content: testPDF, wantMime: "application/pdf", wantName: "report.pdf"},
		{name: "plain text", filename: "a.pdf", content: []byte("not a pdf"), wantErr: ErrPlaygroundFileType},
		{name: "empty", filename: "a.png", content: nil, wantErr: ErrPlaygroundFileType},
		{name: "oversized", filename: "big.png", content: append(append([]byte{}, testPNG...), make([]byte, PlaygroundFileMaxBytes)...), wantErr: ErrPlaygroundFileTooLarge},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			info, err := SavePlaygroundFile(1, test.filename, bytes.NewReader(test.content))
			if test.wantErr != nil {
				require.ErrorIs(t, err, test.wantErr)
				return
			}
			require.NoError(t, err)
			assert.True(t, strings.HasPrefix(info.ID, playgroundFileIDPrefix))
			assert.Len(t, info.ID, len(playgroundFileIDPrefix)+48)
			assert.Equal(t, test.wantMime, info.MimeType)
			assert.Equal(t, test.wantName, info.Filename)
			assert.Equal(t, int64(len(test.content)), info.Size)
		})
	}
}

func TestPlaygroundFilePendingLimitIsPerUserAndFreedByDelete(t *testing.T) {
	usePlaygroundFileStore(t)
	var first string
	for i := range playgroundUserPendingFiles {
		info, err := SavePlaygroundFile(1, "a.png", bytes.NewReader(testPNG))
		require.NoError(t, err)
		if i == 0 {
			first = info.ID
		}
	}
	_, err := SavePlaygroundFile(1, "a.png", bytes.NewReader(testPNG))
	require.ErrorIs(t, err, ErrPlaygroundFilePendingLimit)

	_, err = SavePlaygroundFile(2, "a.png", bytes.NewReader(testPNG))
	require.NoError(t, err, "another user's pending files do not count")

	DeletePlaygroundFile(2, first)
	_, err = SavePlaygroundFile(1, "a.png", bytes.NewReader(testPNG))
	require.ErrorIs(t, err, ErrPlaygroundFilePendingLimit, "a foreign delete must not cancel the owner's file")

	DeletePlaygroundFile(1, first)
	DeletePlaygroundFile(1, first)
	_, err = SavePlaygroundFile(1, "a.png", bytes.NewReader(testPNG))
	require.NoError(t, err)
}

func TestExpandPlaygroundChatFilesInlinesBytesOnceForOwner(t *testing.T) {
	store := usePlaygroundFileStore(t)
	png, err := SavePlaygroundFile(1, "photo.png", bytes.NewReader(testPNG))
	require.NoError(t, err)
	pdf, err := SavePlaygroundFile(1, "report.pdf", bytes.NewReader(testPDF))
	require.NoError(t, err)
	body := playgroundChatBody(png.ID, pdf.ID)

	_, release, err := ExpandPlaygroundChatFiles(newPlaygroundTestContext(t), 2, body)
	release()
	require.ErrorIs(t, err, ErrPlaygroundFileUnavailable, "another user cannot claim the files")

	c := newPlaygroundTestContext(t)
	expanded, release, err := ExpandPlaygroundChatFiles(c, 1, body)
	require.NoError(t, err)
	assert.True(t, PlaygroundRequestCarriesFiles(c))
	assert.Equal(t, "be brief", gjson.GetBytes(expanded, "messages.0.content").String())
	assert.Equal(t, "read these", gjson.GetBytes(expanded, "messages.1.content.0.text").String())
	assert.Equal(t, "data:image/png;base64,"+base64.StdEncoding.EncodeToString(testPNG), gjson.GetBytes(expanded, "messages.1.content.1.image_url.url").String())
	assert.Equal(t, "file", gjson.GetBytes(expanded, "messages.1.content.2.type").String())
	assert.Equal(t, "report.pdf", gjson.GetBytes(expanded, "messages.1.content.2.file.filename").String())
	assert.Equal(t, "data:application/pdf;base64,"+base64.StdEncoding.EncodeToString(testPDF), gjson.GetBytes(expanded, "messages.1.content.2.file.file_data").String())
	assert.True(t, gjson.GetBytes(expanded, "stream").Bool())
	assert.NotContains(t, string(expanded), png.ID)
	assert.NotContains(t, string(expanded), pdf.ID)
	assert.NotContains(t, string(expanded), playgroundFilePartType)

	assert.Nil(t, VerifyPlaygroundDelivery(c, expanded), "an outbound body that keeps the PDF bytes passes")
	apiErr := VerifyPlaygroundDelivery(c, []byte(`{"messages":[{"role":"user","content":"read these"}]}`))
	require.NotNil(t, apiErr)
	assert.Equal(t, types.ErrorCode("playground_attachment_unsupported"), apiErr.GetErrorCode())
	assert.Equal(t, http.StatusBadRequest, apiErr.StatusCode)

	release()
	release()
	assert.Zero(t, storedPlaygroundFileCount(t, store), "claimed files are deleted when the request ends")
	_, release, err = ExpandPlaygroundChatFiles(newPlaygroundTestContext(t), 1, body)
	release()
	require.ErrorIs(t, err, ErrPlaygroundFileUnavailable, "a claimed file cannot be reused")
}

func TestExpandPlaygroundChatFilesRejectsBatchWithoutConsumingIt(t *testing.T) {
	usePlaygroundFileStore(t)
	info, err := SavePlaygroundFile(1, "photo.png", bytes.NewReader(testPNG))
	require.NoError(t, err)

	invalid := map[string][]byte{
		"reference outside the last user message": []byte(`{"model":"m","messages":[{"role":"user","content":[{"type":"playground_file","playground_file":{"id":"` + info.ID + `"}}]},{"role":"assistant","content":"ok"}]}`),
		"duplicate reference":                     playgroundChatBody(info.ID, info.ID),
		"too many files":                          playgroundChatBody(info.ID, "pgf_b", "pgf_c", "pgf_d", "pgf_e"),
	}
	for name, body := range invalid {
		_, release, err := ExpandPlaygroundChatFiles(newPlaygroundTestContext(t), 1, body)
		release()
		require.ErrorIs(t, err, ErrPlaygroundFileInvalid, name)
	}
	_, release, err := ExpandPlaygroundChatFiles(newPlaygroundTestContext(t), 1, playgroundChatBody(info.ID, "pgf_missing"))
	release()
	require.ErrorIs(t, err, ErrPlaygroundFileUnavailable)

	_, release, err = ExpandPlaygroundChatFiles(newPlaygroundTestContext(t), 1, playgroundChatBody(info.ID))
	release()
	require.NoError(t, err, "rejected batches leave the upload usable")
}

func TestExpiredPlaygroundFilesAreSweptAndUnavailable(t *testing.T) {
	store := usePlaygroundFileStore(t)
	info, err := SavePlaygroundFile(1, "photo.png", bytes.NewReader(testPNG))
	require.NoError(t, err)
	require.Equal(t, 1, storedPlaygroundFileCount(t, store))

	store.now = func() time.Time { return time.Now().Add(PlaygroundFileTTL + time.Second) }
	_, release, err := ExpandPlaygroundChatFiles(newPlaygroundTestContext(t), 1, playgroundChatBody(info.ID))
	release()
	require.ErrorIs(t, err, ErrPlaygroundFileUnavailable)
	assert.Zero(t, storedPlaygroundFileCount(t, store))
}

func TestVerifyPlaygroundDeliveryRequiresHostedWebSearch(t *testing.T) {
	c := newPlaygroundTestContext(t)
	body := []byte(`{"model":"m","messages":[{"role":"user","content":"news"}],"web_search_options":{}}`)
	expanded, release, err := ExpandPlaygroundChatFiles(c, 1, body)
	release()
	require.NoError(t, err)
	assert.Equal(t, body, expanded)
	assert.False(t, PlaygroundRequestCarriesFiles(c))

	delivered := []string{
		`{"web_search_options":{"search_context_size":"medium"}}`,
		`{"tools":[{"type":"function"},{"type":"web_search_preview"}]}`,
		`{"tools":[{"type":"web_search_20250305","name":"web_search"}]}`,
		`{"tools":[{"googleSearch":{}}]}`,
		`{"enable_search":true}`,
	}
	for _, outbound := range delivered {
		assert.Nil(t, VerifyPlaygroundDelivery(c, []byte(outbound)), outbound)
	}
	apiErr := VerifyPlaygroundDelivery(c, []byte(`{"contents":[{"parts":[{"text":"news"}]}]}`))
	require.NotNil(t, apiErr)
	assert.Equal(t, types.ErrorCode("playground_web_search_unsupported"), apiErr.GetErrorCode())
}
