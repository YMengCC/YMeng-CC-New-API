import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { approvedSources, reSignSources } from './managed-manifest-sources.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const tag = 'v1.2.14';
const image = `ghcr.io/ymengcc/ymeng-cc-new-api@sha256:${'a'.repeat(64)}`;
const runUrl = 'https://github.com/YMengCC/YMeng-CC-New-API/actions/runs/123456';

const sources = ['v1.2.10', 'v1.2.11', 'v1.2.12', 'v1.2.13'];
const evidence = (source, overrides = {}) => ({
  tag, source, image_digest: image, test_run_url: runUrl,
  platforms: ['linux/amd64', 'linux/arm64'], databases: ['sqlite', 'mysql', 'postgres'],
  direct_upgrade_tested: true, startup_twice: true, shared_state_tested: true,
  ...overrides,
});
const ledger = { entries: sources.map(source => evidence(source, { results_file: '.github/direct-upgrade-results.json' })) };
const results = sources.flatMap(source => ['sqlite', 'mysql', 'postgres'].map(dialect => ({
  source, target: tag, dialect,
  startupTwice: true, dataPreserved: true, schemaPreserved: true,
  crossVersionSessions: true, oldWritesVisibleToNew: true, balanceUnchanged: true,
})));
const published = {
  schema_unchanged: true, shared_state_compatible: true,
  platforms: ['linux/amd64', 'linux/arm64'], databases: ['sqlite', 'mysql', 'postgres'],
  from_versions: ['v1.2.13'], version: tag, image,
};
const manifestBytes = Buffer.from(JSON.stringify(published, null, 2) + '\n');
const signature = Buffer.from(sign(null, manifestBytes, privateKey).toString('base64'));

test('multiple exact-image source approvals are accepted', () => {
  assert.deepEqual(approvedSources({ tag, image, sources, ledger, results }), sources);
  const updated = reSignSources({ tag, image, manifestBytes, signature, publicKey, sources, ledger, results });
  assert.deepEqual(updated.from_versions, sources);
  for (const field of ['version', 'image', 'schema_unchanged', 'shared_state_compatible', 'platforms', 'databases']) {
    assert.deepEqual(updated[field], published[field]);
  }
  assert.deepEqual(Object.keys(updated), Object.keys(published));
});

test('an unsigned or modified published manifest cannot be re-signed', () => {
  const changed = Buffer.from(manifestBytes.toString().replace('v1.2.13', 'v1.2.9'));
  assert.throws(() => reSignSources({ tag, image, manifestBytes: changed, signature, publicKey, sources, ledger, results }), /signature/);
  const other = generateKeyPairSync('ed25519');
  assert.throws(() => reSignSources({ tag, image, manifestBytes, signature, publicKey: other.publicKey, sources, ledger, results }), /signature/);
});

for (const [name, override] of [
  ['a missing source', { source: 'v1.2.9' }],
  ['a different image digest', { image_digest: image.replace(/a$/, 'b') }],
  ['an untested direct upgrade', { direct_upgrade_tested: false }],
  ['a single startup', { startup_twice: false }],
  ['missing shared-state evidence', { shared_state_tested: false }],
  ['an incomplete database matrix', { databases: ['sqlite'] }],
  ['an incomplete platform matrix', { platforms: ['linux/amd64'] }],
]) {
  test(`an approved source is rejected with ${name}`, () => {
    const incomplete = {
      entries: [...sources.slice(0, -1).map(source => evidence(source)), evidence('v1.2.13', typeof override === 'function' ? override() : override)],
    };
    assert.throws(() => approvedSources({ tag, image, sources, ledger: incomplete, results }), /no exact signed-image evidence/);
  });
}

test('a non-GitHub or missing evidence run cannot authorize a source', () => {
  const invalid = { entries: [...sources.slice(0, -1).map(source => evidence(source)), evidence('v1.2.13', { test_run_url: 'https://example.com/other' })] };
  assert.throws(() => approvedSources({ tag, image, sources, ledger: invalid, results }), /no exact signed-image evidence/);
});

test('version-pair matrix results must exist for every source and database', () => {
  const partial = results.filter(row => !(row.source === 'v1.2.12' && row.dialect === 'postgres'));
  assert.throws(() => approvedSources({ tag, image, sources, ledger, results: partial }), /no passing postgres result/);
});

test('published source versions must remain approved after re-signing', () => {
  const missing = { entries: sources.filter(source => source !== 'v1.2.13').map(source => evidence(source)) };
  assert.throws(() => reSignSources({ tag, image, manifestBytes, signature, publicKey, sources: ['v1.2.10', 'v1.2.11'], ledger: missing, results }), /no exact signed-image evidence/);
});
