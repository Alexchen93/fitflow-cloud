-- Anonymous device data is retained for audit/recovery but is intentionally not visible through authenticated APIs.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sessions_user_expiry ON sessions(user_id, expires_at);

-- Keep device_id for legacy anonymous rows. New account rows only use user_id.
ALTER TABLE nutrition_foods ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE nutrition_entries ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE workout_runs ADD COLUMN user_id TEXT REFERENCES users(id);
CREATE INDEX idx_nutrition_foods_user ON nutrition_foods(user_id, name);
CREATE INDEX idx_nutrition_entries_user_date ON nutrition_entries(user_id, date, deleted_at, created_at);
CREATE INDEX idx_workout_runs_user_completed ON workout_runs(user_id, completed_at DESC);

-- Replacement for device-keyed targets: authenticated targets are account-keyed.
CREATE TABLE nutrition_user_targets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  calories REAL CHECK (calories > 0 AND calories <= 20000),
  protein REAL CHECK (protein > 0 AND protein <= 2000),
  carbs REAL CHECK (carbs > 0 AND carbs <= 2000),
  fat REAL CHECK (fat > 0 AND fat <= 2000)
);
