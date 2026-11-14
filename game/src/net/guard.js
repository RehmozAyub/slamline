// Checks on everything that arrives from other players (online.js, onlineMenu.js): another
// device can run a changed copy of the game, so its messages are data to check, never to
// trust. Out-of-range numbers become safe values, text is stripped to plain characters before
// it can reach the screen, and a link that floods messages has the extra ones dropped.

// a finite number within [lo, hi], else `dflt`
export const num = (v, lo, hi, dflt = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

// a whole number within [lo, hi], else `dflt`
export const int = (v, lo, hi, dflt = -1) => (Number.isInteger(v) && v >= lo && v <= hi ? v : dflt);

// a player id: 'p0' (the host) .. 'p7'
export const playerId = (v) => (typeof v === 'string' && /^p[0-7]$/.test(v) ? v : null);

// a popup label like 'TAKEDOWN!' or 'TRAIN WRECK' (only capitals, digits and a little punctuation)
export const label = (v, dflt = 'TAKEDOWN!') => (typeof v === 'string' && /^[A-Z0-9 !'.×-]{1,28}$/.test(v) ? v : dflt);

// plain text for the screen: no markup characters, short
export const text = (v, max = 40) => String(v ?? '').replace(/[<>&"'`\\]/g, '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);

// a results list from the host: every string made plain, every number finite, at most 16 rows
export function results(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 16).filter((r) => r && typeof r === 'object').map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r).slice(0, 24)) {
      if (typeof v === 'string') out[k] = text(v);
      else if (typeof v === 'number') out[k] = Number.isFinite(v) ? v : 0;
      else if (typeof v === 'boolean' || v === null) out[k] = v;
      else if (Array.isArray(v)) out[k] = v.slice(0, 8).map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0));
    }
    return out;
  });
}

// at most `rate` events per second (bursts up to `burst`) per link; the rest are dropped
export class Gate {
  constructor(rate, burst = rate * 2) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.last = performance.now();
  }

  pass() {
    const now = performance.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}

// a reliable message small enough to handle (a full results table is a few kB)
export function smallMessage(m, max = 32768) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.type !== 'string' || m.type.length > 24) return false;
  try { return JSON.stringify(m).length <= max; } catch { return false; }
}
