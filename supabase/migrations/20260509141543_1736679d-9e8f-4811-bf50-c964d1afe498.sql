
-- 1. Add 'test' to notification_event enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_event' AND e.enumlabel = 'test'
  ) THEN
    ALTER TYPE public.notification_event ADD VALUE 'test';
  END IF;
END$$;

-- 2. Update _notify_user to never gate event 'test'
CREATE OR REPLACE FUNCTION public._notify_user(
  p_user_id uuid, p_event notification_event, p_severity notification_severity,
  p_title text, p_body text, p_data jsonb, p_tx uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_enabled JSONB;
BEGIN
  INSERT INTO public.notification_preferences(user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  IF p_event::text <> 'test' THEN
    SELECT enabled INTO v_enabled FROM public.notification_preferences WHERE user_id = p_user_id;
    IF COALESCE((v_enabled ->> p_event::text)::boolean, true) IS NOT TRUE THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.notifications(user_id, event_type, severity, title, body, data, transaction_id)
  VALUES (p_user_id, p_event, p_severity, p_title, COALESCE(p_body,''), COALESCE(p_data,'{}'::jsonb), p_tx);
END; $function$;

-- 3. Self-test RPC
CREATE OR REPLACE FUNCTION public.notif_self_test()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public._notify_user(
    v_uid, 'test'::notification_event, 'info'::notification_severity,
    'Test notification',
    'If you can see this, your in-app and browser notifications are wired up correctly.',
    jsonb_build_object('source','self_test','at', now()),
    NULL
  );
  RETURN v_uid;
END; $$;

GRANT EXECUTE ON FUNCTION public.notif_self_test() TO authenticated;

-- 4. Admin-only test sender
CREATE OR REPLACE FUNCTION public.admin_send_test_notification(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_actor;

  PERFORM public._notify_user(
    p_user_id, 'test'::notification_event, 'info'::notification_severity,
    'Test notification from ' || COALESCE(NULLIF(v_actor_name,''),'admin'),
    'This is a test push sent by an administrator to verify your notifications are working.',
    jsonb_build_object('source','admin_test','sent_by', v_actor, 'at', now()),
    NULL
  );
  RETURN p_user_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_send_test_notification(uuid) TO authenticated;

-- 5. Admin-only list of push status for staff users
CREATE OR REPLACE FUNCTION public.admin_list_push_status()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  browser_push_enabled boolean,
  subscription_count integer,
  last_subscription_at timestamptz,
  has_prefs boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.full_name,
    COALESCE(np.browser_push_enabled, false) AS browser_push_enabled,
    COALESCE(ps.cnt, 0)::int AS subscription_count,
    ps.last_at AS last_subscription_at,
    (np.user_id IS NOT NULL) AS has_prefs
  FROM public.profiles p
  LEFT JOIN public.notification_preferences np ON np.user_id = p.id
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
    FROM public.push_subscriptions
    WHERE granted = true
    GROUP BY user_id
  ) ps ON ps.user_id = p.id;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_list_push_status() TO authenticated;

-- 6. Ensure realtime publication includes notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END$$;
