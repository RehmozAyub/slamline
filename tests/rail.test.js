import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackPath } from '../game/src/trackMath.js';
import { LAYOUTS } from '../game/src/maps/layouts.js';
import { Rail, RAIL, tryEnterRail, railStep, railContacts } from '../game/src/rail.js';
import { Vehicle } from '../game/src/vehicle.js';
import { CARS } from '../game/src/config.js';

const lay = LAYOUTS.volcano;
const track = new TrackPath(lay.points, { width: lay.width });
const rail = new Rail(track, lay.features.find((f) => f.type === 'loop'));
rail.flattenCurvature();
const gas = { steer: 0, throttle: 1, brake: 0, boost: false };

// drive v with controls c for up to `seconds`, the way the race does (rail or road)
function drive(v, c, seconds, onExit = () => {}) {
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    if (v.ride) { const out = railStep(v, c, dt); if (out) onExit(out, v); continue; }
    v.update(dt, c);
    v.constrain(track);
    tryEnterRail(v, [rail], track);
  }
}

test('the loop joins the main road exactly and goes upside down', () => {
  for (const [u, s] of [[0, rail.sA], [rail.length, rail.sB]]) {
    const a = rail.pose(u, 3), b = track.pointAt(s, 3);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.05, `seam at u=${u}`);
  }
  const top = rail.pose(RAIL.lead + rail.midArc / 2, 0);
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
  assert.equal(v.ride, null);
  assert.equal(v.pose, null);
  v.placeOnTrack(track, rail.sA - 20, 0, 50);
  drive(v, gas, 1.4);
  rode = !!v.ride;
  if (v.pose) maxY = v.pose.y;
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
  assert.equal(back.ride, null, 'not stuck on the rail');
});

test('cars on the rail do not pass through each other', () => {
  const a = new Vehicle(CARS[0]), b = new Vehicle(CARS[1]);
  for (const v of [a, b]) { v.placeOnTrack(track, rail.sA + 2, 0, 50); tryEnterRail(v, [rail], track); }
  a.ride.u = 40; b.ride.u = 41; a.ride.vF = 60; b.ride.vF = 40;
  railContacts([a, b]);
  assert.ok(b.ride.u - a.ride.u >= RAIL.carLen - 1e-6, 'pushed apart along the rail');
  assert.ok(a.ride.vF <= b.ride.vF, 'the one behind is slowed');
});

// --- the corkscrew (Sunset Coast): a full roll round the road's own line -------------------------
const coast = LAYOUTS.coast;
const coastTrack = new TrackPath(coast.points, { width: coast.width });
const screw = new Rail(coastTrack, coast.features.find((f) => f.type === 'corkscrew'));
screw.flattenCurvature();

test('the corkscrew joins the road exactly and is upside down halfway, up over the road', () => {
  for (const [u, s] of [[0, screw.sA], [screw.length, screw.sB]]) {
    const a = screw.pose(u, 3), b = coastTrack.pointAt(s, 3);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.05, `seam at u=${u}`);
  }
  const top = screw.pose(RAIL.lead + screw.midArc / 2, 0);
  const under = coastTrack.pointAt(screw.sOf(RAIL.lead + screw.midArc / 2), 0);
  assert.ok(top.uy < -0.99, `upside down halfway (up.y ${top.uy})`);
  assert.ok(Math.abs(top.y - under.y - 2 * screw.radius) < 0.5 && Math.hypot(top.x - under.x, top.z - under.z) < 0.5, 'straight above the road');
});

test('a car drives through the corkscrew and out in its lane at speed', () => {
  const v = new Vehicle(CARS[1]);
  v.placeOnTrack(coastTrack, screw.sA - 50, -4, 65);
  let exit = null, minUy = 1, lane = null;
  const dt = 1 / 120;
  for (let t = 0; t < 8 && !exit; t += dt) {
    if (v.ride) { const out = railStep(v, gas, dt); if (v.pose) minUy = Math.min(minUy, v.pose.uy); if (out) exit = { out, s: v.s, lat: v.lateral, speed: v.speed }; continue; }
    v.update(dt, gas);
    v.constrain(coastTrack);
    tryEnterRail(v, [screw], coastTrack);
    if (v.ride) lane = v.ride.lat;
  }
  assert.equal(exit && exit.out, 'done');
  assert.ok(minUy < -0.95, `went upside down (${minUy})`);
  assert.ok(Math.abs(exit.lat - lane) < 0.3, `kept its lane (in at ${lane}, out at ${exit.lat})`);
  assert.ok(exit.speed > 50, `kept its speed (${exit.speed})`);
});

// --- the helix (Neon City): driven freely up a car park, off the roof ---------------------------
const city = LAYOUTS.city;
const cityTrack = new TrackPath(city.points, { width: city.width });
const helix = new Rail(cityTrack, city.features.find((f) => f.type === 'helix'));
helix.flattenCurvature();

// drive with a per-step control function until the car leaves the helix (or time runs out)
function driveHelix(v, ctl, seconds, steerable = true) {
  const dt = 1 / 120;
  let out = null, wall = 0, topSpeed = 0;
  for (let t = 0; t < seconds && !out; t += dt) {
    if (v.ride) {
      const r = railStep(v, ctl(v), dt, 1, steerable);
      if (v.railHit) wall++;
      if (v.ride) topSpeed = Math.max(topSpeed, Math.hypot(v.ride.vF, v.ride.vx));
      if (r) out = { out: r, speed: v.speed, lat: v.lateral };
      continue;
    }
    v.update(dt, ctl(v));
    v.constrain(cityTrack);
    tryEnterRail(v, [helix], cityTrack);
  }
  return { out, wall, topSpeed };
}

// a driver holding the middle of the deck
const holdLane = (lane = 0) => (v) => {
  if (!v.ride) return gas;
  const want = Math.max(-0.3, Math.min(0.3, 0.08 * (v.ride.lat - lane)));
  return { ...gas, steer: Math.max(-1, Math.min(1, 3 * (v.ride.h - want))) };
};

test('the helix deck never dips under the street, even at its low edge', () => {
  const ground = cityTrack.pointAt(helix.s0, 0).y, hw = cityTrack.halfWidth + 0.6;
  let worst = Infinity;
  for (let u = 0; u < helix.length; u += 1) for (const lat of [-hw, hw]) worst = Math.min(worst, helix.pose(u, lat).y - ground);
  assert.ok(worst > -0.05, `lowest edge ${worst.toFixed(2)} m from the street`);
});

test('a car steering up the helix drives off the roof, its speed its own', () => {
  const v = new Vehicle(CARS[1]);
  v.placeOnTrack(cityTrack, helix.sA - 40, 0, 45);
  const run = driveHelix(v, holdLane(), 20);
  assert.equal(run.out && run.out.out, 'air', 'launched off the roof');
  assert.ok(run.wall < 30, `barely touched the walls (${run.wall} knocks)`);
  assert.ok(v.air, 'flying');
});

test('on the helix the car turns, slides and is not carried', () => {
  const v = new Vehicle(CARS[0]);
  v.placeOnTrack(cityTrack, helix.sA - 10, 0, 40);
  driveHelix(v, (car) => (car.ride && car.ride.t > 0.4 ? { ...gas, steer: 1 } : gas), 1.2);
  assert.ok(v.ride && v.ride.free, 'on the helix');
  assert.ok(Math.abs(v.ride.h) > 0.1, `turned on the deck (h ${v.ride.h.toFixed(2)})`);
  // coast in slowly: no minimum speed pushes it up, it just rolls to a stop
  const slow = new Vehicle(CARS[3]);
  slow.placeOnTrack(cityTrack, helix.sA - 3, 0, 9);
  const coast = driveHelix(slow, (car) => (car.ride ? { steer: 0, throttle: 0, brake: 0, boost: false } : gas), 40);
  assert.ok(coast.topSpeed < 15, `never pushed along (${coast.topSpeed.toFixed(1)} m/s)`);
  assert.ok(!coast.out || coast.out.out === 'back', 'not carried up and off');
});

test('a car not steering drifts to the outside wall and scrapes up it, no crash', () => {
  const v = new Vehicle(CARS[2]);
  v.placeOnTrack(cityTrack, helix.sA - 30, 0, 45);
  const run = driveHelix(v, () => gas, 25);
  assert.ok(run.wall > 0, 'met the wall');
  assert.equal(run.out && run.out.out, 'air', 'still made it up and off');
  assert.ok(!v.wrecked);
});

test('the AI is kept in its lane up the helix', () => {
  const v = new Vehicle(CARS[4]);
  v.placeOnTrack(cityTrack, helix.sA - 20, 3, 45);
  let lane = null, worst = 0;
  const dt = 1 / 120;
  for (let t = 0; t < 20; t += dt) {
    if (v.ride) {
      if (lane === null) lane = v.ride.lat;
      worst = Math.max(worst, Math.abs(v.ride.lat - lane));
      if (railStep(v, gas, dt, 1, false)) break;
      continue;
    }
    v.update(dt, gas); v.constrain(cityTrack); tryEnterRail(v, [helix], cityTrack);
  }
  assert.ok(v.air, 'off the roof');
  assert.ok(worst < 0.5, `held its lane (strayed ${worst.toFixed(2)} m)`);
});
