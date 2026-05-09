ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS p256dh text,
  ADD COLUMN IF NOT EXISTS auth text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

UPDATE public.push_subscriptions SET granted = false WHERE endpoint IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uidx
  ON public.push_subscriptions (endpoint)
  WHERE endpoint IS NOT NULL;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

DROP POLICY IF EXISTS "push admin read" ON public.push_subscriptions;
CREATE POLICY "push admin read"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP FUNCTION IF EXISTS public.admin_list_push_status();
CREATE FUNCTION public.admin_list_push_status()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  browser_push_enabled boolean,
  subscription_count integer,
  last_seen_at timestamptz,
  last_success_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.full_name,
    COALESCE(np.browser_push_enabled, false) AS browser_push_enabled,
    COALESCE(s.cnt, 0)::int AS subscription_count,
    s.last_seen_at,
    s.last_success_at
  FROM public.profiles p
  LEFT JOIN public.notification_preferences np ON np.user_id = p.id
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE granted AND endpoint IS NOT NULL) AS cnt,
      max(last_seen_at) AS last_seen_at,
      max(last_success_at) AS last_success_at
    FROM public.push_subscriptions
    WHERE user_id = p.id
  ) s ON true
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role);
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_push_status() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_push_devices(uuid);
CREATE FUNCTION public.admin_list_push_devices(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  label text,
  user_agent text,
  granted boolean,
  endpoint_present boolean,
  created_at timestamptz,
  last_seen_at timestamptz,
  last_success_at timestamptz,
  last_error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.label, s.user_agent, s.granted,
    (s.endpoint IS NOT NULL) AS endpoint_present,
    s.created_at, s.last_seen_at, s.last_success_at, s.last_error
  FROM public.push_subscriptions s
  WHERE s.user_id = p_user_id
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  ORDER BY s.last_seen_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_push_devices(uuid) TO authenticated;