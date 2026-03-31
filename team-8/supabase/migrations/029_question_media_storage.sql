-- Хувийн асуултын сангийн зураг хадгалах (public уншилт, зөвхөн өөрийн хавтсанд upload)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-media',
  'question-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "question_media_public_read" ON storage.objects;
CREATE POLICY "question_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'question-media');

DROP POLICY IF EXISTS "question_media_insert_own" ON storage.objects;
CREATE POLICY "question_media_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'question-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "question_media_update_own" ON storage.objects;
CREATE POLICY "question_media_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'question-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "question_media_delete_own" ON storage.objects;
CREATE POLICY "question_media_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'question-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
