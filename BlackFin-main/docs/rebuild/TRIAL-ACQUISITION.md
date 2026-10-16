> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Planning stops, proposed integrations and build directions below describe September 12. The source-to-analysis foundation was subsequently delivered; dated research and acquisition limits remain evidence.

# Tampa-to-Naples trial acquisition — 2026-09-12

A RealEstateAPI trial key with a stated $200 allowance was supplied, and an initial sweep from Tampa through Naples was authorized. A bounded local collector acquired actual data. This does not resume the rejected application or authorize paid upgrades, recurring purchases or deployment.

## Saved result

Private files are under `.local/realestateapi/` in the local workspace checkout. This directory and `.env.local` are Git-ignored. No credentials or provider exports were committed, pushed or placed in public assets.

| Artifact | Private path below `.local/realestateapi/` |
|---|---|
| SQLite database | `dataset/tampa-naples.sqlite` |
| Dense export, including unmatched licenses | `dataset/license-property-screen.csv` |
| Mortgage register with lenders, dates and source references | `dataset/mortgage-register.csv` |
| Target-county coordinates with match flags | `dataset/property-points.geojson` |
| Strict address-consistent subset | `dataset/address-consistent-points.geojson` |
| Six outside-region responses, quarantined | `dataset/outside-target-review.geojson` |
| Counts and field coverage | `dataset/summary.json`, `dataset/quality-checks.json` |
| Raw responses and budget ledger | `acquisition/` |
| Original public lodging extracts | `public/dbpr-hrlodge1-20260912.csv` through district 7 |
| Reproducible collector/curation code | `collect.mjs`, `curate.py` and their test files |

The database retains source hashes/timestamps, **3,177 public apartment-license records, 1,268 unique provider property records, 1,300 candidate license/property relationships, and 662 mortgage entries across 612 properties**. These are records, not verified apartment communities or investment opportunities. One license, parcel, building and loan are not interchangeable.

**1,262 provider records are in the seven target counties.** Counts below use the returned county identifier, not the county requested. All have provider coordinates; parcel boundaries remain unverified.

| Returned county | Property records | Properties with mortgage entries |
|---|---:|---:|
| Hillsborough | 609 | 276 |
| Pinellas | 295 | 155 |
| Manatee | 40 | 16 |
| Sarasota | 99 | 57 |
| Charlotte | 17 | 8 |
| Lee | 129 | 65 |
| Collier | 73 | 34 |
| **Target counties** | **1,262** | **611** |

## Selection and budget

Seventeen initial count calls exposed severe undercounting in Lee and Collier using the provider's 5+ unit/apartment filters. Used free [DBPR lodging extracts](https://www2.myfloridalicense.com/sto/file_download/extracts/hrlodge1.csv) as the address baseline instead; all seven original district files are retained.

Prioritized licenses reporting 20+ rental units: 1,783 with primary status 20 (Current) and 66 with primary status 45 (Delinquent). Status 45 is **licensing delinquency, not financial distress**. Deduplicated address requests and interleaved counties. Smaller licenses remain in the free baseline but were not comprehensively enriched. This is not a census of all regional multifamily parcels.

There were **1,839 detail calls: 1,275 successful responses, 561 not found and 3 rejected inputs**. Successful records deduplicated to 1,268 provider IDs. Including every failed call and the earlier counts, the ledger conservatively reserves **1,856 units: $185.60 at the published $0.10 PAYG rate**. The collector cap was $190 equivalent against the stated $200 trial. Actual trial billing/balance was not exposed by responses; this is an estimate, not a billing receipt. No further paid calls are running or scheduled. References: [pricing](https://www.realestateapi.com/pricing/), [count billing](https://developer.realestateapi.com/reference/count-query).

A Windows ledger rename failure interrupted the pass. Reconciled the final request against its saved successful response and resumed without repurchasing it. Added a local-write retry and regression test. Provider requests are not automatically retried; persistent fingerprints/reservations survive interruption.

## Quality limits that govern the next build

- **895 unique records pass strict normalized street, city, ZIP, state and county consistency against a license.** This establishes address consistency, not parcel/community completeness. There are 110 additional relationships with matching streets but postal conflicts. Address-range, unit/building, street and geography conflicts remain review candidates. Six properties outside the target counties are excluded from the target map file.
- Unit counts disagree in 726 relationships; another 294 have missing/zero provider units. Do not divide building-level values or debt by community-level licensed units. Preserve both sources until their geographic scope is reconciled.
- Returned classifications include 964 MFR, 68 SFR, 50 LAND, 175 OTHER and 11 CONDO. Do not silently relabel these or discard licensed communities solely because of provider classification.
- Of 662 mortgage entries, 648 have recording dates, 302 have populated maturity dates, and **only six have positive interest-rate values**. The strict address subset contains 468 entries across 439 properties, with 217 populated maturity dates. Older mortgages and releases/refinancings require instrument review. A past maturity is not a confirmed default; original mortgage amounts are not current payoffs. Contract rates and maturity dates have not been independently verified.
- Estimated values/equity/balances remain estimates. No mortgage response does not prove debt-free ownership. Current NOI, actual rent rolls/occupancy, T12, payoff and capex needs are not established by this acquisition. Do not fabricate DSCR, cash flow, distress probabilities or grades from it.
- Coordinates are provider points, not verified property boundaries. Free statewide parcel queries timed out during this pass; no new polygon coverage is claimed. Manatee has particularly weak address-return coverage.

The [PropertyDetail endpoint](https://developer.realestateapi.com/reference/property-detail-api-1) and [response documentation](https://developer.realestateapi.com/reference/property-detail-response-object) describe capabilities. The saved actual responses are the evidence for this snapshot.

## Verification and next use

Collector budget/bounded-query/parser/recovery tests and address/geography/missing-data tests passed. SQLite integrity and foreign-key checks passed. The existing repository's `npm run check` passed; this does not certify dataset completeness or underwriting correctness.

Use the snapshot for the replacement's central map, dense screener and source drilldown. Start strict joins from `address_consistent_properties`; `links_requiring_review` preserves other relationships. Resolve parcel/community boundaries and ownership/loan links with free county records before per-unit financial comparisons. Obtain operating documents and appropriate market sources for NOI/rents. Refresh selected IDs when needed; do not repeat the broad purchase.

The rejected application is not wired to this data. No app rebuild, production migration, commit, push or deployment is claimed.
