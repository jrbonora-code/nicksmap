# Debt basis and retained provider evidence

## Loan sources: HUD, SEC CMBS and county releases (migration 010, October 16, 2026)

Three public sources, stored by migration `010-debt-sources.sql` (append-only, content-addressed runs, `research_debt_current`) and loaded by the explicit command `node scripts/debt-import.mjs <bundle>`. The bundle comes from `node scripts/debt-refresh.mjs <research-bundle.json.gz>`, which reads the sources below, links them to the research snapshot's properties, and writes `.local/debt/import/debt-<id>.json.gz`. It touches no database.

| Source | Kept | Scope |
| --- | --- | --- |
| HUD FHA-insured multifamily, active (FHA-BF90-RM-A) and terminated (FHA-BF90-RM-T) | Project, property name, city, ZIP, units, amounts, rate, maturity, amortized balance, holder and servicer, programme, termination type, claim flag and date | National, monthly |
| SEC Form ABS-EE, Exhibit EX-102 | Each multifamily property record of each CMBS trust's latest filing: balance, rate, maturity, DSCR, occupancy, payment status, special servicing, modification, payoff code, servicer | National; SEC-registered CMBS only |
| Hillsborough and Pinellas daily official-records indexes | Satisfactions and releases: instrument, date, amount, the cited original instrument, organization lenders | Forward from the first capture |

**Fetching.** The SEC gets the declared User-Agent `BlackFin research nick@npsconsultingllc.com`, at most two requests a second (500 ms apart per host), and every accession is cached under `.local/debt/sec/` and never fetched again. Trusts come from EDGAR's quarterly `form.idx`, read by row shape; depositors and non-CMBS filers are skipped and every EX-102 must carry the CMBS namespace. Pinellas keeps about one week of daily files online and Hillsborough about two months, so run the refresh at least weekly; the weekly workflow `debt-watch.yml` opens or updates the issue "County records waiting" when new days are online.

**Privacy.** No person's name is stored anywhere: holder, servicer, originator and release lender names are kept only when they pass the organization test (`isOrganization` in `scripts/debt-lib.mjs`), and the importer refuses a bundle whose stored names fail it. Party files are read in memory; borrower parties are compared with the provider's owner name in memory and never written. Beside the cache, only organization names per release are kept, so a later run can re-match after a clerk removes a file.

**Links** (`scripts/debt-match.mjs`). Confirmed only on an exact recorded instrument (a Hillsborough release citing the mortgage's clerk number), ZIP plus street number and street (CMBS, words in any order), or ZIP plus name (0.6 Dice on distinctive words, city words removed) plus units within 10% and the same city or a near-exact name (HUD apartments only). Weaker but specific agreement is probable; a Pinellas release is probable only when exactly one mortgage fits its lender, owner and date. Nothing weaker is linked. A probable link is shown with its label and never supplies the balance.

**Balance.** Servicer-reported now leads the order: a confirmed active HUD loan's amortized balance, else a confirmed single-property CMBS loan not paid off (notes of one loan held by several trusts are added). A portfolio loan's total is shown as "Loan total across N properties" and is never a property balance. None of this becomes a recorded basis or an operating input.

**Released (verified).** A confirmed county release citing the instrument, a confirmed HUD termination, or a confirmed CMBS payoff code.

## Balances, provider estimates and the maturity wall (October 16, 2026)

Parser `research-import-3` adds RealEstateAPI's own estimates, read from the responses already retained in the September 12 acquisition (no new provider call or purchase). The bundle is otherwise identical to the `research-import-2` debt-basis bundle `b4a4f516…`: every record, observation, tract and source matches once the new fields are set aside.

| Field (provider path) | Shown as | In-region properties |
| --- | --- | ---: |
| `estimatedMortgageBalance` (a numeric string) | Provider estimate | 585 |
| `openMortgageBalance` | Provider open total. It equals the sum of current recorded amounts on 568 of 612 properties and the largest one on 42, so it is a recorded total, not an estimate of what is owed. | 611 |
| `estimatedEquity` (provider value less its balance estimate on 1,057 of 1,268 records) | Provider equity | 1,050 |

The retained raw files hold 617 and 1,060 positive responses for `openMortgageBalance` and `estimatedEquity`. Those are counts per response file; per property they are 612 and 1,056 across all 1,268 records.

**Balance column.** The best figure for each property, in this order: servicer-reported (HUD or CMBS, not loaded yet), the provider estimate, our estimate of the default recorded loan, then that loan's recorded amount. The default loan is the existing `scenarioBase` selection. Loans are never summed, and excluded entries (aggregate, truncated, conflicting, possible duplicate, provider-closed, shared) never supply a figure.

**Our estimate** (`lib/research/balance-estimate.ts`). Rate: the monthly average of the daily 10-year Treasury par yield in the recording month (`lib/research/treasury-10y-data.ts`, generated by `node scripts/treasury-10y.mjs` from Treasury's yearly CSVs with a SHA-256 per file) plus 1.0 to 2.5 percentage points. Repayment: monthly over 30 to 35 years from the recording date to the scenario date. The range runs from the low rate over 30 years to the high rate over 35 years. Interest-only periods, prepayment, extensions and refinancing are not modelled.

**None of these figures is an operating input or a recorded basis.** Financing thresholds, case origins, saved selections and lender totals still use only the recorded amount or an explicit analyst target, unchanged.

**Maturity wall** (`lib/research/maturity-wall.ts`). Current recorded loans by reported maturity: passed, 20 quarters from the scenario date (the first 24 months emphasised), later, and "No reported maturity". A document seen on several property records counts once. No maturity is estimated. On the September 12 data and a scenario date of October 16, 2026: 653 loans, 300 with a maturity, 33 in the next 24 months, 94 passed, 353 with none reported.

September 15, 2026. Local implementation on `codex/debt-basis-20260915`, based on main `8f785d9`. This is not a production release receipt.

## Behavior

- The offline `research-import-2` preparer retains loan type, lien position, lender type/code, assumable flag and provider mortgage ID. An open flag is copied from the current entry if present, otherwise only from a unique exact mortgage-ID match in history. Its field path is retained. A missing or ambiguous match stays unknown.
- All mortgage history entries remain separate observations with source IDs, dates and open/closed flags. They are not added to current-entry counts or lender totals. A provider closed flag is not proof of release.
- Aggregate/multiple amounts, truncated amounts, conflicting instrument terms, possible duplicate facilities and provider-closed entries cannot supply a recorded-basis calculation or lender total. Raw amounts remain unchanged, including the truncated value; no multiplier or property allocation is inferred.
- An exact lender-code/amount/recording-date match across different property records and different document identities flags a possible duplicate. It does not merge documents, identify a confirmed facility or increase the confirmed shared-property count. Its total remains unresolved pending reconciliation.
- Default selection requires a positive supported amount and one observed property. It prefers provider-reported first liens, then newer recording dates, then stable IDs. Missing dates sort last within each lien rank. This is a declared selection policy, not verified loan seniority, payoff or underwriting.
- The inspector, property preview and grid expose the basis and reported past maturity. The `Before scenario date` filter is strictly earlier than the selected scenario date and must match the same mortgage as other debt predicates. It persists in saved queries and case origins.
- A case can retain an excluded instrument as research evidence with no numeric debt basis. An explicit analyst target can still support scenarios; its provenance remains `analyst_target` even if it equals the recorded amount. Saved selections enforce the same rules server-side.
- Tax, sale, flood/pre-foreclosure, owner portfolio estimates, area rent/income benchmarks, multifamily flags and square-foot observations are available in the inspector with source field paths. Provider period fields are retained. New cases copy these fields and history into their immutable origin. None becomes an operating input, current loan balance, verified hazard conclusion or confirmed foreclosure.

## Compatibility and delivery

No schema migration, dependency update, provider call or purchase is required. The import remains explicit and creates a new immutable snapshot. Replaying an existing import leaves its records and current-snapshot pointer unchanged.

Earlier snapshots discarded qualification fields. Missing fields are treated as unavailable, rather than presumed safe. Recomputed views on those snapshots therefore omit recorded-basis thresholds and lender totals. A null loan type on a new snapshot means the field was retained but the provider did not report a value. Existing saved results and case origins are historical records and are not rewritten. The case UI labels historical calculations under the earlier policy.

Before a future release, prepare and validate a new private bundle from the retained acquisition, explicitly import it into the verified intended database, and verify the new snapshot and authenticated paths with the updated application. The preparer and application changes must ship together operationally. Preserve the previous snapshot and recovery evidence. Follow the repository's Git, CI and Railway verification rules; this local task did not authorize a push or production update.

## Verification

Three regressions first failed against the baseline: aggregate/truncated amounts produced property thresholds and lender totals; ambiguous case origins inferred debt; and the largest loan was selected over a newer observation. The regression fixtures now retain the qualification fields explicitly. The shared-collateral fault-injection case also checks an exclusively shared input, so it detects the fault independently of the changed sorting policy.

`npm run check` passes: 92 financial tests, 16 detected injected faults, 8 auth tests, 14 workspace passes with one skipped integration, 38 research tests, lint, types, production build and anonymous-route smoke checks. Separate loopback database tests cover import rollback/replay, immutable snapshots and case persistence. Full underwriting review remains outside these checks.

The private data reconciliation preserves 1,268 provider records (1,262 regional), 662 current mortgage entries, 1,572 history entries and 910 history entries marked closed. It retains 27 aggregate flags, one truncated-amount flag, 662 matched open flags and seven possible duplicate entries. On the dated September 15 scenario, the regional snapshot has 571 qualified default scenarios and 89 properties with an entry before the scenario date. The duplicate indicator is conservative and requires source reconciliation.

Private artifacts: `.local/debt-check.log`, `.local/debt-db-check.log`, `.local/debt-data-audit.json`, `.local/debt-basis-import.json.gz` and its manifest. Desktop (1600 by 1000) and mobile (390 by 844) browser checks passed: unsafe recorded selections rejected server-side, explicit equal-amount target saved/replayed with analyst provenance, new case retained evidence without a numeric basis, date filter saved/replayed, no horizontal mobile overflow and no page errors. Captures were visually inspected. Results and captures are in `.local/debt-browser-results.json` and `output/playwright/debt-basis-*.png`.

## Remaining slices

Population reconciliation and a visible multifamily/sub-five-unit scope control remain open. This slice does not silently remove provider records based on conflicting unit/classification observations. The consolidated UX/navigation/theme work, permissioned operating-document workflow, calendar-anniversary maturity buckets and other committee items remain separate work.
