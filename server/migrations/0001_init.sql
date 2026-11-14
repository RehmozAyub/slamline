-- SLAMLINE stats and feedback. Only daily totals are kept: no player IDs, no IP addresses.

-- sessions and play time per day, country, platform and game version
CREATE TABLE daily (
  day TEXT NOT NULL,            -- UTC date, YYYY-MM-DD
  country TEXT NOT NULL,        -- two letters from Cloudflare's lookup ('XX' unknown)
  platform TEXT NOT NULL,       -- web-desktop | web-phone | exe
  version TEXT NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  open_s INTEGER NOT NULL DEFAULT 0,    -- seconds the game was open
  active_s INTEGER NOT NULL DEFAULT 0,  -- seconds actually playing
  rooms_hosted INTEGER NOT NULL DEFAULT 0,
  room_players INTEGER NOT NULL DEFAULT 0,
  conn_failed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country, platform, version)
);

-- races per day, track, mode and mirrored or not
CREATE TABLE daily_races (
  day TEXT NOT NULL,
  track TEXT NOT NULL,
  mode TEXT NOT NULL,           -- solo | split | online
  mirrored INTEGER NOT NULL,    -- 0 | 1
  started INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  quit INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, track, mode, mirrored)
);

-- frame rate samples per day, platform and graphics level
CREATE TABLE daily_perf (
  day TEXT NOT NULL,
  platform TEXT NOT NULL,
  quality TEXT NOT NULL,
  samples INTEGER NOT NULL DEFAULT 0,
  fps_sum REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, platform, quality)
);

-- game errors per day, by kind and (path-free) message
CREATE TABLE daily_errors (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, message)
);

-- sessions running right now: a random token the game makes up each time it starts (kept only
-- in memory there), and when it last checked in. Lets play time count only as fast as real
-- time passes. Rows go after a day of silence.
CREATE TABLE live (
  sid TEXT PRIMARY KEY,
  last INTEGER NOT NULL         -- ms since 1970
);

-- the in-game feedback form
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL,        -- ISO time
  kind TEXT NOT NULL,           -- bug | idea | other
  text TEXT NOT NULL,
  hash TEXT NOT NULL,           -- to drop exact repeats
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  track TEXT NOT NULL,
  quality TEXT NOT NULL,
  country TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'   -- new | done
);
CREATE INDEX feedback_created ON feedback (created);
CREATE INDEX feedback_hash ON feedback (hash);
