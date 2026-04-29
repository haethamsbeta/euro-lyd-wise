REVOKE EXECUTE ON FUNCTION public.seed_demo_ledger(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._seed_post_tx(uuid, uuid, uuid, currency_code, tx_direction, vault_channel, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._seed_pending_tx(uuid, uuid, uuid, currency_code, tx_direction, vault_channel, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._upsert_vault(text, vault_channel, currency_code, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._upsert_customer(text, uuid) FROM PUBLIC, anon, authenticated;