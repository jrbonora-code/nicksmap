# National OZ / EB-5 API research

Research date: September 15, 2026, America/New_York (probe receipts September 16 UTC). This records API research and bounded live probes, not a national implementation, legal eligibility determination, paid subscription or deployment. `docs/PRIMARY-OBJECTIVES.md` and the original `NATIONAL-OZ-EB5-PLAN.md` were retired on September 16, 2026: they were removed from the branch and archived locally under `.local/handoff-history/oz-eb5-planning-20260915/`, which is Git-ignored. They are evidence, not current objectives; the current objective statement is in [the handoff](HANDOFF.md).

## Recommendation

Follow-up verification: [complete HUD/IRS/CDFI audit and Novogradac assessment](HUD-OZ-COMPLETENESS-AUDIT.md). All 8,764 original officially designated tract IDs are present in HUD; one extra HUD ID must be quarantined. This does not establish 2027 designation coverage or polygon accuracy.

Build the geographic shortlist with official public sources now: CDFI's designated list, HUD's designated polygons, Census TIGERweb boundaries/decennial population, and OMB metro delineations. Acquire parcels from state/county APIs in shortlisted areas. This route needs no paid provider and no MCP. REST APIs are sufficient; official bulk GIS/XLSX files are appropriate for complete national snapshots.

For paid augmentation, first evaluate existing RealEstateAPI access for property searches/enrichment. Regrid is a strong technical fit for national parcel polygons, but its standard API license is a material mismatch for our offline exports and retained evidence without written permission. Shovels is the most useful new API candidate for permits and planning decisions; test its free tier and target-jurisdiction coverage before buying anything. No authenticated vendor call or account registration was made in this research.

## Sources, costs and fit

| Source | Purpose | Published price/access observed | Evidence and decision |
|---|---|---|---|
| [CDFI designated list](https://www.cdfifund.gov/opportunity-zones) + [HUD OZ FeatureServer](https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Opportunity_Zones/FeatureServer/13) | Authoritative designated membership plus mapped polygons | Public, no API key or purchase for tested requests | Live HUD count and ID requests both returned 8,765 unique object IDs. This is the service count, not the authoritative designation count. Reconcile against CDFI's 8,764 and documented retired-FIPS anomaly; never publish the raw service count as the legal universe. |
| [Census 2020 TIGERweb](https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/tigerWMS_Census2020/MapServer/26) + [current TIGERweb](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/93) | Decennial place population, polygons and current metro geography | Public, keyless requests succeeded | Live query returned Kalispell population 24,558. Current point query returned Cape Coral-Fort Myers Metro Area. POP100 on current MSA output was null; do not substitute it for the decennial place population. |
| [Montana cadastral API](https://gisservice.mt.gov/arcgis/rest/services/msdi_cadastral_map_v1/MapServer/1), [NC OneMap parcels](https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1), [Wisconsin parcel API](https://dnrmaps.wi.gov/arcgis/rest/services/DW_Map_Dynamic/EN_County_Tax_Parcels_WTM_Ext_Dynamic_L16/MapServer/0) | Parcel IDs, situs addresses, land attributes and boundaries | Public, anonymous queries succeeded | Fresh single-parcel queries returned addresses and polygons in all three states. NC source acreage again returned zero; preserve it as a source observation and use separately labelled geometry acreage. Metadata advertises page caps of 2,000 / 5,000 / 1,000 respectively. These samples do not establish nationwide coverage or current full-state completeness. |
| [RealEstateAPI](https://developer.realestateapi.com/reference/property-search-api) | Polygon searches for land/multifamily and property enrichment | [Pricing](https://www.realestateapi.com/pricing/): Starter $599/month, 30,000 credits; Growth $1,200/month, 150,000 credits with parcel boundaries. Advertised subscription prices assume annual commitment billed monthly. Promotional pay-as-you-go $0.10/record. Count-only searches advertised at zero credits. | Best existing-provider candidate. Polygon/multi-polygon, LAND/MFR, census tract and MLS status filters are documented. The workspace's imported snapshot does not prove an active subscription, current entitlements or a working national feed. No authenticated call made. Confirm geometry and retained-use rights before depending on it. |
| [Regrid API](https://support.regrid.com/docs/api-endpoint-overview) | National parcel polygon search, stable parcel identifiers and county refresh metadata | [Live plan page](https://app.regrid.com/api/plans): Standard $375/month, Premium $500/month; each includes 2,000 parcel records and 200,000 tiles. Record overages $0.10 / $0.15 respectively; tile overage $0.001. | Prices extracted from the public page's embedded plan JSON because text extraction omitted the client-rendered pricing. `/api/v2/parcels/area` and `/query` support custom area discovery; `/verse` supplies county-level coverage/refresh metadata. Strong technical candidate, conditional on license. No token/sample tested. |
| [ReportAll](https://reportallusa.com/solutions/overlay/documentation/) | National parcel query and polygon geometry | [Product page](https://reportallusa.com/products/api) advertises a 30-day trial; current production dollar price not established | Alternative national aggregator. Documented version-9 parcel endpoint returns WGS84 multipolygons; `rpp=0` count-only requests do not consume quota. Missing attributes may be omitted. Confirm polygon-query entitlement and offline retention terms before selection. No authenticated sample tested. |
| [Shovels](https://docs.shovels.ai/api-reference/permits/search-permits) | Permit and development activity to investigate real project leads | [Pricing](https://www.shovels.ai/pricing): free 500 credits/month, one year of history, up to 10 results/query; Basic $599/month for 25,000 credits and full history/downloads; Pro $999/month for 50,000. API included. | Best new permit/planning API to evaluate. The provider also advertises planning/zoning decisions before permits. [Coverage dashboard](https://www.shovels.ai/coverage) did not expose its loaded county data in the retrieved page; pilot and Lee/Cape coverage remain unverified. No key/sample tested. |
| [ATTOM](https://www.attomdata.com/solutions/delivery/property-data-api/) | Broader property enrichment | Production price not established from official material reviewed | Optional alternative. No verified advantage over the public geography plus existing-provider path for this task; not a prerequisite. |

Prices are observations, not account-specific quotes or purchase authorization. No provider's generic rural or OZ flag is accepted as the combined classification without its exact program definition, vintage and method.

## Reuse terms that change the recommendation

- [Regrid API terms](https://regrid.com/terms/api), Limitations and Restrictions: caching/offline storage requires written approval; derivative work outside web/mobile applications also requires approval and may cost more. A standard self-service API purchase therefore does not establish permission for our offline spreadsheet or durable raw snapshots. Consider a suitable bulk license or written API amendment if this vendor becomes necessary.
- [Shovels terms](https://www.shovels.ai/terms), revised May 19, 2026: internal-business use while the agreement remains in effect; termination requires discontinuing use and removing copies. Retained evidence after cancellation needs an appropriate agreement. The free tier is a coverage/quality probe, not established permission for a permanent independent warehouse.
- Public state parcel metadata identifies publishers and source vintages but is not a complete license audit. Preserve original metadata/attribution and check the relevant distribution terms for production exports. Do not infer unrestricted republication merely from anonymous access.

## What the live probes establish

The reproducible, bounded read-only probe is `.local/probe-national-api-research.py`; payloads and timestamped SHA-256 receipts are in `.local/national-api-research/`. They contain no owner-name fields from parcel queries. They are ignored local evidence, not public app assets.

1. HUD anonymous count and all-object-ID queries agree at 8,765; all returned object IDs are unique. Object-ID uniqueness does not establish logical tract uniqueness or correctness.
2. Querying three pilot tract identifiers returned designated polygons for `30053000200` (MT) and `37155960502` (NC), but no exact-ID match for `55141011400` (WI). These are 2010-vintage designated boundaries; the earlier pilot used 2020 geometry. Do not upgrade any existing parcel row to designated based only on the matching tract string. Re-run full parcel containment against the actual designated polygons and resolve vintage changes.
3. Public parcel queries returned one feature with both a situs address and polygon from each of MT, NC and WI. This is current connectivity/schema/sample evidence; it does not revalidate the old 1,022-row candidate export.
4. The keyless Census population query returned `GEOID=3040075`, Kalispell city, `POP100=24558`. Population input does not need to wait for a Census Data API key.
5. Current Census MSA query at a Cape Coral point returned CBSA `15980`, Cape Coral-Fort Myers, FL Metro Area. The retained official [OMB July 2023 delineation workbook](https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx) independently lists Lee County, Florida (`12071`) in that MSA.
6. Cape Coral's [public GIS directory](https://capeims.capecoral.gov/arcgis/rest/services/AGOL) lists building permits, development planning, potential commercial lands, zoning and land use. Direct metadata requests for the first three returned HTTP 403 in this runtime. Discovery is verified; working machine acquisition is not. A blocked request must never become a zero-permit result.

## Lee County / Cape Coral and EB-5 rural

The [statutory rural definition](https://uscode.house.gov/view.xhtml?req=%28title%3A8+section%3A1153+edition%3Aprelim%29) excludes locations within an OMB metropolitan statistical area. The verified county delineation therefore excludes Lee County, including Cape Coral, from this rural geographic screen under that delineation. Keep Lee/Cape as BlackFin permit/property research, but do not force them into the OZ-plus-EB-5-rural shortlist. This does not assess high-unemployment TEAs or any project's overall EB-5 eligibility.

## Existing EB-5 maps

**Later September 15 finding:** the uploaded package identified the publicly accessible [IIUSA V40 CSV](https://eb5-unemployment-area.themapsolutely.com/TEA%20tracts%20-%20V40.csv). An independent download verified 84,399 unique tract IDs and 12,563 `Rural_TEA=TRUE` rows. Its 1,324 positive ID matches to the uploaded original-OZ list reproduce; a nationwide spatial overlap does not follow from equal IDs across geography vintages. This supersedes the earlier discovery limitation below. Supported API access, full rural methodology and bulk redistribution rights remain unestablished. The audited shortlist guide at the local, Git-ignored path `.local/external-oz-audit/README.md` (not part of this repository's tracked files) and the [current handoff](HANDOFF.md) record the usable output and limits.

[IIUSA](https://iiusa.org/eb5_tea_mapping_tool/) remains a comparison source. [Impact DataSource's TEA Finder](https://tea.impactdatasource.com/) reports a May 19, 2026 update; full results solicit contact details. Reviewed public materials did not establish a supported reusable EB-5 rural API, downloadable national layer or redistribution rights from these tools. Do not represent that as proof no commercial service exists. No contact form was submitted.

## Source precedence and next executable slice

1. Designated status: controlling Treasury/IRS/CDFI membership, explicit effective date and tract vintage. HUD supplies geometry after reconciliation; 2027 nomination eligibility stays separate.
2. Rural inputs: OMB metropolitan delineation plus most recent decennial population and the recorded place-boundary interpretation. Legal ambiguity remains visible. A vendor Boolean cannot overwrite this result.
3. Site identity/geometry: jurisdiction + canonical parcel ID + geometry/source vintage. Local assessor/state publisher first, licensed aggregator fills gaps. Preserve conflicts; do not deduplicate only by address.
4. Development evidence: original permit/planning authority and dated record first; aggregators accelerate discovery. A permit alone does not establish availability or a financeable deal.

Next build is the existing offline shortlist slice: reliable ID/count-reconciled acquisition, designated-boundary overlay, independent rural screen, canonical parcel reconciliation, then an address/parcel export with explicit unknowns. Acquire only parcels inside shortlisted areas. This avoids needing a national parcel purchase before delivering useful results. National coverage and the full application remain open.

No application tests rerun for this research-only addition; no production or Railway changes. The live API probes above are the validation performed.

## User-supplied GitHub candidates: source inspection

Checked September 15, 2026. Public GitHub repository metadata, recursive file trees, README files and relevant source files were read. No third-party package was installed or executed; no tax-benefit implementation is accepted by this inspection.

### Jaypatel1511/oz-tracker

Reviewed main revision `8aac858c4a3e6c08cb44f3a83eacca1a5708f334` (August 2, 2026).

- [README](https://github.com/Jaypatel1511/oz-tracker/blob/8aac858c4a3e6c08cb44f3a83eacca1a5708f334/README.md) explicitly describes tract lookup as nonfunctional in version 0.2.0. The repository contains Python implementation and tests, but no complete bundled tract or parcel dataset.
- [Loader](https://github.com/Jaypatel1511/oz-tracker/blob/8aac858c4a3e6c08cb44f3a83eacca1a5708f334/oztracker/data/loader.py) still uses obsolete CDFI and Treasury download URLs. Fresh HTTP HEAD probes of both exact URLs returned 404. It raises on download failure; synthetic samples require explicit opt-in.
- The loader uppercases OZ2 column names while [OZ2Checker](https://github.com/Jaypatel1511/oz-tracker/blob/8aac858c4a3e6c08cb44f3a83eacca1a5708f334/oztracker/eligibility/oz2.py) reads lowercase `tract_id`. Replacing the URL alone would not repair the live path. Its rural method is OZ2 rural, not an EB-5 rural classifier.
- The README points to the same working IRS 2027 eligibility appendix BlackFin already uses. It does not supply additional national parcels or project addresses.
- `pyproject.toml` declares MIT; no standalone LICENSE appeared in the repository tree, and GitHub's detected license field was null. Preserve and clarify applicable notices before copying source.
- Decision: useful reference for explicit failure states and testing ideas, not a working replacement for the verified official-data acquisition path. Tax/portfolio functions were not independently validated.

### worldofhacks/seekandscore

Reviewed main revision `32de3b5291ece9fea4b4a5ee177f9f56fb591872` (August 13, 2026).

- [README](https://github.com/worldofhacks/seekandscore/blob/32de3b5291ece9fea4b4a5ee177f9f56fb591872/README.md) explicitly labels the project architecture/delivery planning, with no production application. The full repository tree contains documentation, YAML policies and deployment examples; its proposed application/worker folders are not implemented.
- [Source inventory](https://github.com/worldofhacks/seekandscore/blob/32de3b5291ece9fea4b4a5ee177f9f56fb591872/docs/SOURCE_INVENTORY.md) lists sources as discovery or blocked, not tested active feeds. It supplies no ready address table, parcel export or working API adapter.
- [OZ design](https://github.com/worldofhacks/seekandscore/blob/32de3b5291ece9fea4b4a5ee177f9f56fb591872/docs/OPPORTUNITY_ZONES_AND_DATA.md) usefully separates designation rounds, effective dates, geographic vintages and source observations. These align with BlackFin's existing requirements but are not runtime proof.
- The README expressly states no open-source license has been selected. Do not copy its material into an implementation on the assumption that public visibility permits reuse.
- Decision: design comparison only; adopting its proposed stack would add work without acquiring new data.

### Related lead found while inspecting oz-tracker

[nmtc-mapper](https://github.com/Jaypatel1511/nmtc-mapper) documents actual address/DataFrame batch enrichment from CDFI/Census sources and has a standalone MIT license. This is a potentially useful NMTC enrichment reference. Only its README/repository page was inspected: its advertised functionality and dataset counts were not independently exercised. It is not an EB-5 rural implementation or a source of national deal addresses. Keep evaluation separate from the primary OZ/EB-5 acquisition slice.
