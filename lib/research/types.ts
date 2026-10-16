import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { ServicerReading } from './debt-sources.ts';

export type DebtRecord = {
  id: string; sourceId: string; sequence: number; instrumentKey: string | null;
  lender: string | null; amountCents: number | null; recordingDate: string | null;
  documentDate: string | null; maturity: string | null; documentNumber: string | null;
  reportedRate: string | null; sharedPropertyCount: number; instrumentConflict: boolean;
  loanType?:string|null; position?:string|null; lenderType?:string|null; lenderCode?:string|null;
  providerMortgageId?:string|null; providerOpen?:boolean|null; openSourcePath?:string|null; assumable?:boolean|null;
  possibleDuplicate?:boolean;
};
export type ResearchProperty = {
  id: string; providerId: string; address: string; countyFips: string; countyName: string;
  apn: string | null; longitude: number | null; latitude: number | null;
  owner: string | null; propertyType: string | null; providerUnits: number | null;
  licensedUnits: number[]; licenseCount: number; yearBuilt: number | null;
  estimatedValueCents: number | null; sourceId: string; retrievedAt: string;
  providerDate: string | null; strictAddress: boolean; needsReview: boolean; flags: string[];
  mortgages: DebtRecord[]; tractId: string | null; oz: 'eligible' | 'not_in_list' | 'unmapped' | 'ambiguous';
  rural: boolean | null;
  mortgageHistory?:DebtRecord[];
  /** RealEstateAPI's own estimates, retained from the saved response (parser research-import-3). Undefined on older snapshots. */
  providerEstimate?: ProviderEstimate | null;
  /** Linked HUD and CMBS loans and county releases from the current loan-source run (migration 010); null without a run. */
  servicer?: ServicerReading | null;
  /** Read at query time from the national 2027 run (migration 009); null when no run is imported or the tract is unresolved. */
  oz2027?: Oz2027PropertyReading | null;
};
/** Display-only provider estimates. Never an operating input, a recorded basis or a payoff (DEBT-BASIS.md). */
export type ProviderEstimate = {
  /** `estimatedMortgageBalance`: the provider's estimate of what is owed on the open mortgages (method not published). */
  mortgageBalanceCents: number | null;
  /** `openMortgageBalance`: the provider's total of open recorded mortgage amounts (not amortized). */
  openMortgageCents: number | null;
  /** `estimatedEquity`: the provider's estimated value less its estimated mortgage balance. */
  equityCents: number | null;
  equityPercent: number | null;
  /** `estimatedMortgagePayment`, monthly. */
  mortgagePaymentCents: number | null;
  sourceId: string; retrievedAt: string;
};
/** Where a property's balance figure comes from, best first. */
export type BalanceSource = 'servicer' | 'provider_estimate' | 'estimate' | 'recorded';
export type BalanceReading = {
  source: BalanceSource; cents: number;
  /** An estimate range (source 'estimate'); cents is the midpoint. */
  lowCents?: number; highCents?: number;
  /** The recorded instrument behind an 'estimate' or 'recorded' reading. */
  debtId?: string;
  /** The servicer source behind a 'servicer' reading, and its as-of date when the source gives one. */
  via?: 'hud' | 'cmbs'; asOf?: string | null;
};
export type MaturityWallBucket = {
  key: string; label: string; kind: 'past' | 'quarter' | 'year' | 'later' | 'undated'; next24: boolean;
  loans: number; recordedCents: number; recordedLoans: number; estimateLowCents: number; estimateHighCents: number; estimatedLoans: number;
  lenders: { name: string; loans: number }[];
  from: string | null; to: string | null;
};
export type MaturityWall = {
  asOf: string; through24: string; loans: number; dated: number;
  buckets: MaturityWallBucket[];
  lenders24: { name: string; loans: number; recordedCents: number; estimateLowCents: number; estimateHighCents: number; earliest: string }[];
  sizes24: { label: string; loans: number }[];
};
export type Oz2027PropertyReading = {
  status:'certified'|'nominated'|'state_recommended'|'draft_for_comment'|'local_recommended'|'eligible';
  confidence:'high'|'medium'|'low'|'unverified'|null; rural:boolean; overlap2018LandPct:number; inAprilAppendix:boolean;
  /** Present when at least 1% of the tract's land is inside a 2018-designated zone. */
  notice:{text:string;zone:string;ends:string;endDate:string;rule:string;citation:string;url:string}|null;
};
/** Which eligibility list the OZ readings of a result come from. */
export type OzBasis = {source:'treasury_2026_09_23'|'irs_rev_proc_2026_14_appendix'; runId:string|null; label:string};
export type ResearchSource = {id:string; provider:string; url:string; retrievedAt:string; dateBasis:string; sha256:string; locator:string};
export type LicenseLink = {license:string; name:string; address:string; units:number|null; status:string; flags:string[]; sourceId:string; primaryStatus:string; expiry:string|null};
export type PropertyDetail = {property:ResearchProperty; sources:ResearchSource[]; licenses:LicenseLink[]; fields:{label:string;path:string;value:string|null;sourceId:string;group?:string}[]; ozBasis?:OzBasis};
export type TractFeature = Feature<Polygon|MultiPolygon,{geoid:string;rural:boolean;eligible:boolean;status?:string|null;overlap2018LandPct?:number|null}>;
export type ResearchQuery = {
  ids:string[]|null;
  text:string; county:string; lender:string; ownership:string;
  debt:'all'|'reported'|'missing'; match:'all'|'strict'|'review';
  oz:'all'|'eligible'|'not_in_list'|'unmapped'; maturityBefore:string; maturityAfter:string;
  beforeScenarioDate:boolean;
  minAmount:number|null; maxAmount:number|null; minUnits:number|null; maxUnits:number|null;
  bounds:[number,number,number,number]|null; area:Feature<Polygon>|null;
  /** Any current mortgage entry with a reported maturity from the scenario date through 24 months later. */
  within24:boolean;
  /** The source of the property's best balance figure; 'none' when there is no figure. */
  balanceSource:''|BalanceSource|'none';
  /** A servicer-reported balance (HUD or CMBS, confirmed link). */
  realBalance:boolean;
  /** A linked CMBS loan in special servicing. */
  specialServicing:boolean;
  /** A verified release: county record citing the instrument, a HUD termination or a CMBS payoff code. */
  releasedVerified:boolean;
  sort:'address'|'countyName'|'providerUnits'|'amount'|'maturity'|'requiredNoi'|'requiredValue'|'balance'|'lender'; direction:'asc'|'desc';
};
export type Scenario = {version:'threshold-1'; asOf:string; annualRate:number; amortizationMonths:number; termMonths:number; minDscr:number; minDebtYield:number; maxLtv:number; annualReserveCents:number; interestOnly:boolean};
export type ThresholdResult = {
  modelVersion:'threshold-1'; principalCents:number; monthlyDebtServiceCents:number; annualDebtServiceCents:number;
  requiredNoiDscrCents:number; requiredNoiDebtYieldCents:number; requiredNoiCents:number; requiredValueCents:number;
  balloonCents:number; bindingIncomeConstraint:'DSCR after reserves'|'Debt yield'|'Tied';
  actualNoi:null; actualPayoff:null; actualFundingGap:null;
};
export type ScreenRow = ResearchProperty & {scenarioDebt:DebtRecord|null; scenarioResult:ThresholdResult|null; earliestMaturity:string|null; balance:BalanceReading|null};
export type ResearchResult = {
  snapshotId:string; sourceDate:string; importedAt:string; ozBasis:OzBasis; query:ResearchQuery; scenario:Scenario;
  rows:ScreenRow[]; total:number; universe:number; mapped:number; licenseUniverse:number; unmatchedLicenses:number;
  coverage:{mortgageProperties:number;mortgageEntries:number;maturityEntries:number;positiveRateEntries:number;strictProperties:number;eligibleProperties:number;scenarioProperties:number;unresolvedInstrumentEntries:number;sharedInstrumentGroups:number};
  lenders:{name:string;instrumentGroups:number;properties:number;recordedAmountCents:number;datedMaturities:number}[];
  maturityBuckets:{label:string;entries:number;instrumentGroups:number}[];
  maturityWall:MaturityWall;
  balanceCoverage:Record<BalanceSource|'none',number>;
  debtCoverage:{runId:string|null;hud:number;cmbs:number;release:number;specialServicing:number;released:number};
  countyCoverage:{fips:string;name:string;properties:number;licenses:number}[];
};
