-- Ahmed Wazir assistant · Cloudflare D1 schema
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY, created INTEGER, updated INTEGER,
  stage TEXT, route TEXT, lead TEXT, meeting TEXT, lang TEXT, messages TEXT, handled INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY, created INTEGER, name TEXT, contact TEXT, interest TEXT, budget TEXT,
  emirate TEXT, project TEXT, message TEXT, source TEXT
);
-- Partner-developer projects (loaded at deploy time from a private file, never committed)
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, n TEXT, d TEXT, em TEXT, a TEXT, t TEXT, h TEXT, ss TEXT, cs TEXT,
  p0 REAL, p1 REAL, s0 REAL, s1 REAL, b0 REAL, b1 REAL, ua INTEGER, tu INTEGER,
  esc TEXT, dld TEXT, cp REAL, ov TEXT
);
CREATE INDEX IF NOT EXISTS chats_updated ON chats(updated);
