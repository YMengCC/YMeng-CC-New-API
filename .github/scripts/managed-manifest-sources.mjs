import { verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

/** Validate a direct-upgrade evidence ledger entry for an exact signed target. */
export function approvedSources({ tag, image, sources, ledger, results }) {
  if (!VERSION_PATTERN.test(tag)) throw new Error('Invalid release tag');
  if (!Array.isArray(sources) || sources.length === 0 ||
      sources.some(source => typeof source !== 'string' || !VERSION_PATTERN.test(source)) ||
      new Set(sources).size !== sources.length) {
    throw new Error('Explicit, unique prior source versions are required');
  }
  const entries = ledger?.entries;
  if (!Array.isArray(entries)) throw new Error('Managed-update evidence ledger is missing');
  if (!Array.isArray(results)) throw new Error('Version-pair matrix results are missing');
  for (const source of sources) {
    const matches = entries.filter(entry =>
      entry.tag === tag && entry.source === source && entry.image_digest === image &&
      entry.results_file === '.github/direct-upgrade-results.json' &&
      /^https:\/\/github\.com\/YMengCC\/YMeng-CC-New-API\/actions\/runs\/\d+$/.test(entry.test_run_url || '') &&
      Array.isArray(entry.databases) && ['sqlite', 'mysql', 'postgres'].every(database => entry.databases.includes(database)) &&
      Array.isArray(entry.platforms) && ['linux/amd64', 'linux/arm64'].every(platform => entry.platforms.includes(platform)) &&
      entry.direct_upgrade_tested === true && entry.startup_twice === true &&
      entry.shared_state_tested === true);
    if (matches.length !== 1) {
      throw new Error(`Direct upgrade ${source} -> ${tag} has no exact signed-image evidence`);
    }
    for (const database of ['sqlite', 'mysql', 'postgres']) {
      const row = results.find(item =>
        item.source === source && item.target === tag && item.dialect === database);
      if (!row || ['startupTwice', 'dataPreserved', 'schemaPreserved', 'crossVersionSessions', 'oldWritesVisibleToNew', 'balanceUnchanged']
        .some(field => row[field] !== true)) {
        throw new Error(`Direct upgrade ${source} -> ${tag} has no passing ${database} result`);
      }
    }
  }
  return [...sources];
}

/** Re-sign only the approved source list; preserve every other signed field. */
export function reSignSources({ tag, image, manifestBytes, signature, publicKey, sources, ledger, results }) {
  const signatureText = signature.toString().trim();
  const signatureBytes = Buffer.from(signatureText, 'base64');
  if (!publicKey || signatureBytes.length !== 64 || signatureBytes.toString('base64') !== signatureText) {
    throw new Error('Invalid compatibility manifest signature');
  }
  if (!verify(null, manifestBytes, publicKey, signatureBytes)) {
    throw new Error('Invalid compatibility manifest signature');
  }
  const published = JSON.parse(manifestBytes.toString());
  if (published.version !== tag || published.image !== image) {
    throw new Error('Published manifest does not match the release tag and image');
  }
  const approved = approvedSources({ tag, image, sources, ledger, results });
  if (!Array.isArray(published.from_versions) ||
      published.from_versions.some(source => !approved.includes(source))) {
    throw new Error('Published sources must remain explicitly approved');
  }
  const updated = { ...published, from_versions: approved };
  const immutableFields = ['version', 'image', 'schema_unchanged', 'shared_state_compatible', 'platforms', 'databases'];
  for (const field of immutableFields) {
    if (JSON.stringify(updated[field]) !== JSON.stringify(published[field])) {
      throw new Error(`Re-signing must preserve ${field}`);
    }
  }
  const keys = Object.keys(updated).sort().join(',');
  if (keys !== Object.keys(published).sort().join(',')) {
    throw new Error('Re-signing must not add or remove manifest fields');
  }
  return updated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, image, manifestPath, signaturePath, publicKeyPath, sourcesPath, ledgerPath, resultsPath, outputPath] = process.argv.slice(2);
  const manifestBytes = readFileSync(manifestPath);
  const updated = reSignSources({
    tag, image, manifestBytes,
    signature: readFileSync(signaturePath),
    publicKey: readFileSync(publicKeyPath),
    sources: JSON.parse(readFileSync(sourcesPath, 'utf8')),
    ledger: JSON.parse(readFileSync(ledgerPath, 'utf8')),
    results: JSON.parse(readFileSync(resultsPath, 'utf8')),
  });
  const output = JSON.stringify(updated, null, 2) + '\n';
  if (outputPath) {
    writeFileSync(outputPath, output);
  } else {
    process.stdout.write(output);
  }
}
