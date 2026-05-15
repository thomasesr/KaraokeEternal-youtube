CREATE TABLE IF NOT EXISTS "userPlayerPrefs" (
  "userId"              integer PRIMARY KEY NOT NULL REFERENCES users(userId),
  "lrcFontSize"         real    NOT NULL DEFAULT 1,
  "lrcDefaultOffset"    integer NOT NULL DEFAULT 0,
  "isReplayGainEnabled" integer(1) NOT NULL DEFAULT 0
);
