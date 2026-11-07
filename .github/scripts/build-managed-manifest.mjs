import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function buildManagedManifest(tag, image, compatibility, approval) {
  if (!/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(tag) || approval?.version !== tag) {
    throw new Error('Source-version approval must match the release tag');
  }
  const sources = approval.from_versions;
  if (!Array.isArray(sources) || sources.length === 0 ||
      sources.some(source => typeof source !== 'string' || source === tag ||
        !/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(source)) ||
      new Set(sources).size !== sources.length) {
    throw new Error('Explicit, unique prior source versions are required');
  }
  if (compatibility?.schema_unchanged !== true || compatibility.shared_state_compatible !== true) {
    throw new Error('Schema and shared-state compatibility must be approved');
  }
  if (!/^ghcr\.io\/ymengcc\/ymeng-cc-new-api@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error('An immutable managed-update image is required');
  }
  return { ...compatibility, from_versions: [...sources], version: tag, image };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, image, compatibilityPath, approvalPath] = process.argv.slice(2);
  if (!approvalPath) {
    throw new Error('Usage: build-managed-manifest.mjs TAG IMAGE COMPATIBILITY APPROVAL');
  }
  const result = buildManagedManifest(tag, image,
    JSON.parse(readFileSync(compatibilityPath, 'utf8')),
    JSON.parse(readFileSync(approvalPath, 'utf8')));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
