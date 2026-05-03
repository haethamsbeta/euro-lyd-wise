DROP POLICY IF EXISTS "Users can only subscribe to their own notif channel" ON realtime.messages;
CREATE POLICY "Users can only subscribe to their own notif channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() = ('notif:' || auth.uid()::text))
  OR (extension = 'postgres_changes')
);

REVOKE EXECUTE ON FUNCTION public.notifications_mark_read(uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.notifications_mark_all_read() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_mark_all_read() TO authenticated;