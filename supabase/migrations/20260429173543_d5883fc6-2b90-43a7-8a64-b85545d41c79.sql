
-- =========================================
-- Notifications schema
-- =========================================

CREATE TYPE public.notification_event AS ENUM (
  'tx_posted',
  'pending_created',
  'approval_decision',
  'large_tx',
  'low_vault',
  'overdraft',
  'daily_summary',
  'account_change',
  'reminder_pending',
  'reminder_shift'
);

CREATE TYPE public.notification_severity AS ENUM ('info','warning','critical');

-- Notifications inbox
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type public.notification_event NOT NULL,
  severity public.notification_severity NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  transaction_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_unread_idx ON public.notifications(user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif self read" ON public.notifications
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notif self update" ON public.notifications
FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- =========================================
-- Per-user preferences
-- =========================================
CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY,
  -- per-event toggles (true = notify)
  enabled JSONB NOT NULL DEFAULT jsonb_build_object(
    'tx_posted', true,
    'pending_created', true,
    'approval_decision', true,
    'large_tx', true,
    'low_vault', true,
    'overdraft', true,
    'daily_summary', true,
    'account_change', true,
    'reminder_pending', true,
    'reminder_shift', true
  ),
  -- thresholds in minor units, per currency code
  large_tx_threshold JSONB NOT NULL DEFAULT jsonb_build_object('USD', 500000, 'EUR', 500000, 'LYD', 2500000),
  low_vault_threshold JSONB NOT NULL DEFAULT jsonb_build_object('USD', 100000, 'EUR', 100000, 'LYD', 500000),
  -- reminder cadence (user-customisable)
  pending_reminder_minutes INT NOT NULL DEFAULT 30 CHECK (pending_reminder_minutes BETWEEN 5 AND 1440),
  daily_summary_time TIME NOT NULL DEFAULT '17:00',
  daily_summary_enabled BOOLEAN NOT NULL DEFAULT true,
  browser_push_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prefs self all" ON public.notification_preferences
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- bookkeeping for last reminder fired (to space them out)
CREATE TABLE public.notification_reminders_state (
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.notification_reminders_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rem state self read" ON public.notification_reminders_state
FOR SELECT TO authenticated USING (user_id = auth.uid());

-- =========================================
-- Push subscriptions (browser endpoints)
-- =========================================
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  label TEXT,
  user_agent TEXT,
  granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push self all" ON public.push_subscriptions
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =========================================
-- Helper: mark read
-- =========================================
CREATE OR REPLACE FUNCTION public.notifications_mark_read(p_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n INT;
BEGIN
  UPDATE public.notifications
    SET read_at = now()
    WHERE user_id = auth.uid()
      AND read_at IS NULL
      AND (p_ids IS NULL OR id = ANY(p_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

CREATE OR REPLACE FUNCTION public.notifications_mark_all_read()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n INT;
BEGIN
  UPDATE public.notifications SET read_at = now()
    WHERE user_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

-- =========================================
-- Internal fanout helper
-- =========================================
-- Inserts a notification for a single user only if their prefs enable that event.
CREATE OR REPLACE FUNCTION public._notify_user(
  p_user_id UUID,
  p_event public.notification_event,
  p_severity public.notification_severity,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB,
  p_tx UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled JSONB;
BEGIN
  -- ensure prefs row exists with defaults
  INSERT INTO public.notification_preferences(user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT enabled INTO v_enabled FROM public.notification_preferences WHERE user_id = p_user_id;
  IF COALESCE((v_enabled ->> p_event::text)::boolean, true) IS NOT TRUE THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications(user_id, event_type, severity, title, body, data, transaction_id)
  VALUES (p_user_id, p_event, p_severity, p_title, COALESCE(p_body,''), COALESCE(p_data,'{}'::jsonb), p_tx);
END; $$;

-- Resolve recipients by role and notify all.
CREATE OR REPLACE FUNCTION public._notify_role(
  p_role public.app_role,
  p_event public.notification_event,
  p_severity public.notification_severity,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB,
  p_tx UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role = p_role LOOP
    PERFORM public._notify_user(r.user_id, p_event, p_severity, p_title, p_body, p_data, p_tx);
  END LOOP;
END; $$;

-- =========================================
-- Triggers on transactions
-- =========================================
CREATE OR REPLACE FUNCTION public.tg_transactions_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.accounts;
  v_amount_text TEXT;
  v_data JSONB;
  v_threshold BIGINT;
  v_admin RECORD;
  v_pref JSONB;
BEGIN
  SELECT * INTO v_customer FROM public.accounts WHERE id = NEW.customer_account_id;
  v_amount_text := (NEW.amount_minor::numeric / 100)::text || ' ' || NEW.currency::text;
  v_data := jsonb_build_object(
    'tx_number', NEW.tx_number,
    'amount_minor', NEW.amount_minor,
    'currency', NEW.currency,
    'direction', NEW.direction,
    'channel', NEW.channel,
    'customer', v_customer.name,
    'customer_account_id', v_customer.id
  );

  IF TG_OP = 'INSERT' THEN
    -- Pending approval (withdraw routed to queue)
    IF NEW.status = 'pending' THEN
      PERFORM public._notify_role('admin', 'pending_created', 'warning',
        'Approval needed: ' || NEW.tx_number,
        'Withdrawal of ' || v_amount_text || ' for ' || v_customer.name || ' is awaiting approval.',
        v_data, NEW.id);
    END IF;

    -- Posted notifications
    IF NEW.status = 'posted' THEN
      -- staff who opt into tx_posted
      PERFORM public._notify_role('teller', 'tx_posted', 'info',
        NEW.tx_number || ' posted',
        initcap(NEW.direction::text) || ' ' || v_amount_text || ' • ' || v_customer.name,
        v_data, NEW.id);
      PERFORM public._notify_role('admin', 'tx_posted', 'info',
        NEW.tx_number || ' posted',
        initcap(NEW.direction::text) || ' ' || v_amount_text || ' • ' || v_customer.name,
        v_data, NEW.id);

      -- Large transaction alert (per-user threshold; we evaluate per recipient)
      FOR v_admin IN
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','teller')
      LOOP
        SELECT large_tx_threshold INTO v_pref FROM public.notification_preferences WHERE user_id = v_admin.user_id;
        v_threshold := COALESCE((v_pref ->> NEW.currency::text)::bigint, 500000);
        IF NEW.amount_minor >= v_threshold THEN
          PERFORM public._notify_user(v_admin.user_id, 'large_tx', 'warning',
            'Large transaction: ' || NEW.tx_number,
            v_amount_text || ' ' || NEW.direction::text || ' for ' || v_customer.name,
            v_data, NEW.id);
        END IF;
      END LOOP;

      -- Overdraft check
      IF EXISTS (
        SELECT 1 FROM public.account_balances
         WHERE account_id = NEW.customer_account_id
           AND currency = NEW.currency
           AND balance_minor < 0
      ) THEN
        PERFORM public._notify_role('admin', 'overdraft', 'critical',
          'Overdraft on ' || v_customer.name,
          'Account is below zero in ' || NEW.currency::text || ' after ' || NEW.tx_number,
          v_data, NEW.id);
      END IF;

      -- Low vault check (per-user threshold)
      FOR v_admin IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','teller') LOOP
        SELECT low_vault_threshold INTO v_pref FROM public.notification_preferences WHERE user_id = v_admin.user_id;
        v_threshold := COALESCE((v_pref ->> NEW.currency::text)::bigint, 100000);
        IF EXISTS (
          SELECT 1 FROM public.account_balances ab
           WHERE ab.account_id = NEW.vault_account_id
             AND ab.currency = NEW.currency
             AND ab.balance_minor < v_threshold
        ) THEN
          PERFORM public._notify_user(v_admin.user_id, 'low_vault', 'warning',
            'Low vault balance',
            NEW.channel::text || ' ' || NEW.currency::text || ' vault is below threshold.',
            v_data, NEW.id);
        END IF;
      END LOOP;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Approval decision: notify the teller who created the tx
    IF OLD.status = 'pending' AND NEW.status IN ('posted','rejected') AND NEW.created_by_user_id IS NOT NULL THEN
      PERFORM public._notify_user(NEW.created_by_user_id, 'approval_decision',
        CASE WHEN NEW.status = 'posted' THEN 'info' ELSE 'warning' END,
        NEW.tx_number || ' ' || NEW.status::text,
        CASE WHEN NEW.status='rejected'
             THEN 'Rejected: ' || COALESCE(NEW.reject_reason,'(no reason)')
             ELSE 'Approved and posted to the ledger.'
        END,
        v_data, NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_transactions_notify
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_transactions_notify();

-- =========================================
-- Account changes
-- =========================================
CREATE OR REPLACE FUNCTION public.tg_accounts_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.kind = 'customer' THEN
    PERFORM public._notify_role('admin', 'account_change', 'info',
      'New account: ' || NEW.name,
      'Customer account ' || COALESCE(NEW.account_number,'') || ' was created.',
      jsonb_build_object('account_id', NEW.id, 'account_number', NEW.account_number), NULL);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_accounts_notify
AFTER INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.tg_accounts_notify();

-- =========================================
-- Reminder runner (called by cron via /api/public/hooks/notifications-tick)
-- =========================================
CREATE OR REPLACE FUNCTION public.run_notification_reminders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
  v_pref public.notification_preferences;
  v_state public.notification_reminders_state;
  v_pending_count INT;
  v_now TIMESTAMPTZ := now();
  v_sent INT := 0;
  v_summary INT := 0;
BEGIN
  -- 1. Pending approvals reminder per admin
  FOR v_admin IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    INSERT INTO public.notification_preferences(user_id) VALUES (v_admin.user_id)
      ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_pref FROM public.notification_preferences WHERE user_id = v_admin.user_id;

    IF COALESCE((v_pref.enabled ->> 'reminder_pending')::boolean, true) THEN
      SELECT COUNT(*) INTO v_pending_count FROM public.transactions WHERE status = 'pending';
      IF v_pending_count > 0 THEN
        SELECT * INTO v_state FROM public.notification_reminders_state
          WHERE user_id = v_admin.user_id AND kind = 'pending';
        IF NOT FOUND OR v_state.last_sent_at < v_now - make_interval(mins => v_pref.pending_reminder_minutes) THEN
          PERFORM public._notify_user(v_admin.user_id, 'reminder_pending', 'warning',
            'Reminder: ' || v_pending_count || ' pending approval(s)',
            'You have transactions waiting for your decision.',
            jsonb_build_object('count', v_pending_count), NULL);
          INSERT INTO public.notification_reminders_state(user_id, kind, last_sent_at)
            VALUES (v_admin.user_id, 'pending', v_now)
            ON CONFLICT (user_id, kind) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at;
          v_sent := v_sent + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 2. End-of-shift / daily summary for tellers + admins
  FOR v_admin IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','teller')
  LOOP
    INSERT INTO public.notification_preferences(user_id) VALUES (v_admin.user_id)
      ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_pref FROM public.notification_preferences WHERE user_id = v_admin.user_id;
    CONTINUE WHEN NOT v_pref.daily_summary_enabled;
    CONTINUE WHEN NOT COALESCE((v_pref.enabled ->> 'reminder_shift')::boolean, true);

    -- fire if current time (UTC) is within 5 minutes of configured time and not already sent today
    IF abs(EXTRACT(EPOCH FROM (v_now::time - v_pref.daily_summary_time))) < 300 THEN
      SELECT * INTO v_state FROM public.notification_reminders_state
        WHERE user_id = v_admin.user_id AND kind = 'shift';
      IF NOT FOUND OR v_state.last_sent_at < date_trunc('day', v_now) THEN
        PERFORM public._notify_user(v_admin.user_id, 'reminder_shift', 'info',
          'End-of-shift reminder',
          'Review today''s activity and confirm everything is reconciled.',
          '{}'::jsonb, NULL);
        INSERT INTO public.notification_reminders_state(user_id, kind, last_sent_at)
          VALUES (v_admin.user_id, 'shift', v_now)
          ON CONFLICT (user_id, kind) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at;
        v_summary := v_summary + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('pending_reminders', v_sent, 'shift_reminders', v_summary, 'at', v_now);
END; $$;
