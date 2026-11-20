package service

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// Playground attachments are short-lived, instance-local raw files that one
// /pg/chat/completions request consumes. They are never listed, downloaded,
// stored in the database, or shared across gateway instances.
const (
	PlaygroundFileMaxBytes    int64 = 10 << 20
	PlaygroundFilesPerMessage       = 4
	PlaygroundMessageMaxBytes int64 = 20 << 20
	PlaygroundFileTTL               = 15 * time.Minute

	playgroundUserPendingFiles       = 8
	playgroundUserPendingBytes int64 = 40 << 20
	playgroundPendingFiles           = 1024
	playgroundPendingBytes     int64 = 2 << 30

	playgroundFilePartType = "playground_file"
	playgroundFileIDPrefix = "pgf_"

	// A delivery probe is a prefix of the attachment's base64 payload. Every
	// supported conversion copies the payload verbatim, so its absence from the
	// outbound body means the selected upstream path dropped the attachment.
	playgroundDeliveryProbeLen = 96

	playgroundDeliveryProbesKey = "playground_delivery_probes"
	playgroundWebSearchKey      = "playground_web_search"
	playgroundAttachmentsKey    = "playground_attachments"
)

// Web console messages for the upload endpoints. The English text is the
// frontend locale key.
var (
	ErrPlaygroundFileType         = common.NewMessage("Only PDF, PNG, JPEG, GIF, or WebP files are supported")
	ErrPlaygroundFileTooLarge     = common.NewMessage("Each file must not exceed 10 MiB")
	ErrPlaygroundFilePendingLimit = common.NewMessage("Too many pending attachments; send or remove some first")
	ErrPlaygroundFileStorageBusy  = common.NewMessage("Attachment storage is busy; try again later")
	ErrPlaygroundFileUploadFailed = common.NewMessage("Attachment upload failed")
)

// Chat-side failures. The controller maps them to OpenAI-shaped errors.
var (
	ErrPlaygroundFileUnavailable = errors.New("playground file unavailable")
	ErrPlaygroundFileInvalid     = errors.New("playground file reference invalid")
)

var playgroundFileMimeTypes = map[string]bool{
	"application/pdf": true,
	"image/png":       true,
	"image/jpeg":      true,
	"image/gif":       true,
	"image/webp":      true,
}

// PlaygroundFileInfo is the client-visible description of an uploaded file.
type PlaygroundFileInfo struct {
	ID        string `json:"id"`
	Filename  string `json:"filename"`
	MimeType  string `json:"mime_type"`
	Size      int64  `json:"size"`
	ExpiresAt int64  `json:"expires_at"`
}

type playgroundFile struct {
	info   PlaygroundFileInfo
	userID int
	path   string
}

type playgroundFileStore struct {
	mu        sync.Mutex
	baseDir   string
	dir       string
	files     map[string]*playgroundFile
	userFiles map[int]int
	userBytes map[int]int64
	allFiles  int
	allBytes  int64
	now       func() time.Time
	sweepOnce sync.Once
}

var playgroundFiles = newPlaygroundFileStore("")

func newPlaygroundFileStore(baseDir string) *playgroundFileStore {
	return &playgroundFileStore{
		baseDir:   baseDir,
		files:     map[string]*playgroundFile{},
		userFiles: map[int]int{},
		userBytes: map[int]int64{},
		now:       time.Now,
	}
}

// ensureDir creates this process's private directory on first use and removes
// directories left behind by earlier processes once they are past the TTL.
// Caller holds s.mu.
func (s *playgroundFileStore) ensureDir() error {
	if s.dir != "" {
		return nil
	}
	parent := s.baseDir
	if parent == "" {
		parent = common.GetDiskCachePath()
		if parent == "" {
			parent = os.TempDir()
		}
		parent = filepath.Join(parent, "new-api-playground-files")
	}
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return err
	}
	if entries, err := os.ReadDir(parent); err == nil {
		for _, entry := range entries {
			info, infoErr := entry.Info()
			if infoErr == nil && entry.IsDir() && s.now().Sub(info.ModTime()) > 4*PlaygroundFileTTL {
				_ = os.RemoveAll(filepath.Join(parent, entry.Name()))
			}
		}
	}
	dir, err := os.MkdirTemp(parent, "instance-")
	if err != nil {
		return err
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		_ = os.RemoveAll(dir)
		return err
	}
	s.dir = dir
	return nil
}

// reserve counts an upload in progress at the maximum file size so concurrent
// uploads cannot overshoot the pending limits. Caller holds s.mu.
func (s *playgroundFileStore) reserve(userID int) error {
	if s.userFiles[userID] >= playgroundUserPendingFiles || s.userBytes[userID]+PlaygroundFileMaxBytes > playgroundUserPendingBytes {
		return ErrPlaygroundFilePendingLimit
	}
	if s.allFiles >= playgroundPendingFiles || s.allBytes+PlaygroundFileMaxBytes > playgroundPendingBytes {
		return ErrPlaygroundFileStorageBusy
	}
	s.userFiles[userID]++
	s.userBytes[userID] += PlaygroundFileMaxBytes
	s.allFiles++
	s.allBytes += PlaygroundFileMaxBytes
	return nil
}

// release returns counted capacity. Caller holds s.mu.
func (s *playgroundFileStore) release(userID int, size int64) {
	s.userFiles[userID]--
	s.userBytes[userID] -= size
	if s.userFiles[userID] <= 0 {
		delete(s.userFiles, userID)
		delete(s.userBytes, userID)
	}
	s.allFiles--
	s.allBytes -= size
}

// sweep drops expired pending files. Caller holds s.mu.
func (s *playgroundFileStore) sweep() {
	now := s.now()
	for id, file := range s.files {
		if now.Unix() >= file.info.ExpiresAt {
			delete(s.files, id)
			s.release(file.userID, file.info.Size)
			_ = os.Remove(file.path)
		}
	}
}

func (s *playgroundFileStore) startSweeper() {
	s.sweepOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(time.Minute)
			defer ticker.Stop()
			for range ticker.C {
				s.mu.Lock()
				s.sweep()
				s.mu.Unlock()
			}
		}()
	})
}

func (s *playgroundFileStore) save(userID int, filename string, src io.Reader) (*PlaygroundFileInfo, error) {
	s.mu.Lock()
	s.sweep()
	if err := s.ensureDir(); err != nil {
		s.mu.Unlock()
		common.SysError(common.LogText("playground file directory unavailable: %s", err.Error()))
		return nil, ErrPlaygroundFileUploadFailed
	}
	if err := s.reserve(userID); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	dir := s.dir
	s.mu.Unlock()

	committed := false
	reserved := PlaygroundFileMaxBytes
	defer func() {
		if !committed {
			s.mu.Lock()
			s.release(userID, reserved)
			s.mu.Unlock()
		}
	}()

	idBytes := make([]byte, 24)
	if _, err := rand.Read(idBytes); err != nil {
		return nil, ErrPlaygroundFileUploadFailed
	}
	id := playgroundFileIDPrefix + hex.EncodeToString(idBytes)

	head := make([]byte, 512)
	n, err := io.ReadFull(src, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return nil, uploadReadError(err)
	}
	head = head[:n]
	mimeType, _, _ := strings.Cut(http.DetectContentType(head), ";")
	if n == 0 || !playgroundFileMimeTypes[mimeType] {
		return nil, ErrPlaygroundFileType
	}

	// Another process may have swept this directory after a long idle period.
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, ErrPlaygroundFileUploadFailed
	}
	filePath := filepath.Join(dir, id+".bin")
	out, err := os.OpenFile(filePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		common.SysError(common.LogText("playground file create failed: %s", err.Error()))
		return nil, ErrPlaygroundFileUploadFailed
	}
	written, copyErr := io.Copy(out, io.MultiReader(bytes.NewReader(head), io.LimitReader(src, PlaygroundFileMaxBytes+1-int64(n))))
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil || written > PlaygroundFileMaxBytes {
		_ = os.Remove(filePath)
		if written > PlaygroundFileMaxBytes {
			return nil, ErrPlaygroundFileTooLarge
		}
		if copyErr != nil {
			return nil, uploadReadError(copyErr)
		}
		return nil, ErrPlaygroundFileUploadFailed
	}

	info := PlaygroundFileInfo{
		ID:        id,
		Filename:  sanitizePlaygroundFilename(filename),
		MimeType:  mimeType,
		Size:      written,
		ExpiresAt: s.now().Add(PlaygroundFileTTL).Unix(),
	}
	s.mu.Lock()
	s.userBytes[userID] += written - reserved
	s.allBytes += written - reserved
	reserved = written
	s.files[id] = &playgroundFile{info: info, userID: userID, path: filePath}
	committed = true
	s.mu.Unlock()
	s.startSweeper()
	return &info, nil
}

func uploadReadError(err error) error {
	var maxBytesErr *http.MaxBytesError
	if errors.As(err, &maxBytesErr) {
		return ErrPlaygroundFileTooLarge
	}
	return ErrPlaygroundFileUploadFailed
}

func (s *playgroundFileStore) remove(userID int, id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	file, ok := s.files[id]
	if !ok || file.userID != userID {
		return
	}
	delete(s.files, id)
	s.release(userID, file.info.Size)
	_ = os.Remove(file.path)
}

// claim validates the whole batch and only then takes every file out of the
// pending index, so a rejected batch leaves all uploads usable.
func (s *playgroundFileStore) claim(userID int, ids []string) ([]*playgroundFile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweep()
	files := make([]*playgroundFile, 0, len(ids))
	var total int64
	for _, id := range ids {
		file, ok := s.files[id]
		if !ok || file.userID != userID {
			return nil, ErrPlaygroundFileUnavailable
		}
		total += file.info.Size
		files = append(files, file)
	}
	if total > PlaygroundMessageMaxBytes {
		return nil, ErrPlaygroundFileInvalid
	}
	for _, file := range files {
		delete(s.files, file.info.ID)
		s.release(userID, file.info.Size)
	}
	return files, nil
}

func sanitizePlaygroundFilename(name string) string {
	name = path.Base(strings.ReplaceAll(strings.ToValidUTF8(name, ""), `\`, "/"))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == "/" {
		return "attachment"
	}
	if utf8.RuneCountInString(name) > 255 {
		name = string([]rune(name)[:255])
	}
	return name
}

// SavePlaygroundFile stores one uploaded file for userID after sniffing its
// content type. The client-supplied name is display-only.
func SavePlaygroundFile(userID int, filename string, src io.Reader) (*PlaygroundFileInfo, error) {
	return playgroundFiles.save(userID, filename, src)
}

// DeletePlaygroundFile cancels a pending upload. Unknown, foreign, expired, or
// already used IDs are ignored so the call is idempotent.
func DeletePlaygroundFile(userID int, id string) {
	playgroundFiles.remove(userID, id)
}

// PlaygroundChatUsesExtras reports whether a chat body may reference
// playground files or request hosted web search.
func PlaygroundChatUsesExtras(body []byte) bool {
	return bytes.Contains(body, []byte(playgroundFilePartType)) || gjson.GetBytes(body, "web_search_options").Exists()
}

// ExpandPlaygroundChatFiles replaces playground_file references in the final
// user message with the stored bytes as standard Chat image_url / file parts
// and records what the outbound request must still carry. It returns the
// body unchanged when nothing needs replacing. release deletes the claimed
// files and is safe to call more than once.
func ExpandPlaygroundChatFiles(c *gin.Context, userID int, body []byte) (newBody []byte, release func(), err error) {
	release = func() {}
	if gjson.GetBytes(body, "web_search_options").Exists() {
		c.Set(playgroundWebSearchKey, true)
	}
	if !bytes.Contains(body, []byte(playgroundFilePartType)) {
		return body, release, nil
	}

	var request map[string]json.RawMessage
	if err := common.Unmarshal(body, &request); err != nil {
		return body, release, nil
	}
	var messages []json.RawMessage
	if err := common.Unmarshal(request["messages"], &messages); err != nil {
		return body, release, nil
	}

	var ids []string
	var target map[string]json.RawMessage
	var parts []json.RawMessage
	partIDs := map[int]string{}
	for i, raw := range messages {
		var message map[string]json.RawMessage
		if common.Unmarshal(raw, &message) != nil {
			continue
		}
		var content []json.RawMessage
		if common.Unmarshal(message["content"], &content) != nil {
			continue
		}
		for j, rawPart := range content {
			if gjson.GetBytes(rawPart, "type").String() != playgroundFilePartType {
				continue
			}
			id := gjson.GetBytes(rawPart, "playground_file.id").String()
			if i != len(messages)-1 || gjson.ParseBytes(message["role"]).String() != "user" ||
				!strings.HasPrefix(id, playgroundFileIDPrefix) || slices.Contains(ids, id) {
				return nil, release, ErrPlaygroundFileInvalid
			}
			ids = append(ids, id)
			partIDs[j] = id
			target, parts = message, content
		}
	}
	if len(ids) == 0 {
		return body, release, nil
	}
	if len(ids) > PlaygroundFilesPerMessage {
		return nil, release, ErrPlaygroundFileInvalid
	}

	files, err := playgroundFiles.claim(userID, ids)
	if err != nil {
		return nil, release, err
	}
	var once sync.Once
	release = func() {
		once.Do(func() {
			for _, file := range files {
				_ = os.Remove(file.path)
			}
		})
	}
	byID := make(map[string]*playgroundFile, len(files))
	for _, file := range files {
		byID[file.info.ID] = file
	}

	var probes [][]byte
	for j, id := range partIDs {
		file := byID[id]
		data, readErr := os.ReadFile(file.path)
		if readErr != nil {
			return nil, release, ErrPlaygroundFileUnavailable
		}
		encoded := base64.StdEncoding.EncodeToString(data)
		dataURL := "data:" + file.info.MimeType + ";base64," + encoded
		var part any
		if file.info.MimeType == "application/pdf" {
			part = map[string]any{"type": "file", "file": map[string]any{"filename": file.info.Filename, "file_data": dataURL}}
			probes = append(probes, []byte(encoded[:min(len(encoded), playgroundDeliveryProbeLen)]))
		} else {
			part = map[string]any{"type": "image_url", "image_url": map[string]any{"url": dataURL}}
		}
		if parts[j], err = common.Marshal(part); err != nil {
			return nil, release, err
		}
	}

	if target["content"], err = common.Marshal(parts); err != nil {
		return nil, release, err
	}
	if messages[len(messages)-1], err = common.Marshal(target); err != nil {
		return nil, release, err
	}
	if request["messages"], err = common.Marshal(messages); err != nil {
		return nil, release, err
	}
	if newBody, err = common.Marshal(request); err != nil {
		return nil, release, err
	}
	maxMB := constant.MaxRequestBodyMB
	if maxMB <= 0 {
		maxMB = 128
	}
	if int64(len(newBody)) > int64(maxMB)<<20 {
		return nil, release, fmt.Errorf("%w: request body exceeds %d MB", common.ErrRequestBodyTooLarge, maxMB)
	}
	c.Set(playgroundAttachmentsKey, true)
	if len(probes) > 0 {
		c.Set(playgroundDeliveryProbesKey, probes)
	}
	return newBody, release, nil
}

// PlaygroundRequestCarriesFiles reports that the request body holds raw
// playground attachments, which must stay out of debug logs.
func PlaygroundRequestCarriesFiles(c *gin.Context) bool {
	return c.GetBool(playgroundAttachmentsKey)
}

// VerifyPlaygroundDelivery checks the converted outbound body of a playground
// chat request. A PDF the selected path dropped, or a requested web search no
// upstream field carries, is rejected instead of being silently lost.
func VerifyPlaygroundDelivery(c *gin.Context, outbound []byte) *types.NewAPIError {
	if probes, ok := c.Get(playgroundDeliveryProbesKey); ok {
		for _, probe := range probes.([][]byte) {
			if !bytes.Contains(outbound, probe) {
				return types.NewErrorWithStatusCode(errors.New(i18n.T(c, i18n.MsgPlaygroundAttachmentUnsupported)),
					types.ErrorCode("playground_attachment_unsupported"), http.StatusBadRequest, types.ErrOptionWithSkipRetry())
			}
		}
	}
	if c.GetBool(playgroundWebSearchKey) && !hostedWebSearchRequested(outbound) {
		return types.NewErrorWithStatusCode(errors.New(i18n.T(c, i18n.MsgPlaygroundWebSearchUnsupported)),
			types.ErrorCode("playground_web_search_unsupported"), http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	return nil
}

// hostedWebSearchRequested recognizes the hosted search fields the relay
// encoders emit: Chat web_search_options, Responses/Claude/Zhipu web_search*
// tools, Gemini googleSearch tools, and Qwen enable_search.
func hostedWebSearchRequested(body []byte) bool {
	if gjson.GetBytes(body, "web_search_options").Exists() || gjson.GetBytes(body, "enable_search").Bool() {
		return true
	}
	found := false
	gjson.GetBytes(body, "tools").ForEach(func(_, tool gjson.Result) bool {
		if strings.HasPrefix(tool.Get("type").String(), "web_search") ||
			tool.Get("googleSearch").Exists() || tool.Get("google_search").Exists() || tool.Get("googleSearchRetrieval").Exists() {
			found = true
			return false
		}
		return true
	})
	return found
}
