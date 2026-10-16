// The OZ / EB-5 page keeps everything a reader would want to share in the URL: the mode, filters, the selected tract,
// the view and the map position. Pure functions only, so the round trip is unit-tested.
import { OZ2027_TIERS, type Oz2027Tier } from '../../lib/research/oz2027.ts';
import { OZ_EB5_MAPPED_CLASSES, OZ_EB5_STATE_NAMES, type OzEb5Class } from '../../lib/research/oz-eb5.ts';

export type OzMode = '2018' | '2027';
export type OzView = 'map' | 'split' | 'table';
export const OZ_INCENTIVES = ['', 'any', 'qct', 'dda', 'nmtc', 'oz2027'] as const;
export type OzIncentive = typeof OZ_INCENTIVES[number];
export const OZ_TABS_2018 = ['tracts', 'markets', 'assets', 'site'] as const;
export const OZ_TABS_2027 = ['states', 'tracts'] as const;
export const OZ_SORTS = ['state', 'poverty', 'properties', 'class'] as const;
export type OzSort = typeof OZ_SORTS[number];
export type OzState = {
  mode: OzMode; state: string; q: string; inc: OzIncentive; props: boolean; cls: OzEb5Class[];
  status: Oz2027Tier | ''; ozRural: boolean; both: boolean; compare: boolean;
  tab: string; tract: string; view: OzView; at: [number, number, number] | null; area: boolean; sort: OzSort;
};
export const DEFAULT_OZ_STATE: OzState = {
  mode: '2018', state: '', q: '', inc: '', props: false, cls: [...OZ_EB5_MAPPED_CLASSES], status: '', ozRural: false, both: false, compare: false,
  tab: 'tracts', tract: '', view: 'split', at: null, area: false, sort: 'state',
};
const STATE_SET = new Set(OZ_EB5_STATE_NAMES);

type Params = { get(key: string): string | null };
/** Anything malformed falls back to the default for that key; a URL never throws. */
export function parseOzState(params: Params): OzState {
  const s = { ...DEFAULT_OZ_STATE, cls: [...DEFAULT_OZ_STATE.cls] };
  const mode = params.get('mode');
  if (mode === '2018' || mode === '2027') s.mode = mode;
  const state = params.get('state') ?? '';
  if (STATE_SET.has(state)) s.state = state;
  s.q = (params.get('q') ?? '').slice(0, 80);
  const inc = params.get('inc') ?? '';
  if ((OZ_INCENTIVES as readonly string[]).includes(inc)) s.inc = inc as OzIncentive;
  s.props = params.get('props') === '1';
  const cls = params.get('cls');
  if (cls !== null) s.cls = cls.split(',').filter((c): c is OzEb5Class => (OZ_EB5_MAPPED_CLASSES as string[]).includes(c));
  const status = params.get('status') ?? '';
  if ((OZ2027_TIERS as readonly string[]).includes(status)) s.status = status as Oz2027Tier;
  s.ozRural = params.get('orural') === '1';
  s.both = params.get('both') === '1';
  s.compare = params.get('cmp') === '1';
  const tabs: readonly string[] = s.mode === '2027' ? OZ_TABS_2027 : OZ_TABS_2018;
  const tab = params.get('tab') ?? '';
  s.tab = tabs.includes(tab) ? tab : tabs[0];
  const tract = params.get('tract') ?? '';
  if (/^\d{11}$/.test(tract)) s.tract = tract;
  const view = params.get('view');
  if (view === 'map' || view === 'split' || view === 'table') s.view = view;
  const at = (params.get('at') ?? '').split(',').map(Number);
  if (at.length === 3 && at.every(Number.isFinite) && Math.abs(at[0]) <= 180 && Math.abs(at[1]) <= 90 && at[2] >= 0 && at[2] <= 22) s.at = [at[0], at[1], at[2]];
  s.area = params.get('area') === '1';
  const sort = params.get('sort') ?? '';
  if ((OZ_SORTS as readonly string[]).includes(sort)) s.sort = sort as OzSort;
  return s;
}
/** Only what differs from the default is written, in a fixed key order, so equal states give equal URLs. */
export function serialiseOzState(s: OzState): string {
  const p = new URLSearchParams();
  if (s.mode !== '2018') p.set('mode', s.mode);
  if (s.state) p.set('state', s.state);
  if (s.q) p.set('q', s.q);
  if (s.inc) p.set('inc', s.inc);
  if (s.props) p.set('props', '1');
  if (s.cls.length !== OZ_EB5_MAPPED_CLASSES.length || s.cls.some(c => !OZ_EB5_MAPPED_CLASSES.includes(c))) p.set('cls', OZ_EB5_MAPPED_CLASSES.filter(c => s.cls.includes(c)).join(','));
  if (s.status) p.set('status', s.status);
  if (s.ozRural) p.set('orural', '1');
  if (s.both) p.set('both', '1');
  if (s.compare) p.set('cmp', '1');
  const firstTab = s.mode === '2027' ? OZ_TABS_2027[0] : OZ_TABS_2018[0];
  if (s.tab && s.tab !== firstTab) p.set('tab', s.tab);
  if (s.tract) p.set('tract', s.tract);
  if (s.view !== 'split') p.set('view', s.view);
  if (s.at) p.set('at', `${s.at[0].toFixed(4)},${s.at[1].toFixed(4)},${s.at[2].toFixed(2)}`);
  if (s.area) p.set('area', '1');
  if (s.sort !== 'state') p.set('sort', s.sort);
  return p.toString();
}
