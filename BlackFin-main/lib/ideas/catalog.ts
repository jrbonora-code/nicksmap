import "server-only";

export type Idea = {
  id: number;
  title: string;
  summary: string;
  payer: string;
  role: string;
  nextStep: string;
  potential: string;
  work: string;
  lanes: string[];
  thesis: string[];
  approach: string;
  tools: string;
  overlap: string;
  needs: string;
};

// Strategy research notes, September 12, 2026. Estimates and market claims
// remain unverified hypotheses. Pass to the client only after session checks.
export const IDEAS: Idea[] = [
  {
    id: 1, title: "OZ nomination and site research",
    summary: "Evaluate sites in nomination-eligible tracts for acquisition, entitlement or qualified-fund investment.", payer: "Land buyer, developer or fund, if an engagement is agreed",
    role: "Research sites; negotiate options; coordinate entitlement", nextStep: "Verify tract status and parcel constraints; compare a site sale with a long-term fund investment.", potential: "High", work: "Very low", lanes: ["Land & development", "Incentives"],
    thesis: ["Governors nominate new tracts by late September, with extension to October 28, 2026; the new map takes effect January 1, 2027.", "Proposed screening test in the original notes: MFI ≤70% AMI, or poverty ≥20% and MFI ≤125% AMI.", "Rural QROF: 30% basis step-up at year 5; substantial-improvement test reduced from 100% to 50%. Both maps in effect during the 2027–28 overlap."],
    approach: "Screen official eligible tracts, consider a land option, then compare sale after designation with a ten-year hold. Selection and any tax treatment require separate verification.",
    tools: "Parcel/tract screening using public income, zoning and utility data.",
    overlap: "The research map links acquired property points to nomination-eligible 2020 Census tracts. Existing, nominated and designated zone layers and a development-site inventory are not loaded.",
    needs: "Official eligible/nominated/designated tract layers; vacant-land inventory; zoning, achievable density, infrastructure and site economics. Evaluate the option/sale and QOF hold structures separately.",
  },
  {
    id: 2, title: "Land with potential power access",
    summary: "Evaluate land where documented utility service could support development.", payer: "Data-center developer or land investor",
    role: "Assess utility evidence; negotiate site control or a development partnership", nextStep: "Obtain utility capacity and service-timing evidence before valuing proximity to infrastructure.", potential: "Highest", work: "Low–moderate", lanes: ["Land & development"],
    thesis: ["The notes hypothesize that available power may constrain development. Original reference: Ashburn power-ready land above $3.5M/acre.", "PJM reference: 294 GW studied, 23 GW reached service and 74% withdrawn."],
    approach: "Screen owned and competing land for substation adjacency; option it; sell or form a joint venture with a data-center developer who handles interconnection. Also investigate workforce housing near hyperscale campuses.",
    tools: "Parcel screening against grid/substation capacity maps; entitlement research and public-comment strategy.",
    overlap: "Geographic screening can be reused. Data-center land is an expansion beyond the current apartment inventory; no power-capacity data is connected.",
    needs: "Florida utility territories, capacity and service timing, land availability, infrastructure and entitlements. Proximity alone does not establish deliverable power; PJM evidence is not Florida capacity evidence.",
  },
  {
    id: 3, title: "Refinancing capital support",
    summary: "Evaluate preferred equity or additional loans where verified refinancing proceeds are insufficient.", payer: "Property owner or sponsor, if additional capital is needed",
    role: "Compare financing alternatives; provide or arrange capital subject to authority", nextStep: "Obtain current operations, payoff and lender terms; establish whether a financing need exists.", potential: "Moderate–high", work: "Low", lanes: ["Credit & capital"],
    thesis: ["Original estimates: $162B of multifamily maturities in 2026 and $168B in 2027; 39% of CMBS hard maturities in Q4.", "Refinancing may need new equity. The original notes contemplated a September 16 Fed hike reducing proceeds."],
    approach: "Preferred equity or gap loans targeting 12–16%, plus additional performance-based compensation and negotiated control rights. Original thesis: a default could create a path to ownership at the sponsor's basis; actual rights depend on the documents.",
    tools: "Document extraction, including tools such as Kolena, to analyze rent rolls and T12s at volume.",
    overlap: "Available foundation: recorded mortgage/lender data and some maturities; reusable debt-sizing, DSCR, debt-yield and sources/uses calculations. No complete rescue-capital workflow.",
    needs: "Current operating statements and payoff; refinance shortfall scenarios; preferred-equity/mezzanine terms, waterfalls, lender consents and control rights.",
  },
  {
    id: 4, title: "Acquisition during initial leasing",
    summary: "Evaluate recently delivered apartments against supported replacement cost and stabilization assumptions.", payer: "Acquisition partnership; no separate service payer identified",
    role: "Acquire and oversee stabilization with property management", nextStep: "Verify effective rents, concessions, leasing pace, purchase basis and financing terms.", potential: "Moderate–high", work: "Low", lanes: ["Acquisition & operations"],
    thesis: ["Target 2022–24 Sun Belt deliveries financed with floating-rate bridge debt.", "Original thesis: tariffs raise replacement cost while distressed acquisition basis falls; a 2027–28 reduction in new supply supports recovery."],
    approach: "Acquire below replacement cost, obtain five-year agency financing, use third-party management and hold through stabilization.",
    tools: "HelloData rent comparisons for underwriting; AI revenue management after acquisition.",
    overlap: "Available foundation: property inventory, reported year built, ownership/debt records and annual acquisition calculations. These fields do not establish Class A quality, lease-up status or distress.",
    needs: "Effective rent and concession comparisons, lease-up pace, actual purchase basis, replacement-cost evidence, stabilization cash flows and financing eligibility/quotes.",
  },
  {
    id: 5, title: "Sponsor and fund interests",
    summary: "Evaluate discounted fund interests, sponsor commitments or management-company cash flows.", payer: "Selling investor, sponsor or acquisition partnership, depending on the transaction",
    role: "Assess interests and governance; invest or operate if agreed", nextStep: "Reconcile entities and review partnership documents, transfer rights and company financials.", potential: "High", work: "Low–moderate", lanes: ["Credit & capital"],
    thesis: ["Unverified transaction benchmarks in the September 12 notes: a $115M continuation vehicle (August 18, 2026), a $694M recapitalization, and general-partner transactions up 40% in 2025. Original source attribution needs verification.", "Evaluate sponsors of 2021–22 acquisitions; consider limited-partner secondary interests, general-partner co-investments and management-company fee streams. The notes propose about ten times fee-related earnings as an unvalidated valuation reference."],
    approach: "Buy discounted limited-partner interests, fund the 5–10% general-partner commitment, or acquire management-company fee streams if operating the business is desired.",
    tools: "Read PPMs, LPAs and cap tables to identify performance-based profit shares, capital-call exposure and potential limited-partner dilution.",
    overlap: "Sponsor/portfolio research fits the original scope. Acquired owner names are only a starting point; fund and sponsor relationships are not resolved.",
    needs: "Entity/fund relationships, LPAs/PPMs, cap tables, capital calls, transfer restrictions, waterfalls and management-company financials. Property deeds do not supply these.",
  },
  {
    id: 6, title: "Mortgage note acquisition",
    summary: "Evaluate available mortgage notes using documented collateral, rights and recovery alternatives.", payer: "Note seller or capital partner; no service engagement established",
    role: "Acquire a note and manage a negotiated resolution", nextStep: "Confirm sale availability, assignments, current balance, lien priority and collateral scope.", potential: "High", work: "Moderate", lanes: ["Credit & capital"],
    thesis: ["Original CMBS references: 7.55% headline delinquency, or 9.17% including performing matured balloons.", "Approximately $27.3B of 2026 hard maturities reportedly have debt yield of 8% or less."],
    approach: "Buy notes at a discount from banks or servicers and manage restructuring; compare repayment, negotiated sale and possible acquisition of collateral.",
    tools: "Per-loan debt-yield analysis from servicer data; lease and estoppel abstraction for diligence.",
    overlap: "Available foundation: mortgage amounts, lenders, document references and some maturity dates are saved. No complete note-purchase or restructuring model exists.",
    needs: "Current balances/status, assignments and releases, collateral scope, servicing reports, note-sale availability, lien position and recovery and restructuring scenarios. A mortgage record does not establish a note for sale.",
  },
  {
    id: 7, title: "Land entitlement and development",
    summary: "Evaluate site entitlement or development against locally supported future housing demand.", payer: "Site buyer, developer or investment partner",
    role: "Control a site; coordinate entitlement; sell or develop", nextStep: "Verify zoning, utilities, construction costs and absorption before choosing a delivery date.", potential: "High", work: "High", lanes: ["Land & development"],
    thesis: ["Original delivery target: 2028, dependent on verified demand, approvals and construction timing.", "Original forecasts: multifamily starts fall to roughly 392k in 2026 and 367k in 2027.", "Entitled sites may be scarce when rent growth returns. Original alternative ranking: #3 if stopping at entitlement and selling the site."],
    approach: "Option land, secure entitlements and build into the projected supply gap, or sell the entitled site.",
    tools: "Site feasibility tools before a letter of intent; the notes propose screening 500 sites to identify five for investigation.",
    overlap: "Development partnerships are in the original scope. The trial acquisition mainly covers existing licensed apartments, not a development-site universe.",
    needs: "Vacant/redevelopment parcels, zoning and land use, achievable density, permits, utilities, construction costs, absorption and development cash-flow scenarios.",
  },
  {
    id: 8, title: "Affordable housing rehabilitation",
    summary: "Evaluate whether an acquisition and rehabilitation could support a 4% housing tax-credit structure.", payer: "Owner, developer or tax-credit investment partnership",
    role: "Assess rehabilitation and program structure with qualified advisers", nextStep: "Verify applicable program rules, tenant qualification, eligible basis and compliance costs.", potential: "Moderate", work: "High", lanes: ["Acquisition & operations", "Incentives"],
    thesis: ["Original policy notes: permanent 25% bond test for buildings placed in service after 2025; more than 20 states at bond cap.", "Fannie/Freddie LIHTC equity capacity described as increasing from $1B to $2B each; 9% authority +12%.", "Original bond-transition note: at least 5% of aggregate basis financed from bonds issued after December 31, 2025. Fifteen-year compliance period."],
    approach: "Evaluate acquisition and rehabilitation of Class B/C apartments with documented financing or operating constraints through a 4% tax-credit structure.",
    tools: "Screen rent rolls for rents already near applicable 60%-AMI rent limits; tenant income and rent qualification must be tested separately.",
    overlap: "Fits the incentive and recapitalization approach. Licenses and property records supply an initial inventory; no specialized LIHTC model exists.",
    needs: "Unit rents, utility allowances and household-income evidence; current applicable limits; rehabilitation/eligible basis; bond and allocation rules; credit pricing and compliance economics.",
  },
  {
    id: 9, title: "Apartment operating improvements",
    summary: "Evaluate measured leasing, maintenance and expense improvements in existing apartments.", payer: "Property owner or third-party management client, if contracted",
    role: "Acquire or manage; test operating changes and measure results", nextStep: "Obtain current operations and integration access; establish a baseline for a controlled trial.", potential: "Moderate", work: "Very high", lanes: ["Acquisition & operations"],
    thesis: ["Original market references: B/C vacancy 5.4% versus 6.8% overall.", "Original vendor claims: Asset Living +300 bps occupancy across 450k units; EliseAI survey, 77% reduced operating expenses and 85% increased lead-to-lease."],
    approach: "Acquire existing Class B/C assets with documented operating needs, improve leasing, revenue management and maintenance, improve net operating income, then potentially offer third-party management.",
    tools: "EliseAI, Funnel and RealPage Leonardo; assisted leasing, revenue management and maintenance.",
    overlap: "Related acquisition and operating-analysis tools exist. Annual NOI and operating ratios are reusable. No leasing, maintenance or property-management automation is connected.",
    needs: "Actual property operations, expense/occupancy benchmarks, improvement scenarios, integration access and measured outcomes. Vendor claims do not establish asset-specific savings.",
  },
  {
    id: 10, title: "Development services partnership",
    summary: "Evaluate contracted development and construction-management services alongside an investment partner.", payer: "Project owner or capital partner under an agreement",
    role: "Manage development execution and reporting for agreed compensation", nextStep: "Define authority, delivery scope, fees, performance participation and capital obligations.", potential: "Low–moderate", work: "Highest", lanes: ["Land & development", "Credit & capital"],
    thesis: ["Original thesis: institutions have capital but lack development teams; Fannie plans $88B of multifamily business in 2026.", "AI may reduce deal overhead. Original extension: internal tooling could become a separate software business."],
    approach: "Provide development and construction-management execution for fees and a performance-based profit share with limited equity invested.",
    tools: "Draw packages, lender reporting, quarterly investor reports and permit tracking.",
    overlap: "Fits the development-partnership intent; basic sources/uses and calculations can be reused. Project administration and fee and profit-sharing analysis are not implemented.",
    needs: "Project/sponsor sourcing, fee and profit-sharing economics, development budgets, draws and reporting. Selling software would be a separate scope from this internal platform.",
  },
];

export const MARKET_NOTES = [
  "Fed funds 3.50–3.75%; FOMC September 15–16; approximately 65% odds of a 25 bp hike.",
  "30-year fixed mortgage rate: 6.76%.",
  "Multifamily vacancy 6.8% in Q2; Class B/C 5.4%; starts falling; projected reduction in new supply in about 18 months.",
  "Multifamily maturities: $162B in 2026 and $168B in 2027.",
];

export const PRACTICAL_NOTES = [
  "Original staffing assumption: ideas 1–4 could be investigated by an operator and one analyst. Capacity has not been validated.",
  "Original staffing assumption: ideas 5–6 need legal support; ideas 7–10 need a delivery team.",
  "Original prioritization proposal: near-term OZ site research and continuing refinancing-capital research. This is not an approved investment or service mandate.",
];
