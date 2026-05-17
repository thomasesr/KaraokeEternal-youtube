-- up
CREATE TABLE IF NOT EXISTS songScores (
  scoreId   INTEGER PRIMARY KEY AUTOINCREMENT,
  queueId   INTEGER NOT NULL,
  songId    INTEGER NOT NULL REFERENCES songs(songId) ON DELETE CASCADE,
  userId    INTEGER NOT NULL REFERENCES users(userId) ON DELETE CASCADE,
  roomId    INTEGER NOT NULL REFERENCES rooms(roomId) ON DELETE CASCADE,
  median    REAL    NOT NULL,
  voteCount INTEGER NOT NULL,
  scoredAt  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_songScores_songId  ON songScores(songId);
CREATE INDEX IF NOT EXISTS idx_songScores_userId  ON songScores(userId);
CREATE INDEX IF NOT EXISTS idx_songScores_roomId  ON songScores(roomId);
CREATE INDEX IF NOT EXISTS idx_songScores_scoredAt ON songScores(scoredAt);
-- down
DROP TABLE IF EXISTS songScores;
