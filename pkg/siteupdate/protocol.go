package siteupdate

const Repository = "atelier-of-dongn/YMeng-CC-New-API"
const ImageRepository = "ghcr.io/atelier-of-dongn/ymeng-cc-new-api"

type Status struct {
	Supported        bool           `json:"supported"`
	Reason           string         `json:"reason"`
	State            string         `json:"state"`
	CurrentVersion   string         `json:"current_version"`
	TargetVersion    string         `json:"target_version"`
	OperationID      string         `json:"operation_id"`
	Draining         bool           `json:"draining"`
	CleanupSupported bool           `json:"cleanup_supported"`
	CanUpdate        *bool          `json:"can_update,omitempty"`
	CanCleanup       bool           `json:"can_cleanup"`
	ReasonCode       string         `json:"reason_code,omitempty"`
	Cleanup          *CleanupStatus `json:"cleanup,omitempty"`
}

type CleanupStatus struct {
	CleanupID     string `json:"cleanup_id"`
	TargetName    string `json:"target_name"`
	Phase         string `json:"phase"`
	LastErrorCode string `json:"last_error_code,omitempty"`
}

type CleanupRequest struct {
	CleanupID string `json:"cleanup_id"`
}

type OperationError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *OperationError) Error() string { return e.Message }

type Release struct {
	Tag         string `json:"tag"`
	Name        string `json:"name"`
	PublishedAt string `json:"published_at"`
	URL         string `json:"url"`
	Compatible  bool   `json:"compatible"`
	Reason      string `json:"reason"`
	Image       string `json:"image"`
}

type ReleaseList struct {
	Releases []Release `json:"releases"`
}

type UpdateRequest struct {
	Tag string `json:"tag"`
}

// Compatibility is a maintainer-approved declaration, signed independently of
// the image. It must only be published after testing the listed version pairs.
type Compatibility struct {
	Version               string   `json:"version"`
	Image                 string   `json:"image"`
	FromVersions          []string `json:"from_versions"`
	SchemaUnchanged       bool     `json:"schema_unchanged"`
	SharedStateCompatible bool     `json:"shared_state_compatible"`
	Platforms             []string `json:"platforms"`
	Databases             []string `json:"databases"`
}
