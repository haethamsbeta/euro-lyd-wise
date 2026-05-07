
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_reset_password(p_target_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_is_consumer_only boolean;
BEGIN
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_target_user IS NULL THEN
    RAISE EXCEPTION 'target user required';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_target_user;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Refuse if target only has the consumer role.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_target_user AND role IN ('admin','teller','auditor')
  ) INTO v_is_consumer_only;
  IF v_is_consumer_only THEN
    RAISE EXCEPTION 'Cannot reset password for non-staff users';
  END IF;

  INSERT INTO public.profiles (id, must_change_password)
    VALUES (p_target_user, true)
    ON CONFLICT (id) DO UPDATE SET must_change_password = true;

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
    VALUES (v_uid, 'password.admin_reset', p_target_user::text,
            jsonb_build_object('email', v_email));

  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles SET must_change_password = false WHERE id = v_uid;
  INSERT INTO public.audit_log(actor_user_id, action, target, details)
    VALUES (v_uid, 'password.changed', v_uid::text, '{}'::jsonb);
END;
$$;
