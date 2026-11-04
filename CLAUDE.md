# CLAUDE.md — Project Conventions for new-api

## MANDATORY: Read AGENTS.md with the Read tool

Do not treat `@AGENTS.md` as loaded. Claude Code does not reliably inline that import.

Before any planning, coding, reviewing, or answering a project question, you MUST call the Read tool on the repo-root file `AGENTS.md` and wait for the full contents. This is the first action of every session and every new task.

Rules:

- Do not start from memory, summaries, or this file alone.
- Do not skip the Read because a previous turn mentioned AGENTS.md.
- Do not replace the Read with a grep, glob, or partial skim.
- After reading, follow every rule in `AGENTS.md` for the rest of the work.
- If the task touches `web/`, also Read `web/AGENTS.md` before editing frontend files.
- If the task touches billing as defined under **Billing rules (mandatory read gate)** in `AGENTS.md`, also Read `.agents/rules/billing.md` in full before planning or editing. Tasks outside that definition may skip it.

## MANDATORY: Verify online-update assets before declaring a release complete

A successful commit, version bump, tag push, or binary release does not mean that online installation is ready. The binary and managed-image workflows run independently; never end a release task merely because the tag was pushed or the binary workflow passed.

For every release intended for online updates:

- Keep a new GitHub Release as a draft until the managed-update image, all platform binaries/checksums, `update-manifest.json`, and `update-manifest.sig` have been uploaded and verified. Binary and Electron upload jobs must preserve the draft state; only the verified managed-release completion step may publish it.
- Wait for `Managed update image release` to finish successfully. If it fails, inspect the failed step, repair or rerun it, and continue through final verification. If it is still running, report that online updates are pending and keep following it; do not report the release as complete.
- Inspect the actual Release assets. Download the manifest and signature, verify the signature against the release signing public key, and verify the exact tag, immutable GHCR image digest, supported platforms/databases, and approved source versions. Confirm that the referenced image is accessible and contains the declared platforms.
- Do not fabricate compatibility declarations, approve untested version pairs, replace the signing key, or weaken the controller's verification to remove the unsupported-install message. Distinguish tested migration compatibility from unchanged-schema/shared-state requirements for online cutover.
- Verify that the public Release is no longer a draft and still contains the verified assets. Confirm the controller's release-list result when a configured controller is available; otherwise state that controller-side confirmation was not performed.
- Record the tag/commit, managed-release run URL and conclusion, manifest/signature verification, image digest, and any remaining deployment verification limits in the handoff. If a required check is blocked, say that the release is not ready for online installation and explain the concrete blocker.
