CREATE OR REPLACE FUNCTION public.tg_transactions_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF NEW.status = 'pending' THEN
      PERFORM public._notify_role('admin', 'pending_created'::public.notification_event, 'warning'::public.notification_severity,
        'Approval needed: ' || NEW.tx_number,
        'Withdrawal of ' || v_amount_text || ' for ' || v_customer.name || ' is awaiting approval.',
        v_data, NEW.id);
    END IF;

    IF NEW.status = 'posted' THEN
      PERFORM public._notify_role('teller', 'tx_posted'::public.notification_event, 'info'::public.notification_severity,
        NEW.tx_number || ' posted',
        initcap(NEW.direction::text) || ' ' || v_amount_text || ' • ' || v_customer.name,
        v_data, NEW.id);
      PERFORM public._notify_role('admin', 'tx_posted'::public.notification_event, 'info'::public.notification_severity,
        NEW.tx_number || ' posted',
        initcap(NEW.direction::text) || ' ' || v_amount_text || ' • ' || v_customer.name,
        v_data, NEW.id);

      FOR v_admin IN
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','teller')
      LOOP
        SELECT large_tx_threshold INTO v_pref FROM public.notification_preferences WHERE user_id = v_admin.user_id;
        v_threshold := COALESCE((v_pref ->> NEW.currency::text)::bigint, 500000);
        IF NEW.amount_minor >= v_threshold THEN
          PERFORM public._notify_user(v_admin.user_id, 'large_tx'::public.notification_event, 'warning'::public.notification_severity,
            'Large transaction: ' || NEW.tx_number,
            v_amount_text || ' ' || NEW.direction::text || ' for ' || v_customer.name,
            v_data, NEW.id);
        END IF;
      END LOOP;

      IF EXISTS (
        SELECT 1 FROM public.account_balances
         WHERE account_id = NEW.customer_account_id
           AND currency = NEW.currency
           AND balance_minor < 0
      ) THEN
        PERFORM public._notify_role('admin', 'overdraft'::public.notification_event, 'critical'::public.notification_severity,
          'Overdraft on ' || v_customer.name,
          'Account is below zero in ' || NEW.currency::text || ' after ' || NEW.tx_number,
          v_data, NEW.id);
      END IF;

      FOR v_admin IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','teller') LOOP
        SELECT low_vault_threshold INTO v_pref FROM public.notification_preferences WHERE user_id = v_admin.user_id;
        v_threshold := COALESCE((v_pref ->> NEW.currency::text)::bigint, 100000);
        IF EXISTS (
          SELECT 1 FROM public.account_balances ab
           WHERE ab.account_id = NEW.vault_account_id
             AND ab.currency = NEW.currency
             AND ab.balance_minor < v_threshold
        ) THEN
          PERFORM public._notify_user(v_admin.user_id, 'low_vault'::public.notification_event, 'warning'::public.notification_severity,
            'Low vault balance',
            NEW.channel::text || ' ' || NEW.currency::text || ' vault is below threshold.',
            v_data, NEW.id);
        END IF;
      END LOOP;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status IN ('posted','rejected') AND NEW.created_by_user_id IS NOT NULL THEN
      PERFORM public._notify_user(NEW.created_by_user_id, 'approval_decision'::public.notification_event,
        (CASE WHEN NEW.status = 'posted' THEN 'info' ELSE 'warning' END)::public.notification_severity,
        NEW.tx_number || ' ' || NEW.status::text,
        CASE WHEN NEW.status='rejected'
             THEN 'Rejected: ' || COALESCE(NEW.reject_reason,'(no reason)')
             ELSE 'Approved and posted to the ledger.'
        END,
        v_data, NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END; $function$;