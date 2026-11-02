package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/siteupdate"
)

type SystemUpdateControllerError struct {
	StatusCode int
	Code       string
	Message    string
}

func (e *SystemUpdateControllerError) Error() string {
	return e.Message
}

func SystemUpdateRequest(ctx context.Context, method, endpoint string, payload any, result any) error {
	base := strings.TrimRight(os.Getenv("UPDATE_CONTROLLER_URL"), "/")
	token := os.Getenv("UPDATE_CONTROL_TOKEN")
	if base == "" || len(token) < 32 {
		return fmt.Errorf("managed update controller is not configured")
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil {
		return fmt.Errorf("invalid update controller configuration")
	}
	var data []byte
	if payload != nil {
		data, err = common.Marshal(payload)
		if err != nil {
			return err
		}
	}
	request, err := http.NewRequestWithContext(ctx, method, base+endpoint, bytes.NewReader(data))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("update controller is unavailable")
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("cannot read update controller response")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		if endpoint == "/v1/cleanup" {
			var rejection siteupdate.OperationError
			if common.Unmarshal(body, &rejection) == nil {
				messages := map[string]string{
					"cleanup_conflict":           "Cleanup no longer matches the retained instance. Refresh the update status and try again.",
					"cleanup_unavailable":        "The retained instance cannot be cleaned up safely. Check the update status before retrying.",
					"cleanup_invalid_request":    "Invalid retained instance cleanup request.",
					"cleanup_persistence_failed": "Cleanup state could not be saved. Installation remains blocked until recovery succeeds.",
					"cleanup_not_supported":      "This update controller does not support retained instance cleanup. Update the controller first.",
				}
				if message, ok := messages[rejection.Code]; ok {
					status := http.StatusConflict
					if rejection.Code == "cleanup_invalid_request" {
						status = http.StatusBadRequest
					} else if rejection.Code == "cleanup_unavailable" || rejection.Code == "cleanup_persistence_failed" || rejection.Code == "cleanup_not_supported" {
						status = http.StatusServiceUnavailable
					}
					return &SystemUpdateControllerError{StatusCode: status, Code: rejection.Code, Message: message}
				}
			}
			if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusMethodNotAllowed {
				return &SystemUpdateControllerError{StatusCode: http.StatusServiceUnavailable, Code: "cleanup_not_supported", Message: "This update controller does not support retained instance cleanup. Update the controller first."}
			}
			return &SystemUpdateControllerError{StatusCode: http.StatusServiceUnavailable, Code: "cleanup_unavailable", Message: "The retained instance cannot be cleaned up safely. Check the update status before retrying."}
		}
		return fmt.Errorf("update controller rejected the operation (HTTP %d)", response.StatusCode)
	}
	return common.Unmarshal(body, result)
}

func SystemUpdateStatus(ctx context.Context) (siteupdate.Status, error) {
	status := siteupdate.Status{State: "unconfigured", Reason: "Connect the managed update controller before installing releases."}
	if os.Getenv("UPDATE_CONTROLLER_URL") == "" {
		return status, nil
	}
	err := SystemUpdateRequest(ctx, http.MethodGet, "/v1/status", nil, &status)
	return status, err
}
