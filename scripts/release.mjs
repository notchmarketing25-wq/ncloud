// npm run release -- <version> "<English note>" "<ملاحظة بالعربي>"
// Bumps the version, writes the release notes, builds the site and produces:
//   release/install.php                      the full installer of this version (always the latest)
//   release/updates/ncloud-update-X.Y.Z.json only the files that changed since the previous version (one per version, all kept in git)
//   release/manifests/X.Y.Z.json             file hashes of this version (the next update is a diff against it)
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const [version, en, ar] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) { console.error('usage: npm run release -- X.Y.Z "English note" "ملاحظة بالعربي"'); process.exit(1); }
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
if (cmp(version, pkg.version) < 0) { console.error(`version ${version} is older than the current ${pkg.version}`); process.exit(1); }
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
mkdirSync(join(root, 'release', 'notes'), { recursive: true });
writeFileSync(join(root, 'release', 'notes', `${version}.json`), JSON.stringify({ en: [en ?? ''], ar: [ar ?? en ?? ''] }, null, 1));
execSync('npm run package', { cwd: root, stdio: 'inherit' });
console.log(`\nNext: git add -A && git commit -m "Release ${version}" && git tag v${version} && git push origin HEAD --tags`);
