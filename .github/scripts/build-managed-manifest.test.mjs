import assert from 'node:assert/strict';
import test from 'node:test';
import { buildManagedManifest } from './build-managed-manifest.mjs';

const tag = 'v1.2.13';
const image = `ghcr.io/ymengcc/ymeng-cc-new-api@sha256:${'a'.repeat(64)}`;
const compatibility = {
  schema_unchanged: true, shared_state_compatible: true,
  platforms: ['linux/amd64', 'linux/arm64'], databases: ['sqlite', 'mysql', 'postgres'],
  from_versions: ['v1.1.24', 'v1.2.12', 'v1.2.13'],
};

test('only explicitly approved versions enter the signed manifest', () => {
  const approval = { version: tag, from_versions: ['v1.2.10', 'v1.2.11', 'v1.2.12'] };
  const result = buildManagedManifest(tag, image, compatibility, approval);
  assert.deepEqual(result.from_versions, ['v1.2.10', 'v1.2.11', 'v1.2.12']);
  assert.equal(result.version, tag);
  assert.equal(result.image, image);
  assert.deepEqual(result.platforms, compatibility.platforms);
  assert.deepEqual(result.databases, compatibility.databases);
  assert.deepEqual(compatibility.from_versions, ['v1.1.24', 'v1.2.12', 'v1.2.13']);
});

test('a stale approval cannot authorize a different release', () => {
  assert.throws(() => buildManagedManifest(tag, image, compatibility,
    { version: 'v1.2.12', from_versions: ['v1.2.11'] }), /match the release tag/);
});

for (const sources of [undefined, [], ['v1.2.13'], ['v1.2.12', 'v1.2.12'], ['invalid'], [null]]) {
  test(`invalid source approval is rejected: ${JSON.stringify(sources)}`, () => {
    assert.throws(() => buildManagedManifest(tag, image, compatibility,
      { version: tag, from_versions: sources }), /prior source versions/);
  });
}

test('explicit source approval cannot bypass incompatible schema or shared state', () => {
  const approval = { version: tag, from_versions: ['v1.2.12'] };
  for (const field of ['schema_unchanged', 'shared_state_compatible']) {
    assert.throws(() => buildManagedManifest(tag, image,
      { ...compatibility, [field]: false }, approval), /compatibility must be approved/);
  }
});

test('a mutable image tag is rejected', () => {
  assert.throws(() => buildManagedManifest(tag, 'ghcr.io/ymengcc/ymeng-cc-new-api:v1.2.13', compatibility,
    { version: tag, from_versions: ['v1.2.12'] }), /immutable/);
});
