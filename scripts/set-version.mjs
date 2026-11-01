// Usage: node scripts/set-version.mjs 1.2.3
// Writes the version into tauri.conf.json (which decides the bundle version) and package.json.
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
// MSI (WiX) only accepts numeric versions: major.minor.patch, optionally -<number>.
if (!/^\d+\.\d+\.\d+(-\d+)?$/.test(version ?? '')) {
  console.error(`Invalid version "${version}". Use tags like v1.2.3 (or v1.2.3-1 for a pre-release).`);
  process.exit(1);
}
for (const file of ['src-tauri/tauri.conf.json', 'package.json']) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = version;
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}
console.log(`Version set to ${version}`);
