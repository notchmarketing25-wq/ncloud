// Builds release/install.php (one-file installer: site + PHP API + admin setup).
// Run through `npm run package` so dist/ is fresh. The default build uses relative paths + hash routing, so it runs from any folder.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (name === '.htaccess') continue; // never ship rewrite rules in the portable package
    files[relative(dist, p).split(sep).join('/')] = new Uint8Array(readFileSync(p));
  }
})(dist);
if (!files['index.html']) throw new Error('dist/index.html missing: run `npm run build` first');

mkdirSync(join(root, 'release'), { recursive: true });

// The one-file installer also carries the PHP API.
const installFiles = { ...files, 'api/index.php': new Uint8Array(Buffer.from(readFileSync(join(root, 'server', 'api', 'index.php'), 'utf8').replace('__NC_VERSION__', pkg.version))), 'api/schema.php': new Uint8Array(readFileSync(join(root, 'server', 'api', 'schema.php'))), 'nc-api.php': new Uint8Array(Buffer.from("<?php\n// Same API, reachable at the site root for hosts that do not serve the api/ folder.\nrequire __DIR__ . '/api/index.php';\n")), 'api/providers.php': new Uint8Array(readFileSync(join(root, 'server', 'api', 'providers.php'))), 'api/update.php': new Uint8Array(readFileSync(join(root, 'server', 'api', 'update.php'))) };

const php = Object.entries(installFiles)
  .map(([path, data]) => `  '${path.replace(/'/g, "\\'")}' => '${Buffer.from(data).toString('base64')}',`)
  .join('\n');
const tpl = readFileSync(join(root, 'scripts', 'install.template.php'), 'utf8');
writeFileSync(join(root, 'release', 'install.php'), tpl.replaceAll('__VERSION__', pkg.version).replace('__FILES__', php));

// Version update package: only the files that changed since the previous release (see release/manifests).
const sha = (d) => createHash('sha1').update(d).digest('hex');
const manifest = Object.fromEntries(Object.entries(installFiles).map(([k, v]) => [k, sha(v)]));
const mdir = join(root, 'release', 'manifests');
mkdirSync(mdir, { recursive: true });
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] - y[i]; } return 0; };
const prev = readdirSync(mdir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((v) => cmp(v, pkg.version) < 0).sort(cmp).pop();
writeFileSync(join(mdir, `${pkg.version}.json`), JSON.stringify({ version: pkg.version, files: manifest }, null, 1));
let updNote = 'no previous manifest: no update package';
if (prev) {
  const old = JSON.parse(readFileSync(join(mdir, `${prev}.json`), 'utf8')).files;
  const changed = Object.keys(manifest).filter((k) => old[k] !== manifest[k]);
  const removed = Object.keys(old).filter((k) => !(k in manifest) && /^assets\//.test(k));
  const changelog = existsSync(join(root, 'release', 'notes', `${pkg.version}.json`)) ? JSON.parse(readFileSync(join(root, 'release', 'notes', `${pkg.version}.json`), 'utf8')) : {};
  const pack = { format: 1, version: pkg.version, requires: prev, notes: changelog, files: Object.fromEntries(changed.map((k) => [k, Buffer.from(installFiles[k]).toString('base64')])), delete: removed };
  writeFileSync(join(root, 'release', `ncloud-update-${pkg.version}.json`), JSON.stringify(pack));
  updNote = `release/ncloud-update-${pkg.version}.json (from ${prev}: ${changed.length} changed, ${removed.length} removed)`;
}
console.log(updNote);
console.log(`release/install.php (${Object.keys(installFiles).length} files, v${pkg.version})`);
