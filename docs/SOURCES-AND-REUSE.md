# Sources, prebuilt resources and reuse checks

This catalogue records source and tool candidates, not implemented integrations. The current release imports the retained Tampa–Naples source snapshot through an explicit private operator workflow; it does not run recurring commercial collection. See [RESEARCH-RELEASE.md](RESEARCH-RELEASE.md) for implemented behavior and [TRIAL-ACQUISITION.md](rebuild/TRIAL-ACQUISITION.md) for acquisition evidence and limits.

The September 12 [public-data research](rebuild/PUBLIC-DATA-RESEARCH.md) and [open-source evaluation](rebuild/OPEN-SOURCE-RESEARCH.md) preserve the source-linked replacement investigation. Free public sources were chosen first. A named provider, stored key, public repository or example model establishes neither working integration nor permission for internal reuse. The older credential-storage branch is not an ingestion engine.

## Methodology and existing models

| Resource | Candidate use | Boundary |
| --- | --- | --- |
| [A.CRE apartment acquisition model](https://www.adventuresincre.com/multifamily-apartment-acquisition-model-in-excel/) | Inspectable operating model, senior debt and investor waterfall | Relatively simple debt module; test our complex capital-stack cases independently |
| [A.CRE model-specific AI skill](https://www.adventuresincre.com/ai-skill-apartment-acquisition-model/) | Model-aware input staging and result explanation | Offered with workbook on pay-what-you're-able terms; actual bundle license governs internal use/integration; do not redistribute |
| [A.CRE development model](https://www.adventuresincre.com/mutlifamily-development-model/) | Candidate construction/development reference workbook | Download and review actual formulas/version/license before treating as a reference |
| [Fannie Mae Income Analysis](https://mfguide.fanniemae.com/node/7526) | Underwritten cash flow and credit analysis | Apply the correct current product-specific requirements |
| [NCHMA standards](https://www.housingonline.com/councils/national-council-housing-market-analysts/model-content-standards/) | Market study, comparable selection and demand methodology | Review actual standard and reuse requirements; do not claim certification |
| [NCREIF/PREA](https://user.ncreif.org/reporting-standards/) | Reporting conventions and broad benchmarking | Index returns and project net equity IRRs have different definitions |

## Commercial tools to compare before custom implementation

| Resource | Documented capability | Required comparison |
| --- | --- | --- |
| [Radix Underwriting / redIQ](https://radix.com/radix-underwriting/) | Rent-roll/statement extraction, underwriting, comps, Excel workflow and document API | Two-user price, source-level traceability, real-document error rate, formula export and API/storage rights |
| [TestFit](https://www.testfit.io/product/site-solver?tab=tab-link.site-planning) | Multifamily site layouts, quantity takeoffs, cost and preliminary feasibility | Florida site types, custom constraints, export/integration rights and validation against actual site constraints |
| [Rockport VAL](https://www.therockportgroup.com/products/rockport-val) | DCF, valuation and scenario application | Multifamily/development/capital-stack fit, export fidelity and total cost |
| [Rockport ENGINE](https://www.therockportgroup.com/products/rockport-engine) | CRE calculation APIs | Exact supported calculations, conventions, API contract and quote |

## Property and market data candidates

| Source | Use | Material boundary |
| --- | --- | --- |
| [Florida DOR](https://floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx) | Assessment/sales rolls and parcel/GIS discovery | Periodic, not a live listing or loan-servicing feed; coverage dates vary |
| [Sunbiz bulk data](https://dos.fl.gov/sunbiz/other-services/data-downloads) | Entity records and relationship research | Registered agents/officers do not alone prove beneficial ownership |
| [Census Data API](https://www.census.gov/data/developers/guidance/api-user-guide.API_Key.html) | ACS/demographic/household context | Register current required key; preserve dataset vintage and margin of error |
| [Census geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) | Address-to-geography support | Interpolated point is not a verified parcel; boundary/vintage matters |
| [HUD FMR/income limits](https://www.huduser.gov/portal/dataset/fmr-api.html) | Program-oriented rent/income context | Token required; program-specific limits are not interchangeable with market rent |
| [HUD QCT/DDA](https://www.huduser.gov/portal/datasets/qct.html) | Date-versioned affordable-housing geography | Eligibility depends on the program and relevant date |
| [Yardi Matrix](https://www.yardimatrix.com/property-types/multifamily/) | Community/ownership, rents, pipeline, loan and expense benchmarking | Published DSCR/LTV are modeled estimates; confirm actual county/unit-size coverage and licensed retention |
| [Trepp](https://www.trepp.com/multifamily-solutions) | Agency/CMBS and loan research | [Terms](https://www.trepp.com/terms-of-use) can restrict MCP data retention/database use; obtain the applicable feed agreement |
| [CRED iQ](https://pages.cred-iq.com/datafeed) | Loan/credit feed candidate | Verify coverage, access, commercial license and terms |
| [Regrid](https://regrid.com/api) | Standardized parcel data/API | Optional paid alternative to heterogeneous county sources; verify rights and costs |

## Loan sources in use (migration 010)

| Source | Use | D06 assessment |
| --- | --- | --- |
| [HUD FHA multifamily active and terminated files](https://www.hud.gov/hud-partners/multifamily-fhasl-active) | Servicer balance, rate, maturity, holder and servicer for FHA loans; payoff or claim and date for ended loans | Usable. Federal government work, presumed public domain; the publication page states no terms (unverified for these files) |
| [SEC EDGAR Form ABS-EE, EX-102](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) | CMBS multifamily loans: balance, rate, maturity, DSCR, occupancy, delinquency, special servicing, modification, payoff | Usable. sec.gov content is public; cite the SEC; declared User-Agent, at most two requests a second, cached by accession |
| [Hillsborough Clerk daily indexes](https://hillsclerk.com/en/records-and-reports/public-data-files) and [Pinellas Clerk public files](https://www.mypinellasclerk.gov/Home/View-Records) | Recorded satisfactions and releases | Usable. Public records (Fla. Stat. ch. 119, s. 28.2221); only instruments, dates, amounts and organization names are stored |
| [Census batch geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) and 2024 ZCTA gazetteer | Map points for CMBS loans outside the property data | Usable. Commercial property addresses only; an interpolated point, or a ZIP center when there is no match |

Fannie Mae (DUS Disclose, MFLPD), Freddie Mac (MSIA, MLPD) and Ginnie Mae disclosure data need registration and written terms first (Fannie licenses internal use only); they are not used.

No statewide completeness claim until the coverage matrix is populated. Start with a diverse verification sample, then expand the verified connector inventory while retaining all-county search scope.

## Incentive sources

- [Florida Housing multifamily programs](https://www.floridahousing.org/programs/developers-multifamily-programs) and [Live Local](https://www.floridahousing.org/live-local-act).
- [Local housing assistance plans](https://www.floridahousing.org/programs/special-programs/current-local-government-lhaps), plus each county, municipality and CRA's own current materials.
- [IRS Opportunity Zones](https://www.irs.gov/credits-deductions/businesses/opportunity-zones) and [2027 designation-cycle guidance](https://www.irs.gov/newsroom/treasury-irs-provide-guidance-to-states-for-nominating-census-tracts-as-qualified-opportunity-zones-under-the-one-big-beautiful-bill).

Keep current designations, eligible nomination tracts, nominations and certifications distinct. Store program rules and effective/expiry dates, eligibility evidence, benefit timing, restrictions, funding and verified award status. Geographic overlap is only a possible match.

## Open-source candidates

- [Refine](https://github.com/refinedev/refine), [shadcn/ui](https://ui.shadcn.com/docs): app/UI building blocks.
- [MapLibre](https://maplibre.org/maplibre-gl-js/docs/), [PostGIS](https://postgis.net/), [Terra Draw integration](https://maplibre.org/maplibre-gl-js/docs/examples/draw-geometries-with-terra-draw/): mapping and spatial analysis.
- [deck.gl](https://deck.gl/), [Martin](https://github.com/maplibre/martin), [PMTiles](https://docs.protomaps.com/pmtiles/): optional analytical/tile scaling after measurement.
- [Docling](https://github.com/docling-project/docling): PDF/table/OCR extraction; code and model licenses require separate review.
- [pg-boss](https://github.com/timgit/pg-boss): PostgreSQL-backed job processing; implement idempotent business writes.
- [Splink](https://github.com/moj-analytical-services/splink): optional probabilistic matching; preserve review and reversibility.
- [PyXIRR](https://github.com/Anexen/pyxirr): financial functions under the Unlicense; not a complete underwriting engine.
- [CRE Agent Skills](https://github.com/ahacker-1/cre-agent-skills): Apache-2.0 reference workflows; author describes these as educational, not validated production investment software.

Do not install every candidate. Evaluate only the component needed for the next milestone; record version, license, failure modes and measured benefit. The current package.json is the authoritative installed dependency list.

## Integration acceptance checklist

Confirm source coverage and freshness, schema/identifiers, rate limits, outages, export quality, source attribution, corrections, historical retention, derived-data rights, model-provider data use, two-user pricing and termination/export rights. Measure the same actual documents across competing products; do not accept marketing accuracy figures as test results.
