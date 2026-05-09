-- DAHAB — Reporting & dashboard views (per-currency; never combine).

CREATE OR REPLACE VIEW report_volume_by_currency_30d AS
SELECT currency, sum(amount_minor) AS volume_minor, count(*) AS posted_count
FROM transactions
WHERE status='posted' AND created_at >= now() - interval '30 days'
GROUP BY currency;

CREATE OR REPLACE VIEW report_daily_volume_7d AS
SELECT date_trunc('day', created_at)::date AS day, currency,
       sum(CASE WHEN status='posted' THEN amount_minor ELSE 0 END) AS volume_minor,
       count(*) AS tx_count
FROM transactions
WHERE created_at >= (now()::date - interval '6 days')
GROUP BY 1,2 ORDER BY 1;

CREATE OR REPLACE VIEW report_currency_distribution AS
SELECT currency, sum(balance_minor) AS balance_minor
FROM account_balances GROUP BY currency;

CREATE OR REPLACE VIEW report_customer_growth_7m AS
SELECT date_trunc('month', created_at)::date AS month, count(*) AS new_holders
FROM account_holders
WHERE created_at >= (now() - interval '7 months')
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW report_top_accounts_by_balance AS
SELECT b.account_id, a.name, b.currency, b.balance_minor
FROM account_balances b JOIN accounts a ON a.id = b.account_id
ORDER BY b.balance_minor DESC LIMIT 50;

CREATE OR REPLACE VIEW report_cash_flow_daily AS
SELECT date_trunc('day', posted_at)::date AS day, currency, direction,
       sum(amount_minor) AS volume_minor, count(*) AS tx_count
FROM transactions WHERE status='posted' AND posted_at IS NOT NULL
GROUP BY 1,2,3;

CREATE OR REPLACE VIEW report_approval_speed AS
SELECT date_trunc('day', posted_at)::date AS day,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM posted_at-created_at)) AS median_seconds,
       count(*) AS approved_count
FROM transactions
WHERE posted_at IS NOT NULL AND status='posted'
  AND posted_at >= now() - interval '30 days'
GROUP BY 1;

CREATE OR REPLACE VIEW report_hourly_traffic AS
SELECT EXTRACT(hour FROM created_at)::int AS hour_of_day,
       count(*) AS tx_count
FROM transactions WHERE created_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW report_processing_time_dist AS
SELECT CASE
  WHEN EXTRACT(epoch FROM posted_at-created_at) < 60   THEN '< 1 min'
  WHEN EXTRACT(epoch FROM posted_at-created_at) < 120  THEN '1-2 min'
  WHEN EXTRACT(epoch FROM posted_at-created_at) < 180  THEN '2-3 min'
  WHEN EXTRACT(epoch FROM posted_at-created_at) < 300  THEN '3-5 min'
  ELSE '> 5 min' END AS bucket,
  count(*) AS tx_count
FROM transactions
WHERE posted_at IS NOT NULL AND posted_at >= now() - interval '30 days'
GROUP BY 1;

CREATE OR REPLACE VIEW report_rejection_rate_trend AS
SELECT date_trunc('day', created_at)::date AS day,
       count(*) FILTER (WHERE status='rejected')::numeric / NULLIF(count(*),0) * 100 AS rejection_pct,
       count(*) AS total_count
FROM transactions
WHERE created_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1;

-- Liquidity health (uses vault_targets + 30d outflow average per vault×currency)
CREATE OR REPLACE VIEW report_liquidity_health AS
SELECT b.account_id, b.currency, b.balance_minor,
       t.target_minor, t.min_minor,
       (SELECT avg(daily) FROM (
          SELECT sum(amount_minor) AS daily FROM transactions x
          WHERE x.direction='withdraw' AND x.status='posted'
            AND x.vault_account_id = b.account_id AND x.currency = b.currency
            AND x.posted_at >= now() - interval '30 days'
          GROUP BY date_trunc('day', x.posted_at)
       ) s) AS avg_daily_outflow_minor,
       CASE WHEN (SELECT avg(daily) FROM (
              SELECT sum(amount_minor) AS daily FROM transactions x
              WHERE x.direction='withdraw' AND x.status='posted'
                AND x.vault_account_id = b.account_id AND x.currency = b.currency
                AND x.posted_at >= now() - interval '30 days'
              GROUP BY date_trunc('day', x.posted_at)
            ) s) > 0
       THEN b.balance_minor / NULLIF((SELECT avg(daily) FROM (
              SELECT sum(amount_minor) AS daily FROM transactions x
              WHERE x.direction='withdraw' AND x.status='posted'
                AND x.vault_account_id = b.account_id AND x.currency = b.currency
                AND x.posted_at >= now() - interval '30 days'
              GROUP BY date_trunc('day', x.posted_at)) s),0)
       END AS days_of_cover
FROM account_balances b
JOIN accounts a ON a.id = b.account_id AND a.kind='vault'
LEFT JOIN vault_targets t ON t.vault_account_id = b.account_id AND t.currency = b.currency;

CREATE OR REPLACE VIEW report_tellers_today AS
SELECT s.teller_user_id, p.full_name, br.name AS branch,
       s.currency, s.txns_count, s.posted_count, s.rejected_count,
       s.volume_minor, s.avg_processing_seconds
FROM teller_daily_stats s
LEFT JOIN profiles p ON p.id = s.teller_user_id
LEFT JOIN branches br ON br.id = s.branch_id
WHERE s.day = CURRENT_DATE;

CREATE OR REPLACE VIEW report_alert_volume_daily AS
SELECT date_trunc('day', opened_at)::date AS day,
       count(*) AS generated,
       count(*) FILTER (WHERE resolved_at IS NOT NULL
                        AND date_trunc('day', resolved_at) = date_trunc('day', opened_at)) AS resolved
FROM compliance_alerts
WHERE opened_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW report_risk_typology AS
SELECT alert_type::text AS name, count(*) AS value
FROM compliance_alerts WHERE status IN ('open','reviewing')
GROUP BY 1;

CREATE OR REPLACE VIEW fx_rates_current AS
SELECT DISTINCT ON (currency) currency, usd_rate, as_of_date, note, created_at
FROM fx_rates ORDER BY currency, as_of_date DESC, created_at DESC;
