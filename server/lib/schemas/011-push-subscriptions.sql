-- up
CREATE TABLE IF NOT EXISTS pushSubscriptions (
  subscriptionId INTEGER PRIMARY KEY AUTOINCREMENT,
  userId         INTEGER NOT NULL REFERENCES users(userId) ON DELETE CASCADE,
  endpoint       TEXT    NOT NULL UNIQUE,
  expirationTime INTEGER,
  auth           TEXT    NOT NULL,
  p256dh         TEXT    NOT NULL,
  createdAt      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pushSubscriptions_userId ON pushSubscriptions(userId);
-- down
DROP TABLE IF EXISTS pushSubscriptions;
