// Builds release/install.php (one-file installer: site + PHP API + admin setup) and release/ncloud-site.zip (static site only).
// Run through `npm run package` so dist/ is fresh. The default build uses relative paths + hash routing, so it runs from any folder.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

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
writeFileSync(join(root, 'release', 'ncloud-site.zip'), zipSync(files, { level: 9 })); // static only (no PHP needed)

// The one-file installer also carries the PHP API.
const installFiles = { ...files, 'api/index.php': new Uint8Array(readFileSync(join(root, 'server', 'api', 'index.php'))) };

const php = Object.entries(installFiles)
  .map(([path, data]) => `  '${path.replace(/'/g, "\\'")}' => '${Buffer.from(data).toString('base64')}',`)
  .join('\n');
const tpl = readFileSync(join(root, 'scripts', 'install.template.php'), 'utf8');
writeFileSync(join(root, 'release', 'install.php'), tpl.replaceAll('__VERSION__', pkg.version).replace('__FILES__', php));

console.log(`release/install.php + release/ncloud-site.zip (${Object.keys(installFiles).length} files, v${pkg.version})`);
