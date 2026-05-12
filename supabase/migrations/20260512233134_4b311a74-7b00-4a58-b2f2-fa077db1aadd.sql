-- Step 1: Add balance_limit + credit_used to holder_accounts and a derived-limits function.
-- Keeps existing columns (credit_limit, debit_limit, withdraw_limit_amount, withdraw_limit_enabled)
-- intact for soft cutover. They will be dropped in a later cleanup migration.

ALTER TABLE public.holder_accounts
  ADD COLUMN IF NOT EXISTS balance_limit numeric(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_used   numeric(20,2) NOT NULL DEFAULT 0;

-- Backfill: treat existing debit_limit as the new balance_limit (Q2 = A).
UPDATE public.holder_accounts
   SET balance_limit = COALESCE(debit_limit, 0)
 WHERE balance_limit = 0 AND COALESCE(debit_limit, 0) <> 0;

-- Non-negativity guard via trigger (avoid CHECK so we can keep rules flexible).
CREATE OR REPLACE FUNCTION public.holder_accounts_validate_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.balance_limit < 0 THEN
    RAISE EXCEPTION 'balance_limit must be >= 0';
  END IF;
  IF NEW.credit_limit < 0 THEN
    RAISE EXCEPTION 'credit_limit must be >= 0';
  END IF;
  IF NEW.credit_used < 0 THEN
    RAISE EXCEPTION 'credit_used must be >= 0';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_holder_accounts_validate_limits ON public.holder_accounts;
CREATE TRIGGER trg_holder_accounts_validate_limits
BEFORE INSERT OR UPDATE ON public.holder_accounts
FOR EACH ROW EXECUTE FUNCTION public.holder_accounts_validate_limits();

-- Derived snapshot function: backend source of truth for available_to_withdraw.
CREATE OR REPLACE FUNCTION public.sp_account_limits(p_account_id bigint)
RETURNS TABLE (
  account_id            bigint,
  currency_code         varchar,
  balance               numeric,
  balance_limit         numeric,
  credit_limit          numeric,
  credit_used           numeric,
  spendable_balance     numeric,
  available_credit      numeric,
  available_to_withdraw numeric,
  over_limit            boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.currency_code,
    a.current_balance                                              AS balance,
    a.balance_limit,
    a.credit_limit,
    a.credit_used,
    GREATEST(a.current_balance - a.balance_limit, 0)               AS spendable_balance,
    GREATEST(a.credit_limit   - a.credit_used,   0)                AS available_credit,
    GREATEST(a.current_balance - a.balance_limit, 0)
      + GREATEST(a.credit_limit - a.credit_used, 0)                AS available_to_withdraw,
    (a.credit_used > a.credit_limit)                               AS over_limit
  FROM public.holder_accounts a
  WHERE a.id = p_account_id
    AND (
      public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.account_holders h
        WHERE h.id = a.account_holder_id AND h.owner_user_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.sp_account_limits(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_account_limits(bigint) TO authenticated;

-- Admin-only setter for the new limit fields.
CREATE OR REPLACE FUNCTION public.sp_set_account_limits(
  p_account_id    bigint,
  p_balance_limit numeric,
  p_credit_limit  numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can set account limits';
  END IF;
  IF p_balance_limit < 0 OR p_credit_limit < 0 THEN
    RAISE EXCEPTION 'Limits must be >= 0';
  END IF;

  UPDATE public.holder_accounts
     SET balance_limit = p_balance_limit,
         credit_limit  = p_credit_limit,
         updated_at    = now()
   WHERE id = p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sp_set_account_limits(bigint, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_set_account_limits(bigint, numeric, numeric) TO authenticated;