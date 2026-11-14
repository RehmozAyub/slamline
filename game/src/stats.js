// Anonymous play stats and the feedback form's delivery, for SLAMLINE's own small server
// (server/ in the repository; what is sent and why is in PRIVACY.md).
// Every few minutes the game sends what happened since last time: how long it was open and
// played, races started / finished / quit, one frame-rate sample, online room counts and any
// errors. There is no player ID: `sid` is made up each time the game starts and lives only in
// memory, so two sessions can't be linked. Settings → SHARE PLAY STATS turns it off. Only the
// official game sends: the web version on GitHub Pages, and the Windows exe, whose release
// build carries a key in official.json (never in the repository). Dev servers send nothing
// (set localStorage 'slamline.statsDebug' to see what would go in the console).
import { VERSION } from './version.js';
import { IS_MOBILE } from './config.js';

export const SERVER = 'https://slamline-stats.slamline.workers.dev';
const PAGES = 'https://rehmozayub.github.io';
const BEAT = 5 * 60; // seconds between beats
const IDLE = 120; // seconds without any input before the time stops counting as played
const MAX_ERRORS = 20; // per session

export class PlayStats {
  constructor(game) {
    this.game = game;
    this.sid = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(36).padStart(2, '0')).join('');
    this.platform = location.protocol === 'app:' ? 'exe' : IS_MOBILE || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) ? 'web-phone' : 'web-desktop';
    this.debug = false;
    try { this.debug = !!localStorage.getItem('slamline.statsDebug'); } catch {}
    this.buildKey = null;
    this.official = location.origin === PAGES;
    if (location.protocol === 'app:') {
      fetch('official.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.key) { this.buildKey = j.key; this.official = true; } }).catch(() => {});
    }
    this.reset();
    this.started = false; // the first beat (counts the session) has gone
    this.sinceBeat = 0;
    this.lastActive = performance.now();
    this.errorCount = 0;
    this.race = null; // the race under way: { t, m, mi }

    const active = () => { this.lastActive = performance.now(); };
    for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) window.addEventListener(ev, active, { passive: true, capture: true });
    window.addEventListener('error', (e) => this.error(e.error || e.message, e.filename, e.lineno));
    window.addEventListener('unhandledrejection', (e) => this.error(e.reason));
    // leaving: send what's left (the page may not get another chance)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.send(); });
    window.addEventListener('pagehide', () => this.send());
  }

  get on() { return this.game.settings.shareStats !== false && (this.official || this.debug); }

  reset() {
    this.open = 0; this.active = 0;
    this.races = [];
    this.online = { hosted: 0, players: 0, failed: 0 };
    this.fps = { sum: 0, n: 0 };
    this.errors = [];
  }

  // every frame: dt in seconds, racing = a race is being driven (for the frame-rate sample)
  tick(dt, racing) {
    if (!this.on) return;
    if (!this.started) { this.started = true; this.send(); }
    this.open += dt;
    if (this.padActive() || performance.now() - this.lastActive < IDLE * 1000) this.active += dt;
    if (racing && dt > 0) { this.fps.sum += 1 / dt; this.fps.n++; }
    this.sinceBeat += dt;
    if (this.sinceBeat >= BEAT) this.send();
  }

  padActive() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (p.buttons.some((b) => b.pressed) || p.axes.some((a) => Math.abs(a) > 0.3)) { this.lastActive = performance.now(); return true; }
    }
    return false;
  }

  // races: mode solo | split | online
  raceStarted(track, mode, mirrored) {
    this.raceEnded('quit');
    this.race = { t: track, m: mode, mi: mirrored ? 1 : 0 };
    this.races.push({ ...this.race, r: 'start' });
  }

  // 'finish' or 'quit'; nothing if no race is under way
  raceEnded(result) {
    if (!this.race) return;
    this.races.push({ ...this.race, r: result });
    this.race = null;
  }

  roomHosted() { this.online.hosted++; }
  roomPlayers(n) { this.online.players += n; }
  connectFailed() { this.online.failed++; }

  // an uncaught error: its kind and message, plus where in the game's own code (file name and
  // line only; the server strips anything that still looks like a path)
  error(err, file, line) {
    if (this.errorCount >= MAX_ERRORS) return;
    const kind = (err && err.name) || 'Error';
    let msg = String((err && err.message) || err || '').slice(0, 120);
    const where = (file && file.split('/').pop()) || ((err && err.stack) || '').split('\n').map((l) => l.match(/([\w.-]+\.js):(\d+)/)).find(Boolean)?.slice(1).join(':');
    if (where) msg += ` (${file ? `${where}:${line}` : where})`;
    if (!msg || this.errors.some((e) => e.m === msg)) return;
    this.errorCount++;
    this.errors.push({ k: kind, m: msg });
  }

  send() {
    if (!this.on || !this.started) return;
    const body = { sid: this.sid, v: VERSION, p: this.platform, open: Math.round(this.open), active: Math.round(this.active) };
    if (this.races.length) body.races = this.races.slice(0, 30);
    if (this.online.hosted || this.online.players || this.online.failed) body.online = this.online;
    if (this.fps.n > 30) body.perf = { q: this.game.qualityName, fps: Math.round(this.fps.sum / this.fps.n) };
    if (this.errors.length) body.errors = this.errors.slice(0, 5);
    this.reset();
    this.sinceBeat = 0;
    post('/v1/beat', body, this);
  }
}

// POST to the server as text/plain (a "simple" request, so the browser needs no preflight and
// it still goes out while the page closes). The exe adds its build key to the body.
export function post(path, body, stats) {
  const payload = { ...body };
  if (stats && stats.buildKey) payload.bk = stats.buildKey;
  if (stats && stats.debug && !stats.official) { console.info('[stats]', path, payload); return Promise.resolve({ ok: true, debug: true }); }
  return fetch(SERVER + path, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'text/plain' }, keepalive: true, mode: 'cors', credentials: 'omit' })
    .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, status: r.status, ...j })))
    .catch(() => ({ ok: false, status: 0 }));
}
