ALTER TABLE public.holder_accounts
  ADD COLUMN IF NOT EXISTS credit_limit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debit_limit numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.holder_accounts.credit_limit IS 'Maximum allowed credit balance (0 = no limit enforced)';
COMMENT ON COLUMN public.holder_accounts.debit_limit IS 'Maximum allowed debit/overdraft (0 = no limit enforced)';