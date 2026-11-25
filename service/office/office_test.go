package office

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadConfigEnablesOfficeOnlyWithAConfiguredWorker(t *testing.T) {
	cases := []struct {
		name      string
		url       string
		token     string
		timeout   string
		enabled   bool
		turnHours float64
	}{
		{name: "worker configured", url: " http://office-worker:8090/ ", token: "secret", enabled: true, turnHours: 20.0 / 60},
		{name: "worker url missing", token: "secret"},
		{name: "worker token missing", url: "http://office-worker:8090"},
		{name: "custom turn timeout", url: "http://office-worker:8090", token: "secret", timeout: "45m", enabled: true, turnHours: 0.75},
		{name: "turn timeout below the minimum", url: "http://office-worker:8090", token: "secret", timeout: "30s"},
		{name: "turn timeout is not a duration", url: "http://office-worker:8090", token: "secret", timeout: "soon"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(workerURLEnv, tc.url)
			t.Setenv(workerTokenEnv, tc.token)
			t.Setenv(turnTimeoutEnv, tc.timeout)

			client := newClient(loadConfig())

			if !tc.enabled {
				assert.Nil(t, client)
				return
			}
			require.NotNil(t, client)
			assert.Equal(t, "http://office-worker:8090", client.config.workerURL)
			assert.Equal(t, tc.turnHours, client.config.turnTimeout.Hours())
		})
	}
}

func TestTurnTokenIsShortLivedAndBilledToTheWallet(t *testing.T) {
	token := turnToken(7, 1_000, 10*time.Minute)

	assert.Equal(t, 7, token.UserId)
	assert.Equal(t, int64(1_000+900), token.ExpiredTime)
	assert.Equal(t, common.TokenStatusEnabled, token.Status)
	assert.True(t, token.UnlimitedQuota)
	// No group and no model limit: the admin's own group routes the request.
	assert.Empty(t, token.Group)
	assert.False(t, token.ModelLimitsEnabled)
	assert.Empty(t, token.Key, "the key is generated when the token is issued")
}

func TestClientAuthenticatesAndUnwrapsWorkerData(t *testing.T) {
	var got *http.Request
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"success":true,"message":"","data":{"sessions":[{"id":"abc","title":"Report"}]}}`)
	}))
	defer server.Close()
	client := newClient(config{workerURL: server.URL, workerToken: "shared-secret", turnTimeout: defaultTurnTimeout})
	require.NotNil(t, client)

	var out struct {
		Sessions []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"sessions"`
	}
	require.NoError(t, client.listSessions(context.Background(), 7, &out))

	require.NotNil(t, got)
	assert.Equal(t, http.MethodGet, got.Method)
	assert.Equal(t, "Bearer shared-secret", got.Header.Get("Authorization"))
	assert.Equal(t, "7", got.URL.Query().Get("userId"))
	assert.Equal(t, "/sessions", got.URL.Path)
	require.Len(t, out.Sessions, 1)
	assert.Equal(t, "Report", out.Sessions[0].Title)
}

func TestClientSendsTheActingUserWhenCreatingASession(t *testing.T) {
	body := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, _ := io.ReadAll(r.Body)
		body <- string(data)
		io.WriteString(w, `{"success":true,"data":{"id":"abc"}}`)
	}))
	defer server.Close()
	client := newClient(config{workerURL: server.URL, workerToken: "shared-secret", turnTimeout: defaultTurnTimeout})

	var out struct {
		ID string `json:"id"`
	}
	require.NoError(t, client.createSession(context.Background(), 7, &out))

	assert.Equal(t, `{"userId":7}`, <-body)
	assert.Equal(t, "abc", out.ID)
}

func TestClientMapsWorkerFailures(t *testing.T) {
	t.Run("worker error keeps its status and message", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusConflict)
			io.WriteString(w, `{"success":false,"message":"A turn is already running in this session"}`)
		}))
		defer server.Close()
		client := newClient(config{workerURL: server.URL, workerToken: "shared-secret", turnTimeout: defaultTurnTimeout})

		err := client.deleteSession(context.Background(), 7, "abc")

		var workerError *WorkerError
		require.ErrorAs(t, err, &workerError)
		assert.Equal(t, http.StatusConflict, workerError.Status)
		assert.Equal(t, "A turn is already running in this session", workerError.Message)
	})

	t.Run("an unreachable worker is a console message", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
		server.Close()
		client := newClient(config{workerURL: server.URL, workerToken: "shared-secret", turnTimeout: defaultTurnTimeout})

		err := client.listSessions(context.Background(), 7, nil)

		var message *common.Message
		require.ErrorAs(t, err, &message)
		assert.Equal(t, "Office service is unreachable", err.Error())
	})

	t.Run("a broken worker response is rejected", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			io.WriteString(w, `{"success":true,"data":`)
		}))
		defer server.Close()
		client := newClient(config{workerURL: server.URL, workerToken: "shared-secret", turnTimeout: defaultTurnTimeout})

		var out any
		err := client.listSessions(context.Background(), 7, &out)

		assert.EqualError(t, err, "Office service returned an invalid response")
		assert.Nil(t, out)
	})
}

func TestStartTurnStreamsTheWorkerResponse(t *testing.T) {
	sent := make(chan []byte, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		sent <- body
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/turns/0123456789abcdef0123456789abcdef", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, "data: {\"type\":\"turn.completed\"}\n\n")
	}))
	defer server.Close()
	client := newClient(config{workerURL: server.URL, workerToken: "shared-secret", turnTimeout: defaultTurnTimeout})

	stream, err := client.startTurn(context.Background(), "0123456789abcdef0123456789abcdef", TurnRequest{
		UserId: 7, Prompt: "Write it", APIKey: "sk-short-lived", Model: "gpt-test", TimeoutMs: 120_000,
	})
	require.NoError(t, err)
	defer stream.Close()
	data, err := io.ReadAll(stream)
	require.NoError(t, err)

	assert.Equal(t, "data: {\"type\":\"turn.completed\"}\n\n", string(data))
	assert.JSONEq(t, `{"userId":7,"prompt":"Write it","apiKey":"sk-short-lived","model":"gpt-test","timeoutMs":120000}`, string(<-sent))
}

func TestOnlySessionIdsOfTheWorkerAreAccepted(t *testing.T) {
	assert.True(t, ValidSessionID("0123456789abcdef0123456789abcdef"))
	for _, invalid := range []string{"", "0123456789ABCDEF0123456789ABCDEF", "../sessions", "0123456789abcdef0123456789abcde", "0123456789abcdef0123456789abcdef/../x"} {
		assert.False(t, ValidSessionID(invalid), invalid)
	}
}

func TestTurnSlotIsOnePerUserAndStopsOnlyItsOwnSession(t *testing.T) {
	ctx, err := BeginTurn(7, "session-a", context.Background())
	require.NoError(t, err)
	t.Cleanup(func() { EndTurn(7) })

	_, err = BeginTurn(7, "session-b", context.Background())
	assert.ErrorIs(t, err, ErrTurnRunning)
	assert.False(t, StopTurn(7, "session-b"))
	assert.NoError(t, ctx.Err())

	assert.True(t, StopTurn(7, "session-a"))
	assert.ErrorIs(t, ctx.Err(), context.Canceled)

	EndTurn(7)
	assert.False(t, StopTurn(7, "session-a"))
	_, err = BeginTurn(7, "session-a", context.Background())
	assert.NoError(t, err)
}

func TestStreamEventsForwardsFramesInOrderAndKeepsTheLineOpen(t *testing.T) {
	reader, writer := io.Pipe()
	t.Cleanup(func() { reader.Close(); writer.Close() })
	go func() {
		io.WriteString(writer, "data: one\n")
		io.WriteString(writer, "\ndata: two\n\n")
		time.Sleep(40 * time.Millisecond)
		io.WriteString(writer, "data: three\n\n")
		writer.Close()
	}()

	var mu sync.Mutex
	var emitted [][]byte
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	streamEvents(ctx, reader, 5*time.Millisecond, func(frame []byte) error {
		mu.Lock()
		defer mu.Unlock()
		emitted = append(emitted, frame)
		if string(frame) == "data: three\n\n" {
			cancel()
			return errors.New("client disconnected")
		}
		return nil
	})

	mu.Lock()
	defer mu.Unlock()
	require.GreaterOrEqual(t, len(emitted), 4)
	assert.Equal(t, "data: one\n\n", string(emitted[0]))
	assert.Equal(t, "data: two\n\n", string(emitted[1]))
	assert.Equal(t, "data: three\n\n", string(emitted[len(emitted)-1]))
	// Everything between the second and the third data frame is a keepalive.
	for _, frame := range emitted[2 : len(emitted)-1] {
		assert.Equal(t, ": keepalive\n\n", string(frame))
	}
}
