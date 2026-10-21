import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackPath } from '../game/src/trackMath.js';
import { LAYOUTS } from '../game/src/maps/layouts.js';
import { LoopRail, LOOP, tryEnterLoop, loopStep, loopContacts } from '../game/src/loop.js';
import { Vehicle } from '../game/src/vehicle.js';
import { CARS } from '../game/src/config.js';

const lay = LAYOUTS.volcano;
const track = new TrackPath(lay.points, { width: lay.width });
const rail = new LoopRail(track, lay.loops[0]);
rail.flattenCurvature();
const gas = { steer: 0, throttle: 1, brake: 0, boost: false };

// drive v with controls c for up to `seconds`, the way the race does (rail or road)
function drive(v, c, seconds, onExit = () => {}) {
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    if (v.loop) { const out = loopStep(v, c, dt); if (out) onExit(out, v); continue; }
    v.update(dt, c);
    v.constrain(track);
    tryEnterLoop(v, [rail], track);
  }
}

test('the loop joins the main road exactly and goes upside down', () => {
  for (const [u, s] of [[0, rail.sA], [rail.length, rail.sB]]) {
    const a = rail.pose(u, 3), b = track.pointAt(s, 3);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.05, `seam at u=${u}`);
  }
  const top = rail.pose(LOOP.lead + rail.loopArc / 2, 0);
  assert.ok(top.uy < -0.99, `upside down at the top (up.y ${top.uy})`);
  assert.ok(top.y - track.pointAt(rail.s0).y > 35, `tall (${top.y})`);
  assert.ok(Math.abs(rail.exitTurn) < 0.01, 'entry and exit run the same way');
});

test('the way down clears the way up', () => {
  const hw = track.halfWidth + 0.6;
  let worst = Infinity;
  for (let i = 0; i < rail.length; i += 2) {
    for (let j = i + 60; j < rail.length; j += 2) {
      for (const la of [-hw, hw]) for (const lb of [-hw, hw]) {
        const a = rail.pose(i, la), b = rail.pose(j, lb);
        worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    }
  }
  assert.ok(worst > 2.5, `closest approach ${worst.toFixed(2)} m`);
});

test('sOf and uOf are inverses, and race progress never goes backwards on the rail', () => {
  let last = -1;
  for (let u = 0; u <= rail.length; u += 1.7) {
    const s = rail.sOf(u);
    assert.ok(Math.abs(rail.uOf(s) - u) < 0.05, `u ${u}`);
    assert.ok(track.deltaS(rail.sA, s) >= last - 1e-6, `s went back at u=${u}`);
    last = track.deltaS(rail.sA, s);
  }
});

test('a car drives into the loop, round it and out the far end in its lane', () => {
  const v = new Vehicle(CARS[0]);
  v.placeOnTrack(track, rail.sA - 60, 4, 60);
  let exit = null, rode = false, maxY = 0;
  drive(v, gas, 8, (out) => { if (!exit) exit = { out, s: v.s, lat: v.lateral, speed: v.speed }; });
  assert.equal(exit && exit.out, 'done');
  assert.ok(Math.abs(track.deltaS(rail.sB, exit.s)) < 2, `came out at ${exit.s} (rail ends ${rail.sB})`);
  assert.ok(Math.abs(exit.lat - 4) < 0.5, `kept its lane (${exit.lat})`);
  assert.ok(exit.speed > 40, `kept its speed (${exit.speed})`);
  // and it is back to normal road driving afterwards
  assert.equal(v.loop, null);
  assert.equal(v.loopPose, null);
  v.placeOnTrack(track, rail.sA - 20, 0, 50);
  drive(v, gas, 1.4);
  rode = !!v.loop;
  if (v.loopPose) maxY = v.loopPose.y;
  assert.ok(rode && maxY > track.pointAt(rail.s0).y + 2, `climbing the loop again next lap (${maxY})`);
});

test('a slow car is carried round, a reversing car rolls back out', () => {
  const slow = new Vehicle(CARS[3]);
  slow.placeOnTrack(track, rail.sA - 4, 0, 6);
  let out = null;
  drive(slow, { ...gas, throttle: 0.3 }, 15, (o) => { out = out || o; });
  assert.equal(out, 'done');
  const back = new Vehicle(CARS[2]);
  back.placeOnTrack(track, rail.sB + 8, 0, 0);
  back.heading += Math.PI; // facing back up the exit
  back.vx = Math.sin(back.heading) * 12; back.vz = Math.cos(back.heading) * 12;
  let outB = null;
  drive(back, { steer: 0, throttle: 0, brake: 0, boost: false }, 20, (o) => { outB = outB || o; });
  assert.ok(outB === 'done' || outB === 'back', `rolled out (${outB})`);
  assert.equal(back.loop, null, 'not stuck on the rail');
});

test('cars on the rail do not pass through each other', () => {
  const a = new Vehicle(CARS[0]), b = new Vehicle(CARS[1]);
  for (const v of [a, b]) { v.placeOnTrack(track, rail.sA + 2, 0, 50); tryEnterLoop(v, [rail], track); }
  a.loop.u = 40; b.loop.u = 41; a.loop.vF = 60; b.loop.vF = 40;
  loopContacts([a, b]);
  assert.ok(b.loop.u - a.loop.u >= LOOP.carLen - 1e-6, 'pushed apart along the rail');
  assert.ok(a.loop.vF <= b.loop.vF, 'the one behind is slowed');
});
