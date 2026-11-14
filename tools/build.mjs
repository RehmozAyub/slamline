// Packages the game as a portable Windows exe: release/Slamline.exe
// Build happens in %LOCALAPPDATA%\SlamlineBuild so node_modules never syncs to Google Drive.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(process.env.LOCALAPPDATA || join(root, '.build'), 'SlamlineBuild');
mkdirSync(build, { recursive: true });

const run = (cmd) => execSync(cmd, { cwd: build, stdio: 'inherit' });

const pkg = JSON.parse(readFileSync(join(root, 'electron', 'package.json'), 'utf8'));
if (!existsSync(join(build, 'node_modules', 'electron')) || !existsSync(join(build, 'node_modules', 'electron-builder'))) {
  writeFileSync(join(build, 'package.json'), JSON.stringify({ ...pkg, devDependencies: {} }, null, 2));
  // a fixed Electron, so a fresh build folder reuses the one already downloaded (a new major
  // means a fresh 160 MB download, and the exe changing under the players)
  run('npm install --save-dev electron@44.4.5 electron-builder --no-audit --no-fund');
}
const ver = (m) => JSON.parse(readFileSync(join(build, 'node_modules', m, 'package.json'), 'utf8')).version;
pkg.devDependencies = { electron: ver('electron'), 'electron-builder': ver('electron-builder') };
writeFileSync(join(build, 'package.json'), JSON.stringify(pkg, null, 2));

console.log('Staging files...');
rmSync(join(build, 'game'), { recursive: true, force: true });
rmSync(join(build, 'dist'), { recursive: true, force: true });
cpSync(join(root, 'game'), join(build, 'game'), { recursive: true });
copyFileSync(join(root, 'electron', 'main.cjs'), join(build, 'main.cjs'));
copyFileSync(join(root, 'electron', 'icon.png'), join(build, 'icon.png'));
// the official-build key (stats.js / server/): lets the stats server tell this exe from a copy
// someone built themselves. It lives only on this PC (.keys/, gitignored) and in the server's
// secrets, never in git.
const keyFile = join(root, '.keys', 'build-key.txt');
if (existsSync(keyFile)) writeFileSync(join(build, 'game', 'official.json'), JSON.stringify({ key: readFileSync(keyFile, 'utf8').trim() }));
else console.warn('No .keys/build-key.txt: this exe sends no play stats or feedback.');

console.log('Running electron-builder...');
run('npx electron-builder --win portable --x64');

const exe = join(build, 'dist', 'Slamline.exe');
mkdirSync(join(root, 'release'), { recursive: true });
copyFileSync(exe, join(root, 'release', 'Slamline.exe'));
console.log(`\nBuilt release/Slamline.exe (${(statSync(exe).size / 1048576).toFixed(1)} MB)`);
