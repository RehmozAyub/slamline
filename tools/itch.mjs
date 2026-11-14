// The web game for itch.io: `node tools/itch.mjs` writes release/slamline-itch.zip (index.html at
// the zip's root, as itch.io wants). Upload it on the game's itch.io page as "This file will be
// played in the browser" (itch/README.md has the page settings), or let `npm run release` push it
// with butler once .keys/itch-target.txt names the page (see pushToItch below).
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = join(root, 'game');
export const ITCH_ZIP = join(root, 'release', 'slamline-itch.zip');

// files never shipped to the web: the exe's build key (it should never be in game/, but if a
// build ever leaves it there it must not go out)
const SKIP = new Set(['official.json']);

function count(dir) {
  let n = 0;
  for (const f of readdirSync(dir)) n += statSync(join(dir, f)).isDirectory() ? count(join(dir, f)) : 1;
  return n;
}

export function buildItchZip() {
  const entries = readdirSync(game).filter((f) => !SKIP.has(f) && !f.startsWith('.') && f !== 'desktop.ini');
  if (!entries.includes('index.html')) throw new Error('game/index.html is missing');
  mkdirSync(dirname(ITCH_ZIP), { recursive: true });
  rmSync(ITCH_ZIP, { force: true });
  // Windows' own tar (bsdtar) writes real zips; Git's GNU tar can't
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar';
  execFileSync(tar, ['-a', '-cf', ITCH_ZIP, '--exclude', 'desktop.ini', ...entries], { cwd: game, stdio: 'inherit' });
  const files = entries.reduce((n, f) => n + (statSync(join(game, f)).isDirectory() ? count(join(game, f)) : 1), 0);
  const mb = statSync(ITCH_ZIP).size / 1048576;
  if (files > 1000 || mb > 500) throw new Error(`too big for itch.io: ${files} files, ${mb.toFixed(1)} MB (limits 1000 files, 500 MB)`);
  return { path: ITCH_ZIP, files, mb };
}

// .keys/itch-target.txt holds the page as butler names it, e.g. "yourname/slamline". With that file
// and butler (https://itch.io/docs/butler/, logged in once with `butler login`) the release pushes
// the web zip to the "html" channel and the exe to "windows". Returns false when not set up.
export function pushToItch(version, exe) {
  const file = join(root, '.keys', 'itch-target.txt');
  if (!existsSync(file)) return false;
  const target = readFileSync(file, 'utf8').trim();
  if (!/^[\w-]+\/[\w-]+$/.test(target)) throw new Error(`.keys/itch-target.txt should look like yourname/slamline, not "${target}"`);
  try { execSync('butler -V', { stdio: 'ignore' }); } catch { throw new Error('butler is not installed (or not on PATH): https://itch.io/docs/butler/'); }
  const push = (path, channel) => execFileSync('butler', ['push', path, `${target}:${channel}`, '--userversion', version], { stdio: 'inherit' });
  push(ITCH_ZIP, 'html');
  if (exe) push(exe, 'windows');
  return target;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const z = buildItchZip();
  console.log(`Wrote ${z.path} (${z.files} files, ${z.mb.toFixed(1)} MB)`);
}
