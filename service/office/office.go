// Package office links the playground office mode to the office worker: the
// separate service that runs Codex CLI turns inside its sandbox. The gateway
// only authenticates admins, issues a short-lived token per turn and proxies
// the worker API; it never touches a workspace itself.
package office

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// TurnRequest is the payload of POST /turns/:id on the office worker.
type TurnRequest struct {
	UserId    int    `json:"userId"`
	Prompt    string `json:"prompt"`
	APIKey    string `json:"apiKey"`
	Model     string `json:"model"`
	TimeoutMs int64  `json:"timeoutMs"`
}

// WorkerError is an error response of the office worker.
type WorkerError struct {
	Status  int
	Message string
}

func (e *WorkerError) Error() string {
	return e.Message
}

// ErrTurnRunning reports that the user already has a turn in progress.
var ErrTurnRunning = errors.New("You already have an office task in progress")

var sessionIDPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

// ValidSessionID reports whether id is a session the worker could have issued.
func ValidSessionID(id string) bool {
	return sessionIDPattern.MatchString(id)
}

const (
	workerURLEnv   = "OFFICE_WORKER_URL"
	workerTokenEnv = "OFFICE_WORKER_TOKEN"
	turnTimeoutEnv = "OFFICE_TURN_TIMEOUT"

	defaultTurnTimeout = 20 * time.Minute
	minTurnTimeout     = time.Minute
	maxTurnTimeout     = 3 * time.Hour
	// tokenGrace keeps a turn token valid while its cleanup is delayed.
	tokenGrace = 5 * time.Minute

	requestTimeout   = 2 * time.Minute
	maxResponseBytes = 8 << 20
	keepaliveEvery   = 15 * time.Second
)

type config struct {
	workerURL   string
	workerToken string
	turnTimeout time.Duration
}

func loadConfig() config {
	c := config{
		workerURL:   strings.TrimRight(strings.TrimSpace(os.Getenv(workerURLEnv)), "/"),
		workerToken: strings.TrimSpace(os.Getenv(workerTokenEnv)),
		turnTimeout: defaultTurnTimeout,
	}
	if raw := strings.TrimSpace(os.Getenv(turnTimeoutEnv)); raw != "" {
		duration, err := time.ParseDuration(raw)
		if err != nil || duration < minTurnTimeout || duration > maxTurnTimeout {
			common.SysError(common.LogText("office mode disabled: %s must be a duration between %s and %s", turnTimeoutEnv, minTurnTimeout, maxTurnTimeout))
			return config{}
		}
		c.turnTimeout = duration
	}
	// Office mode stays hidden until the worker is configured.
	if c.workerURL == "" || c.workerToken == "" {
		return config{}
	}
	return c
}

var current = sync.OnceValue(func() *client {
	return newClient(loadConfig())
})

// Enabled reports whether the office worker is configured.
func Enabled() bool {
	return current() != nil
}

// TurnTimeout is how long a single office turn may run.
func TurnTimeout() time.Duration {
	return current().config.turnTimeout
}

// CreateSession, ListSessions, DeleteSession, SessionEvents, ListFiles,
// UploadFile, DownloadFile and StartTurn call the configured office worker;
// userId scopes every call to the acting admin.
func CreateSession(ctx context.Context, userId int, out any) error {
	return current().createSession(ctx, userId, out)
}

func ListSessions(ctx context.Context, userId int, out any) error {
	return current().listSessions(ctx, userId, out)
}

func DeleteSession(ctx context.Context, userId int, sessionId string) error {
	return current().deleteSession(ctx, userId, sessionId)
}

func SessionEvents(ctx context.Context, userId int, sessionId string, out any) error {
	return current().sessionEvents(ctx, userId, sessionId, out)
}

func ListFiles(ctx context.Context, userId int, sessionId string, out any) error {
	return current().listFiles(ctx, userId, sessionId, out)
}

// UploadFile stores content at a workspace-relative path.
func UploadFile(ctx context.Context, userId int, sessionId, relative string, content io.Reader) error {
	return current().uploadFile(ctx, userId, sessionId, relative, content)
}

// DownloadFile returns the worker's file response for the caller to stream.
func DownloadFile(ctx context.Context, userId int, sessionId, relative string) (*http.Response, error) {
	return current().downloadFile(ctx, userId, sessionId, relative)
}

// StartTurn starts a turn and returns the server-sent event stream of the
// office worker. Closing the returned body stops the turn on the worker.
func StartTurn(ctx context.Context, sessionId string, request TurnRequest) (io.ReadCloser, error) {
	return current().startTurn(ctx, sessionId, request)
}

func (c *client) createSession(ctx context.Context, userId int, out any) error {
	payload, err := common.Marshal(struct {
		UserId int `json:"userId"`
	}{userId})
	if err != nil {
		return err
	}
	return c.call(ctx, http.MethodPost, "/sessions", nil, bytes.NewReader(payload), "application/json", out)
}

func (c *client) listSessions(ctx context.Context, userId int, out any) error {
	return c.call(ctx, http.MethodGet, "/sessions", userQuery(userId), nil, "", out)
}

func (c *client) deleteSession(ctx context.Context, userId int, sessionId string) error {
	return c.call(ctx, http.MethodDelete, "/sessions/"+sessionId, userQuery(userId), nil, "", nil)
}

func (c *client) sessionEvents(ctx context.Context, userId int, sessionId string, out any) error {
	return c.call(ctx, http.MethodGet, "/sessions/"+sessionId+"/events", userQuery(userId), nil, "", out)
}

func (c *client) listFiles(ctx context.Context, userId int, sessionId string, out any) error {
	return c.call(ctx, http.MethodGet, "/sessions/"+sessionId+"/files", userQuery(userId), nil, "", out)
}

func (c *client) uploadFile(ctx context.Context, userId int, sessionId, relative string, content io.Reader) error {
	query := userQuery(userId)
	query.Set("path", relative)
	return c.call(ctx, http.MethodPost, "/sessions/"+sessionId+"/files", query, content, "application/octet-stream", nil)
}

func (c *client) downloadFile(ctx context.Context, userId int, sessionId, relative string) (*http.Response, error) {
	query := userQuery(userId)
	query.Set("path", relative)
	return c.open(ctx, http.MethodGet, "/sessions/"+sessionId+"/files/content", query, nil, "")
}

func (c *client) startTurn(ctx context.Context, sessionId string, request TurnRequest) (io.ReadCloser, error) {
	payload, err := common.Marshal(request)
	if err != nil {
		return nil, err
	}
	response, err := c.open(ctx, http.MethodPost, "/turns/"+sessionId, nil, bytes.NewReader(payload), "application/json")
	if err != nil {
		return nil, err
	}
	return response.Body, nil
}

// StreamEvents forwards a server-sent event stream to emit until the body
// ends or ctx is done. A comment is emitted between keepalive intervals so
// proxies do not close an otherwise idle connection.
func StreamEvents(ctx context.Context, body io.Reader, emit func(frame []byte) error) {
	streamEvents(ctx, body, keepaliveEvery, emit)
}

func streamEvents(ctx context.Context, body io.Reader, keepaliveEvery time.Duration, emit func(frame []byte) error) {
	frames := make(chan []byte)
	go func() {
		defer close(frames)
		readFrames(ctx, body, frames)
	}()

	keepalive := time.NewTicker(keepaliveEvery)
	defer keepalive.Stop()
	for {
		select {
		case frame, ok := <-frames:
			if !ok || emit(frame) != nil {
				return
			}
		case <-keepalive.C:
			if emit([]byte(": keepalive\n\n")) != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

// readFrames splits the stream into frames terminated by a blank line.
func readFrames(ctx context.Context, body io.Reader, frames chan<- []byte) {
	reader := bufio.NewReaderSize(body, 16<<10)
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) == 0 && err != nil {
			return
		}
		// Every frame is a fresh slice: emit may still be writing the
		// previous one when the next one arrives.
		frame := append([]byte(nil), line...)
		for !bytes.Equal(line, []byte("\n")) && err == nil {
			line, err = reader.ReadBytes('\n')
			frame = append(frame, line...)
		}
		select {
		case frames <- frame:
		case <-ctx.Done():
			return
		}
		if err != nil {
			return
		}
	}
}

type runningTurn struct {
	sessionId string
	cancel    context.CancelFunc
}

type turnRegistry struct {
	mu      sync.Mutex
	running map[int]runningTurn
}

var turns = &turnRegistry{running: map[int]runningTurn{}}

// BeginTurn reserves the single turn slot of a user for sessionId. Cancelling
// the returned context stops the turn.
func BeginTurn(userId int, sessionId string, ctx context.Context) (context.Context, error) {
	turns.mu.Lock()
	defer turns.mu.Unlock()
	if _, running := turns.running[userId]; running {
		return nil, ErrTurnRunning
	}
	turnCtx, cancel := context.WithCancel(ctx)
	turns.running[userId] = runningTurn{sessionId: sessionId, cancel: cancel}
	return turnCtx, nil
}

// EndTurn releases the turn slot of a user.
func EndTurn(userId int) {
	turns.mu.Lock()
	defer turns.mu.Unlock()
	delete(turns.running, userId)
}

// StopTurn stops the turn a user is running in sessionId and reports whether
// there was one.
func StopTurn(userId int, sessionId string) bool {
	turns.mu.Lock()
	defer turns.mu.Unlock()
	turn, running := turns.running[userId]
	if running && turn.sessionId == sessionId {
		turn.cancel()
		return true
	}
	return false
}

// IssueTurnToken creates the short-lived API token the Codex CLI uses for its
// model calls, so they are billed and logged as the user's own requests.
func IssueTurnToken(userId int, ttl time.Duration) (*model.Token, error) {
	token := turnToken(userId, common.GetTimestamp(), ttl)
	key, err := common.GenerateKey()
	if err != nil {
		return nil, err
	}
	token.Key = key
	if err := token.Insert(); err != nil {
		return nil, err
	}
	return token, nil
}

func turnToken(userId int, now int64, ttl time.Duration) *model.Token {
	return &model.Token{
		UserId:         userId,
		Name:           "office-turn",
		Status:         common.TokenStatusEnabled,
		CreatedTime:    now,
		AccessedTime:   now,
		ExpiredTime:    now + int64((ttl + tokenGrace).Seconds()),
		UnlimitedQuota: true,
	}
}

// RevokeTurnToken deletes a turn token. A failed delete only leaves a row
// that expires on its own within the grace period.
func RevokeTurnToken(token *model.Token) {
	if err := token.Delete(); err != nil {
		common.SysError(common.LogText("failed to delete office turn token %d: %s", token.Id, err.Error()))
	}
}

type client struct {
	config config
	http   *http.Client
}

func newClient(c config) *client {
	if c.workerURL == "" || c.workerToken == "" || c.turnTimeout <= 0 {
		return nil
	}
	return &client{config: c, http: &http.Client{}}
}

func userQuery(userId int) url.Values {
	return url.Values{"userId": {strconv.Itoa(userId)}}
}

// call performs a JSON request and stores the envelope's data in out.
func (c *client) call(ctx context.Context, method, path string, query url.Values, body io.Reader, contentType string, out any) error {
	ctx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()
	response, err := c.open(ctx, method, path, query, body, contentType)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes))
	if err != nil {
		return common.NewMessage("Office service returned an invalid response")
	}
	var envelope struct {
		Success bool              `json:"success"`
		Message string            `json:"message"`
		Data    common.RawMessage `json:"data"`
	}
	if err := common.Unmarshal(data, &envelope); err != nil {
		return common.NewMessage("Office service returned an invalid response")
	}
	if !envelope.Success {
		return &WorkerError{Status: response.StatusCode, Message: envelope.Message}
	}
	if out == nil {
		return nil
	}
	return common.Unmarshal(envelope.Data, out)
}

// open sends an authenticated request and returns the response, turning
// non-2xx worker responses into *WorkerError.
func (c *client) open(ctx context.Context, method, path string, query url.Values, body io.Reader, contentType string) (*http.Response, error) {
	endpoint := c.config.workerURL + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+c.config.workerToken)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, common.NewMessage("Office service is unreachable")
	}
	if response.StatusCode >= 200 && response.StatusCode <= 299 {
		return response, nil
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	var envelope struct {
		Message string `json:"message"`
	}
	message := http.StatusText(response.StatusCode)
	if common.Unmarshal(data, &envelope) == nil && envelope.Message != "" {
		message = envelope.Message
	}
	return nil, &WorkerError{Status: response.StatusCode, Message: message}
}
