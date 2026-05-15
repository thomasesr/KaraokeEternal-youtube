ALTER TABLE paths ADD COLUMN managedByUserId INTEGER REFERENCES users(userId);

CREATE UNIQUE INDEX IF NOT EXISTS idxPathManagedBy ON paths (managedByUserId)
  WHERE managedByUserId IS NOT NULL;
