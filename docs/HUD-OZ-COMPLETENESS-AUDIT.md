# HUD Opportunity Zone coverage audit

Checked September 15, 2026, America/New_York; completed receipt `2026-09-16T00:25:02.501503+00:00`.

## Finding

HUD's layer contains every tract identifier in the original official OZ designation universe: **8,764 of 8,764, zero missing**. It also contains **one extra identifier**, `51515050100`, absent from the official list. The complete HUD layer is therefore not an exact authoritative membership list.

| Check | Result |
|---|---:|
| IRS Notice 2018-48 unique tract IDs | 8,762 |
| IRS Notice 2019-42 additional Puerto Rico IDs | 2 |
| Combined IRS universe | 8,764 |
| Fresh CDFI spreadsheet unique tract IDs | 8,764 |
| Differences between CDFI and combined IRS lists | 0 |
| HUD records and unique tract IDs | 8,765 |
| Official tract IDs missing from HUD | 0 |
| HUD tract IDs absent from official lists | 1 |
| Duplicate exact tract IDs in HUD | 0 |
| Jurisdictions compared separately | 56 |

All 50 states, DC and five territories are represented. Territory counts match individually: American Samoa 16, Guam 25, Northern Mariana Islands 20, Puerto Rico 863 and US Virgin Islands 14. Virginia accounts for the sole difference: 212 official versus 213 HUD identifiers. The extra uses former Bedford city FIPS `51515`; county-code history alone is not proof that two polygon geometries are identical, so no automatic geometry merge is approved.

## Sources and reproducibility

- [CDFI Opportunity Zones resources](https://www.cdfifund.gov/opportunity-zones) identifies the controlling IRS notices and links the spreadsheet and national shapefile.
- [IRS Notice 2018-48](https://www.irs.gov/pub/irs-drop/n-18-48.pdf) and [IRS Notice 2019-42](https://www.irs.gov/pub/irs-drop/n-19-42.pdf) were downloaded fresh and their 11-digit tract IDs extracted. Their union exactly matches the separately downloaded CDFI spreadsheet.
- [CDFI spreadsheet](https://www.cdfifund.gov/system/files/documents/designated-qozs.12.14.18.xlsx) already includes the two Puerto Rico additions; do not add them again.
- [HUD layer 13](https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Opportunity_Zones/FeatureServer/13) supplied an all-object-ID inventory and a separate total count. All records were retrieved in bounded 200-ID batches. Every batch's identities and count were reconciled; transfer-limit flags cause failure. The final all-ID inventory matched the initial inventory.
- Local audit script: `.local/audit-hud-oz-completeness.py`. Raw downloads, 50 timestamped SHA-256 receipts, complete per-jurisdiction comparison and machine-readable results: `.local/hud-oz-completeness/audit.json` and adjacent files. The first 1,000-ID URL batch attempt returned HTTP 404; the successful run used shorter 200-ID queries. No partial result was accepted.

## Exact scope of acceptance

This is **tract-membership completeness for the original designated OZ round**, not a polygon-validity, boundary-accuracy or whole-site eligibility certification. The audit fetched all membership attributes, not all national geometries. Keep the controlling designation-era boundaries: CDFI explicitly states that later Census boundary changes do not change an original designation.

For a canonical original-designation import, retain all raw records, whitelist HUD rows against the IRS/CDFI designation set and quarantine the unmatched identifier with its reason. Require exactly one accepted record for each official ID and fail the import on any missing or duplicate accepted ID. This is the required import rule; no application importer was changed in this research task.

The **2027 round is separate**. [Treasury's designation-cycle announcement](https://home.treasury.gov/news/press-releases/sb0550) and [data page](https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones) distinguish nomination eligibility from designation. This HUD audit does not establish coverage of new 2027 designations. Track eligible, nominated, certified/designated and effective dates independently. Neither the 25,332 eligible tracts nor a predictive private map is a substitute for a published official designation list.

No application code, frozen objectives, existing candidate export or production data changed. No Railway deployment or application test run was performed; validation consists of the source downloads and complete identity reconciliation above.

## Novogradac comparison supplied by the user

The user supplied the [April 2, 2026 article](https://www.novoco.com/notes-from-novogradac/updated-novogradac-opportunity-zones-20-mapping-tool-reflects-2020-2024-acs-data-provides-rural-focused-data-overlays-and-investment-data) and a screenshot of the OZ 2.0 map. Direct article/page fetches returned HTTP 402; publicly indexed publisher text and the user-provided screenshot were available. No paywall or access control was bypassed. The interactive map and licensed data exports were not tested.

The screenshot visibly distinguishes current OZ designations, OZ 2.0 low-income-community eligibility, and current OZ investments funded or planned. Supplemental layers include persistent-poverty counties, Capital Magnet Fund rural areas, NMTC indicators, HUD QCTs/DDAs, broadband availability and community colleges. These are useful contextual layers, not confirmed transactions or EB-5 qualifications.

The visible USDA RBS exclusion overlay names cities/towns with **more than 50,000 inhabitants and adjacent urban areas**. It cannot serve as the EB-5 rural layer: the [EB-5 statute](https://uscode.house.gov/view.xhtml?req=%28title%3A8+section%3A1153+edition%3Aprelim%29) instead excludes metropolitan statistical areas and city/town boundaries with population **20,000 or more**, based on the most recent decennial census. The supplied screenshot does not show a dedicated EB-5 rural overlay.

Novogradac describes tract-level investment observations drawn from public sources and its QOF survey. Those can inform market investigation, but planned/funded observations are not a census of all projects, proof of availability, or an opportunity score. Retain survey date, reporting coverage and original evidence if licensed for use.

[PolicyMap offers licensed APIs and flat files](https://www.policymap.com/features/integrations), including OZ and market-context indicators. This is an additional integration candidate; availability of the exact Novogradac proprietary investment layer, price and retention rights are unverified. A publicly visible map does not establish those rights.
