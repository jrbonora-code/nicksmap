// The property page keeps what a reader would share in the URL: the view, the panel, the selected property, the map
// colouring and every filter. Pure functions only, so the round trip is unit-tested. Anything malformed falls back to
// its default; a URL never throws and never produces a query the server would reject.
import { emptyQuery } from '../../lib/research/query.ts';
import type { ResearchQuery } from '../../lib/research/types.ts';

export type ResearchView = 'map' | 'split' | 'table';
export const RESEARCH_TABS = ['properties', 'maturities', 'lenders', 'cases', 'sources'] as const;
export type ResearchTab = typeof RESEARCH_TABS[number];
export type ResearchColour = 'oz' | 'maturity';
type Filters = Omit<ResearchQuery, 'ids' | 'area'>;
export type ResearchState = Filters & { view: ResearchView; tab: ResearchTab; property: string; colour: ResearchColour; at: [number, number, number] | null };

/** The page opens on properties with mortgage entries, earliest reported maturity first. */
export const DEFAULT_RESEARCH_STATE: ResearchState = {
  text: '', county: '', lender: '', ownership: '', debt: 'reported', match: 'all', oz: 'all', maturityBefore: '', maturityAfter: '', beforeScenarioDate: false,
  minAmount: null, maxAmount: null, minUnits: null, maxUnits: null, bounds: null, within24: false, balanceSource: '', realBalance: false, specialServicing: false, releasedVerified: false, sort: 'maturity', direction: 'asc',
  view: 'split', tab: 'properties', property: '', colour: 'oz', at: null,
};
const DEBT = ['all', 'reported', 'missing'] as const, MATCH = ['all', 'strict', 'review'] as const, OZ = ['all', 'eligible', 'not_in_list', 'unmapped'] as const;
const SOURCES = ['', 'servicer', 'provider_estimate', 'estimate', 'recorded', 'none'] as const;
const SORTS = ['address', 'countyName', 'providerUnits', 'amount', 'maturity', 'requiredNoi', 'requiredValue', 'balance', 'lender'] as const;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const pick = <T extends string>(options: readonly T[], value: string | null, fallback: T): T => ((options as readonly string[]).includes(value ?? '\u0000') ? value as T : fallback);
const amount = (value: string | null) => { if (value === null || !/^\d+(\.\d+)?$/.test(value)) return null; const n = Number(value); return Number.isFinite(n) && n <= 1e12 ? n : null; };

type Params = { get(key: string): string | null };
export function parseResearchState(params: Params): ResearchState {
  const d = DEFAULT_RESEARCH_STATE;
  const s: ResearchState = { ...d };
  s.view = pick(['map', 'split', 'table'] as const, params.get('view'), d.view);
  s.tab = pick(RESEARCH_TABS, params.get('tab'), d.tab);
  const property = params.get('p') ?? '';
  if (/^reapi:[\w-]{1,80}$/.test(property)) s.property = property;
  s.colour = pick(['oz', 'maturity'] as const, params.get('colour'), d.colour);
  const at = (params.get('at') ?? '').split(',').map(Number);
  if (at.length === 3 && at.every(Number.isFinite) && Math.abs(at[0]) <= 180 && Math.abs(at[1]) <= 90 && at[2] >= 0 && at[2] <= 22) s.at = [at[0], at[1], at[2]];
  s.text = (params.get('q') ?? '').slice(0, 180);
  const county = params.get('county') ?? '';
  if (/^12\d{3}$/.test(county)) s.county = county;
  s.lender = (params.get('lender') ?? '').slice(0, 180);
  s.ownership = (params.get('owner') ?? '').slice(0, 180);
  s.debt = pick(DEBT, params.get('debt'), d.debt);
  s.match = pick(MATCH, params.get('match'), d.match);
  s.oz = pick(OZ, params.get('oz'), d.oz);
  s.balanceSource = pick(SOURCES, params.get('src'), d.balanceSource);
  s.within24 = params.get('m24') === '1';
  s.realBalance = params.get('real') === '1';
  s.specialServicing = params.get('ss') === '1';
  s.releasedVerified = params.get('rel') === '1';
  s.beforeScenarioDate = params.get('before') === '1';
  const from = params.get('mfrom') ?? '', to = params.get('mto') ?? '';
  if (isDate(from)) s.maturityAfter = from;
  if (isDate(to)) s.maturityBefore = to;
  if (s.maturityAfter && s.maturityBefore && s.maturityAfter > s.maturityBefore) { s.maturityAfter = ''; s.maturityBefore = ''; }
  s.minAmount = amount(params.get('amin')); s.maxAmount = amount(params.get('amax'));
  if (s.minAmount !== null && s.maxAmount !== null && s.minAmount > s.maxAmount) { s.minAmount = null; s.maxAmount = null; }
  s.minUnits = amount(params.get('umin')); s.maxUnits = amount(params.get('umax'));
  if (s.minUnits !== null && s.maxUnits !== null && s.minUnits > s.maxUnits) { s.minUnits = null; s.maxUnits = null; }
  const box = (params.get('box') ?? '').split(',').map(Number);
  if (box.length === 4 && box.every(Number.isFinite) && box[0] >= -180 && box[2] <= 180 && box[1] >= -90 && box[3] <= 90 && box[0] < box[2] && box[1] < box[3]) s.bounds = [box[0], box[1], box[2], box[3]];
  s.sort = pick(SORTS, params.get('sort'), d.sort);
  s.direction = pick(['asc', 'desc'] as const, params.get('dir'), d.direction);
  return s;
}
/** Only what differs from the default is written, in a fixed key order, so equal states give equal URLs. */
export function serialiseResearchState(s: ResearchState): string {
  const d = DEFAULT_RESEARCH_STATE, p = new URLSearchParams();
  if (s.view !== d.view) p.set('view', s.view);
  if (s.tab !== d.tab) p.set('tab', s.tab);
  if (s.property) p.set('p', s.property);
  if (s.colour !== d.colour) p.set('colour', s.colour);
  if (s.text) p.set('q', s.text);
  if (s.county) p.set('county', s.county);
  if (s.lender) p.set('lender', s.lender);
  if (s.ownership) p.set('owner', s.ownership);
  if (s.debt !== d.debt) p.set('debt', s.debt);
  if (s.match !== d.match) p.set('match', s.match);
  if (s.oz !== d.oz) p.set('oz', s.oz);
  if (s.balanceSource) p.set('src', s.balanceSource);
  if (s.within24) p.set('m24', '1');
  if (s.realBalance) p.set('real', '1');
  if (s.specialServicing) p.set('ss', '1');
  if (s.releasedVerified) p.set('rel', '1');
  if (s.beforeScenarioDate) p.set('before', '1');
  if (s.maturityAfter) p.set('mfrom', s.maturityAfter);
  if (s.maturityBefore) p.set('mto', s.maturityBefore);
  if (s.minAmount !== null) p.set('amin', String(s.minAmount));
  if (s.maxAmount !== null) p.set('amax', String(s.maxAmount));
  if (s.minUnits !== null) p.set('umin', String(s.minUnits));
  if (s.maxUnits !== null) p.set('umax', String(s.maxUnits));
  if (s.bounds) p.set('box', s.bounds.map(n => n.toFixed(5)).join(','));
  if (s.sort !== d.sort) p.set('sort', s.sort);
  if (s.direction !== d.direction) p.set('dir', s.direction);
  if (s.at) p.set('at', `${s.at[0].toFixed(4)},${s.at[1].toFixed(4)},${s.at[2].toFixed(2)}`);
  return p.toString();
}
/** The server query for a page state; the cluster selection is page-local and never in the URL. */
export function queryOf(s: ResearchState, ids: string[] | null): ResearchQuery {
  return { ...emptyQuery, text: s.text, county: s.county, lender: s.lender, ownership: s.ownership, debt: s.debt, match: s.match, oz: s.oz,
    maturityBefore: s.maturityBefore, maturityAfter: s.maturityAfter, beforeScenarioDate: s.beforeScenarioDate, minAmount: s.minAmount, maxAmount: s.maxAmount,
    minUnits: s.minUnits, maxUnits: s.maxUnits, bounds: s.bounds, within24: s.within24, balanceSource: s.balanceSource, realBalance: s.realBalance, specialServicing: s.specialServicing, releasedVerified: s.releasedVerified, sort: s.sort, direction: s.direction, ids, area: null };
}
/** How many filters differ from the page defaults, for the Filters button. Search, county and the two map filters show themselves. */
export function advancedFilterCount(s: ResearchState): number {
  const d = DEFAULT_RESEARCH_STATE;
  return [s.lender !== d.lender, s.ownership !== d.ownership, s.debt !== d.debt, s.match !== d.match, s.oz !== d.oz, s.beforeScenarioDate,
    !!s.maturityAfter, !!s.maturityBefore, s.minAmount !== null, s.maxAmount !== null, s.minUnits !== null, s.maxUnits !== null, s.realBalance, s.specialServicing, s.releasedVerified].filter(Boolean).length;
}
/** A saved analysis's query as page filters; the view, panel and map colouring stay as they are. */
export function filtersOf(q: ResearchQuery): Partial<ResearchState> {
  return { text: q.text, county: q.county, lender: q.lender, ownership: q.ownership, debt: q.debt, match: q.match, oz: q.oz, maturityBefore: q.maturityBefore,
    maturityAfter: q.maturityAfter, beforeScenarioDate: q.beforeScenarioDate, minAmount: q.minAmount, maxAmount: q.maxAmount, minUnits: q.minUnits, maxUnits: q.maxUnits,
    bounds: q.bounds, within24: q.within24 ?? false, balanceSource: q.balanceSource ?? '', realBalance: q.realBalance ?? false, specialServicing: q.specialServicing ?? false, releasedVerified: q.releasedVerified ?? false, sort: q.sort, direction: q.direction };
}
