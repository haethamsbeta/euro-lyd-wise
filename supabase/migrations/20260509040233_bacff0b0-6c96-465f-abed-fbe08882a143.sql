
-- ============================================================================
-- Step 1: FX rates + consolidated USD reserves
-- Replaces hardcoded USD_RATE constants on the Vaults page with a real,
-- audit-trailed rate source. Mirrors the account_balances pattern: a canonical
-- table + view + SQL function callable from the app.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fx_rates (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  currency     public.currency_code NOT NULL,
  usd_rate     numeric(18,8) NOT NULL CHECK (usd_rate > 0),
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','provider')),
  as_of_date   date NOT NULL DEFAULT CURRENT_DATE,
  note         text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (currency, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_currency_date
  ON public.fx_rates (currency, as_of_date DESC);

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fx_rates staff read"
  ON public.fx_rates FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "fx_rates admin write"
  ON public.fx_rates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- View: latest rate per currency
CREATE OR REPLACE VIEW public.fx_rates_current AS
SELECT DISTINCT ON (currency)
  currency, usd_rate, as_of_date, source
FROM public.fx_rates
ORDER BY currency, as_of_date DESC, id DESC;

-- Seed the same rates the app currently uses, so behavior doesn't break.
INSERT INTO public.fx_rates (currency, usd_rate, source, note)
VALUES
  ('USD'::public.currency_code, 1.00000000, 'manual', 'Initial seed (replaces hardcoded USD_RATE)'),
  ('EUR'::public.currency_code, 1.08000000, 'manual', 'Initial seed (replaces hardcoded USD_RATE)'),
  ('LYD'::public.currency_code, 0.21000000, 'manual', 'Initial seed (replaces hardcoded USD_RATE)')
ON CONFLICT (currency, as_of_date) DO NOTHING;

-- Function: consolidated USD-equivalent reserves across all vaults.
-- Returns total in USD MINOR units (cents), matching formatMinor() expectations.
CREATE OR REPLACE FUNCTION public.report_consolidated_usd()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total_usd_minor bigint := 0;
  v_breakdown jsonb;
  v_missing text[];
BEGIN
  IF NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'Staff only';
  END IF;

  WITH vault_bal AS (
    SELECT ab.currency::text AS currency,
           SUM(ab.balance_minor)::bigint AS balance_minor
    FROM public.account_balances ab
    JOIN public.accounts a ON a.id = ab.account_id
    WHERE a.kind = 'vault'
    GROUP BY ab.currency
  ),
  joined AS (
    SELECT vb.currency,
           vb.balance_minor,
           fx.usd_rate,
           fx.as_of_date AS rate_date,
           CASE WHEN fx.usd_rate IS NULL THEN 0
                ELSE (vb.balance_minor * fx.usd_rate)::bigint
           END AS usd_minor
    FROM vault_bal vb
    LEFT JOIN public.fx_rates_current fx ON fx.currency::text = vb.currency
  )
  SELECT
    COALESCE(SUM(usd_minor), 0)::bigint,
    COALESCE(jsonb_agg(jsonb_build_object(
      'currency', currency,
      'balance_minor', balance_minor,
      'usd_rate', usd_rate,
      'rate_date', rate_date,
      'usd_minor', usd_minor
    ) ORDER BY currency), '[]'::jsonb),
    COALESCE(array_agg(currency) FILTER (WHERE usd_rate IS NULL), ARRAY[]::text[])
  INTO v_total_usd_minor, v_breakdown, v_missing
  FROM joined;

  RETURN jsonb_build_object(
    'total_usd_minor', v_total_usd_minor,
    'breakdown', v_breakdown,
    'missing_rates', to_jsonb(v_missing),
    'computed_at', now()
  );
END;
$$;
