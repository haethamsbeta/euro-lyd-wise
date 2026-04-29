
REVOKE EXECUTE ON FUNCTION public._notify_user(uuid, public.notification_event, public.notification_severity, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._notify_role(public.app_role, public.notification_event, public.notification_severity, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_transactions_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_accounts_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_notification_reminders() FROM PUBLIC, anon, authenticated;
