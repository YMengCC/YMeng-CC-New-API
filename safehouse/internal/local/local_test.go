package local

import (
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testAddr = "127.0.0.1:17860"

var localToken = regexp.MustCompile(`\[\[TL:[0-9a-f]{32}:\d+\]\]`)

func newTestServer(t *testing.T, upstream string) *Server {
	t.Helper()
	server, err := NewServer(Options{Addr: testAddr, ConfigPath: filepath.Join(t.TempDir(), "config.json"), Version: "test"})
	require.NoError(t, err)
	if upstream != "" {
		require.NoError(t, server.config.setUpstream(upstream))
	}
	return server
}

func localRequest(method, path, body string) *http.Request {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Host = testAddr
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	return request
}

func TestProxyNeverSendsPlaintextUpstream(t *testing.T) {
	const secret = "alice@example.com"
	t.Run("JSON reply is restored locally", func(t *testing.T) {
		var upstreamBody, authorization, encoding string
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, _ := io.ReadAll(r.Body)
			upstreamBody = string(raw)
			authorization = r.Header.Get("Authorization")
			encoding = r.Header.Get("Accept-Encoding")
			token := localToken.FindString(upstreamBody)
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"choices":[{"index":0,"message":{"role":"assistant","content":"reply to `+token+`"}}]}`)
		}))
		defer upstream.Close()
		server := newTestServer(t, upstream.URL)

		request := localRequest(http.MethodPost, "/v1/chat/completions", `{"model":"m","messages":[{"role":"user","content":"mail `+secret+`"}]}`)
		request.Header.Set("Authorization", "Bearer sk-test")
		request.Header.Set("Accept-Encoding", "br")
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code)
		assert.NotContains(t, upstreamBody, secret)
		assert.Regexp(t, localToken, upstreamBody)
		assert.Equal(t, "Bearer sk-test", authorization)
		assert.NotContains(t, encoding, "br")
		assert.Contains(t, recorder.Body.String(), "reply to "+secret)
		assert.Equal(t, int64(1), server.stats.requests.Load())
		assert.Equal(t, int64(1), server.stats.maskedEntities.Load())
	})
	t.Run("agent tool arguments are masked upstream and restored locally", func(t *testing.T) {
		var upstreamBody string
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, _ := io.ReadAll(r.Body)
			upstreamBody = string(raw)
			token := localToken.FindString(upstreamBody)
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"choices":[{"index":0,"message":{"role":"assistant","tool_calls":[{"id":"call_2","type":"function","function":{"name":"lookup","arguments":"{\"email\":\"`+token+`\"}"}}]},"finish_reason":"tool_calls"}]}`)
		}))
		defer upstream.Close()
		server := newTestServer(t, upstream.URL)

		request := localRequest(http.MethodPost, "/v1/chat/completions", `{"model":"m","messages":[{"role":"user","content":"mail `+secret+`"},{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{\"email\":\"`+secret+`\"}"}}]},{"role":"tool","tool_call_id":"call_1","content":"found `+secret+`"}],"tools":[{"type":"function","function":{"name":"lookup","description":"lookup `+secret+`","parameters":{"type":"object","properties":{"email":{"type":"string"}}}}}]}`)
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code)
		assert.NotContains(t, upstreamBody, secret)
		assert.Regexp(t, localToken, upstreamBody)
		assert.Contains(t, recorder.Body.String(), secret)
	})
	t.Run("SSE placeholder split across chunks is restored locally", func(t *testing.T) {
		var upstreamBody string
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, _ := io.ReadAll(r.Body)
			upstreamBody = string(raw)
			token := localToken.FindString(upstreamBody)
			w.Header().Set("Content-Type", "text/event-stream")
			event := "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi " + token + "\"}}]}\n\ndata: [DONE]\n\n"
			split := strings.Index(event, token) + len(token)/2
			_, _ = io.WriteString(w, event[:split])
			w.(http.Flusher).Flush()
			_, _ = io.WriteString(w, event[split:])
		}))
		defer upstream.Close()
		server := newTestServer(t, upstream.URL)

		request := localRequest(http.MethodPost, "/v1/chat/completions", `{"model":"m","stream":true,"messages":[{"role":"user","content":"`+secret+`"}]}`)
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, request)

		assert.NotContains(t, upstreamBody, secret)
		assert.Contains(t, recorder.Body.String(), "hi "+secret)
		assert.Contains(t, recorder.Body.String(), "data: [DONE]")
		assert.NotContains(t, recorder.Body.String(), "event: error")
	})
	t.Run("signed Claude thinking passes through locally", func(t *testing.T) {
		var upstreamBody string
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, _ := io.ReadAll(r.Body)
			upstreamBody = string(raw)
			token := localToken.FindString(upstreamBody)
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"type":"message","content":[{"type":"thinking","thinking":"private `+token+`","signature":"sig"},{"type":"text","text":"reply `+token+`"}]}`)
		}))
		defer upstream.Close()
		server := newTestServer(t, upstream.URL)
		request := localRequest(http.MethodPost, "/v1/messages", `{"model":"m","max_tokens":1,"messages":[{"role":"user","content":"mail `+secret+`"}]}`)
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code)
		assert.NotContains(t, upstreamBody, secret)
		assert.Regexp(t, localToken, upstreamBody)
		assert.Contains(t, recorder.Body.String(), `"thinking":"private `+localToken.FindString(upstreamBody)+`"`)
		assert.Contains(t, recorder.Body.String(), "reply "+secret)
	})
	t.Run("signed Gemini thought passes through locally", func(t *testing.T) {
		var upstreamBody string
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, _ := io.ReadAll(r.Body)
			upstreamBody = string(raw)
			token := localToken.FindString(upstreamBody)
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"candidates":[{"content":{"parts":[{"text":"private `+token+`","thought":true,"thoughtSignature":"sig"},{"text":"reply `+token+`"}]}}]}`)
		}))
		defer upstream.Close()
		server := newTestServer(t, upstream.URL)
		request := localRequest(http.MethodPost, "/v1beta/models/gemini-pro:generateContent", `{"model":"m","contents":[{"role":"user","parts":[{"text":"mail `+secret+`"}]}]}`)
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code)
		assert.NotContains(t, upstreamBody, secret)
		assert.Regexp(t, localToken, upstreamBody)
		assert.Contains(t, recorder.Body.String(), `"text":"private `+localToken.FindString(upstreamBody)+`"`)
		assert.Contains(t, recorder.Body.String(), "reply "+secret)
	})
}

func TestProxyBlocksWhatItCannotMask(t *testing.T) {
	var hits atomic.Int64
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.URL.Path == "/v1/chat/completions" {
			http.Redirect(w, r, "/elsewhere", http.StatusTemporaryRedirect)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[]}`)
	}))
	defer upstream.Close()
	server := newTestServer(t, upstream.URL)

	cases := []struct {
		name, method, path, body string
		status                   int
		upstreamHits             int64
	}{
		{"unrecognized query is forwarded", http.MethodPost, "/v1/chat/completions?note=private", `{"model":"m","messages":[{"role":"user","content":"x"}]}`, http.StatusBadGateway, 1},
		{"malformed tool declaration stays local", http.MethodPost, "/v1/chat/completions", `{"model":"m","messages":[{"role":"user","content":"x"}],"tools":[{"type":"function"}]}`, http.StatusBadRequest, 0},
		{"media tool result stays local", http.MethodPost, "/v1/chat/completions", `{"model":"m","messages":[{"role":"tool","tool_call_id":"call_1","content":[{"type":"image_url","image_url":{"url":"https://example.com/x.png"}}]}]}`, http.StatusBadRequest, 0},
		{"unsupported endpoint stays local", http.MethodPost, "/v1/embeddings", `{"model":"m","input":"alice@example.com"}`, http.StatusBadRequest, 0},
		{"redirect is not followed", http.MethodPost, "/v1/chat/completions", `{"model":"m","messages":[{"role":"user","content":"x"}]}`, http.StatusBadGateway, 1},
		{"model listing passes through", http.MethodGet, "/v1/models", "", http.StatusOK, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			hits.Store(0)
			recorder := httptest.NewRecorder()
			server.Handler().ServeHTTP(recorder, localRequest(tc.method, tc.path, tc.body))
			assert.Equal(t, tc.status, recorder.Code)
			assert.Equal(t, tc.upstreamHits, hits.Load())
		})
	}
}

func TestProxyForwardsQueryAuthAndBrowserPreflight(t *testing.T) {
	var gotPath, gotQuery, gotOrigin string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotQuery = r.URL.RawQuery
		gotOrigin = r.Header.Get("Origin")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"object":"list","data":[]}`)
	}))
	defer upstream.Close()
	server := newTestServer(t, upstream.URL)

	preflight := localRequest(http.MethodOptions, "/v1beta/models", "")
	preflight.Header.Set("Origin", "https://client.example")
	preflight.Header.Set("Access-Control-Request-Method", "POST")
	preflight.Header.Set("Access-Control-Request-Headers", "authorization,content-type")
	preflightRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(preflightRecorder, preflight)
	require.Equal(t, http.StatusNoContent, preflightRecorder.Code)
	assert.Equal(t, "*", preflightRecorder.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "authorization,content-type", preflightRecorder.Header().Get("Access-Control-Allow-Headers"))

	request := localRequest(http.MethodGet, "/v1beta/models?key=gemini-key&alt=sse", "")
	request.Header.Set("Origin", "https://client.example")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "/v1beta/models", gotPath)
	assert.Equal(t, "key=gemini-key&alt=sse", gotQuery)
	assert.Equal(t, "*", recorder.Header().Get("Access-Control-Allow-Origin"))
	assert.Empty(t, gotOrigin)
}

func TestPairingRequiresPanelTokenAndOrigin(t *testing.T) {
	server := newTestServer(t, "")
	pair := func(body string, mutate func(*http.Request)) int {
		request := localRequest(http.MethodPost, "/api/pair", body)
		request.Header.Set(tokenHeader, server.token)
		request.Header.Set("Origin", "http://"+testAddr)
		mutate(request)
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, request)
		assert.Empty(t, recorder.Header().Get("Access-Control-Allow-Origin"))
		return recorder.Code
	}
	valid := `{"upstream":"https://site.example"}`

	cases := []struct {
		name   string
		body   string
		mutate func(*http.Request)
		status int
	}{
		{"missing token", valid, func(r *http.Request) { r.Header.Del(tokenHeader) }, http.StatusForbidden},
		{"wrong token", valid, func(r *http.Request) { r.Header.Set(tokenHeader, "guess") }, http.StatusForbidden},
		{"foreign origin", valid, func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") }, http.StatusForbidden},
		{"rebinding host", valid, func(r *http.Request) { r.Host = "evil.example:17860" }, http.StatusForbidden},
		{"plain http site", `{"upstream":"http://site.example"}`, func(*http.Request) {}, http.StatusBadRequest},
		{"site with path", `{"upstream":"https://site.example/v1"}`, func(*http.Request) {}, http.StatusBadRequest},
		{"loop to itself", `{"upstream":"http://127.0.0.1:17860"}`, func(*http.Request) {}, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.status, pair(tc.body, tc.mutate))
			assert.Empty(t, server.config.upstream())
		})
	}

	require.Equal(t, http.StatusOK, pair(valid, func(*http.Request) {}))
	assert.Equal(t, "https://site.example", server.config.upstream())
	reloaded := loadConfig(server.config.path)
	assert.Equal(t, "https://site.example", reloaded.upstream())
}
