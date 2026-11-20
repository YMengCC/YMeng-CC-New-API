//go:build !windows

package local

// NewAutostart reports no support outside Windows; the panel hides the toggle.
func NewAutostart() Autostart { return unsupportedAutostart{} }
