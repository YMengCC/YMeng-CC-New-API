package service

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/siteupdate"
)

const (
	systemReleaseFeedTTL        = 10 * time.Minute
	systemReleaseFeedFailureTTL = time.Minute
	maxSystemReleaseFeedSize    = 4 << 20
)

// PublishedSystemRelease contains only public release metadata. Installation
// compatibility remains a separate controller-owned decision.
type PublishedSystemRelease struct {
	TagName     string  `json:"tag_name"`
	Name        string  `json:"name"`
	Body        string  `json:"body"`
	PublishedAt *string `json:"published_at"`
	Prerelease  bool    `json:"prerelease"`
}

type SystemReleaseFeed struct {
	Source        string                   `json:"source"`
	Releases      []PublishedSystemRelease `json:"releases"`
	LastCheckedAt int64                    `json:"last_checked_at"`
	LastAttemptAt int64                    `json:"last_attempt_at"`
	Error         *string                  `json:"error"`
}

type ReleaseFeedError struct{ Code string }

func (e *ReleaseFeedError) Error() string {
	switch e.Code {
	case "rate-limit":
		return "GitHub rate limit reached. Try again later."
	case "timeout":
		return "Update check timed out. Try again."
	case "payload":
		return "Unexpected release payload"
	default:
		return "Failed to check for updates"
	}
}

type systemReleaseFeedCache struct {
	sync.Mutex
	feed       SystemReleaseFeed
	hasSuccess bool
	expiresAt  time.Time
	inFlight   chan struct{}
}

var publishedSystemReleases systemReleaseFeedCache
var systemReleaseVersion = regexp.MustCompile(`^v?(\d+(?:\.\d+){2,})(?:-(alpha|beta|rc|patch)(?:\.(\d+))?(?:-i18nfix\.(\d+))?)?(?:\+[\da-zA-Z.-]+)?$`)

func GetSystemReleaseFeed(ctx context.Context) (SystemReleaseFeed, error) {
	return publishedSystemReleases.get(ctx, GetHttpClient(), time.Now)
}

func (cache *systemReleaseFeedCache) get(ctx context.Context, client *http.Client, now func() time.Time) (SystemReleaseFeed, error) {
	for {
		if err := ctx.Err(); err != nil {
			return SystemReleaseFeed{}, err
		}
		cache.Lock()
		if !cache.expiresAt.IsZero() && now().Before(cache.expiresAt) {
			feed, err := cache.resultLocked()
			cache.Unlock()
			return feed, err
		}
		if cache.inFlight != nil {
			pending := cache.inFlight
			cache.Unlock()
			select {
			case <-ctx.Done():
				return SystemReleaseFeed{}, ctx.Err()
			case <-pending:
				continue
			}
		}
		cache.inFlight = make(chan struct{})
		cache.Unlock()

		releases, err := fetchSystemReleaseFeed(ctx, client)
		completedAt := now()
		cache.Lock()
		if ctx.Err() == nil {
			cache.feed.Source = siteupdate.Repository
			cache.feed.LastAttemptAt = completedAt.UnixMilli()
			if err == nil {
				cache.feed.Releases = releases
				cache.feed.LastCheckedAt = completedAt.UnixMilli()
				cache.feed.Error = nil
				cache.hasSuccess = true
				cache.expiresAt = completedAt.Add(systemReleaseFeedTTL)
			} else {
				code := "network"
				var failure *ReleaseFeedError
				if errors.As(err, &failure) {
					code = failure.Code
				}
				cache.feed.Error = &code
				cache.expiresAt = completedAt.Add(systemReleaseFeedFailureTTL)
			}
		}
		close(cache.inFlight)
		cache.inFlight = nil
		feed, resultErr := cache.resultLocked()
		cache.Unlock()
		if ctx.Err() != nil {
			return SystemReleaseFeed{}, ctx.Err()
		}
		return feed, resultErr
	}
}

func (cache *systemReleaseFeedCache) resultLocked() (SystemReleaseFeed, error) {
	feed := cache.feed
	feed.Source = siteupdate.Repository
	feed.Releases = append(make([]PublishedSystemRelease, 0, len(feed.Releases)), feed.Releases...)
	if feed.Error != nil {
		code := *feed.Error
		feed.Error = &code
		if !cache.hasSuccess {
			return feed, &ReleaseFeedError{Code: code}
		}
	}
	return feed, nil
}

func fetchSystemReleaseFeed(ctx context.Context, client *http.Client) ([]PublishedSystemRelease, error) {
	if client == nil {
		return nil, &ReleaseFeedError{Code: "network"}
	}
	requestContext, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestContext, http.MethodGet, "https://api.github.com/repos/"+siteupdate.Repository+"/releases?per_page=100", nil)
	if err != nil {
		return nil, &ReleaseFeedError{Code: "network"}
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "new-api")
	response, err := client.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(requestContext.Err(), context.DeadlineExceeded) {
			return nil, &ReleaseFeedError{Code: "timeout"}
		}
		var timeout interface{ Timeout() bool }
		if errors.As(err, &timeout) && timeout.Timeout() {
			return nil, &ReleaseFeedError{Code: "timeout"}
		}
		return nil, &ReleaseFeedError{Code: "network"}
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusForbidden || response.StatusCode == http.StatusTooManyRequests {
		return nil, &ReleaseFeedError{Code: "rate-limit"}
	}
	if response.StatusCode != http.StatusOK {
		return nil, &ReleaseFeedError{Code: "network"}
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxSystemReleaseFeedSize+1))
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if errors.Is(requestContext.Err(), context.DeadlineExceeded) {
		return nil, &ReleaseFeedError{Code: "timeout"}
	}
	if err != nil {
		return nil, &ReleaseFeedError{Code: "network"}
	}
	if len(data) > maxSystemReleaseFeedSize || common.GetJsonType(data) != "array" {
		return nil, &ReleaseFeedError{Code: "payload"}
	}
	var items []json.RawMessage
	if common.Unmarshal(data, &items) != nil {
		return nil, &ReleaseFeedError{Code: "payload"}
	}
	releases := make([]PublishedSystemRelease, 0, len(items))
	seen := make(map[string]bool, len(items))
	validPayload := len(items) == 0
	for _, raw := range items {
		var item struct {
			TagName     *string `json:"tag_name"`
			Name        *string `json:"name"`
			Body        *string `json:"body"`
			PublishedAt *string `json:"published_at"`
			Draft       *bool   `json:"draft"`
			Prerelease  *bool   `json:"prerelease"`
		}
		if common.Unmarshal(raw, &item) != nil || item.TagName == nil || item.Draft == nil || item.Prerelease == nil {
			continue
		}
		tag := strings.TrimSpace(*item.TagName)
		if tag == "" {
			continue
		}
		if item.PublishedAt != nil {
			if _, err := time.Parse(time.RFC3339Nano, *item.PublishedAt); err != nil {
				continue
			}
		}
		validPayload = true
		match := systemReleaseVersion.FindStringSubmatch(tag)
		if *item.Draft || match == nil || (match[4] != "" && match[2] != "rc") || strings.Trim(match[1], "0.") == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		release := PublishedSystemRelease{TagName: tag, PublishedAt: item.PublishedAt, Prerelease: *item.Prerelease}
		if item.Name != nil {
			release.Name = *item.Name
		}
		if item.Body != nil {
			release.Body = *item.Body
		}
		releases = append(releases, release)
	}
	if !validPayload {
		return nil, &ReleaseFeedError{Code: "payload"}
	}
	return releases, nil
}
