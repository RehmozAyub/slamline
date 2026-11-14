# SLAMLINE stats server

A Cloudflare Worker with a D1 database: it takes the game's anonymous play stats and the feedback form (`../game/src/stats.js`, `../game/src/feedback.js`) and serves the owner's dashboard. What it keeps and why is in [PRIVACY.md](../PRIVACY.md).

- Live at https://slamline-stats.slamline.workers.dev
- Dashboard: https://slamline-stats.slamline.workers.dev/dashboard (asks for the dashboard key)

## Keys

Two secrets live in the Worker and in the project's `.keys/` folder (gitignored) only, never in git:

- `ADMIN_KEY` opens the dashboard. It is in `.keys/dashboard-key.txt`.
- `BUILD_KEY` marks the official Windows exe. `tools/build.mjs` copies `.keys/build-key.txt` into the exe as `official.json`; without that file an exe sends nothing.

To change a key: write the new value to the file, then `npx wrangler@4.155.0 secret put ADMIN_KEY` (or `BUILD_KEY`) in this folder and paste it. A new `BUILD_KEY` stops older exes from sending.

## Deploy

```bash
npx wrangler@4.155.0 login
npx wrangler@4.155.0 d1 migrations apply slamline --remote
npx wrangler@4.155.0 deploy
```

Run them in this folder. The database and its tables already exist; `migrations apply` only runs new files in `migrations/`.

## What it accepts

- `POST /v1/beat` and `POST /v1/feedback`, as JSON in a `text/plain` body, only from `https://rehmozayub.github.io` or from the exe (`app://game`) with the build key in the body (`bk`).
- Play time counts only as fast as real time passes for each session, so a made-up "1000 hours" adds a few seconds at most.
- Rate limits per connection (Cloudflare's, approximate), at most 300 feedback messages a day in total, exact repeats within a day dropped, and no more than two links per message.
- Feedback is stored as plain text with control characters removed, email addresses and phone numbers blanked, and is only ever shown as text on the dashboard.
- A burst of fake play numbers can be wiped from the dashboard: click that day's bar.
