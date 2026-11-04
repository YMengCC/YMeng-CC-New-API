import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { verifyManagedRelease } from './verify-managed-release.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const tag = 'v1.2.5';
const image = `ghcr.io/ymengcc/ymeng-cc-new-api@sha256:${'a'.repeat(64)}`;

function fixture(overrides = {}) {
  const manifest = {
    version: tag, image, from_versions: ['v1.2.4'],
    schema_unchanged: true, shared_state_compatible: true,
    platforms: ['linux/amd64', 'linux/arm64'], databases: ['sqlite', 'mysql', 'postgres'],
    ...overrides,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  return {
    tag, image, manifestBytes, publicKey,
    signature: Buffer.from(sign(null, manifestBytes, privateKey).toString('base64')),
    assets: [
      `new-api-${tag}`, `new-api-arm64-${tag}`, `new-api-macos-${tag}`, `new-api-${tag}.exe`,
      'checksums-linux.txt', 'checksums-macos.txt', 'checksums-windows.txt',
      'update-manifest.json', 'update-manifest.sig',
    ].map(name => ({ name, size: 123 })),
  };
}

test('complete signed release assets permit publication', () => {
  assert.equal(verifyManagedRelease(fixture()).version, tag);
});

for (const name of ['update-manifest.json', 'update-manifest.sig', `new-api-${tag}`, 'checksums-windows.txt']) {
  test(`missing ${name} prevents publication`, () => {
    const input = fixture();
    input.assets = input.assets.filter(asset => asset.name !== name);
    assert.throws(() => verifyManagedRelease(input), /Release asset/);
  });
}

for (const overrides of [
  { version: 'v1.2.6' }, { image: image.replace(/a$/, 'b') },
  { schema_unchanged: false }, { shared_state_compatible: false },
  { from_versions: [] }, { from_versions: ['v1.2.4', 'v1.2.4'] },
  { platforms: ['linux/riscv64'] }, { databases: ['unsupported'] },
]) {
  test(`signed incompatible metadata prevents publication: ${JSON.stringify(overrides)}`, () => {
    assert.throws(() => verifyManagedRelease(fixture(overrides)));
  });
}

test('a modified manifest or a different signing key prevents publication', () => {
  const input = fixture();
  input.manifestBytes = Buffer.from(input.manifestBytes.toString().replace('v1.2.4', 'v1.2.3'));
  assert.throws(() => verifyManagedRelease(input), /signature/);
  const other = generateKeyPairSync('ed25519');
  assert.throws(() => verifyManagedRelease({ ...fixture(), publicKey: other.publicKey }), /signature/);
});

test('malformed signature and empty or duplicate assets prevent publication', () => {
  assert.throws(() => verifyManagedRelease({ ...fixture(), signature: Buffer.from('invalid') }), /signature/);
  const empty = fixture();
  empty.assets[0].size = 0;
  assert.throws(() => verifyManagedRelease(empty), /Release asset/);
  const duplicate = fixture();
  duplicate.assets.push({ ...duplicate.assets[0] });
  assert.throws(() => verifyManagedRelease(duplicate), /Release asset/);
});
