// Package textmask provides request-local, reversible text privacy masking.
// It deliberately supports only explicit text-only protocol shapes.
package textmask

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

var (
	ErrUnsupported = errors.New("text masking: unsupported or malformed content")
	ErrIncomplete  = errors.New("text masking: incomplete masked stream")
	ErrClosed      = errors.New("text masking: session closed")
	entityPattern  = regexp.MustCompile("(?s:-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----)|(?:sk-[A-Za-z0-9_-]{16,}|(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,})|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+|[1-9][0-9]{16}[0-9Xx]|1[3-9][0-9]{9}|(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")
)

// Marker starts every placeholder of one masking layer. The gateway and the
// local safe house use different markers, so a request masked on the user's
// machine can still pass through gateway masking without being mistaken for a
// forged placeholder, and each layer restores only its own tokens.
type Marker string

const (
	GatewayMarker Marker = "[[TM:"
	LocalMarker   Marker = "[[TL:"
)

// Transport limits shared by the gateway middleware and the local proxy.
const (
	MaxRequestBytes  = 8 << 20
	MaxResponseBytes = 16 << 20
	MaxEventBytes    = 1 << 20
)

const (
	maxMaskedEntities      = 4096
	maxSensitiveValueBytes = 64 << 10
	maxRestoredTextBytes   = 16 << 20
)

// Session must be shared by retries of one request, never between requests.
// Methods are safe for concurrent use; Close releases its sensitive mappings.
type Session struct {
	mu            sync.Mutex
	marker        string
	prefix        string
	forward       map[string]string
	reverse       map[string]string
	pending       map[string]string
	closed        bool
	incomplete    bool
	restoreBudget int
}

// New starts a gateway-layer session.
func New() (*Session, error) { return NewWithMarker(GatewayMarker) }

func NewWithMarker(marker Marker) (*Session, error) {
	if marker != GatewayMarker && marker != LocalMarker {
		return nil, errors.New("text masking: unknown marker")
	}
	var namespace [16]byte
	if _, err := rand.Read(namespace[:]); err != nil {
		return nil, errors.New("text masking: namespace generation failed")
	}
	return &Session{marker: string(marker), prefix: string(marker) + hex.EncodeToString(namespace[:]) + ":", forward: make(map[string]string), reverse: make(map[string]string), pending: make(map[string]string)}, nil
}

// MaskText masks free text with the same detector used for request bodies.
func (s *Session) MaskText(text string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return "", ErrClosed
	}
	return s.maskText(text)
}

// MaskedCount reports how many distinct values this session replaced.
func (s *Session) MaskedCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.forward)
}

func (s *Session) maskText(text string) (string, error) {
	if strings.Contains(text, s.marker) {
		return "", ErrUnsupported
	}
	// Incomplete PEM blocks must not evade masking or be forwarded in fragments.
	remainder := entityPattern.ReplaceAllStringFunc(text, func(match string) string {
		if strings.Contains(match, "PRIVATE KEY-----") {
			return ""
		}
		return match
	})
	if strings.Contains(remainder, "PRIVATE KEY-----") {
		return "", ErrUnsupported
	}
	matches := entityPattern.FindAllStringIndex(text, -1)
	var out strings.Builder
	last := 0
	for _, span := range matches {
		start, end := span[0], span[1]
		value := text[start:end]
		if !validEntity(text, start, end) {
			if strings.HasPrefix(value, "-----BEGIN ") {
				return "", ErrUnsupported
			}
			continue
		}
		token, found := s.forward[value]
		if !found {
			if len(s.forward) >= maxMaskedEntities || len(value) > maxSensitiveValueBytes {
				return "", ErrUnsupported
			}
			token = s.prefix + strconv.Itoa(len(s.forward)+1) + "]]"
			s.forward[value], s.reverse[token] = token, value
		}
		out.WriteString(text[last:start])
		out.WriteString(token)
		last = end
	}
	out.WriteString(text[last:])
	return out.String(), nil
}

func validEntity(text string, start, end int) bool {
	value := text[start:end]
	if strings.HasPrefix(value, "-----BEGIN ") {
		first, _, _ := strings.Cut(value, "-----\n")
		if first == value {
			first, _, _ = strings.Cut(value, "-----\r\n")
		}
		label := strings.TrimPrefix(first, "-----BEGIN ")
		return strings.HasSuffix(value, "-----END "+label+"-----")
	}
	if start > 0 {
		r, _ := utf8.DecodeLastRuneInString(text[:start])
		if (r <= unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r))) || r == '_' || r == '@' || r == '.' {
			return false
		}
	}
	if end < len(text) {
		r, _ := utf8.DecodeRuneInString(text[end:])
		if (r <= unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r))) || r == '_' || r == '@' {
			return false
		}
		// A full stop can terminate a sentence, but not extend an IP/domain.
		if r == '.' && end+1 < len(text) {
			next, _ := utf8.DecodeRuneInString(text[end+1:])
			if next <= unicode.MaxASCII && (unicode.IsLetter(next) || unicode.IsDigit(next)) {
				return false
			}
		}
	}
	if strings.Contains(value, "@") {
		return true
	}
	if strings.HasPrefix(value, "sk-") || strings.HasPrefix(value, "ghp_") || strings.HasPrefix(value, "gho_") || strings.HasPrefix(value, "github_pat_") || strings.HasPrefix(value, "xox") || strings.HasPrefix(value, "AKIA") || strings.HasPrefix(value, "eyJ") {
		return true
	}
	if strings.Contains(value, ".") {
		return net.ParseIP(value) != nil
	}
	if len(value) == 11 {
		return true
	}
	if len(value) != 18 || value[:6] == "000000" || value[14:17] == "000" {
		return false
	}
	if _, err := time.Parse("20060102", value[6:14]); err != nil {
		return false
	}
	weights := [...]int{7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2}
	sum := 0
	for i, weight := range weights {
		sum += int(value[i]-'0') * weight
	}
	return strings.EqualFold(value[17:], string("10X98765432"[sum%11]))
}

func (s *Session) restoreText(text string) string {
	// Bound expansion: a short token can represent a much larger private key.
	var out strings.Builder
	for {
		at := strings.Index(text, s.prefix)
		if at < 0 {
			if out.Len()+len(text) > s.restoreBudget {
				s.incomplete = true
				return ""
			}
			out.WriteString(text)
			break
		}
		if out.Len()+at > s.restoreBudget {
			s.incomplete = true
			return ""
		}
		out.WriteString(text[:at])
		text = text[at:]
		end := strings.Index(text, "]]")
		if end < 0 {
			s.incomplete = true
			return ""
		}
		token := text[:end+2]
		replacement, ok := s.reverse[token]
		if !ok {
			s.incomplete = true
			return ""
		}
		if out.Len()+len(replacement) > s.restoreBudget {
			s.incomplete = true
			return ""
		}
		out.WriteString(replacement)
		text = text[end+2:]
	}
	s.restoreBudget -= out.Len()
	return out.String()
}

func (s *Session) RestoreText(text string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return text
	}
	s.restoreBudget = maxRestoredTextBytes
	return s.restoreText(text)
}

// RestoreDelta requires a distinct key for each logical choice/item/content lane.
// Call Finish before reporting successful stream completion.
func (s *Session) RestoreDelta(key, text string, final bool) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return text
	}
	s.restoreBudget = maxRestoredTextBytes
	return s.restoreDelta(key, text, final)
}

func (s *Session) restoreDelta(key, text string, final bool) string {
	text = s.pending[key] + text
	delete(s.pending, key)
	hold := len(text)
	// The random namespace is shared by all tokens in this request. Checking
	// its suffix once avoids scanning every sensitive value for each delta.
	if len(s.reverse) > 0 {
		for n := min(len(text), len(s.prefix)); n > 0; n-- {
			if strings.HasSuffix(text, s.prefix[:n]) {
				hold = len(text) - n
				break
			}
		}
		if at := strings.LastIndex(text, s.prefix); at >= 0 && !strings.Contains(text[at:], "]]") {
			hold = min(hold, at)
			if len(text)-at > len(s.prefix)+16 {
				s.incomplete = true
			}
		}
	}
	if hold < len(text) {
		if len(s.pending) >= maxMaskedEntities {
			s.incomplete = true
			return ""
		}
		suffix := text[hold:]
		if final {
			if strings.HasPrefix(suffix, s.marker) || strings.HasPrefix(suffix, s.prefix) {
				s.incomplete = true
				s.pending[key] = suffix
			} else {
				hold = len(text)
			}
		} else {
			s.pending[key] = suffix
		}
	}
	return s.restoreText(text[:hold])
}

func (s *Session) finish() error {
	if s.closed {
		return ErrClosed
	}
	if s.incomplete || len(s.pending) != 0 {
		return ErrIncomplete
	}
	return nil
}

// Finish fails closed on incomplete placeholders at EOF or protocol termination.
func (s *Session) Finish() error { s.mu.Lock(); defer s.mu.Unlock(); return s.finish() }

func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	clear(s.forward)
	clear(s.reverse)
	clear(s.pending)
	s.prefix = ""
	s.closed = true
}
