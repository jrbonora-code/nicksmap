> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Planning stops, proposed integrations and build directions below describe September 12. The source-to-analysis foundation was subsequently delivered; dated research and acquisition limits remain evidence.

# Data acquisition for developer and investment analysis

Research date: 2026-09-12. Proposed acquisition and analytical contracts, not implemented integrations. Free public sources first; paid access remains unapproved. Implementation remains stopped pending further direction. Read alongside PUBLIC-DATA-RESEARCH.md and REPLACEMENT-PLAN.md.

## The information model

A comprehensive analysis combines three evidence layers:

1. Public records and disclosures: find properties, establish recorded facts, detect dated signals and compare locations.
2. Licensed commercial research: improve property-level market, ownership and disclosed debt coverage and reduce normalization work.
3. Permissioned owner/lender documents and professional diligence: establish actual operations, obligations, physical scope, project costs and executable financing.

API access is a transport choice. CSV, bulk files, GIS services, filings and authorized document imports are also necessary. A stored API key does not establish data availability or a completed connector. Paid research does not automatically establish actual current property financials.

## Information-to-analysis contract

| Developer's question | Free acquisition | Paid improvement to evaluate | Decision-useful output and remaining evidence |
|---|---|---|---|
| What is the asset and who is involved? | Florida DOR/county parcel records and geometry: parcel identifiers, land use, recorded owner, units, age, assessed values and recorded sales. DBPR apartment licenses: licensee, address, units, license and inspection history. Sunbiz: company identity, filings, named managers/officers. | Researched ownership/management portfolios and contacts; consolidated property/sales data. | Property/community/parcel/building identity with sourced owner and manager relationships. Title, control and beneficial ownership require additional evidence; a registered agent is not necessarily an owner. |
| Where is a refinancing or workout problem plausible? | Recorded mortgages/modifications/releases where accessible; FHA mortgage publication; agency disclosures and SEC CMBS exhibits; county tax status and court records where available. | Normalized loan, collateral, maturity, delinquency, watchlist, servicing and financial history through a licensed CRED iQ/Trepp feed. | Dated debt timelines and evidenced triggers. Refinance analysis uses reported financials where available and explicit scenarios elsewhere. Bank-held nonsecuritized loan status has a substantial public-data gap. No automatic inference of default from upcoming maturity. |
| What income is supportable and what competition is coming? | Census/ACS household, income, tenure, vacancy and rent context; BLS jobs/wages; local permits/planning; Census permits; HUD rent/income benchmarks. | Property rent/concession research, unit mix, occupancy trends, submarket comparisons, deliveries and proposed supply. Yardi Matrix is a candidate. | Comparable-set rent positioning, affordability, demand and supply pressure. ACS/HUD figures are dated statistical or program benchmarks, not today's achievable asking/effective rent. Need current subject rent roll and verified competitive evidence. |
| Is the property underperforming? | Disclosed operating figures for covered loans/properties; RHFS survey expense and financing benchmarks at supported aggregate levels. | Licensed servicer financials and researched/aggregated operating benchmarks. | Actual-to-comparable NOI and expense bridges, collections loss, economic versus physical occupancy, rent loss and controllable expenses. Subject-level truth requires T12, monthly historical statements, rent roll and collections evidence. |
| Can the site support the intended use or expansion? | Parcel/aerial layers, effective FEMA flood mapping, wetlands inventory, jurisdictional zoning/future land use, published plans, permits and applicable incentive geography. | Consolidated zoning/permit services where coverage and provenance justify cost. | Constraints map, jurisdiction-specific entitlement questions and preliminary feasible alternatives. Confirm density, setbacks, parking, access, stormwater, utility capacity, easements and approval conditions through current records and professional analysis. Mapped land is not automatically buildable acreage. |
| What will rehabilitation or completion actually cost? | Building age, permit/inspection history, recorded violations and visible site context. | Cost databases can inform early ranges; data feeds may accelerate permit history. | Costed scope and schedule from PCA/engineering, plans, contractor estimates/bids, contracts and draw records. Include deferred maintenance, occupied-unit disruption, contingency, financing carry and insurance/tax resets. Inspection flags cannot produce a defensible renovation budget by themselves. |
| Which lenders or sponsors merit engagement? | FDIC bank financials, recorded lender relationships, business filings, disclosed portfolios and changes in property/loan records. | Researched ownership/contact networks and normalized portfolio/debt histories. | Separate lender and sponsor research views showing linked evidence. FDIC ratios concern the reporting bank; they do not identify individual troubled Florida loans. Sponsor liquidity and ability/willingness to transact require direct evidence. |
| Does an incentive change project economics? | Official program rules, current funding rounds, rent/income limits, published awards, mapped designations and local fee/tax programs. | Specialist research only where it supplies missing authoritative coverage. | Versioned eligibility checklist and scenarios with/without the benefit, including compliance costs and timing. Geography or prior awards do not establish this project's eligibility or approval. |
| What can we pay, finance and earn? | Dated Treasury/SOFR benchmarks and source-backed inputs above. | Better comparable transactions, operating benchmarks and loan research; actual lender quotes remain distinct. | Acquisition/recapitalization/development cash flows, debt sizing, refinance gap, cost to complete, peak equity, yield on cost, NPV, levered/unlevered dated IRR and equity multiple. Assumed rents, spreads, exit cap rates and costs remain visibly assumed. |

## Free sources: what has actually been established

The earlier research pass obtained parcel-service metadata and sample records, parsed a DBPR district license extract, and received FDIC financial and NY Fed SOFR responses. Those are source-access experiments, not statewide production ingestion.

- Florida parcel service inspected is a 2025 layer, despite newer service metadata. Statewide retrieval, county reconciliation and current county supplements remain work. [DOR assessment/GIS publication](https://www.floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx)
- DBPR publishes apartment-license and inspection extracts with documented columns. License rows are not automatically unique communities. [DBPR records](https://www2.myfloridalicense.com/hotels-restaurants/lodging-public-records/)
- HUD lists monthly FHA mortgage fields including original amount, interest rate, monthly principal/interest, maturity, amortized unpaid balance and holding/servicing lenders. The publication was dated August 31, 2026 when checked. The XLSX download in the earlier probe returned HTTP 403; successful acquisition and parsing are unresolved. An amortized balance is not a payoff quote. [HUD mortgage publication](https://www.hud.gov/hud-partners/multifamily-fhasl-active)
- Agency historical performance/disclosure access requires free registration and applicable terms; SEC CMBS exhibits require parsing and collateral matching. Coverage is program-specific, not all multifamily debt. See PUBLIC-DATA-RESEARCH.md for exact publications and probe status.
- Census statistical API access needs a free key in the tested path; a response with HTTP 200 was actually a missing-key HTML page. Census bulk data is another route. RHFS provides survey financial/expense data for supported aggregates, not current identified-property operations. [2024 RHFS release](https://www.census.gov/newsroom/press-releases/2026/2024-rhfs-data.html)
- FDIC bank financials support lender research at the reporting-bank level. Verify field units, quarter/YTD treatment and definitions before calculating trends. [FDIC API](https://api.fdic.gov/banks/docs)

### Additional HUD GIS probe in this follow-up

The [HUD Multifamily Properties service](https://egis.hud.gov/arcgis/rest/services/cpdmaps/HudMfProps/MapServer/1) returned JSON metadata and sample records. It exposes fields named MTR_LATEST_DSCR, PCT_OCCUPIED, loan maturity and financial reporting dates. The first samples contained nulls or zero DSCR/occupancy with absent reporting dates; one apartment record contained a maturity date. The Florida filter used STATE2KX='12', after inspecting its string type and returned values.

This establishes a queryable candidate, not usable current financial coverage. Zero values with missing dates must not become claims of zero occupancy or zero coverage. Check the source definitions, sentinel values, program/category, vintage and full null distribution before admitting these observations. Do not substitute this GIS layer for the unparsed monthly mortgage workbook. This small sample is not a statewide coverage estimate.

## Paid acquisition priorities

Do not choose a provider on the count of advertised fields. Test the same agreed sample of approximately 50 real Florida properties across size, county, age, financing type and use case. Include properties outside institutional markets and deliberate known negatives; do not choose only records the vendor says are covered.

| Gap worth paying to fill | Candidate | Verified description versus open acquisition questions |
|---|---|---|
| Market rents, competition, operating comparisons and ownership research | Yardi Matrix | Its official multifamily page describes 50+ unit coverage in researched markets, rents/unit mix, ownership/management, occupancy history, loans, sales and supply pipeline. Matrix Expert benchmarks aggregate/anonymize operating data; its property DSCR/LTV estimates are modeled. General API availability and automated retention rights for our use have not been established; negotiate the appropriate feed/export entitlement. |
| Debt events, servicing and historical loan/property financials | CRED iQ; compare Trepp | CRED iQ explicitly offers bulk files/datafeeds/APIs and describes securitized/agency loan, property, watchlist, delinquency and financial records. Its advertised universe does not mean all bank-held loans. Verify Florida property match quality, historical revisions, observed periods and collateral allocations. Trepp is an alternative to evaluate against the same sample and terms. |
| County-by-county permit normalization | Shovels or another documented permit service | A candidate only if the free county work proves costly. Check jurisdiction/date coverage, amendments and underlying document access. A permit record does not establish percent complete or cost to complete. |

Sources: [Yardi Matrix multifamily](https://www.yardimatrix.com/property-types/multifamily/), [CRED iQ datafeed/API](https://pages.cred-iq.com/datafeed), [Trepp multifamily](https://www.trepp.com/multifamily-solutions), [Shovels data dictionary](https://www.shovels.ai/data-dictionary).

Measure correct property/loan matches, useful populated fields, source periods, latency, revision handling, contradictions, small-property coverage, retained-history/export rights and the actual quote. Prefer a targeted export or scoped subscription when available and adequate. No price or pay-per-call availability is assumed. Purchase remains a separate owner decision.

## Permissioned diligence acquisition

An attractive candidate should acquire an evidence package through authorized exports/uploads or direct system access, not require the analyst to retype a property row. The proposed request list is:

- Operations: current unit-level rent roll; monthly operating statements for 24–36 months where available; T12; receivables/collections, concessions, bad debt and lease samples; utility, payroll, insurance and tax detail; renovation/unit-status history. Reconcile totals and distinguish cash, accrual and adjusted figures.
- Debt and capital: notes, amendments/extensions, guarantees, amortization schedules, current lender statement/payoff, escrow/reserve balances, rate-cap terms/expiry, covenants, subordinate debt and preferred equity. Obtain executable financing proposals when underwriting a transaction.
- Physical/site: current survey/title/easements, plans, permits/COs, PCA and specialist reports, environmental/geotechnical work where needed, current insurance quotes, utility capacity and entitlement/approval evidence.
- Execution: costed scope, contractor bids/contracts, construction draws and commitments, completion schedule, contingency, leasing costs, working capital, post-acquisition tax and insurance assumptions.
- Sponsor/structure: ownership/control evidence, partnership terms, capital commitments and permissioned evidence of liquidity or guarantees relevant to the proposed structure.

This is a proposed comprehensive intake, not a claim every document is mandatory for every transaction. A current Fannie Mae document taxonomy independently illustrates the real categories involved: certified rent roll, operating statements, loan/collateral agreements, environmental and zoning reports, equity documents and property-condition work. [Fannie Mae document categories](https://multifamily.fanniemae.com/media/document/pdf/dus-docway-document-types-category)

AI may extract and classify these documents; deterministic reconciliation and financial code calculate results. Every material input keeps its file/page or row reference, date and review state. Conflicts remain available for resolution; extraction is not verification.

## Delivery sequence and acceptance

1. **Acquire and prove actual source rows.** Parcel/DBPR identity, disclosed-loan pilot, daily rate benchmarks and an initial authoritative market/context cohort. Store original observations, source date, fetch date, units, grain and permitted retention. Resolve HUD download/parse and loan matching before claiming that coverage.
2. **Deliver a linked map, dense screener and a useful calculation together.** Property/community polygons or verified locations, aerial imagery with dates, spatial selection, comp sets and evidence inspector share one filtered population. Keep unmapped records and missing financials in explicit denominators. Demonstrate a source-backed debt/maturity comparison and financing-threshold scenario with visible assumptions; do not present a parcel directory as analytical completion.
3. **Deepen county and source coverage.** All 67 counties remain scope; source-specific acquisition order can be prioritized. Add taxes, recordings, permits, zoning and incentives where access and meanings are proven. Show coverage by geography, field and reporting date.
4. **Test paid candidates against the measured gaps.** Use the same real-property sample and require a demonstrated improvement in an actual analytical decision. Select market versus debt coverage based on the first workflow and sample results; no blanket subscription shopping.
5. **Underwrite selected candidates with permissioned evidence.** Reconcile source documents; independently validate financial cases; run base/downside and sensitivity analysis. Include rehabilitation or completion cash flows, refinancing/exit, timing and required equity.

The first analysis must answer at least one substantive question: what income/value supports a chosen debt amount today; how reported performance compares to a valid cohort; or what funded scope/operating change is needed to reach selected investment and lending thresholds. An actual refinance gap needs actual obligations and an explicit funding scenario. A maturity alone cannot answer it.

Maintain three independent views: lender/program eligibility, our chosen investment policy and observed peer comparison. If a grade is introduced, disclose the metric definitions, evidence coverage and policy; do not call hand-chosen weights a validated probability of success. Completed-return benchmarking requires consistent dated cash flows from disclosed or permissioned realized investments and attention to selection bias. Current property listings or rent statistics cannot supply it.

The resulting product is an evidence-backed spatial research and underwriting workbench: discover an asset, see why it surfaced, compare it, test the economics, acquire missing diligence, and decide. Nothing in this document authorizes buying access or restarting implementation.
