// Writes dist/THIRD-PARTY-NOTICES.txt: the license text of every production dependency bundled into the app.
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const shipped = Object.entries(lock.packages)
  .filter(([path, meta]) => path.startsWith('node_modules/') && !meta.dev)
  .sort(([a], [b]) => a.localeCompare(b));
assert(shipped.length, 'No production dependencies found in package-lock.json.');

const sections = [];
for (const [path] of shipped) {
  const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  const licenseFile = (await readdir(path)).find(name => /^(licen[cs]e|copying|notice)(\.|-|$)/i.test(name));
  const text = licenseFile ? (await readFile(join(path, licenseFile), 'utf8')).trim() : '';
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type;
  assert(text || license, `${pkg.name}@${pkg.version} has neither a license file nor a license field.`);
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  // Source location satisfies the source-availability terms of EPL-2.0 (elkjs) and MPL-2.0 (dompurify).
  sections.push([`${pkg.name} ${pkg.version}`, `License: ${license || 'see text below'}`, `Source: ${repo || `https://www.npmjs.com/package/${pkg.name}`}`, '', text || '(No license file shipped; see the license field above.)'].join('\n'));
}

const header = `NitroBison bundles the following open-source packages, unmodified.
Where a package offers a choice of licenses, NitroBison uses dompurify under Apache-2.0 and elkjs under EPL-2.0. Electron and Chromium notices ship separately with the desktop app.`;
await writeFile('dist/THIRD-PARTY-NOTICES.txt', `${header}\n\n${sections.join(`\n\n${'='.repeat(72)}\n\n`)}\n`);
console.log(`Third-party notices: ${sections.length} packages`);
