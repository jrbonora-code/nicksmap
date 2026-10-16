# Analysis methodology

## Separate analytical authorities

1. **Calculation definition:** documented formulas and independently checked reference models.
2. **Empirical assumption:** dated source observations, suitable market comparisons and actual project outcomes.
3. **Investment policy:** our return, capital and risk limits.
4. **Lender/program requirements:** the applicable financing or program rules and approval conditions.

Keep these separate. Lending rules are not universal investment criteria; a percentile is not a recommendation. The illustrative percentage weights discussed during ideation are not a validated scoring methodology and are not implemented.

## Initial references to evaluate

- [Fannie Mae Income Analysis](https://mfguide.fanniemae.com/node/7526): income/expense support, underwritten cash flow and debt coverage. Identify the exact product and effective version before applying requirements.
- [NCHMA Model Content Standards](https://www.housingonline.com/councils/national-council-housing-market-analysts/model-content-standards/): market-study content, market boundaries and comparable/demand methodology. The reviewed page described a September 2025 update. Review the actual version and reuse terms before adoption.
- [A.CRE acquisition model](https://www.adventuresincre.com/multifamily-apartment-acquisition-model-in-excel/) and [development model](https://www.adventuresincre.com/mutlifamily-development-model/): candidates for reference workbooks; not imported or financially validated here.
- [NCREIF/PREA Reporting Standards](https://user.ncreif.org/reporting-standards/): consistent investment reporting. The [NPI](https://user.ncreif.org/data-products/property/) is a quarterly unlevered institutional property index; it is not interchangeable with a net equity development IRR.

## Calculation contract

The current deterministic screening primitives use `screening-0.2.0`; the research financing-threshold adapter uses `threshold-1`. Its formulas, supported domains, reference cases, runtime error behavior and remaining scope are documented in [calculation validation](CALCULATION-VALIDATION.md). It does not implement full underwriting or an IRR solver.

Every metric must record identifier, definition/formula, units, period, cash-flow convention, input lineage, rounding, implementation version and a reference case. Store actual cash-flow dates for XIRR/XNPV; detect nonconventional cash flows and ambiguous IRRs. Define LP, sponsor and property returns separately, including fees and promotes.

| Area | Required metrics and distinctions |
| --- | --- |
| Operations | Effective rents after concessions, physical/economic occupancy, collections, normalized operating expenses, NOI and reserves; avoid double counting vacancy/concessions |
| Acquisition | Price vs all-in basis, cost/unit and consistently defined SF, entry cap, renovation/carry/closing costs |
| Development | Land basis/buildable unit, hard/soft costs, contingency, construction draws, interest carry, cost to complete, absorption and stabilization |
| Financing | DSCR using applicable lender cash flow/debt service, debt yield with declared numerator, LTV/LTC, debt schedule, IO expiry, maturity, fees and escrows |
| Returns | Unlevered and levered dated returns, equity multiple, cash distributions, profit dollars, yield on total cost and investor waterfall |
| Downside | Minimum cash, peak equity, break-even occupancy, covenant failure, default/refinance shortfall, sale friction and terminal value sensitivity |
| Incentives | Benefit timing, eligible costs, restrictions, compliance, expiry and recapture risk; investor tax benefits separate from property NOI |

Simple refinancing proceeds are the minimum of all applicable constraints, including LTV, coverage and debt yield. Apply floors/limits consistently and include payoff, fees and required reserves when calculating the funding gap. These are estimates until loan terms and supporting financials are verified.

Build base, downside and severe-downside scenarios with joint rent/concession, expense, tax, insurance, construction, delay, rate and exit-cap changes. Do not add tax savings or value uplift twice. Separate unapproved incentive scenarios from the base case unless the investment policy explicitly allows them with clear labeling.

## Benchmark cohorts

Distinguish market comps (rent, expense, sales), execution benchmarks (cost, timing, lease-up), and investment outcomes (dated contributions/distributions, net profit and realized return). Normalize by strategy, entry vintage, building type, unit mix, restrictions, stage, submarket and hold period. Examine leverage separately. Capture inclusion/exclusion reasons and allow reviewer changes with reasons.

Use successes, ordinary outcomes and failures. Report sample size, observation dates, dispersion and missing outcomes. Broader institutional indices are contextual benchmarks only. A refinance or sponsor-marked NAV is not a fully realized investment outcome. Tutorial examples with invented assumptions are not historical success cases.

## Grading

Begin with explicit policy pass/conditional/fail checks and an evidence register. Show market position, economics, financing resilience, execution and ability to transact separately. Missing critical inputs can leave a deal ungraded. Hard blockers cannot be canceled out by favorable scores elsewhere.

A future aggregate score requires a documented purpose, frozen rules, historical evaluation and an explanation of sensitivity to assumptions/weights. Score is not a probability of success. Record policy, source and model versions on every result.

## AI boundary

AI may propose extractions, identify inconsistencies, suggest entity matches, retrieve sources and draft memos. Structured validation and human review establish critical facts. Deterministic code executes calculations. A source document cannot give instructions to the assistant, request secret access or authorize external actions.
