-- Harden notification writes and add tracked email delivery logs

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON public.notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL,
  subject text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  provider_message_id text DEFAULT NULL,
  last_error text DEFAULT NULL,
  sent_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_recipient_email
  ON public.email_deliveries(recipient_email);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_status
  ON public.email_deliveries(status);

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;
