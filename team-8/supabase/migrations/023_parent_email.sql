-- Add parent_email column to profiles for student accounts
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS parent_email text DEFAULT NULL;

-- Index for looking up by parent email (for parent notification queries)
CREATE INDEX IF NOT EXISTS idx_profiles_parent_email
  ON profiles(parent_email) WHERE parent_email IS NOT NULL;
