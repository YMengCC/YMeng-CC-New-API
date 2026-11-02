package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxHAProxyMapSize = 1 << 20

// persistHAProxyMap makes the runtime selection survive a proxy restart.
func persistHAProxyMap(path, key, target string) error {
	if path == "" || key == "" || target == "" || strings.ContainsAny(path+key+target, "\r\n") {
		return fmt.Errorf("invalid HAProxy map persistence argument")
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return fmt.Errorf("HAProxy map must be a regular non-symlink file")
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	data, err := io.ReadAll(io.LimitReader(file, maxHAProxyMapSize+1))
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if len(data) > maxHAProxyMapSize {
		return fmt.Errorf("HAProxy map is too large")
	}
	updated, err := replaceHAProxyMapEntry(string(data), key, target)
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".haproxy-map-*")
	if err != nil {
		return err
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(info.Mode().Perm()); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := temporary.WriteString(updated); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryName, path)
}

func replaceHAProxyMapEntry(content, key, target string) (string, error) {
	lines := strings.Split(content, "\n")
	found := false
	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		fields := strings.Fields(trimmed)
		if len(fields) == 0 || fields[0] != key {
			continue
		}
		if found {
			return "", fmt.Errorf("HAProxy map contains duplicate key %q", key)
		}
		lines[index] = key + " " + target
		found = true
	}
	if found {
		return strings.Join(lines, "\n"), nil
	}
	if content != "" && !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	return content + key + " " + target + "\n", nil
}

func restoreHAProxyMap(ctx context.Context, u *controller) error {
	target := u.currentContainer()
	if u.activeRef != nil {
		target = u.activeRef.ID
	}
	active, err := u.engine.Inspect(ctx, target)
	if err != nil {
		return err
	}
	if !active.State.Running || active.Labels[managedLabel] != "true" {
		return fmt.Errorf("persisted active container is not running")
	}
	address, err := u.containerAddress(active)
	if u.activeRef != nil {
		address, err = addressOnNetwork(active, u.activeRef.NetworkID)
	}
	if err != nil {
		return err
	}
	life, err := u.lifecycle(ctx, address, "GET")
	if err != nil || life.Protocol != lifecycleProtocol || !life.Ready || life.Draining {
		return fmt.Errorf("persisted active container did not pass readiness")
	}
	if err := persistHAProxyMap(u.config.haproxyMap, u.config.haproxyMapKey, address.host); err != nil {
		return err
	}
	if err := u.proxy.Select(ctx, u.config.haproxyMap, u.config.haproxyMapKey, address.host); err != nil {
		return err
	}
	return u.verifyProxyTarget(ctx, address.host)
}

// proxyRuntime is shared by traffic switching and cleanup verification.
type proxyRuntime interface {
	Target(context.Context, string, string) (string, error)
	Select(context.Context, string, string, string) error
}

type haproxySocket struct{ path string }

func (s haproxySocket) Select(ctx context.Context, path, key, target string) error {
	return switchHAProxyMap(ctx, s.path, path, key, target)
}

func (s haproxySocket) Target(ctx context.Context, path, key string) (string, error) {
	if path == "" || key == "" || strings.ContainsAny(path+key, "\r\n \t") {
		return "", fmt.Errorf("invalid HAProxy map argument")
	}
	connection, err := (&net.Dialer{}).DialContext(ctx, "unix", s.path)
	if err != nil {
		return "", err
	}
	defer connection.Close()
	deadline := time.Now().Add(10 * time.Second)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = connection.SetDeadline(deadline)
	if _, err := io.WriteString(connection, "show map "+path+"\n"); err != nil {
		return "", err
	}
	data, err := io.ReadAll(io.LimitReader(connection, maxHAProxyMapSize+1))
	if err != nil || len(data) > maxHAProxyMapSize {
		return "", fmt.Errorf("cannot read runtime map")
	}
	return parseHAProxyTarget(string(data), key, true)
}

func parseHAProxyTarget(content, key string, runtime bool) (string, error) {
	target := ""
	for line := range strings.SplitSeq(content, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 || strings.HasPrefix(fields[0], "#") {
			continue
		}
		if runtime {
			if len(fields) != 3 {
				return "", fmt.Errorf("invalid runtime map row")
			}
			fields = fields[1:]
		}
		if fields[0] != key {
			continue
		}
		if len(fields) != 2 || target != "" {
			return "", fmt.Errorf("invalid or duplicate map key")
		}
		address, err := netip.ParseAddr(fields[1])
		if err != nil {
			return "", fmt.Errorf("invalid map target")
		}
		target = address.String()
	}
	if target == "" {
		return "", fmt.Errorf("map key missing")
	}
	return target, nil
}

func readHAProxyTarget(path, key string) (string, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() > maxHAProxyMapSize {
		return "", fmt.Errorf("invalid map file")
	}
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxHAProxyMapSize+1))
	if err != nil || len(data) > maxHAProxyMapSize {
		return "", fmt.Errorf("cannot read map file")
	}
	return parseHAProxyTarget(string(data), key, false)
}

func (u *controller) verifyProxyTarget(ctx context.Context, target string) error {
	disk, err := readHAProxyTarget(u.config.haproxyMap, u.config.haproxyMapKey)
	if err != nil || disk != target {
		return fmt.Errorf("persisted proxy route mismatch")
	}
	runtime, err := u.proxy.Target(ctx, u.config.haproxyMap, u.config.haproxyMapKey)
	if err != nil || runtime != target {
		return fmt.Errorf("runtime proxy route mismatch")
	}
	return nil
}
