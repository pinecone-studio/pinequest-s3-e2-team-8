-- Fix infinite recursion in profiles SELECT policy.
--
-- Migration 026 introduced a profile policy that queried public.profiles
-- from inside the policy itself. When authenticated users queried tables
-- whose RLS checks also referenced public.profiles, Postgres raised:
--   infinite recursion detected in policy for relation "profiles"
--
-- We fix this by moving the elevated role check into a SECURITY DEFINER
-- helper that bypasses RLS.

CREATE OR REPLACE FUNCTION public.auth_is_teacher_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('teacher', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_teacher_or_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_is_teacher_or_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_is_teacher_or_admin() TO authenticated;

DROP POLICY IF EXISTS "Users can view permitted profiles" ON public.profiles;

CREATE POLICY "Users can view permitted profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR public.auth_is_teacher_or_admin()
  );
