// The web game for itch.io: `node tools/itch.mjs` writes release/slamline-itch.zip (index.html at
// the zip's root, as itch.io wants). Upload it on the game's itch.io page as "This file will be
// played in the browser" (itch/README.md has the page settings). GitHub Actions builds it and pushes
// it with butler on every push to main (.github/workflows/itch.yml).
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, mkdirSync, statSync } from 'node:fs';
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const z = buildItchZip();
  console.log(`Wrote ${z.path} (${z.files} files, ${z.mb.toFixed(1)} MB)`);
}
