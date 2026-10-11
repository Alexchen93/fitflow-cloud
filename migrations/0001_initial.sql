PRAGMA foreign_keys = ON;

CREATE TABLE exercises (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate')),
  equipment TEXT NOT NULL DEFAULT '徒手',
  primary_muscles TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]',
  cautions TEXT NOT NULL DEFAULT '[]',
  source_name TEXT NOT NULL DEFAULT 'FitFlow original seed',
  source_url TEXT NOT NULL DEFAULT '',
  license_name TEXT NOT NULL DEFAULT 'Project license pending',
  license_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  duration_weeks INTEGER NOT NULL CHECK (duration_weeks BETWEEN 1 AND 12),
  sessions_per_week INTEGER NOT NULL CHECK (sessions_per_week BETWEEN 1 AND 7),
  level TEXT NOT NULL,
  goal TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE program_phases (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  start_week INTEGER NOT NULL CHECK (start_week >= 1),
  end_week INTEGER NOT NULL CHECK (end_week >= start_week),
  UNIQUE(program_id, position)
);

CREATE TABLE program_sessions (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  focus TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  intensity TEXT NOT NULL,
  UNIQUE(program_id, week_number, day_number)
);

CREATE TABLE program_session_exercises (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES program_sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL,
  sets INTEGER NOT NULL,
  reps INTEGER,
  duration_seconds INTEGER,
  rest_seconds INTEGER NOT NULL DEFAULT 45,
  UNIQUE(session_id, position)
);

CREATE TABLE workout_runs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES program_sessions(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_seconds INTEGER,
  perceived_effort INTEGER CHECK (perceived_effort BETWEEN 1 AND 10),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE set_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workout_runs(id) ON DELETE CASCADE,
  session_exercise_id TEXT NOT NULL REFERENCES program_session_exercises(id),
  set_number INTEGER NOT NULL,
  reps INTEGER,
  duration_seconds INTEGER,
  completed INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0, 1)),
  UNIQUE(run_id, session_exercise_id, set_number)
);

CREATE INDEX idx_exercises_category ON exercises(category);
CREATE INDEX idx_program_phases_program ON program_phases(program_id, position);
CREATE INDEX idx_program_sessions_program_week ON program_sessions(program_id, week_number, day_number);
CREATE INDEX idx_session_exercises_session ON program_session_exercises(session_id, position);
CREATE INDEX idx_workout_runs_device_completed ON workout_runs(device_id, completed_at DESC);
CREATE INDEX idx_set_logs_run ON set_logs(run_id);

INSERT INTO exercises (id, slug, name_zh, name_en, summary, category, level, equipment, primary_muscles, instructions, cautions) VALUES
('ex-squat', 'bodyweight-squat', '徒手深蹲', 'Bodyweight Squat', '建立臀腿力量與日常下蹲能力。', '下肢', 'beginner', '徒手', '["股四頭肌","臀大肌","腿後肌"]', '["雙腳約與肩同寬","髖部向後坐並屈膝","腳掌穩定踩地後站起"]', '["膝蓋朝腳尖方向","背部維持自然"]'),
('ex-lunge', 'reverse-lunge', '後跨弓步', 'Reverse Lunge', '以單腳控制訓練平衡與下肢穩定。', '下肢', 'beginner', '徒手', '["臀大肌","股四頭肌"]', '["站直後單腳向後跨","雙膝彎曲下降","以前腳出力回到站姿"]', '["前膝不要向內夾","步距保持舒適"]'),
('ex-bridge', 'glute-bridge', '臀橋', 'Glute Bridge', '啟動臀部並建立髖伸展控制。', '下肢', 'beginner', '瑜珈墊', '["臀大肌","腿後肌"]', '["仰躺屈膝踩地","收緊腹部並抬起髖部","停頓後控制下降"]', '["避免過度拱腰","保持膝蓋穩定"]'),
('ex-calf', 'calf-raise', '站姿提踵', 'Standing Calf Raise', '強化小腿與踝關節穩定。', '下肢', 'beginner', '徒手', '["腓腸肌","比目魚肌"]', '["站直並保持軀幹穩定","腳跟緩慢抬高","停頓後慢慢下降"]', '["需要時扶牆保持平衡"]'),
('ex-deadbug', 'dead-bug', '死蟲式', 'Dead Bug', '練習核心穩定與四肢協調。', '核心', 'beginner', '瑜珈墊', '["腹直肌","腹橫肌"]', '["仰躺抬起雙手與雙腿","對側手腳緩慢伸直","保持下背貼近地面後換邊"]', '["動作範圍以腰部不拱起為準"]'),
('ex-plank', 'forearm-plank', '前臂平板', 'Forearm Plank', '建立全身張力與軀幹耐力。', '核心', 'beginner', '瑜珈墊', '["腹直肌","腹橫肌","肩部"]', '["前臂與腳尖支撐","頭肩髖踝保持直線","自然呼吸並維持張力"]', '["腰部不要下沉","肩膀遠離耳朵"]'),
('ex-birddog', 'bird-dog', '鳥狗式', 'Bird Dog', '訓練脊椎穩定與對側協調。', '核心', 'beginner', '瑜珈墊', '["豎脊肌","臀部","核心"]', '["四足跪姿保持背部平坦","伸出對側手腳","停頓後回到中央換邊"]', '["骨盆保持水平"]'),
('ex-sideplank', 'knee-side-plank', '跪姿側平板', 'Kneeling Side Plank', '以友善版本建立側向核心力量。', '核心', 'beginner', '瑜珈墊', '["腹斜肌","臀中肌"]', '["側躺以前臂與膝蓋支撐","抬起髖部形成直線","保持呼吸後換邊"]', '["手肘位於肩膀下方"]'),
('ex-jack', 'low-impact-jumping-jack', '低衝擊開合步', 'Low-impact Jumping Jack', '以不跳躍的節奏提高心率。', '心肺', 'beginner', '徒手', '["全身","小腿","肩部"]', '["單腳向側邊踏出並舉手","回到中央後換邊","維持連續穩定節奏"]', '["落地保持安靜","依體力調整速度"]'),
('ex-pushup', 'knee-push-up', '跪姿伏地挺身', 'Knee Push-up', '建立胸肩與手臂推力。', '上肢', 'beginner', '瑜珈墊', '["胸大肌","前三角肌","肱三頭肌"]', '["膝蓋著地並雙手略寬於肩","身體成一直線下降","推地回到起始位置"]', '["手肘約朝後四十五度","核心保持收緊"]'),
('ex-mountain', 'slow-mountain-climber', '慢速登山者', 'Slow Mountain Climber', '整合核心控制與心肺節奏。', '全身', 'intermediate', '瑜珈墊', '["核心","髖屈肌","肩部"]', '["從高平板開始","單膝向胸口靠近","放回後換邊並保持骨盆穩定"]', '["速度次於姿勢品質"]'),
('ex-wall', 'wall-push-up', '牆面伏地挺身', 'Wall Push-up', '適合初學者的上肢推力練習。', '上肢', 'beginner', '牆面', '["胸大肌","肱三頭肌"]', '["面向牆面站立並雙手撐牆","身體保持直線靠近牆面","推回起始位置"]', '["腳底保持穩定","避免聳肩"]');

INSERT INTO programs (id, slug, name, summary, duration_weeks, sessions_per_week, level, goal, is_published) VALUES
('program-reset-4w', 'four-week-reset', '四週身體重啟', '每週三次，以低壓力方式重新建立下肢、核心與全身節奏。', 4, 3, '新手', '建立規律', 1);

INSERT INTO program_phases (id, program_id, position, name, purpose, start_week, end_week) VALUES
('phase-reset-adapt','program-reset-4w',1,'適應','熟悉動作與找回穩定節奏',1,1),
('phase-reset-build','program-reset-4w',2,'累積','增加訓練組數並建立規律',2,2),
('phase-reset-strengthen','program-reset-4w',3,'強化','提高總量與動作耐力',3,3),
('phase-reset-deload','program-reset-4w',4,'減量','降低負荷、整合動作品質並恢復',4,4);

INSERT INTO program_sessions (id, program_id, week_number, day_number, title, focus, duration_minutes, intensity) VALUES
('w1d1','program-reset-4w',1,1,'穩住下盤','下肢基礎',18,'輕'),
('w1d2','program-reset-4w',1,2,'找回核心','軀幹穩定',16,'輕'),
('w1d3','program-reset-4w',1,3,'全身流動','全身循環',20,'適中'),
('w2d1','program-reset-4w',2,1,'下肢累積','下肢基礎',20,'適中'),
('w2d2','program-reset-4w',2,2,'核心連結','軀幹穩定',18,'適中'),
('w2d3','program-reset-4w',2,3,'節奏循環','全身循環',22,'適中'),
('w3d1','program-reset-4w',3,1,'穩定加強','下肢基礎',22,'適中'),
('w3d2','program-reset-4w',3,2,'核心耐力','軀幹穩定',20,'適中'),
('w3d3','program-reset-4w',3,3,'完整流動','全身循環',24,'進階'),
('w4d1','program-reset-4w',4,1,'輕鬆下盤','減量恢復',16,'輕'),
('w4d2','program-reset-4w',4,2,'重新對齊','減量恢復',14,'輕'),
('w4d3','program-reset-4w',4,3,'收尾節奏','全身整合',18,'適中');

INSERT INTO program_session_exercises (id, session_id, exercise_id, position, sets, reps, duration_seconds, rest_seconds) VALUES
('w1d1-1','w1d1','ex-squat',1,2,10,NULL,45),('w1d1-2','w1d1','ex-lunge',2,2,8,NULL,45),('w1d1-3','w1d1','ex-bridge',3,2,12,NULL,40),('w1d1-4','w1d1','ex-calf',4,2,12,NULL,30),
('w1d2-1','w1d2','ex-deadbug',1,2,8,NULL,40),('w1d2-2','w1d2','ex-plank',2,2,NULL,20,45),('w1d2-3','w1d2','ex-birddog',3,2,8,NULL,40),('w1d2-4','w1d2','ex-sideplank',4,2,NULL,15,40),
('w1d3-1','w1d3','ex-jack',1,2,NULL,40,30),('w1d3-2','w1d3','ex-wall',2,2,12,NULL,40),('w1d3-3','w1d3','ex-squat',3,2,10,NULL,45),('w1d3-4','w1d3','ex-mountain',4,2,NULL,30,45),
('w2d1-1','w2d1','ex-squat',1,3,10,NULL,45),('w2d1-2','w2d1','ex-lunge',2,3,8,NULL,45),('w2d1-3','w2d1','ex-bridge',3,3,12,NULL,40),('w2d1-4','w2d1','ex-calf',4,2,15,NULL,30),
('w2d2-1','w2d2','ex-deadbug',1,3,8,NULL,40),('w2d2-2','w2d2','ex-plank',2,3,NULL,25,45),('w2d2-3','w2d2','ex-birddog',3,3,8,NULL,40),('w2d2-4','w2d2','ex-sideplank',4,2,NULL,20,40),
('w2d3-1','w2d3','ex-jack',1,3,NULL,40,30),('w2d3-2','w2d3','ex-pushup',2,3,8,NULL,45),('w2d3-3','w2d3','ex-squat',3,3,10,NULL,45),('w2d3-4','w2d3','ex-mountain',4,3,NULL,30,45),
('w3d1-1','w3d1','ex-squat',1,3,12,NULL,45),('w3d1-2','w3d1','ex-lunge',2,3,10,NULL,45),('w3d1-3','w3d1','ex-bridge',3,3,15,NULL,40),('w3d1-4','w3d1','ex-calf',4,3,15,NULL,30),
('w3d2-1','w3d2','ex-deadbug',1,3,10,NULL,40),('w3d2-2','w3d2','ex-plank',2,3,NULL,30,45),('w3d2-3','w3d2','ex-birddog',3,3,10,NULL,40),('w3d2-4','w3d2','ex-sideplank',4,3,NULL,20,40),
('w3d3-1','w3d3','ex-jack',1,3,NULL,45,30),('w3d3-2','w3d3','ex-pushup',2,3,10,NULL,45),('w3d3-3','w3d3','ex-squat',3,3,12,NULL,45),('w3d3-4','w3d3','ex-mountain',4,3,NULL,35,45),
('w4d1-1','w4d1','ex-squat',1,2,8,NULL,45),('w4d1-2','w4d1','ex-lunge',2,2,6,NULL,45),('w4d1-3','w4d1','ex-bridge',3,2,10,NULL,40),('w4d1-4','w4d1','ex-calf',4,2,10,NULL,30),
('w4d2-1','w4d2','ex-deadbug',1,2,6,NULL,40),('w4d2-2','w4d2','ex-plank',2,2,NULL,20,45),('w4d2-3','w4d2','ex-birddog',3,2,6,NULL,40),('w4d2-4','w4d2','ex-sideplank',4,2,NULL,15,40),
('w4d3-1','w4d3','ex-jack',1,2,NULL,35,30),('w4d3-2','w4d3','ex-wall',2,2,10,NULL,40),('w4d3-3','w4d3','ex-squat',3,2,8,NULL,45),('w4d3-4','w4d3','ex-mountain',4,2,NULL,25,45);
