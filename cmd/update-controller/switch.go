package main

import (
	"context"
	"fmt"
	"net/http"
	"net/netip"
)

func addressOnNetwork(container dockerContainer, networkID string) (containerAddressInfo, error) {
	for _, endpoint := range container.NetworkSettings.Networks {
		if endpoint.NetworkID != networkID {
			continue
		}
		ip, err := netip.ParseAddr(endpoint.IPAddress)
		if err != nil {
			return containerAddressInfo{}, fmt.Errorf("invalid container address")
		}
		return containerAddressInfo{host: ip.String()}, nil
	}
	return containerAddressInfo{}, fmt.Errorf("container is not on the bound network")
}

func (u *controller) sharedContainerRefs(active, old dockerContainer) (containerRef, containerRef, error) {
	if !validHexID(active.ID, 64) || !validHexID(old.ID, 64) || active.ID == old.ID {
		return containerRef{}, containerRef{}, fmt.Errorf("invalid container identity")
	}
	networkID := ""
	for name, endpoint := range active.NetworkSettings.Networks {
		if endpoint.NetworkID == "" || (u.config.dockerNetwork != "" && name != u.config.dockerNetwork && endpoint.NetworkID != u.config.dockerNetwork) {
			continue
		}
		if _, err := addressOnNetwork(active, endpoint.NetworkID); err != nil {
			continue
		}
		if _, err := addressOnNetwork(old, endpoint.NetworkID); err != nil {
			continue
		}
		if networkID != "" && networkID != endpoint.NetworkID {
			return containerRef{}, containerRef{}, fmt.Errorf("shared network is ambiguous")
		}
		networkID = endpoint.NetworkID
	}
	if networkID == "" {
		return containerRef{}, containerRef{}, fmt.Errorf("no shared network")
	}
	return containerRef{ID: active.ID, Name: active.Name, NetworkID: networkID}, containerRef{ID: old.ID, Name: old.Name, NetworkID: networkID}, nil
}

// A durable intent must exist before HAProxy can possibly change its route.
func (u *controller) prepareSwitch(from, to containerRef, version string) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	state := u.persistedLocked()
	state.ActiveRef = &from
	state.SwitchIntent = &switchIntent{From: from, To: to, TargetVersion: version}
	if err := u.store.save(state); err != nil {
		u.persistenceFailed = true
		return err
	}
	u.activeRef, u.switchIntent = &from, state.SwitchIntent
	u.persistenceFailed = false
	return nil
}

func (u *controller) commitSwitch() error {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.switchIntent == nil {
		return fmt.Errorf("missing switch intent")
	}
	intent := *u.switchIntent
	id, err := newOperationID()
	if err != nil {
		return err
	}
	state := u.persistedLocked()
	state.ActiveContainer = intent.To.Name
	state.ActiveRef = &intent.To
	state.DrainingContainer = intent.From.Name
	state.Cleanup = &cleanupRecord{CleanupID: id, Active: intent.To, Old: intent.From, Phase: cleanupRetained}
	state.SwitchIntent = nil
	state.Status.State = "draining"
	state.Status.ReasonCode = ""
	state.Status.Draining = true
	state.Status.TargetVersion = intent.TargetVersion
	state.Status.Reason = "Traffic switched to the verified candidate; waiting for the previous container to drain."
	if err := u.store.save(state); err != nil {
		u.persistenceFailed = true
		return err
	}
	u.active, u.activeRef, u.drainingContainer, u.cleanup, u.switchIntent, u.status = state.ActiveContainer, state.ActiveRef, state.DrainingContainer, state.Cleanup, nil, state.Status
	u.persistenceFailed = false
	return nil
}

// Reconcile the observed runtime route before ever restoring a persisted one.
// An unknown response must never lead to deleting a possibly active candidate.
func (u *controller) reconcileSwitch(ctx context.Context) error {
	intent := u.switchIntent
	if intent == nil {
		return nil
	}
	from, err := u.engine.Inspect(ctx, intent.From.ID)
	if err != nil {
		return err
	}
	to, err := u.engine.Inspect(ctx, intent.To.ID)
	if err != nil {
		return err
	}
	if from.ID != intent.From.ID || to.ID != intent.To.ID || to.Labels[managedLabel] != "true" || from.Labels[managedLabel] != "true" {
		return fmt.Errorf("invalid switch identities")
	}
	fromAddress, err := addressOnNetwork(from, intent.From.NetworkID)
	if err != nil {
		return err
	}
	toAddress, err := addressOnNetwork(to, intent.To.NetworkID)
	if err != nil {
		return err
	}
	runtime, err := u.proxy.Target(ctx, u.config.haproxyMap, u.config.haproxyMapKey)
	if err != nil {
		return err
	}
	switch runtime {
	case toAddress.host:
		life, err := u.lifecycle(ctx, toAddress, http.MethodGet)
		if err != nil || !to.State.Running || life.Protocol != lifecycleProtocol || !life.Ready || life.Draining {
			return fmt.Errorf("candidate readiness is not proven")
		}
		if err := persistHAProxyMap(u.config.haproxyMap, u.config.haproxyMapKey, toAddress.host); err != nil {
			return err
		}
		if err := u.verifyProxyTarget(ctx, toAddress.host); err != nil {
			return err
		}
		return u.commitSwitch()
	case fromAddress.host:
		if err := u.verifyProxyTarget(ctx, fromAddress.host); err != nil {
			return err
		}
		life, err := u.lifecycle(ctx, fromAddress, http.MethodGet)
		if err != nil || !from.State.Running || life.Protocol != lifecycleProtocol || !life.Ready || life.Draining {
			return fmt.Errorf("original readiness is not proven")
		}
		// No automatic removal: the operator can inspect a candidate left by an
		// interrupted operation. Its name cannot become a later cleanup target.
		u.mu.Lock()
		defer u.mu.Unlock()
		state := u.persistedLocked()
		state.SwitchIntent = nil
		state.Status.State = "failed"
		state.Status.OperationID, state.Status.TargetVersion = "", ""
		state.Status.Reason = "Traffic switch did not take effect; the original instance remains active."
		if err := u.store.save(state); err != nil {
			u.persistenceFailed = true
			return err
		}
		u.switchIntent, u.status, u.persistenceFailed = nil, state.Status, false
		return nil
	default:
		return fmt.Errorf("runtime route does not match either switch participant")
	}
}
