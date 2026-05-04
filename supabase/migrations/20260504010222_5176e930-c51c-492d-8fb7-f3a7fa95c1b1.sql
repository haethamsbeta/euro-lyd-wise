-- Ensure RLS is enabled on realtime.messages and require the channel topic
-- to be scoped to the authenticated user (e.g. "notif:<user-id>" or "<user-id>:...").
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only subscribe to their own channels" ON realtime.messages;

CREATE POLICY "Users can only subscribe to their own channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    realtime.topic() = auth.uid()::text
    OR realtime.topic() LIKE auth.uid()::text || ':%'
    OR realtime.topic() LIKE '%:' || auth.uid()::text
    OR realtime.topic() LIKE '%:' || auth.uid()::text || ':%'
  )
);