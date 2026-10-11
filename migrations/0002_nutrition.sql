-- User-entered nutrition labels; no dietary targets are inferred.
CREATE TABLE nutrition_foods (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  calories REAL NOT NULL CHECK (calories BETWEEN 0 AND 1000),
  protein REAL NOT NULL CHECK (protein BETWEEN 0 AND 100),
  carbs REAL NOT NULL CHECK (carbs BETWEEN 0 AND 100),
  fat REAL NOT NULL CHECK (fat BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, device_id)
);
CREATE INDEX idx_nutrition_foods_device ON nutrition_foods(device_id, name);

CREATE TABLE nutrition_entries (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  food_id TEXT NOT NULL,
  date TEXT NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  grams REAL NOT NULL CHECK (grams > 0 AND grams <= 10000),
  name TEXT NOT NULL,
  calories REAL NOT NULL CHECK (calories >= 0),
  protein REAL NOT NULL CHECK (protein >= 0),
  carbs REAL NOT NULL CHECK (carbs >= 0),
  fat REAL NOT NULL CHECK (fat >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (food_id, device_id) REFERENCES nutrition_foods(id, device_id)
);
CREATE INDEX idx_nutrition_entries_device_date ON nutrition_entries(device_id, date, deleted_at, created_at);

CREATE TABLE nutrition_targets (
  device_id TEXT PRIMARY KEY,
  calories REAL CHECK (calories > 0 AND calories <= 20000),
  protein REAL CHECK (protein > 0 AND protein <= 2000),
  carbs REAL CHECK (carbs > 0 AND carbs <= 2000),
  fat REAL CHECK (fat > 0 AND fat <= 2000)
);
