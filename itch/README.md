# SLAMLINE on itch.io

itch.io is where players browse for indie games. The page there carries the same game as the
Pages site: the web version that plays in the browser, plus the Windows exe as a download. Play
stats and feedback work from itch.io too (the stats server accepts itch's game hosts, and those
plays show up as their own platform, "itch.io", on the dashboard).

## 1. Make the page (once)

1. Make an itch.io account: https://itch.io/register (any username; it becomes `username.itch.io`).
2. Dashboard → **Create new project**, and fill it in:

| Field | Value |
|---|---|
| Title | SLAMLINE |
| Project URL | `slamline` |
| Short description or tagline | Arcade takedown racing in your browser: boost, wreck your rivals, ten wild tracks. |
| Classification | Games |
| Kind of project | **HTML** |
| Release status | Released (or In development, if you'd rather) |
| Pricing | **No payments** (it's free, and the license says no selling) |

3. **Uploads:**
   - `release/slamline-itch.zip` → tick **This file will be played in the browser**.
   - `release/Slamline.exe` → tick **Windows** (players download it; no install).

4. **Embed options** (they show up once the zip is uploaded):

| Option | Setting |
|---|---|
| Embed in page | Manually set size: **1280 × 720** |
| Mobile friendly | **On**, orientation **Landscape** (the game has touch controls) |
| Automatically start on page load | Off (players click Run, so the sound can start) |
| Fullscreen button | **On** |
| Enable scrollbars | Off |
| SharedArrayBuffer support | Off (not needed) |

5. **Details:**
   - Description: paste the text in [Page text](#page-text) below.
   - Genre: **Racing**.
   - Tags (up to 10): `arcade`, `racing`, `3D`, `driving`, `multiplayer`, `local-multiplayer`, `split-screen`, `cars`, `browser`, `neon`.
   - App store links: none. Custom noun: leave empty.
   - Community: **Comments** on, so players can leave feedback under the game.
   - Cover image (630 × 500) and 3 to 5 screenshots (1280 × 720 or larger), all ready in `itch/media/`: `cover.png` (Neon City; `cover-alt-*.png` are other choices) and `screenshot-1` to `-5` (1920 × 1080, in the order to upload them).

6. Save as **Draft**, open the page and play a race: check fullscreen, the sound, a phone (open the
   page on it), RECORD in the pause menu (the saved video should download) and FEEDBACK. Then set
   **Visibility** to **Public**.

## 2. Each release

`npm run release` always writes `release/slamline-itch.zip` (and the exe). Either:

- **By hand:** on the itch.io page, Edit game → Uploads → replace the zip (and the exe) with the new
  ones, keeping "played in the browser" ticked.
- **Automatically, with butler** (itch.io's upload tool):
  1. Install butler: https://itch.io/docs/butler/installing.html (put it on PATH).
  2. Run `butler login` once (it opens itch.io to authorise).
  3. Write the page's name, `username/slamline`, into `.keys/itch-target.txt` (gitignored).

  From then on every `npm run release` pushes the zip to the page's `html` channel and the exe to
  `windows`, with the version number. The first time butler pushes, open the page's Uploads and tick
  "played in the browser" on the `html` upload once.

`node tools/itch.mjs` builds just the zip.

## Page text

> **SLAMLINE** is arcade takedown racing: floor it, fill your boost by drifting, near misses and
> slipstreams, then slam your rivals into the walls.
>
> **Ten tracks, each with its own trick:** a car-park spiral with a roof jump in Neon City, a ski
> jump over a ravine on Alpine Pass, a frozen lake where your tyres barely grip, a jet taking off
> beside you at Skyport, a loop-the-loop inside a live volcano, and a low-gravity gap above a ringed
> gas giant.
>
> - Takedowns with a slow-motion crash cam, and named ones that pay extra: GRINDER, SHUNT, AIR STRIKE
> - Loops, corkscrews, wall-rides, jumps and secret shortcuts behind smashable fences
> - Power-ups: Shockwave, Ricochet, Lightning Strike and Oil Slick
> - Rivals who remember: whoever wrecks you is your RIVAL, so take them out for PAYBACK
> - 8 cars, earned paints and three stars to win on every track
> - **2-player split screen** on one keyboard or two gamepads
> - **Online rooms** for up to 8 players, with a 6-character code and no account
> - Plays on phones and tablets too, with touch or tilt steering
>
> **Controls:** WASD or the arrow keys to drive, Space to drift, Shift to boost, E for a power-up,
> C for the camera, Esc to pause. Gamepads work too. Drive Assist is on by default (H toggles it).
>
> Free, and the source is on GitHub: https://github.com/RehmozAyub/slamline
> Anonymous play stats only (no accounts, no cookies; you can turn them off in Settings). Privacy:
> https://github.com/RehmozAyub/slamline/blob/main/PRIVACY.md
