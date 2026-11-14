// SLAMLINE's own small server on Cloudflare Workers + D1 (schema in ../migrations):
//   POST /v1/beat       anonymous play stats from the game, every few minutes while it runs
//   POST /v1/feedback   the in-game feedback form
//   GET  /dashboard     the owner's private dashboard (the page asks for the admin key)
//   GET  /v1/stats      its data; /v1/admin/... tidies feedback and bad days (admin key)
// Privacy (PRIVACY.md): no cookies and no player IDs. The IP address is used only for
// Cloudflare's country lookup and rate limiting, and is never stored or logged here.
// Only the official game is accepted: the web version from GitHub Pages, and the Windows exe,
// which carries a key the release script adds at build time (never in the repository).
import DASHBOARD from './dashboard.html';

const PLATFORMS = ['web-desktop', 'web-phone', 'exe'];
const TRACKS = ['coast', 'city', 'alpine', 'snow', 'canyon', 'jungle', 'canal', 'space', 'airport', 'volcano'];
const MODES = ['solo', 'split', 'online'];
const QUALITIES = ['low', 'medium', 'high'];
const KINDS = ['bug', 'idea', 'other'];
const FEEDBACK_MAX = 1000;
const FEEDBACK_PER_DAY = 300; // all players together; past it the form says "try tomorrow"

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (path === '/dashboard') return new Response(DASHBOARD, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
      if (path.startsWith('/v1/stats') || path.startsWith('/v1/admin/')) return admin(req, env, url);
      if (path === '/v1/beat' || path === '/v1/feedback') {
        const origin = req.headers.get('origin') || '';
        if (req.method === 'OPTIONS') return preflight(origin, env);
        if (req.method !== 'POST') return reply(405, { error: 'method' }, origin, env);
        const body = await readJson(req, 8192);
        if (!body) return reply(400, { error: 'bad body' }, origin, env);
        if (!official(origin, body, env)) return reply(403, { error: 'not the official game' }, origin, env);
        if (path === '/v1/beat') return reply(...(await beat(req, env, body)), origin, env);
        return reply(...(await feedback(req, env, body)), origin, env);
      }
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'server' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  },

  // daily: forget sessions that went quiet a day ago
  async scheduled(event, env) {
    await env.DB.prepare('DELETE FROM live WHERE last < ?').bind(Date.now() - 86400000).run();
  },
};

// --- who may send ---------------------------------------------------------------------------
// (the game posts as text/plain, a simple request, so the exe's key rides in the body as "bk")
function official(origin, body, env) {
  if (origin === env.PAGES_ORIGIN) return true;
  return origin === 'app://game' && !!env.BUILD_KEY && body.bk === env.BUILD_KEY;
}

function cors(origin, env) {
  const ok = origin === env.PAGES_ORIGIN || origin === 'app://game';
  return ok ? { 'access-control-allow-origin': origin, vary: 'origin' } : {};
}

function preflight(origin, env) {
  return new Response(null, { status: 204, headers: { ...cors(origin, env), 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
}

function reply(status, data, origin, env) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors(origin, env) } });
}

// at most `max` bytes of JSON object, else null
async function readJson(req, max) {
  const text = await req.text();
  if (text.length > max) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

// a rate-limit binding keyed on the connection's IP (Cloudflare keeps the count, briefly;
// nothing is stored here). Missing binding = no limit (local dev).
async function allowed(limiter, req) {
  if (!limiter) return true;
  const { success } = await limiter.limit({ key: req.headers.get('cf-connecting-ip') || 'none' });
  return success;
}

const pick = (v, list, dflt = null) => (list.includes(v) ? v : dflt);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const version = (v) => (typeof v === 'string' && /^\d{1,2}\.\d{1,3}$/.test(v) ? v : 'dev');
const country = (req) => { const c = req.cf && req.cf.country; return typeof c === 'string' && /^[A-Z]{2}$/.test(c) ? c : 'XX'; };
const today = () => new Date().toISOString().slice(0, 10);

// --- play stats --------------------------------------------------------------------------------
// { sid, v, p, open, active, races: [{ t, m, mi, r }], online: { hosted, players, failed },
//   perf: { q, fps }, errors: [{ k, m }] } — counts since the game's last beat
async function beat(req, env, b) {
  if (!(await allowed(env.BEAT_LIMIT, req))) return [429, { error: 'slow down' }];
  const sid = typeof b.sid === 'string' && /^[a-z0-9]{16,40}$/.test(b.sid) ? b.sid : null;
  const platform = pick(b.p, PLATFORMS);
  if (!sid || !platform) return [400, { error: 'bad beat' }];
  const now = Date.now(), day = today(), ver = version(b.v), cc = country(req);
  const db = env.DB;

  // play time counts only as fast as real time passes for this session (slack for timers)
  const live = await db.prepare('SELECT last FROM live WHERE sid = ?').bind(sid).first();
  const elapsed = live ? (now - live.last) / 1000 + 20 : 30;
  const open = Math.round(num(b.open, 0, elapsed));
  const active = Math.round(Math.min(open, num(b.active, 0, elapsed)));
  const on = b.online && typeof b.online === 'object' ? b.online : {};

  const st = [
    db.prepare('INSERT INTO live (sid, last) VALUES (?, ?) ON CONFLICT (sid) DO UPDATE SET last = excluded.last').bind(sid, now),
    db.prepare(`INSERT INTO daily (day, country, platform, version, sessions, open_s, active_s, rooms_hosted, room_players, conn_failed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (day, country, platform, version) DO UPDATE SET sessions = sessions + excluded.sessions,
        open_s = open_s + excluded.open_s, active_s = active_s + excluded.active_s,
        rooms_hosted = rooms_hosted + excluded.rooms_hosted, room_players = room_players + excluded.room_players,
        conn_failed = conn_failed + excluded.conn_failed`)
      .bind(day, cc, platform, ver, live ? 0 : 1, open, active, num(on.hosted, 0, 5) | 0, num(on.players, 0, 40) | 0, num(on.failed, 0, 10) | 0),
  ];

  // races, tallied per track / mode / mirrored
  const tally = new Map();
  for (const r of Array.isArray(b.races) ? b.races.slice(0, 30) : []) {
    const t = pick(r && r.t, TRACKS), m = pick(r && r.m, MODES), res = pick(r && r.r, ['start', 'finish', 'quit']);
    if (!t || !m || !res) continue;
    const key = `${t}|${m}|${r.mi ? 1 : 0}`;
    const c = tally.get(key) || { start: 0, finish: 0, quit: 0 };
    c[res]++;
    tally.set(key, c);
  }
  for (const [key, c] of tally) {
    const [t, m, mi] = key.split('|');
    st.push(db.prepare(`INSERT INTO daily_races (day, track, mode, mirrored, started, finished, quit) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (day, track, mode, mirrored) DO UPDATE SET started = started + excluded.started,
        finished = finished + excluded.finished, quit = quit + excluded.quit`).bind(day, t, m, +mi, c.start, c.finish, c.quit));
  }

  // one frame-rate sample per beat
  const q = pick(b.perf && b.perf.q, QUALITIES);
  if (q && b.perf.fps > 0) {
    st.push(db.prepare(`INSERT INTO daily_perf (day, platform, quality, samples, fps_sum) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT (day, platform, quality) DO UPDATE SET samples = samples + 1, fps_sum = fps_sum + excluded.fps_sum`)
      .bind(day, platform, q, num(b.perf.fps, 1, 360)));
  }

  // errors, with anything that looks like a file path or URL taken out
  for (const e of Array.isArray(b.errors) ? b.errors.slice(0, 5) : []) {
    const kind = clean(e && e.k, 40).replace(/[^A-Za-z]/g, '') || 'Error';
    const msg = clean(e && e.m, 160).replace(/[A-Za-z]:\\\S*/g, '<path>').replace(/(file|app|https?):\/\/\S*/g, '<url>').replace(/\/(Users|home)\/\S*/g, '<path>');
    if (!msg) continue;
    st.push(db.prepare(`INSERT INTO daily_errors (day, kind, message, count) VALUES (?, ?, ?, 1)
      ON CONFLICT (day, kind, message) DO UPDATE SET count = count + 1`).bind(day, kind, msg));
  }

  await db.batch(st);
  return [200, { ok: true }];
}

// plain text only: no control characters (but newlines), trimmed to `max`
function clean(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

// --- feedback ------------------------------------------------------------------------------------
// { kind, text, v, p, track, q }
async function feedback(req, env, b) {
  if (!(await allowed(env.FEEDBACK_LIMIT, req))) return [429, { error: 'slow down' }];
  const kind = pick(b.kind, KINDS, 'other');
  let text = clean(b.text, FEEDBACK_MAX);
  if (text.length < 3) return [400, { error: 'empty' }];
  // personal details typed in by mistake
  text = text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email removed]').replace(/\+?\d[\d\s().\/-]{7,}\d/g, '[number removed]');
  // link spam
  if ((text.match(/https?:\/\/|www\./gi) || []).length > 2) return [400, { error: 'too many links' }];
  const db = env.DB, day = today();
  const n = await db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE created >= ?').bind(day).first();
  if (n && n.n >= FEEDBACK_PER_DAY) return [429, { error: 'full today' }];
  const hash = await sha256(text.toLowerCase().replace(/\s+/g, ' '));
  const dup = await db.prepare('SELECT id FROM feedback WHERE hash = ? AND created >= ?').bind(hash, new Date(Date.now() - 86400000).toISOString()).first();
  if (dup) return [200, { ok: true }]; // the same text again: thank them, keep one copy
  await db.prepare('INSERT INTO feedback (created, kind, text, hash, version, platform, track, quality, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), kind, text, hash, version(b.v), pick(b.p, PLATFORMS, 'web-desktop'), pick(b.track, TRACKS, '-'), pick(b.q, QUALITIES, '-'), country(req)).run();
  return [200, { ok: true }];
}

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// --- the owner's side ---------------------------------------------------------------------------
async function admin(req, env, url) {
  const key = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!env.ADMIN_KEY || !(await same(key, env.ADMIN_KEY))) return json(401, { error: 'wrong key' });
  const db = env.DB;
  if (url.pathname === '/v1/stats' && req.method === 'GET') {
    const days = Math.round(num(+url.searchParams.get('days') || 30, 1, 3650));
    const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const q = (sql, ...a) => db.prepare(sql).bind(...a).all().then((r) => r.results);
    const [byDay, byCountry, byPlatform, byVersion, races, perf, errors, fb, all] = await Promise.all([
      q('SELECT day, SUM(sessions) s, SUM(open_s) o, SUM(active_s) a, SUM(rooms_hosted) rh, SUM(room_players) rp, SUM(conn_failed) cf FROM daily WHERE day >= ? GROUP BY day ORDER BY day', from),
      q('SELECT country, SUM(sessions) s, SUM(active_s) a FROM daily WHERE day >= ? GROUP BY country ORDER BY s DESC', from),
      q('SELECT platform, SUM(sessions) s, SUM(active_s) a FROM daily WHERE day >= ? GROUP BY platform ORDER BY s DESC', from),
      q('SELECT version, SUM(sessions) s, SUM(active_s) a FROM daily WHERE day >= ? GROUP BY version ORDER BY s DESC', from),
      q('SELECT track, mode, mirrored, SUM(started) st, SUM(finished) fi, SUM(quit) qu FROM daily_races WHERE day >= ? GROUP BY track, mode, mirrored', from),
      q('SELECT platform, quality, SUM(samples) n, SUM(fps_sum) f FROM daily_perf WHERE day >= ? GROUP BY platform, quality', from),
      q('SELECT kind, message, SUM(count) n, MAX(day) last FROM daily_errors WHERE day >= ? GROUP BY kind, message ORDER BY n DESC LIMIT 40', from),
      q('SELECT id, created, kind, text, version, platform, track, quality, country, status FROM feedback ORDER BY id DESC LIMIT 300'),
      q('SELECT SUM(sessions) s, SUM(open_s) o, SUM(active_s) a, MIN(day) first FROM daily'),
    ]);
    return json(200, { days, from, byDay, byCountry, byPlatform, byVersion, races, perf, errors, feedback: fb, allTime: all[0] || {} });
  }
  let m = url.pathname.match(/^\/v1\/admin\/feedback\/(\d+)$/);
  if (m && req.method === 'POST') {
    const b = await readJson(req, 512);
    const status = pick(b && b.status, ['new', 'done']);
    if (!status) return json(400, { error: 'status' });
    await db.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(status, +m[1]).run();
    return json(200, { ok: true });
  }
  if (m && req.method === 'DELETE') {
    await db.prepare('DELETE FROM feedback WHERE id = ?').bind(+m[1]).run();
    return json(200, { ok: true });
  }
  // wipe one day's stats (a burst of fake data)
  m = url.pathname.match(/^\/v1\/admin\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (m && req.method === 'DELETE') {
    await db.batch(['daily', 'daily_races', 'daily_perf', 'daily_errors'].map((t) => db.prepare(`DELETE FROM ${t} WHERE day = ?`).bind(m[1])));
    return json(200, { ok: true });
  }
  return json(404, { error: 'not found' });
}

function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

// constant-time compare of the admin key
async function same(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
