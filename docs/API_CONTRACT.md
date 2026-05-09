# DAHAB — API Contract

The frontend must NEVER talk to RDS directly. All access goes through this
HTTPS API. Every endpoint requires a Cognito (or compatible) JWT in
`Authorization: Bearer <token>` unless flagged Public.

Conventions:
- Response envelope (matches `src/lib/dahabApi.ts`): `{success,data,message,timestamp}`.
- Money is always `*_minor` BIGINT (cents). Never floats.
- Errors: `{success:false, message, code}` with proper HTTP status (400/401/403/404/409/422/500).
- All write endpoints map to a stored procedure (see `database/aws/03_stored_procedures.sql`).

## Auth / session
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/auth/me` | any | Returns `{user_id, email, full_name, roles[], must_change_password, branch}`. |
| POST | `/api/auth/change-password` | any | `{current, new}` |
| POST | `/api/auth/clear-must-change` | any | RPC `clear_must_change_password` |
| POST | `/api/auth/passkey/register/start` | any | WebAuthn challenge |
| POST | `/api/auth/passkey/register/finish` | any | persists `webauthn_credentials` |
| POST | `/api/auth/passkey/login/start` | public | |
| POST | `/api/auth/passkey/login/finish` | public | |

## Users & roles (admin)
| GET | `/api/users` | admin | profiles + roles + email |
| POST | `/api/users/consumer` | admin | create consumer + holder link |
| PATCH | `/api/users/:id/email` | admin | RPC `admin_change_user_email` |
| POST | `/api/users/:id/reset-password` | admin | RPC `admin_reset_password` |
| POST | `/api/users/:id/roles` | admin | `{role}` add |
| DELETE | `/api/users/:id/roles/:role` | admin | revoke |

## Account holders
| GET | `/api/holders?q=&limit=&offset=` | staff | search by name / dahab_account_number |
| GET | `/api/holders/:id` | staff or owner | |
| POST | `/api/holders` | admin | RPC `create_holder_with_accounts` |
| GET | `/api/holders/:id/accounts` | staff or owner | nested holder_accounts |
| POST | `/api/holders/:id/accounts` | admin | RPC `add_account_to_holder` |
| GET | `/api/holders/:id/totals` | staff or owner | RPC `get_holder_currency_totals` |

## Holder accounts
| GET | `/api/holder-accounts/:id` | staff or owner | |
| GET | `/api/holder-accounts/:id/ledger?from=&to=&limit=` | staff or owner | from `holder_ledger_entries` |
| POST | `/api/holder-accounts/:id/withdraw-limit` | admin | RPC `sp_set_holder_withdraw_limit` |

## Transactions
| GET | `/api/transactions?q=&from=&to=&status=&direction=&channel=&currency=&limit=&offset=` | staff | full filter set used by the page |
| GET | `/api/transactions/:id` | staff or owner | |
| POST | `/api/transactions` | admin, teller | RPC `post_transaction` body: `{customer_account_id, direction, channel, currency, amount_minor, comment}` |
| POST | `/api/transactions/:id/approve` | admin | `{approved_amount_minor?}` |
| POST | `/api/transactions/:id/reject` | admin | `{reason}` |
| POST | `/api/transactions/:id/correct` | admin | `{new_amount_minor, new_comment, correction_reason}` |
| GET | `/api/transactions/me/recent?limit=` | admin, teller | `created_by_user_id = me` |

## Approvals
| GET | `/api/approvals/pending` | admin | |
| (approve/reject reuse `/api/transactions/:id/...`) |

## Vaults
| GET | `/api/vaults` | staff | accounts where kind='vault' + balances |
| GET | `/api/vaults/:id` | staff | |
| GET | `/api/vaults/recent-activity?limit=` | staff | |
| GET | `/api/vaults/consolidated-usd` | staff | RPC `report_consolidated_usd` |
| GET | `/api/admin/fx-rates` | admin | full history |
| POST | `/api/admin/fx-rates` | admin | `{currency, usd_rate, as_of_date, note?}` |
| GET | `/api/admin/branches` | admin | |
| POST | `/api/admin/branches` | admin | upsert |
| GET | `/api/admin/vault-targets` | admin | |
| PUT | `/api/admin/vault-targets/:vault_id/:currency` | admin | `{target_minor, min_minor}` |

## Account groups
| GET | `/api/groups` | admin, auditor | |
| POST | `/api/groups` | admin | upsert |
| GET | `/api/groups/:id` | admin, auditor | members + totals |
| POST | `/api/groups/:id/members` | admin | `{holder_account_id}` |
| DELETE | `/api/groups/:id/members/:holderAccountId` | admin | |

## Imports
| GET | `/api/imports/batches` | admin | list |
| POST | `/api/imports/batches` | admin | upload Excel → staging |
| POST | `/api/imports/batches/:id/run` | admin | RPC `import_linked_accounts_batch` |
| POST | `/api/imports/batches/:id/approve` | admin | RPC `approve_import_batch` |
| GET | `/api/imports/review-queue` | admin | list ambiguous rows |
| POST | `/api/imports/review-queue/:id/resolve` | admin | RPC `resolve_review_row` body `{decision}` |

## Dashboard
| GET | `/api/dashboard/staff` | staff | totals + recent + counts |
| GET | `/api/dashboard/teller` | admin, teller | self-scoped |
| GET | `/api/dashboard/auditor` | admin, auditor | |

## Reports
See `docs/REPORTS_METRIC_MAPPING.md` for shapes.
| GET | `/api/reports/business/overview?days=` | admin, auditor | |
| GET | `/api/reports/cash-flow?days=` | admin, auditor | |
| GET | `/api/reports/approval-speed?days=` | admin, auditor | |
| GET | `/api/reports/hourly-traffic?days=` | admin, auditor | |
| GET | `/api/reports/processing-time-dist?days=` | admin, auditor | |
| GET | `/api/reports/rejection-rate?days=` | admin, auditor | |
| GET | `/api/reports/liquidity-health` | admin, auditor | |
| GET | `/api/reports/tellers/today` | admin, auditor | |
| GET | `/api/reports/compliance/overview` | admin, auditor | |

## Audit
| GET | `/api/audit?from=&to=&action=&actor=&limit=&offset=` | admin, auditor | |

## Notifications
| GET | `/api/notifications?unread_only=` | any | |
| POST | `/api/notifications/mark-read` | any | `{ids:[uuid]}` |
| POST | `/api/notifications/mark-all-read` | any | |
| GET | `/api/notification-preferences` | any | |
| PUT | `/api/notification-preferences` | any | upsert |
| POST | `/api/push-subscriptions` | any | register web-push |

## Customer portal
| GET | `/api/portal/me` | consumer | own holder + accounts (RLS) |
| GET | `/api/portal/totals` | consumer | RPC `get_holder_currency_totals` |
| GET | `/api/portal/accounts/:id/ledger?currency=&from=&to=` | consumer | scoped to owner |
| GET | `/api/portal/statement.pdf?...` | consumer | server-rendered PDF |

## Webhooks / cron (public, signature-verified)
| POST | `/api/public/hooks/notifications-tick` | HMAC | runs `run_notification_reminders()` |

## Validation rules (server-side)
- All UUIDs must parse.
- `comment`: trim, length 3..280.
- `amount_minor`: integer ≥ 1.
- `currency` ∈ enum.
- `direction` ∈ {deposit,withdraw}.
- `channel` ∈ {cash,bank}.
- `email`: RFC 5321; `phone`: optional E.164.

## Standard error responses
- `400` invalid payload (Zod failure).
- `401` missing/expired JWT.
- `403` role check failed.
- `404` resource not found / RLS-hidden.
- `409` business rule (e.g. tx not pending on approve).
- `422` `{currency, amount}` violates limits.
- `500` unexpected.
