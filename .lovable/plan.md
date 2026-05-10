## Goal

Backend `/reports/liquidity-health` now returns only per-vault rows — no top-level `network_total_lyd_minor` and no `missing_rates`. The Dashboard "Total Consolidated Balance" hero card must therefore never display a number, never compute FX, and stop showing the misleading "FX rates missing" / "Set FX rates" copy that implies the user can fix it locally. It should simply show a pending state.

## Change — `src/routes/app.index.tsx` (Hero card, lines ~338–363)

Keep label, layout, typography, gold styling. Only change the fallback branch:

1. `network !== null` → render `<AnimatedNumber value={network} currency="LYD" />` (unchanged).
2. `network === null` → render the muted text:
   - "…" while `liquidity.isLoading`
   - otherwise "FX/consolidated total pending" (single message, replaces the three current variants: "FX rates missing", "Set FX rates to calculate consolidated balance", and the empty error state).
3. Remove the amber sub-block (lines 352–363) entirely:
   - No "FX rates missing for X→Y" line (backend no longer returns `missing_rates`).
   - No "Backend has not returned a consolidated total" line.
   - No "Set rates" link to `/app/admin/fx-rates` from this card. (The FX-rates admin page is still reachable from the sidebar; the dashboard card just stops pretending the user can fix the missing total here.)
4. `missingRates` local can stay (still typed) but is no longer read in JSX. Safe to drop the variable to keep the file clean.

No changes to:
- `src/lib/api/reports.ts` — `LiquidityHealthResponse` already marks both fields optional/null, so the adapter remains correct for when the backend eventually adds them.
- The per-currency tiles to the right of the hero (those read `cashSource`/`bankSource`, a separate concern).
- Any other dashboard widget.

## Out of scope

- No FX math in the frontend.
- No fallback to `cash_by_currency` or `holder_balances_by_currency` for this card.
- No relabeling of the card.
- No design or layout changes.

## Verification

- Typecheck.
- Visually confirm the hero shows "FX/consolidated total pending" in muted text (no amber row, no "Set rates" link) while `/reports/liquidity-health` returns rows without `network_total_lyd_minor`.
- Once backend adds `network_total_lyd_minor`, the same card automatically renders the LYD-equivalent number with no further code change.
