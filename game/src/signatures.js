// Signature takedowns (pure logic): four named spots per track. The first time a player takes a
// rival down at one, the game shows a snapshot of the crash with the spot's name and a one-liner.
//   line     - within reach of the start / finish line
//   hairpin  - the tightest bend on the track
//   shortcut - on the shortcut
//   landmark - the map's landmark stretch (lighthouse, water tower, river crossing...)

export const SIGNATURES = {
  coast: {
    landmark: { name: 'LIGHTHOUSE KEEPER', line: 'Guiding ships home. Not drivers.' },
    shortcut: { name: 'BEACH BYPASS', line: 'Shortcut? More like a short career.' },
    hairpin: { name: 'CLIFFHANGER', line: 'They took the scenic route. Straight down.' },
    line: { name: 'SUNSET STRIP', line: 'So close they could taste the champagne.' },
  },
  city: {
    landmark: { name: 'NEON NIGHTMARE', line: 'Lit up like a billboard.' },
    shortcut: { name: 'BACK ALLEY BRAWL', line: 'Nobody saw a thing.' },
    hairpin: { name: 'DOWNTOWN DETOUR', line: 'Recalculating... recalculating...' },
    line: { name: 'RED LIGHT RUNNER', line: 'The finish line was right there.' },
  },
  alpine: {
    landmark: { name: 'DOWNHILL DEMOLITION', line: 'Gravity did the rest.' },
    shortcut: { name: 'GOAT TRAIL', line: 'Only goats should take that path.' },
    hairpin: { name: 'SWITCHBACK SMASH', line: 'Switched back. Then switched off.' },
    line: { name: 'SUMMIT SNUB', line: 'Top of the world, bottom of the table.' },
  },
  snow: {
    landmark: { name: 'THIN ICE', line: 'They were skating on it. Literally.' },
    shortcut: { name: 'SNOWPLOUGHED', line: 'Cleared the road. With their face.' },
    hairpin: { name: 'ICE PICK', line: 'Picked out of the pack.' },
    line: { name: 'COLD FINISH', line: 'Frozen out at the flag.' },
  },
  canyon: {
    landmark: { name: 'HIGH AND DRY', line: 'Water tower: 1. Them: 0.' },
    shortcut: { name: 'DRY RUN', line: 'Practice makes wrecked.' },
    hairpin: { name: 'CANYON CARVER', line: 'Carved a new line into the rock.' },
    line: { name: 'DUST TO DUST', line: 'Arrived in style. Left in pieces.' },
  },
  jungle: {
    landmark: { name: 'WASHED UP', line: 'Swept away by the current.' },
    shortcut: { name: 'MUD BATH', line: 'Spa day came early.' },
    hairpin: { name: 'VINE SWINGER', line: 'Tarzan would be proud.' },
    line: { name: 'JUNGLE JUSTICE', line: 'The law of the jungle, served cold.' },
  },
  canal: {
    landmark: { name: 'BRIDGE OUT', line: 'Took the scenic route. Into the canal.' },
    shortcut: { name: 'BIKE LANE', line: 'Ring ring. Too late.' },
    hairpin: { name: 'GABLE GRINDER', line: 'Tight streets, tighter exits.' },
    line: { name: 'FLAT FINISH', line: 'Flattest town around. Flattest exit too.' },
  },
  airport: {
    landmark: { name: 'GROUNDED', line: 'Cleared for takeoff. Not for landing.' },
    shortcut: { name: 'TAXI SERVICE', line: 'Wrong gate. Wrong everything.' },
    hairpin: { name: 'HOLDING PATTERN', line: 'Circled once. Never came back.' },
    line: { name: 'FINAL APPROACH', line: 'Missed the runway by a mile.' },
  },
  space: {
    landmark: { name: 'GATE CRASHER', line: 'Wrong way through the stargate.' },
    shortcut: { name: 'WORMHOLE', line: 'In through the wormhole, out of the race.' },
    hairpin: { name: 'SLINGSHOT', line: 'Gravity assist: denied.' },
    line: { name: 'LAUNCH ABORT', line: 'Houston, they have a problem.' },
  },
};
export const SIGNATURE_KINDS = ['landmark', 'shortcut', 'hairpin', 'line'];

export const SIG_RULES = { lineRange: 60, hairpinRange: 45 };

// s of the tightest bend (largest |curvature|), away from the start line.
export function hairpinS(track) {
  let best = 0, bestC = 0;
  for (let i = 0; i < track.n; i++) {
    const s = i * track.step;
    if (Math.abs(track.deltaS(0, s)) < 150) continue;
    if (Math.abs(track.curv[i]) > bestC) { bestC = Math.abs(track.curv[i]); best = s; }
  }
  return best;
}

// Which signature spot (if any) a takedown at road position s belongs to.
// ctx: { track, s, onShortcut, hairpin, landmark: { s: [...], range } | null }
export function signatureAt(mapId, ctx, R = SIG_RULES) {
  const defs = SIGNATURES[mapId];
  if (!defs) return null;
  const near = (a, range) => Math.abs(ctx.track.deltaS(ctx.s, a)) < range;
  for (const kind of SIGNATURE_KINDS) {
    let hit = false;
    if (kind === 'landmark') hit = !!ctx.landmark && ctx.landmark.s.some((a) => near(a, ctx.landmark.range));
    else if (kind === 'shortcut') hit = !!ctx.onShortcut;
    else if (kind === 'hairpin') hit = ctx.hairpin !== null && ctx.hairpin !== undefined && near(ctx.hairpin, R.hairpinRange);
    else if (kind === 'line') hit = near(0, R.lineRange);
    if (hit) return { id: kind, ...defs[kind] };
  }
  return null;
}
