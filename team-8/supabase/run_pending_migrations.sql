-- =============================================
-- RUN THIS IN SUPABASE DASHBOARD > SQL EDITOR
-- Pending migrations: 022_notifications + 023_parent_email
-- =============================================

-- 022: Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'exam_submitted',
    'exam_graded',
    'exam_reminder_1day',
    'exam_reminder_1hour',
    'ai_grading_complete',
    'new_exam_assigned',
    'general'
  )),
  title text NOT NULL,
  message text NOT NULL,
  link text DEFAULT NULL,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own notifications' AND tablename = 'notifications') THEN
    CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own notifications' AND tablename = 'notifications') THEN
    CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert notifications' AND tablename = 'notifications') THEN
    CREATE POLICY "Authenticated users can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 023: Parent email
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_email text DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_parent_email ON profiles(parent_email) WHERE parent_email IS NOT NULL;

-- Set parent emails for students
UPDATE profiles
SET parent_email = 'parent.' || email
WHERE role = 'student' AND parent_email IS NULL AND id != '30000000-0000-0000-0000-000000000050';

UPDATE profiles
SET parent_email = 'bumbaariunbat@gmail.com'
WHERE id = '30000000-0000-0000-0000-000000000050';

SELECT 'DONE! Migrations applied successfully.' as status;
