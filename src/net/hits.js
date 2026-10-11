// Online hits between players: earliest hit wins.
//
// Both devices see a contact between two player cars at almost the same moment, but not quite
// the same way (each sees the other car predicted across the lag). Each sends the host a claim
// stamped with the shared clock: who rammed whom, and whether it was a takedown or a push. The
// host pairs up the two claims for the same contact (per pair of players) and the earliest one
// decides. A claim the other side never matched stands if the cars really were that close at
// that moment (the caller's `plausible` check, allowing for the lag).
export const HIT = {
  pairWindow: 0.3, // s: claims this close in time are the same contact
  extra: 0.08, // s: wait a round trip plus this for the other side's claim
  cooldown: 0.5, // s: after an outcome, further claims about the same contact are ignored
};

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class HitJudge {
  constructor() {
    this.pending = []; // { key, claims: [], deadline }
    this.last = new Map(); // pair -> claim time of its last decided contact
  }

  // claim: { from, t, attacker, victim, kind: 'takedown' | 'push', nx, nz, closing } (player ids)
  // `now`: host shared time it arrived; `rtt`: round trip between the two players (s)
  // Returns an outcome when this claim completes a pair, else null.
  add(claim, now, rtt) {
    const key = pairKey(claim.attacker, claim.victim);
    const last = this.last.get(key) ?? -Infinity;
    if (claim.t - last < HIT.cooldown && claim.t >= last - HIT.pairWindow) return null;
    const p = this.pending.find((q) => q.key === key && Math.abs(q.claims[0].t - claim.t) < HIT.pairWindow);
    if (p) {
      const mine = p.claims.find((c) => c.from === claim.from);
      if (mine) { if (claim.t < mine.t) p.claims[p.claims.indexOf(mine)] = claim; return null; } // the same side again
      p.claims.push(claim);
      this.pending.splice(this.pending.indexOf(p), 1);
      return this.decide(key, p.claims);
    }
    this.pending.push({ key, claims: [claim], deadline: now + rtt + HIT.extra });
    return null;
  }

  // lone claims whose wait ran out: kept if plausible(claim). Returns the outcomes.
  update(now, plausible) {
    const out = [];
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (now < p.deadline) continue;
      this.pending.splice(i, 1);
      const c = p.claims[0];
      if (plausible(c)) { const o = this.decide(p.key, [c]); if (o) out.push(o); }
    }
    return out;
  }

  // the earliest claim decides who was the attacker and what kind of hit it was
  decide(key, claims) {
    const first = claims.reduce((a, c) => (c.t < a.t ? c : a));
    if (first.t - (this.last.get(key) ?? -Infinity) < HIT.cooldown) return null;
    this.last.set(key, first.t);
    return { attacker: first.attacker, victim: first.victim, kind: first.kind, nx: first.nx, nz: first.nz, t: first.t, paired: claims.length > 1 };
  }
}

// is a lone claim believable? a, b: the two cars' positions at the claim time (History.at);
// rtt: round trip between the two players (s). Cars touch at about 5 m centre to centre; allow
// for how far they move in the one-way lag, plus slack.
export function plausibleContact(a, b, rtt) {
  if (!a || !b) return false;
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  return d <= 5 + Math.max(a.speed, b.speed) * (rtt / 2) + 1.5;
}
