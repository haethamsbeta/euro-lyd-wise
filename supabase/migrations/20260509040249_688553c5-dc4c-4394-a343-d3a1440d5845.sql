
ALTER VIEW public.fx_rates_current SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.report_consolidated_usd() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_consolidated_usd() TO authenticated;
