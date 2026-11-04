import { verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function verifyManagedRelease({ tag, image, manifestBytes, signature, publicKey, assets }) {
  if (!/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(tag)) {
    throw new Error('Invalid release tag');
  }
  const signatureText = signature.toString().trim();
  const signatureBytes = Buffer.from(signatureText, 'base64');
  if (signatureBytes.length !== 64 || signatureBytes.toString('base64') !== signatureText ||
      !verify(null, manifestBytes, publicKey, signatureBytes)) {
    throw new Error('Invalid compatibility manifest signature');
  }
  const manifest = JSON.parse(manifestBytes.toString());
  if (manifest.version !== tag || manifest.image !== image ||
      !/^ghcr\.io\/ymengcc\/ymeng-cc-new-api@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error('Compatibility manifest does not match the release image and tag');
  }
  if (manifest.schema_unchanged !== true || manifest.shared_state_compatible !== true) {
    throw new Error('Online-update compatibility has not been approved');
  }
  for (const field of ['from_versions', 'platforms', 'databases']) {
    const values = manifest[field];
    if (!Array.isArray(values) || values.length === 0 ||
        values.some(value => typeof value !== 'string' || value.trim() !== value || value.length === 0) ||
        new Set(values).size !== values.length) {
      throw new Error(`Invalid compatibility field: ${field}`);
    }
  }
  if (manifest.platforms.some(value => !['linux/amd64', 'linux/arm64'].includes(value)) ||
      manifest.databases.some(value => !['sqlite', 'mysql', 'postgres'].includes(value))) {
    throw new Error('Compatibility manifest declares an unsupported platform or database');
  }
  const required = [
    `new-api-${tag}`, `new-api-arm64-${tag}`, `new-api-macos-${tag}`, `new-api-${tag}.exe`,
    'checksums-linux.txt', 'checksums-macos.txt', 'checksums-windows.txt',
    'update-manifest.json', 'update-manifest.sig',
  ];
  if (!Array.isArray(assets)) {
    throw new Error('Release asset list is missing');
  }
  for (const name of required) {
    const matches = assets.filter(asset => asset.name === name);
    if (matches.length !== 1 || !(matches[0].size > 0)) {
      throw new Error(`Release asset missing, empty, or duplicated: ${name}`);
    }
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, image, manifestPath, signaturePath, publicKeyPath, assetsPath] = process.argv.slice(2);
  if (!assetsPath) {
    throw new Error('Usage: verify-managed-release.mjs TAG IMAGE MANIFEST SIGNATURE PUBLIC_KEY ASSETS_JSON');
  }
  const manifest = verifyManagedRelease({
    tag, image,
    manifestBytes: readFileSync(manifestPath),
    signature: readFileSync(signaturePath),
    publicKey: readFileSync(publicKeyPath),
    assets: JSON.parse(readFileSync(assetsPath, 'utf8')).assets,
  });
  console.log(`Verified online-update assets for ${manifest.version}: ${manifest.image}`);
}
