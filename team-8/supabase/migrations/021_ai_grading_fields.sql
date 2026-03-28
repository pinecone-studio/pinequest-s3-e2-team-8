-- AI-powered essay grading fields
ALTER TABLE answers
  ADD COLUMN IF NOT EXISTS ai_score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_feedback text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_graded_at timestamptz DEFAULT NULL;
