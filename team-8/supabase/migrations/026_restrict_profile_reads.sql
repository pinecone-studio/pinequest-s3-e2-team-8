-- Restrict profile reads so students cannot browse other users' profile data,
-- including parent_email. Teachers and admins still need broad visibility for
-- management flows, while every user can always read their own profile.

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view permitted profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id OR EXISTS (
      SELECT 1
      FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND viewer.role IN ('teacher', 'admin')
    )
  );
