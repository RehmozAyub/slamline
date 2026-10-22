# SLAMLINE

Arcade 3D takedown racing in the browser — Burnout-style boost, takedowns and power-ups across ten tracks.

**Play now:** https://rehmozayub.github.io/slamline/
**Windows exe:** see [Releases](https://github.com/RehmozAyub/slamline/releases) (portable, no install)
**Android:** download `Slamline.apk` from [Releases](https://github.com/RehmozAyub/slamline/releases) on your phone and open it (allow installing from your browser when Android asks). It runs offline. On an iPhone, open the Play now link and use Share → Add to Home Screen.

## Features

- 10 tracks with their own weather: Sunset Coast (a cliff jump over a cove, a sea cave and a corkscrew through a sea arch), Neon City (a car-park helix with a roof jump, a neon wall-ride and a subway dive), Alpine Pass (a ski jump over a ravine, an avalanche gallery and a corkscrew on a viaduct by a waterfall), Whiteout Summit (snowfall, aurora, a corkscrew through an ice tube, a slippery frozen-lake crossing and a bobsleigh wall-ride), Scorched Canyon (dust storm, a broken-bridge jump over a gorge, a slot-canyon wall-ride and an ore train over a level crossing), Monsoon Jungle (thunderstorm, a temple tunnel behind a waterfall, a jump where the river bridge washed out and a corkscrew through an idol gate), Canal Quarter (golden hour over the canals, humpback bridges), Nebula Ring (an orbital speedway above a ringed gas giant) Skyport (an airport: the runway is the main straight, taxiway shortcuts, jets taking off overhead) and Magma Core (inside a live volcano: a lava lake, lava falls down the crater walls, two lava-tube tunnels and a loop-the-loop)
- 8 cars — Viper, Bolt, Raptor, Titan, Phantom, Rogue, the fighter-jet styled Jetstream and the starfighter-styled Pulsar — each with its own livery and balanced so every pick is competitive
- 2 to 12 cars per race (Settings → CARS PER RACE; online the host picks it in the lobby)
- 10 tracks, or **Random Track** to let the game pick. Each card shows the track's shape; the scenery loads once you pick one
- **Set pieces:** loops, corkscrews and car-park spirals carry you round (nothing can wreck you on them) and pay out boost; jumps over gorges, coves and rivers (come up short and you drop in); avalanche galleries and temple tunnels; a frozen lake where your tyres barely grip; wall-rides that curl the road up into a half-pipe (ride high for WALL RIDE boost); tunnels; and level crossings where a train flattens anything in its way (shove a rival under it for a TRAIN WRECK)
- **Paint picker**: one row of chips under the car, recoloured on the spot; hover a chip to preview it, and the paints you are still earning show how close you are
- **2-3 secret shortcuts** on every track, marked by softly pulsing arrows at the fork (some AI rivals take them too): ramps with airtime boost (drift into a jump for a flat spin, keep holding for an aerial donut, or barrel roll off a half ramp), and hidden ones behind wooden fences you smash through
- **Rivals:** whoever wrecks you is marked RIVAL; take them out for a PAYBACK boost
- **Signature takedowns:** four named spots per track; the first one you find snaps a photo of the crash
- **Three stars per track** (win, 5 takedowns, no crashes) and **earned paints** (takedowns and stars unlock 8 more, including chrome and gold)
- **Final lap drama:** the music lifts, and a player right behind the leader gets pulled along
- **Drive Assist** (on by default, per player): you still steer — it nudges you off the walls, calms over-steering, brakes for bends you would miss and makes wall hits less punishing — toggle it any time with H, [ or the gamepad Back button, or from the pause menu
- **2-player split screen** on one keyboard (or two gamepads) — take each other out too
- **Online rooms for 2-8 players:** ONLINE → HOST gives a 4-letter room code, friends pick JOIN and type it. Everyone plus AI rivals (the host picks how many), each on your own PC, phone or browser; pick a name, the host picks the track. Cars are sent 60 times a second and smoothed; a hit between the two of you goes to whoever hit first. No account needed: a free matchmaking service connects you, then the games talk directly. Some pairs of networks have no direct route and need a relay server (see Development)
- Boost meter filled by drifting, near misses, slipstreaming and takedowns, with an adrenaline chain multiplier up to ×5
- Takedowns with slow-motion crash cam; rivals can take you out too
- Road pickups: boost rings that respawn, and power-up blocks that show what they hold (grabbing a new one replaces yours; AI rivals grab about half of the blocks they drive through; pickups come back after half a second) — **Shockwave** (wrecks everyone near you), **Ricochet** (a shot that bounces down the road until it hits a rival), **Lightning Strike** (hits the car ahead), **Oil Slick** (drop it behind you — chasers crash)
- **Phones and tablets:** touch controls, with the car accelerating by itself. Steer with a thumb slider (default), ◀ ▶ buttons or by tilting the phone. Haptics on crashes and takedowns, and an **AUTO** graphics level that picks a setting for your phone and adjusts it as it measures the frame rate
- Motion blur, speed lines, bloom, chromatic aberration, synthesized engine sounds and music

## Controls

| Action | 1 player | 2P · Player 1 | 2P · Player 2 | Gamepad |
|---|---|---|---|---|
| Drive | WASD / arrows | W A S D | Arrows | RT / LT / stick |
| Drift | Space | Space | Right Ctrl or Numpad 0 | X |
| Boost | Shift | Left Shift | Right Shift | A |
| Use power-up | E | E | Enter | LB |
| Camera | C | C | \ | Y |
| Reset car | R | R | ] | |
| Drive assist on/off | H | H | [ | Back |
| Pause | Esc | Esc | Esc | Start |

With two gamepads connected, the first controls player 1 and the second player 2. The in-game **How to Play** screen shows all of this too.

**Touch:** the car accelerates by itself. Your left thumb steers (slide it left or right; Settings → STEERING switches to ◀ ▶ buttons or tilt). Your right thumb has DRIFT, BRAKE (hold it when stopped to reverse), BOOST and POWER. Tap BOOST to fire it until the meter runs dry (tap again to stop), or hold it; tapping it before GO gives a perfect start. POWER shows the power-up you hold: tap it to use it. The strip at the top resets the car, pauses and changes camera, and the phone's back button pauses too. Split screen is desktop only.

## Development

The game is plain ES modules with a vendored copy of three.js — no bundler.

```bash
py -3 tools/serve.py        # http://localhost:5173 (no-cache dev server)
node --test tests/logic.test.js
node tools/build.mjs         # builds release/Slamline.exe with Electron
node tools/build-apk.mjs     # builds release/Slamline.apk (set SLAMLINE_VERSION=2.5 for the version name)
node tools/make-icon.mjs     # redraws every icon (exe, web app, Android launcher)
npm run release              # ships the committed main everywhere (see below)
```

`npm run release` checks that main is committed and up to date, runs the tests, builds the exe and the apk, then pushes main, publishes `game/` to the Pages site and creates the next GitHub release (v2.5 → v2.6) with both files. Nothing goes public unless both builds succeed. Options: `-- --notes "summary"` for the top of the release notes, `-- --version 3.0` to pick the version, `-- --dry-run` to only run the checks and tests and preview the notes.

The Android app (`android/`) is a full-screen WebView that serves the bundled `game/` folder offline. `build-apk.mjs` installs JDK 17, the Android SDK and Gradle into `S:\SlamlineAndroid` the first time it runs (set `SLAMLINE_ANDROID_HOME` to use another folder). It also creates the release signing key in `android/signing/`, which is gitignored. Keep that key: Android only installs an update over the app when it is signed with the same key.

Online play finds a direct route between players with STUN. For networks that have none, a relay (TURN) can be switched on without a new build: `game/net-config.json` on the website holds either `{"turn": "<url that returns ICE servers>"}` (for example a Metered credentials URL) or `{"iceServers": [...]}`. The exe and the Android app read it from https://rehmozayub.github.io/slamline/net-config.json.
