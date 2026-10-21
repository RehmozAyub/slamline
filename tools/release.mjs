// Ships the committed game everywhere in one go: `npm run release`
//   1. checks: on main, nothing uncommitted, not behind GitHub, tests pass
//   2. builds release/Slamline.exe and release/Slamline.apk (before anything goes public)
//   3. pushes main, publishes game/ to the gh-pages branch (the Pages site)
//   4. creates GitHub release vX.Y with the exe and the apk attached
// The version is the latest release tag plus one minor step (v2.4 -> v2.5); `--version 3.0` overrides it.
// `--notes "text"` puts a summary above the change list. `--dry-run` runs the checks and tests and
// prints the plan without building or publishing anything.
import { execSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'RehmozAyub/slamline';
const PAGES = 'https://rehmozayub.github.io/slamline/';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const dryRun = args.includes('--dry-run');

const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', ...opts }).trim();
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
const step = (msg) => console.log(`\n=== ${msg}`);
const fail = (msg) => {
  console.error(`\nRelease stopped: ${msg}`);
  process.exit(1);
};

step('Checking the repo');
const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') fail(`you are on "${branch}"; releases go out from main.`);
const dirty = sh('git status --porcelain');
if (dirty) fail(`these files are not committed (commit them, or add them to .gitignore):\n${dirty}`);
sh('git fetch origin --tags --quiet');
try {
  sh('git merge-base --is-ancestor origin/main HEAD');
} catch {
  fail('GitHub has commits on main that this folder lacks; pull them first.');
}

const lastTag = sh('git describe --tags --abbrev=0 --match "v[0-9]*"');
const version = flag('--version') || (() => {
  const [major, minor] = lastTag.slice(1).split('.').map(Number);
  return `${major}.${minor + 1}`;
})();
const tag = `v${version}`;
if (!/^\d+\.\d+$/.test(version)) fail(`version "${version}" should look like 2.5`);
if (sh(`git tag -l ${tag}`)) fail(`${tag} already exists.`);

const changes = sh(`git log ${lastTag}..HEAD --no-merges --format="- %s"`);
if (!changes) fail(`nothing new since ${lastTag}.`);
const summary = flag('--notes');
const notes = [
  summary,
  `**What's new since ${lastTag}**\n\n${changes}`,
  '- `Slamline.exe`: Windows, portable (no install).\n- `Slamline.apk`: Android. Installs over the previous version and keeps progress.',
  `Play in the browser: ${PAGES}`,
].filter(Boolean).join('\n\n') + '\n';
console.log(`Releasing ${tag} (last release ${lastTag}), commit ${sh('git rev-parse --short HEAD')}`);

step('Running the tests');
run('npm test');

if (dryRun) {
  console.log(`\nDry run: would build the exe and apk, push main and Pages, and publish ${tag} with these notes:\n\n${notes}`);
  process.exit(0);
}

const started = Date.now() - 1000;
const built = (file) => {
  const path = join(root, 'release', file);
  if (!existsSync(path) || statSync(path).mtimeMs < started) fail(`release/${file} was not rebuilt.`);
  return path;
};

step('Building the Windows exe');
run('node tools/build.mjs');
const exe = built('Slamline.exe');

step('Building the Android apk');
run('node tools/build-apk.mjs', { SLAMLINE_VERSION: version });
const apk = built('Slamline.apk');

step('Pushing main to GitHub');
run('git push origin main');

step('Publishing game/ to GitHub Pages');
const pages = sh('git subtree split --prefix=game HEAD');
run(`git push origin ${pages}:refs/heads/gh-pages`);

step(`Creating GitHub release ${tag}`);
const notesFile = join(mkdtempSync(join(tmpdir(), 'slamline-release-')), 'notes.md');
writeFileSync(notesFile, notes);
run(`gh release create ${tag} "${exe}" "${apk}" --repo ${REPO} --target main --title "SLAMLINE ${tag}" --notes-file "${notesFile}"`);
sh('git fetch origin --tags --quiet');

console.log(`\nShipped ${tag}:\n  Pages:   ${PAGES} (live in a minute or two)\n  Release: https://github.com/${REPO}/releases/tag/${tag}`);
