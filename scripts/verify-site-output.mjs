import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || 'packages/app/dist');
function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`;
    assert(!entry.isSymbolicLink(), `Unexpected symlink: ${name}`);
    return entry.isDirectory() ? files(resolve(directory, entry.name), `${name}/`) : [name];
  });
}
const precache = JSON.parse(readFileSync(resolve(root, 'precache.json'), 'utf8'));
assert(Array.isArray(precache) && precache.length > 0, 'Empty precache manifest');
for (const url of precache) {
  assert(
    typeof url === 'string' && /^\/assets\/[^/]+\.(js|css)$/.test(url),
    'Invalid precache URL',
  );
}
for (const name of [
  'index.html',
  ...files('packages/app/public'),
  ...precache.map((url) => url.slice(1)),
]) {
  const info = statSync(resolve(root, name));
  assert(info.isFile() && info.size > 0, `Missing or empty output: ${name}`);
}
const sums = files(root)
  .filter((name) => name !== 'SHA256SUMS')
  .sort()
  .map((name) => {
    assert(!/[\r\n\\]/.test(name), `Unsupported output filename: ${name}`);
    return `${createHash('sha256')
      .update(readFileSync(resolve(root, name)))
      .digest('hex')}  ./${name}\n`;
  });
writeFileSync(resolve(root, 'SHA256SUMS'), sums.join(''));
console.log(`Verified site and generated checksums: ${sums.length} files`);
