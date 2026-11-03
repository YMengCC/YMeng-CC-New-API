package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/siteupdate"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type releaseFeedTransport func(*http.Request) (*http.Response, error)

func (f releaseFeedTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func releaseFeedResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}

func TestReleaseFeedUsesCanonicalPublicRepositoryAndFiltersPayload(t *testing.T) {
	var requests int
	client := &http.Client{Transport: releaseFeedTransport(func(r *http.Request) (*http.Response, error) {
		requests++
		assert.Equal(t, "https://api.github.com/repos/"+siteupdate.Repository+"/releases?per_page=100", r.URL.String())
		assert.Equal(t, "application/vnd.github+json", r.Header.Get("Accept"))
		assert.Empty(t, r.Header.Get("Authorization"))
		assert.Empty(t, r.Header.Get("Cookie"))
		_, bounded := r.Context().Deadline()
		assert.True(t, bounded)
		return releaseFeedResponse(200, `[
			{"tag_name":" v1.2.2 ","draft":false,"prerelease":false,"name":"Release","body":"Branch notes","published_at":"2026-11-03T01:00:00Z","image":"private-image"},
			{"tag_name":"v1.2.3-rc.1","draft":false,"prerelease":true},
			{"tag_name":"v1.2.2","draft":false,"prerelease":false,"body":"duplicate"},
			{"tag_name":"v9.0.0","draft":true,"prerelease":false},
			{"tag_name":"nightly","draft":false,"prerelease":true},
			{"tag_name":"v0.0.0","draft":false,"prerelease":false},
			{"tag_name":42},
			{"tag_name":"v1.2.1","draft":false,"prerelease":false,"published_at":"bad-date"}
		]`), nil
	})}
	cache := systemReleaseFeedCache{}
	now := time.Date(2026, 11, 3, 1, 0, 0, 0, time.UTC)
	feed, err := cache.get(context.Background(), client, func() time.Time { return now })
	require.NoError(t, err)
	assert.Equal(t, siteupdate.Repository, feed.Source)
	require.Len(t, feed.Releases, 2)
	assert.Equal(t, "v1.2.2", feed.Releases[0].TagName)
	assert.Equal(t, "Branch notes", feed.Releases[0].Body)
	assert.True(t, feed.Releases[1].Prerelease)
	assert.Equal(t, now.UnixMilli(), feed.LastCheckedAt)
	assert.Equal(t, feed.LastCheckedAt, feed.LastAttemptAt)
	assert.Nil(t, feed.Error)
	serialized, err := common.Marshal(feed)
	require.NoError(t, err)
	assert.NotContains(t, string(serialized), "private-image")
	assert.NotContains(t, string(serialized), "compatible")
	assert.Equal(t, 1, requests)
}

func TestReleaseFeedCachesSuccessAndEmptyResultsUntilTTL(t *testing.T) {
	for _, body := range []string{`[]`, `[{"tag_name":"v2.0.0","draft":true,"prerelease":false}]`, `[{"tag_name":"v1.2.2","draft":false,"prerelease":false}]`} {
		t.Run(body, func(t *testing.T) {
			requests := 0
			client := &http.Client{Transport: releaseFeedTransport(func(*http.Request) (*http.Response, error) {
				requests++
				return releaseFeedResponse(200, body), nil
			})}
			cache := systemReleaseFeedCache{}
			now := time.Unix(1000, 0)
			clock := func() time.Time { return now }
			first, err := cache.get(context.Background(), client, clock)
			require.NoError(t, err)
			now = now.Add(10*time.Minute - time.Millisecond)
			cached, err := cache.get(context.Background(), client, clock)
			require.NoError(t, err)
			assert.Equal(t, first, cached)
			assert.Equal(t, 1, requests)
			now = now.Add(time.Millisecond)
			_, err = cache.get(context.Background(), client, clock)
			require.NoError(t, err)
			assert.Equal(t, 2, requests)
			assert.NotNil(t, cached.Releases)
		})
	}
}

func TestReleaseFeedColdFailuresClassifyAndBackOff(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   string
		err    error
		code   string
	}{
		{"rate limit", 403, `{}`, nil, "rate-limit"},
		{"too many requests", 429, `{}`, nil, "rate-limit"},
		{"server failure", 500, `{}`, nil, "network"},
		{"network", 0, "", errors.New("offline"), "network"},
		{"timeout", 0, "", context.DeadlineExceeded, "timeout"},
		{"wrong shape", 200, `{}`, nil, "payload"},
		{"null", 200, `null`, nil, "payload"},
		{"malformed entries", 200, `[{"tag_name":42}]`, nil, "payload"},
		{"oversize", 200, strings.Repeat(" ", 4<<20+1), nil, "payload"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			requests := 0
			client := &http.Client{Transport: releaseFeedTransport(func(*http.Request) (*http.Response, error) {
				requests++
				if tc.err != nil {
					return nil, tc.err
				}
				return releaseFeedResponse(tc.status, tc.body), nil
			})}
			cache := systemReleaseFeedCache{}
			now := time.Unix(1000, 0)
			clock := func() time.Time { return now }
			feed, err := cache.get(context.Background(), client, clock)
			require.Error(t, err)
			require.NotNil(t, feed.Error)
			assert.Equal(t, tc.code, *feed.Error)
			assert.Zero(t, feed.LastCheckedAt)
			assert.Empty(t, feed.Releases)
			now = now.Add(59 * time.Second)
			cached, err := cache.get(context.Background(), client, clock)
			require.Error(t, err)
			assert.Equal(t, feed, cached)
			assert.Equal(t, 1, requests)
			now = now.Add(time.Second)
			_, err = cache.get(context.Background(), client, clock)
			require.Error(t, err)
			assert.Equal(t, 2, requests)
		})
	}
}

func TestReleaseFeedFailureRetainsSuccessIncludingEmptyList(t *testing.T) {
	for _, body := range []string{`[]`, `[{"tag_name":"v1.2.2","draft":false,"prerelease":false}]`} {
		t.Run(body, func(t *testing.T) {
			requests := 0
			client := &http.Client{Transport: releaseFeedTransport(func(*http.Request) (*http.Response, error) {
				requests++
				if requests > 1 {
					return releaseFeedResponse(429, `{}`), nil
				}
				return releaseFeedResponse(200, body), nil
			})}
			cache := systemReleaseFeedCache{}
			now := time.Unix(1000, 0)
			clock := func() time.Time { return now }
			first, err := cache.get(context.Background(), client, clock)
			require.NoError(t, err)
			now = now.Add(10 * time.Minute)
			stale, err := cache.get(context.Background(), client, clock)
			require.NoError(t, err)
			assert.Equal(t, first.Releases, stale.Releases)
			assert.Equal(t, first.LastCheckedAt, stale.LastCheckedAt)
			assert.Equal(t, now.UnixMilli(), stale.LastAttemptAt)
			require.NotNil(t, stale.Error)
			assert.Equal(t, "rate-limit", *stale.Error)
		})
	}
}

func TestReleaseFeedConcurrentConsumersShareOneRequest(t *testing.T) {
	var requests atomic.Int32
	entered := make(chan struct{})
	release := make(chan struct{})
	client := &http.Client{Transport: releaseFeedTransport(func(*http.Request) (*http.Response, error) {
		requests.Add(1)
		close(entered)
		<-release
		return releaseFeedResponse(200, `[]`), nil
	})}
	cache := systemReleaseFeedCache{}
	now := time.Unix(1000, 0)
	var group sync.WaitGroup
	for range 4 {
		group.Go(func() {
			feed, err := cache.get(context.Background(), client, func() time.Time { return now })
			assert.NoError(t, err)
			assert.NotNil(t, feed.Releases)
		})
	}
	<-entered
	close(release)
	group.Wait()
	assert.EqualValues(t, 1, requests.Load())
}

func TestReleaseFeedTTLStartsAfterTheRequestCompletes(t *testing.T) {
	now := time.Unix(1000, 0)
	requests := 0
	client := &http.Client{Transport: releaseFeedTransport(func(*http.Request) (*http.Response, error) {
		requests++
		now = now.Add(9 * time.Second)
		return releaseFeedResponse(200, `[]`), nil
	})}
	cache := systemReleaseFeedCache{}
	clock := func() time.Time { return now }
	feed, err := cache.get(context.Background(), client, clock)
	require.NoError(t, err)
	assert.Equal(t, time.Unix(1009, 0).UnixMilli(), feed.LastAttemptAt)
	now = now.Add(10*time.Minute - time.Millisecond)
	_, err = cache.get(context.Background(), client, clock)
	require.NoError(t, err)
	assert.Equal(t, 1, requests)
}

func TestReleaseFeedCancelledWaiterDoesNotCancelSharedFetch(t *testing.T) {
	entered := make(chan struct{})
	finish := make(chan struct{})
	completed := make(chan error, 1)
	client := &http.Client{Transport: releaseFeedTransport(func(*http.Request) (*http.Response, error) {
		close(entered)
		<-finish
		return releaseFeedResponse(200, `[]`), nil
	})}
	cache := systemReleaseFeedCache{}
	clock := func() time.Time { return time.Unix(1000, 0) }
	go func() { _, err := cache.get(context.Background(), client, clock); completed <- err }()
	<-entered
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := cache.get(ctx, client, clock)
	require.ErrorIs(t, err, context.Canceled)
	close(finish)
	require.NoError(t, <-completed)
	feed, err := cache.get(context.Background(), client, clock)
	require.NoError(t, err)
	assert.Nil(t, feed.Error)
}

func TestReleaseFeedCancellationDoesNotReplaceSuccessOrStartCooldown(t *testing.T) {
	requests := 0
	ctx, cancel := context.WithCancel(context.Background())
	client := &http.Client{Transport: releaseFeedTransport(func(r *http.Request) (*http.Response, error) {
		requests++
		if requests == 2 {
			cancel()
			return nil, r.Context().Err()
		}
		return releaseFeedResponse(200, `[]`), nil
	})}
	cache := systemReleaseFeedCache{}
	now := time.Unix(1000, 0)
	clock := func() time.Time { return now }
	first, err := cache.get(context.Background(), client, clock)
	require.NoError(t, err)
	now = now.Add(10 * time.Minute)
	_, err = cache.get(ctx, client, clock)
	require.ErrorIs(t, err, context.Canceled)
	final, err := cache.get(context.Background(), client, clock)
	require.NoError(t, err)
	assert.Nil(t, final.Error)
	assert.Greater(t, final.LastCheckedAt, first.LastCheckedAt)
	assert.Equal(t, 3, requests)
}
