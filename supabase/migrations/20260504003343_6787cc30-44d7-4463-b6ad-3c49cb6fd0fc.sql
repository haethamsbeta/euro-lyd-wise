-- Passkey credentials, one row per registered device per user
CREATE TABLE public.webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,         -- base64url
  public_key text NOT NULL,                   -- base64url COSE key
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_label text NOT NULL DEFAULT 'This device',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX idx_webauthn_credentials_user ON public.webauthn_credentials(user_id);

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passkeys self read"   ON public.webauthn_credentials
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "passkeys self delete" ON public.webauthn_credentials
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "passkeys self update" ON public.webauthn_credentials
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Inserts only via server (service role); no insert policy on purpose.

-- Short-lived challenges issued by the server during a ceremony
CREATE TABLE public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('register','authenticate')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- null for usernameless auth
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);
CREATE INDEX idx_webauthn_challenges_challenge ON public.webauthn_challenges(challenge);
CREATE INDEX idx_webauthn_challenges_expires ON public.webauthn_challenges(expires_at);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
-- No policies; only service role touches this table.

-- Helper used by the auth server function to find a user by their passkey
CREATE OR REPLACE FUNCTION public.lookup_user_email_for_credential(p_credential_id text)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $$
  SELECT u.id, u.email
  FROM public.webauthn_credentials c
  JOIN auth.users u ON u.id = c.user_id
  WHERE c.credential_id = p_credential_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_user_email_for_credential(text) FROM PUBLIC, anon, authenticated;