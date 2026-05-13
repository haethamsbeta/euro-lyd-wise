-- Step 3: Server-side withdraw quote.
-- Returns a derived snapshot for a candidate withdrawal amount, splitting
-- between spendable balance and available credit. Frontend uses this to
-- render preview + enable/disable the submit button. Backend enforcement of
-- limits in transaction posting is a later step.

CREATE OR REPLACE FUNCTION public.sp_withdraw_quote(
  p_account_id  bigint,
  p_amount      numeric
)
RETURNS TABLE (
  account_id            bigint,
  currency_code         varchar,
  amount                numeric,
  balance               numeric,
  balance_limit         numeric,
  credit_limit          numeric,
  credit_used           numeric,
  spendable_balance     numeric,
  available_credit      numeric,
  available_to_withdraw numeric,
  use_balance           numeric,
  use_credit            numeric,
  shortfall             numeric,
  allowed               boolean,
  reason                text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v_use_balance numeric;
  v_use_credit  numeric;
  v_short       numeric;
  v_allowed     boolean;
  v_reason      text;
BEGIN
  SELECT * INTO s FROM public.sp_account_limits(p_account_id);
  IF s IS NULL THEN
    RAISE EXCEPTION 'account not found or not visible';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    v_use_balance := 0; v_use_credit := 0; v_short := 0;
    v_allowed := false; v_reason := 'amount must be > 0';
  ELSE
    v_use_balance := LEAST(p_amount, s.spendable_balance);
    v_use_credit  := LEAST(p_amount - v_use_balance, s.available_credit);
    v_short       := GREATEST(p_amount - v_use_balance - v_use_credit, 0);
    IF v_short > 0 THEN
      v_allowed := false;
      v_reason  := 'exceeds available_to_withdraw';
    ELSE
      v_allowed := true;
      v_reason  := NULL;
    END IF;
  END IF;

  RETURN QUERY SELECT
    s.account_id, s.currency_code, p_amount,
    s.balance, s.balance_limit, s.credit_limit, s.credit_used,
    s.spendable_balance, s.available_credit, s.available_to_withdraw,
    v_use_balance, v_use_credit, v_short, v_allowed, v_reason;
END;
$$;

REVOKE ALL ON FUNCTION public.sp_withdraw_quote(bigint, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_withdraw_quote(bigint, numeric) TO authenticated;