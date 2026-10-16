// Designated Opportunity Zone x EB-5 rural screen inside the workspace.
//
// EB-5 rural area, INA 203(b)(5)(D)(ii) as amended by the EB-5 Reform and Integrity Act of 2022: any area
// other than an area within a metropolitan statistical area designated by OMB, or within the outer boundary
// of any city or town having a population of 20,000 or more at the most recent decennial census. Micropolitan
// areas do not exclude. The test is geographic and applies to the project site: a tract class is a screen and
// the statute tests the site.
//
// classifySite is the reviewed site rule set of scripts/oz-eb5-screen.mjs (`sites` mode), ported verbatim as a
// pure function over already-fetched geocoder layers and an already-resolved OMB row so it is unit-testable.
// The two copies are deliberate and are recorded in docs/OZ-EB5-SCREEN.md; the script stays the offline
// authority and nothing in the application writes to it.
import type { PoolClient } from 'pg';
import { ResearchValidationError } from './finance.ts';
import type { Notice202640Label, Oz2027Picture } from './oz2027.ts';

export const OZ_EB5_POP_THRESHOLD = 20000;
export const OZ_EB5_BENCHMARK = 'Public_AR_Current';
export const OZ_EB5_VINTAGES = { tract2010: 'Census2010_Current', places: 'Census2020_Current', cbsa: 'Current_Current' } as const;
const GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const HUD_OZ = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Opportunity_Zones/FeatureServer/13/query';
const SITE_TIMEOUT_MS = 15000;
const ROW_LIMIT = 2000;
// New England states where the town is the governmental unit; Connecticut (09) is included because OMB 2023
// keys it on planning regions and the county-subdivision question applies there as well.
const NEW_ENGLAND = new Set(['09', '23', '25', '33', '44', '50']);

export const OZ_EB5_CLASSES = ['rural_clear', 'rural_interpretation_dependent', 'not_rural_place_per_iiusa', 'not_rural_msa', 'unknown'] as const;
export type OzEb5Class = typeof OZ_EB5_CLASSES[number];
// The site classes are a different set from the tract classes: a site either is or is not inside a 20,000+
// incorporated place, so `not_rural_place` carries no "per IIUSA" qualifier.
export const OZ_EB5_SITE_CLASSES = ['rural_clear', 'rural_interpretation_dependent', 'not_rural_place', 'not_rural_msa', 'unknown'] as const;
export type OzEb5SiteClass = typeof OZ_EB5_SITE_CLASSES[number];
export const OZ_EB5_CLASS_LABELS: Record<OzEb5Class, string> = {
  rural_clear: 'Rural clear',
  rural_interpretation_dependent: 'Interpretation dependent',
  not_rural_place_per_iiusa: 'Not rural · place',
  not_rural_msa: 'Not rural · metro',
  unknown: 'Unknown',
};
// Every non-metropolitan class carries geometry and is drawn, including the 136 `unknown` Puerto Rico and island tracts.
export const OZ_EB5_MAPPED_CLASSES: OzEb5Class[] = ['rural_clear', 'rural_interpretation_dependent', 'not_rural_place_per_iiusa', 'unknown'];
/**
 * A `partial` incentive flag (or a partly 2027-eligible tract) whose share of the tract's land is under this percent is a
 * sliver: it gets no badge, and the detail says "Sliver only" with the share. Choctaw 01023956800 is the case in point:
 * its only 2027-eligible part is 0.003% of its land.
 */
export const OZ_EB5_SLIVER_BADGE_PCT = 1;

export const OZ_EB5_STATE_CODES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AS: 'American Samoa', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', GU: 'Guam', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', MP: 'Northern Mariana Islands', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VI: 'Virgin Islands', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming',
};
export const OZ_EB5_STATE_NAMES: string[] = [...new Set(Object.values(OZ_EB5_STATE_CODES))].sort();
const STATE_NAME_SET = new Set(OZ_EB5_STATE_NAMES);

/**
 * The twenty-six columns the offline screen appended after `notes` (migration 008). Each is null on a run
 * imported by the earlier parser; the page then says "not carried by this run" rather than showing a value.
 * None of them is an EB-5 input: `eb5RuralClass` is never derived from them and they are never derived from it.
 */
export type OzEb5TractExtensions = {
  oz2027EligibleLandPct: number | null; oz2027Status: string | null; oz2027RuralLandPct: number | null; oz2027RuralFlag: string | null; oz2027Basis: string | null;
  lihtcQct2026LandPct: number | null; lihtcQct2026: string | null; lihtcQct2026Basis: string | null; lihtcDda2026: string | null; lihtcDda2026Basis: string | null;
  nmtcLicLandPct: number | null; nmtcLicEligible: string | null; nmtcPovertyRate: number | null; nmtcMfiRatioPct: number | null; nmtcBasis: string | null;
  acs2015PovertyRate: number | null; acs2015MfiRatioPct: number | null; acs2015PovertyUniversePop: number | null; acs2015LicEligible: string | null; acs2015Basis: string | null;
  acs2024Coverage: string | null; acs2024Population: number | null; acs2024PovertyUniversePop: number | null; acs2024PovertyRate: number | null; acs2024MedianFamilyIncomeUsd: number | null; acs2024Basis: string | null;
};
export type OzEb5TractRow = OzEb5TractExtensions & {
  geoid2010: string; state: string; countyName: string; countyFips: string; tractType: string;
  ozStatus: string; ozAuthority: string; geometryAlias: string;
  cbsaCode: string; cbsaTitle: string; cbsaType: string; msaBasis: string; townBasis: string;
  bridgeType: string; tracts2020: string; droppedSuccessors: string;
  iiusaRows: number; iiusaCoveragePct: number; iiusaRuralTea: string; iiusaMsa: string;
  place20kNames: string; place20kKind: string; place20kSuccessorLandPct: number;
  eb5RuralClass: OzEb5Class; classReason: string; notes: string;
  /** Layer-4 rows in this tract on the same run: source records, the sum of their total units, and distinct properties. */
  assetCount: number; assetUnits: number;
  /**
   * Distinct properties: records sharing a normalised address and city are one building, because the HUD, USDA and LIHTC
   * layers each describe the same property (Choctaw 01023956800: 10 records, 5 buildings). Units are never summed across them.
   */
  propertyCount: number;
  /** A point inside the tract's display polygon, from the current run's geometry; null where the tract has no polygon. */
  labelLon: number | null; labelLat: number | null;
  /** The tract's 2027 picture from Treasury's revised list and the 2010-to-2020 links (migration 009); null with no 2027 run. */
  oz2027: (Oz2027Picture & { ozRuralAndEb5Rural: boolean; notice: Notice202640Label }) | null;
};
export const OZ_EB5_ASSET_SOURCES = ['hud_assisted', 'usda_rural', 'hud_lihtc'] as const;
export type OzEb5AssetSource = typeof OZ_EB5_ASSET_SOURCES[number];
export const OZ_EB5_ASSET_SOURCE_LABELS: Record<OzEb5AssetSource, string> = { hud_assisted: 'HUD-assisted', usda_rural: 'USDA rural housing', hud_lihtc: 'LIHTC allocation' };
export const OZ_EB5_EXPIRATION_STATUSES = ['none', 'later', 'expires_by_2030', 'expired'] as const;
/** One source property in a designated tract: a geographic and administrative observation, never an available transaction. */
export type OzEb5Asset = {
  source: OzEb5AssetSource; sourceObjectId: string; sourcePropertyId: string; propertyName: string;
  address: string; city: string; stateAbbr: string; zip: string; latitude: number; longitude: number;
  geoid2010: string; tractState: string; tractCountyName: string; eb5RuralClass: OzEb5Class; cbsaType: string; cbsaTitle: string;
  totalUnits: number | null; assistedUnits: number | null; assistedUnitsBasis: string;
  programOrDesignation: string; program2: string;
  expirationRaw: string; expirationYear: number | null; expirationStatus: string; secondExpirationRaw: string;
  loanMaturityYear: number | null; effectiveYear: number | null; sourceLayer: string; retrievedUtc: string;
  /** Normalised address and city: records with the same key are one property described by several sources. */
  propertyKey: string;
};
export type OzEb5Market = {
  state: string; countyName: string; countyFips: string; cbsaType: string; cbsaTitle: string;
  designated: number; ruralClear: number; ruralInterpretationDependent: number;
  notRuralPlacePerIiusa: number; notRuralMsa: number; unknown: number;
};
export type OzEb5Run = { id: string; importedAt: string; importedBy: string; scriptSha256: string; sources: Record<string, unknown>; counts: Record<string, number>; rule: string };
export type OzEb5Cbsa = { code: string; title: string; type: 'metropolitan' | 'micropolitan' | 'none' };
export type SitePlace = { geoid: string; name: string; pop: number | null; kind: 'incorporated' | 'cdp' };
export type SiteSubdivision = { name: string; pop: number | null };
/** Everything classifySite is allowed to look at. Every field is already fetched and already resolved. */
export type SiteGeography = {
  tract2010: string | null;
  tract2020: string | null;
  countyFips: string;
  countyName: string;
  /** Current-vintage county, or the Connecticut planning region, used for the OMB 2023 List 1 join. */
  ombKey: string;
  cbsa: OzEb5Cbsa;
  geocoderCbsa: OzEb5Cbsa;
  place: SitePlace | null;
  countySubdivision: SiteSubdivision | null;
  /** null when no 2010 tract was returned, so designated-OZ membership was never established. */
  designated: boolean | null;
};
export type SiteClassification = {
  eb5RuralClass: OzEb5SiteClass;
  classReason: string;
  ozDesignated: 'Y' | 'N' | 'unknown';
  verdict: 'Y' | 'CHECK' | 'N' | 'N (not a designated OZ)' | 'unknown';
  msaBasis: string;
  notes: string[];
};

const count = (value: number) => value.toLocaleString('en-US');
export const noCbsa: OzEb5Cbsa = { code: '', title: '', type: 'none' };

/**
 * The reviewed EB-5 rural site rule set. Order matters: the MSA leg decides first, then an unreported place
 * population stops the test rather than being read as a population of zero, then the 20,000 place test, then
 * the New England town question. Nothing here guesses.
 */
export function classifySite(geography: SiteGeography | null): SiteClassification {
  const notes: string[] = [];
  if (!geography || !geography.tract2010) {
    return {
      eb5RuralClass: 'unknown', ozDesignated: 'unknown', verdict: 'unknown', msaBasis: geography ? ombBasis(geography.ombKey) : '',
      classReason: 'The Census Geocoder returned no 2010 census tract at this point, so designated-OZ membership was not established and the EB-5 rural legs were not decided.',
      notes,
    };
  }
  const msaBasis = ombBasis(geography.ombKey);
  if (geography.geocoderCbsa.type !== geography.cbsa.type) {
    notes.push(`Geocoder current-vintage CBSA (${geography.geocoderCbsa.type === 'none' ? 'none' : `${geography.geocoderCbsa.title} (${geography.geocoderCbsa.type})`}) differs from OMB 2023 by county.`);
  }
  notes.push('Point test only: a parcel may straddle a tract, place or county boundary.');
  // designated === null means membership was never established (no imported run to test against). That is not
  // the same finding as "absent from the run", so it stays unknown rather than becoming "not a designated OZ".
  const ozDesignated: 'Y' | 'N' | 'unknown' = geography.designated === null ? 'unknown' : geography.designated ? 'Y' : 'N';
  const place = geography.place;
  const pop = place ? place.pop : null;
  const townPop = geography.countySubdivision ? geography.countySubdivision.pop : null;
  const inNewEngland = NEW_ENGLAND.has(geography.countyFips.slice(0, 2));
  let eb5RuralClass: OzEb5SiteClass;
  let classReason: string;
  if (geography.cbsa.type === 'metropolitan') {
    eb5RuralClass = 'not_rural_msa';
    classReason = `Point is in ${geography.countyName || geography.ombKey}, part of ${geography.cbsa.title} (OMB 2023 metropolitan statistical area).`;
  } else if (place && pop === null) {
    // POP100 absent is not POP100 zero. Number('') is 0, which would let an unreported place fall through to rural_clear.
    eb5RuralClass = 'unknown';
    classReason = `Outside every MSA, but place population not returned by the geocoder for ${place.name || 'the place at this point'} (${place.kind}), so the 20,000 city-or-town test was not performed.`;
  } else if (place && place.kind === 'incorporated' && pop !== null && pop >= OZ_EB5_POP_THRESHOLD) {
    eb5RuralClass = 'not_rural_place';
    classReason = `Point is inside ${place.name}, 2020 population ${count(pop)}.`;
  } else if (place && place.kind === 'cdp' && pop !== null && pop >= OZ_EB5_POP_THRESHOLD) {
    eb5RuralClass = 'rural_interpretation_dependent';
    classReason = `Outside every MSA; point is inside ${place.name}, a census designated place of ${count(pop)}; USCIS treatment of CDPs as a city or town is not settled.`;
  } else if (inNewEngland && geography.countySubdivision && townPop === null) {
    eb5RuralClass = 'unknown';
    classReason = `Outside every MSA and outside any 20,000+ incorporated place, but town population not returned by the geocoder for New England town ${geography.countySubdivision.name}, so the 20,000 town test was not performed.`;
  } else if (inNewEngland && townPop !== null && townPop >= OZ_EB5_POP_THRESHOLD) {
    eb5RuralClass = 'rural_interpretation_dependent';
    classReason = `Outside every MSA and outside any 20,000+ incorporated place, but inside New England town ${geography.countySubdivision!.name} (${count(townPop)}); town treatment under the 20,000 test is unresolved.`;
  } else {
    eb5RuralClass = 'rural_clear';
    classReason = `Outside every 2023 OMB metropolitan area${geography.cbsa.type === 'micropolitan' ? ` (${geography.cbsa.title} micropolitan area does not exclude)` : ''}; ${!place ? 'not inside any incorporated place or CDP' : `inside ${place.name}, 2020 population ${count(pop as number)}, below 20,000`}.`;
  }
  // "N (not a designated OZ)" is a finding about the designated list. It is only available once a 2010 tract came
  // back and was looked up in the run; an unestablished membership is unknown, never a negative finding.
  //
  // One deliberate difference from the offline script, recorded in docs/OZ-EB5-SCREEN.md: where the class is
  // `unknown` because a population was not returned, the script's collapse falls through to `N`. Reporting an
  // undecided point as "not rural" asserts a finding the sources did not support, so this copy reports `unknown`.
  const verdict: SiteClassification['verdict'] = ozDesignated === 'unknown' ? 'unknown'
    : ozDesignated === 'N' ? 'N (not a designated OZ)'
      : eb5RuralClass === 'rural_clear' ? 'Y'
        : eb5RuralClass === 'rural_interpretation_dependent' ? 'CHECK'
          : eb5RuralClass === 'unknown' ? 'unknown' : 'N';
  return { eb5RuralClass, classReason, ozDesignated, verdict, msaBasis, notes };
}

export function ombBasis(ombKey: string) {
  if (!ombKey) return 'No county was returned at this point, so the OMB 2023 metropolitan leg was not resolved.';
  return `OMB 2023 List 1 by ${ombKey.startsWith('09') ? 'planning region' : 'county'} ${ombKey}`;
}

// ---------- input validation ----------
export type OzEb5Filters = {
  state: string | null; className: OzEb5Class | null; county: string | null; countyFips: string | null; includeMetro: boolean;
  /** Keep only tracts eligible for the 30% LIHTC basis boost on this run's flags: QCT yes or partial, or DDA yes. */
  boost: boolean;
  /** Keep only tracts holding at least one layer-4 asset on this run. */
  withAssets: boolean;
};
export type OzEb5AssetFilters = { geoid: string | null; state: string | null; countyFips: string | null; source: OzEb5AssetSource | null; expiring: boolean; includeMetro: boolean };

/** A full state name from the table, or an explicitly mapped two-letter code. Nothing else is accepted. */
export function parseOzEb5State(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (STATE_NAME_SET.has(text)) return text;
  const mapped = OZ_EB5_STATE_CODES[text.toUpperCase()];
  if (mapped) return mapped;
  throw new ResearchValidationError('Unknown state. Use a state or territory name from the table, or its two-letter code.');
}
export function parseOzEb5Class(value: string | null | undefined): OzEb5Class | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if ((OZ_EB5_CLASSES as readonly string[]).includes(text)) return text as OzEb5Class;
  throw new ResearchValidationError('Unknown EB-5 rural class.');
}
export function parseOzEb5CountyFips(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^[0-9]{5}$/.test(text)) throw new ResearchValidationError('A county FIPS code is exactly five digits.');
  return text;
}
export function parseOzEb5Filters(params: URLSearchParams): OzEb5Filters {
  const county = String(params.get('county') ?? '').trim();
  if (county.length > 80) throw new ResearchValidationError('County search is too long.');
  const className = parseOzEb5Class(params.get('class'));
  return {
    state: parseOzEb5State(params.get('state')),
    className,
    county: county || null,
    countyFips: parseOzEb5CountyFips(params.get('countyFips')),
    // Metropolitan tracts are excluded by default: they fail the rural test outright and are 6,796 of 8,764 rows.
    includeMetro: params.get('all') === '1' || className === 'not_rural_msa',
    boost: params.get('boost') === '1',
    withAssets: params.get('assets') === '1',
  };
}
export function parseOzEb5Geoid(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^[0-9]{11}$/.test(text)) throw new ResearchValidationError('A 2010 census tract identifier is exactly eleven digits.');
  return text;
}
export function parseOzEb5AssetSource(value: string | null | undefined): OzEb5AssetSource | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if ((OZ_EB5_ASSET_SOURCES as readonly string[]).includes(text)) return text as OzEb5AssetSource;
  throw new ResearchValidationError('Unknown asset source.');
}
export function parseOzEb5AssetFilters(params: URLSearchParams): OzEb5AssetFilters {
  return {
    geoid: parseOzEb5Geoid(params.get('geoid')),
    state: parseOzEb5State(params.get('state')),
    countyFips: parseOzEb5CountyFips(params.get('countyFips')),
    source: parseOzEb5AssetSource(params.get('source')),
    // Contracts or restrictions already expired or expiring by the end of 2030, the preservation window.
    expiring: params.get('expiring') === '1',
    // Assets in metropolitan tracts are 14,268 of 19,822 rows and sit outside the EB-5 rural screen; excluded unless asked for.
    includeMetro: params.get('all') === '1',
  };
}
/** Both halves must be present, finite and in range. Number('') is 0, which would test a point in the Gulf of Guinea. */
export function parseOzEb5Point(latitude: string | null | undefined, longitude: string | null | undefined): { lat: number; lon: number } {
  const latText = String(latitude ?? '').trim();
  const lonText = String(longitude ?? '').trim();
  if (!latText || !lonText) throw new ResearchValidationError('Supply both a latitude and a longitude.');
  const lat = Number(latText);
  const lon = Number(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new ResearchValidationError('Latitude must be a number between -90 and 90 and longitude between -180 and 180.');
  }
  return { lat, lon };
}

// ---------- database reads (a caller supplies the client; identity is checked in the service layer) ----------
const TRACT_COLUMN_LIST = ['geoid_2010', 'state', 'county_name', 'county_fips', 'tract_type', 'oz_status', 'oz_authority', 'geoid_2010_geometry_alias',
  'cbsa_code', 'cbsa_title', 'cbsa_type', 'msa_basis', 'town_basis', 'bridge_type', 'tracts_2020', 'dropped_successors', 'iiusa_rows',
  'iiusa_coverage_pct', 'iiusa_rural_tea', 'iiusa_msa', 'place_20k_names', 'place_20k_kind', 'place_20k_successor_land_pct',
  'eb5_rural_class', 'class_reason', 'notes',
  'oz2027_eligible_land_pct', 'oz2027_status', 'oz2027_rural_land_pct', 'oz2027_rural_flag', 'oz2027_basis',
  'lihtc_qct_2026_land_pct', 'lihtc_qct_2026', 'lihtc_qct_2026_basis', 'lihtc_dda_2026', 'lihtc_dda_2026_basis',
  'nmtc_lic_land_pct', 'nmtc_lic_eligible', 'nmtc_poverty_rate', 'nmtc_mfi_ratio_pct', 'nmtc_basis',
  'acs2015_poverty_rate', 'acs2015_mfi_ratio_pct', 'acs2015_poverty_universe_pop', 'acs2015_lic_eligible', 'acs2015_basis',
  'acs2024_coverage', 'acs2024_population', 'acs2024_poverty_universe_pop', 'acs2024_poverty_rate', 'acs2024_median_family_income_usd', 'acs2024_basis'] as const;
const QUALIFIED_TRACT_COLUMNS = TRACT_COLUMN_LIST.map(column => `t.${column}`).join(',');
// The per-tract asset roll-up joined onto tract reads. Total units are summed only where the source reported them.
// propertyKey (below) and PROPERTY_KEY_SQL normalise an address the same way; tests pin that they agree.
export const PROPERTY_KEY_SQL = `CASE WHEN btrim(address)='' THEN source||':'||source_object_id ELSE
  btrim(regexp_replace(regexp_replace(lower(address), '\\s+(apt|apartment|unit|ste|suite|bldg|building|#)\\.?\\s*[a-z0-9-]*$', ''), '[^a-z0-9]+', ' ', 'g'))
  ||'|'||btrim(regexp_replace(lower(city), '[^a-z0-9]+', ' ', 'g')) END`;
const ASSET_ROLLUP = `LEFT JOIN (SELECT run_id, geoid_2010, count(*)::int asset_count, coalesce(sum(total_units),0)::int asset_units, count(DISTINCT ${PROPERTY_KEY_SQL})::int property_count
     FROM research_oz_eb5_assets WHERE run_id=$1 GROUP BY run_id, geoid_2010) a ON a.run_id=t.run_id AND a.geoid_2010=t.geoid_2010`;
/** The TypeScript twin of PROPERTY_KEY_SQL: lower case, a trailing unit designator dropped, punctuation folded to spaces. */
export function propertyKey(address: string, city: string, fallback = ''): string {
  const fold = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!address.trim()) return fallback;
  return `${fold(address.toLowerCase().replace(/\s+(apt|apartment|unit|ste|suite|bldg|building|#)\.?\s*[a-z0-9-]*$/, ''))}|${fold(city)}`;
}
type RawTract = Record<string, string | number | null | undefined>;
// pg returns numeric columns as strings; a NULL stays null so the page can say the run does not carry the value.
const optionalNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const optionalText = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
function toTract(row: RawTract): OzEb5TractRow {
  return {
    geoid2010: String(row.geoid_2010), state: String(row.state), countyName: String(row.county_name), countyFips: String(row.county_fips),
    tractType: String(row.tract_type), ozStatus: String(row.oz_status), ozAuthority: String(row.oz_authority), geometryAlias: String(row.geoid_2010_geometry_alias),
    cbsaCode: String(row.cbsa_code), cbsaTitle: String(row.cbsa_title), cbsaType: String(row.cbsa_type), msaBasis: String(row.msa_basis), townBasis: String(row.town_basis),
    bridgeType: String(row.bridge_type), tracts2020: String(row.tracts_2020), droppedSuccessors: String(row.dropped_successors),
    iiusaRows: Number(row.iiusa_rows), iiusaCoveragePct: Number(row.iiusa_coverage_pct), iiusaRuralTea: String(row.iiusa_rural_tea), iiusaMsa: String(row.iiusa_msa),
    place20kNames: String(row.place_20k_names), place20kKind: String(row.place_20k_kind), place20kSuccessorLandPct: Number(row.place_20k_successor_land_pct),
    eb5RuralClass: String(row.eb5_rural_class) as OzEb5Class, classReason: String(row.class_reason), notes: String(row.notes),
    oz2027EligibleLandPct: optionalNumber(row.oz2027_eligible_land_pct), oz2027Status: optionalText(row.oz2027_status), oz2027RuralLandPct: optionalNumber(row.oz2027_rural_land_pct), oz2027RuralFlag: optionalText(row.oz2027_rural_flag), oz2027Basis: optionalText(row.oz2027_basis),
    lihtcQct2026LandPct: optionalNumber(row.lihtc_qct_2026_land_pct), lihtcQct2026: optionalText(row.lihtc_qct_2026), lihtcQct2026Basis: optionalText(row.lihtc_qct_2026_basis), lihtcDda2026: optionalText(row.lihtc_dda_2026), lihtcDda2026Basis: optionalText(row.lihtc_dda_2026_basis),
    nmtcLicLandPct: optionalNumber(row.nmtc_lic_land_pct), nmtcLicEligible: optionalText(row.nmtc_lic_eligible), nmtcPovertyRate: optionalNumber(row.nmtc_poverty_rate), nmtcMfiRatioPct: optionalNumber(row.nmtc_mfi_ratio_pct), nmtcBasis: optionalText(row.nmtc_basis),
    acs2015PovertyRate: optionalNumber(row.acs2015_poverty_rate), acs2015MfiRatioPct: optionalNumber(row.acs2015_mfi_ratio_pct), acs2015PovertyUniversePop: optionalNumber(row.acs2015_poverty_universe_pop), acs2015LicEligible: optionalText(row.acs2015_lic_eligible), acs2015Basis: optionalText(row.acs2015_basis),
    acs2024Coverage: optionalText(row.acs2024_coverage), acs2024Population: optionalNumber(row.acs2024_population), acs2024PovertyUniversePop: optionalNumber(row.acs2024_poverty_universe_pop), acs2024PovertyRate: optionalNumber(row.acs2024_poverty_rate), acs2024MedianFamilyIncomeUsd: optionalNumber(row.acs2024_median_family_income_usd), acs2024Basis: optionalText(row.acs2024_basis),
    assetCount: Number(row.asset_count ?? 0), assetUnits: Number(row.asset_units ?? 0), propertyCount: Number(row.property_count ?? 0),
    labelLon: null, labelLat: null, oz2027: null,
  };
}
const ASSET_COLUMNS = `source,source_object_id,source_property_id,property_name,address,city,state_abbr,zip,latitude,longitude,geoid_2010,tract_state,tract_county_name,
  eb5_rural_class,cbsa_type,cbsa_title,total_units,assisted_units,assisted_units_basis,program_or_designation,program_2,contract_or_restriction_expiration_raw,
  contract_or_restriction_expiration_year,expiration_status,second_expiration_raw,loan_maturity_year,effective_year,source_layer,retrieved_utc,
  ${PROPERTY_KEY_SQL} property_key`;
function toAsset(row: RawTract): OzEb5Asset {
  return {
    source: String(row.source) as OzEb5AssetSource, sourceObjectId: String(row.source_object_id), sourcePropertyId: String(row.source_property_id), propertyName: String(row.property_name),
    address: String(row.address), city: String(row.city), stateAbbr: String(row.state_abbr), zip: String(row.zip), latitude: Number(row.latitude), longitude: Number(row.longitude),
    geoid2010: String(row.geoid_2010), tractState: String(row.tract_state), tractCountyName: String(row.tract_county_name), eb5RuralClass: String(row.eb5_rural_class) as OzEb5Class,
    cbsaType: String(row.cbsa_type), cbsaTitle: String(row.cbsa_title), totalUnits: optionalNumber(row.total_units), assistedUnits: optionalNumber(row.assisted_units), assistedUnitsBasis: String(row.assisted_units_basis),
    programOrDesignation: String(row.program_or_designation), program2: String(row.program_2), expirationRaw: String(row.contract_or_restriction_expiration_raw),
    expirationYear: optionalNumber(row.contract_or_restriction_expiration_year), expirationStatus: String(row.expiration_status), secondExpirationRaw: String(row.second_expiration_raw),
    loanMaturityYear: optionalNumber(row.loan_maturity_year), effectiveYear: optionalNumber(row.effective_year), sourceLayer: String(row.source_layer), retrievedUtc: String(row.retrieved_utc),
    propertyKey: String(row.property_key),
  };
}
export async function currentOzEb5Run(client: PoolClient): Promise<OzEb5Run | null> {
  const found = await client.query("SELECT r.* FROM research_oz_eb5_current c JOIN research_oz_eb5_runs r ON r.id=c.run_id WHERE c.workspace_id='primary'");
  const row = found.rows[0];
  if (!row) return null;
  const importedAt = row.imported_at instanceof Date ? row.imported_at.toISOString() : String(row.imported_at);
  return { id: row.id, importedAt, importedBy: row.imported_by, scriptSha256: row.script_sha256, sources: row.sources, counts: row.counts, rule: row.rule };
}
export async function ozEb5TractRows(client: PoolClient, runId: string, filters: OzEb5Filters) {
  const like = filters.county === null ? null : filters.county.replace(/[\\%_]/g, '\\$&');
  const result = await client.query(
    `SELECT ${QUALIFIED_TRACT_COLUMNS}, coalesce(a.asset_count,0) asset_count, coalesce(a.asset_units,0) asset_units, coalesce(a.property_count,0) property_count
     FROM research_oz_eb5_tracts t
     ${ASSET_ROLLUP}
     WHERE t.run_id=$1
       AND ($2::text IS NULL OR t.state=$2)
       AND ($3::text IS NULL OR t.eb5_rural_class=$3)
       AND ($4::text IS NULL OR t.county_name ILIKE '%'||$4||'%' ESCAPE '\\')
       AND ($5::text IS NULL OR t.county_fips=$5)
       AND ($6::boolean OR t.eb5_rural_class <> 'not_rural_msa')
       AND (NOT $7::boolean OR t.lihtc_qct_2026 IN ('yes','partial') OR t.lihtc_dda_2026 = 'yes')
       AND (NOT $8::boolean OR coalesce(a.asset_count,0) > 0)
     ORDER BY t.state, t.county_name, t.geoid_2010
     LIMIT ${ROW_LIMIT + 1}`,
    [runId, filters.state, filters.className, like, filters.countyFips, filters.includeMetro, filters.boost, filters.withAssets],
  );
  const truncated = result.rows.length > ROW_LIMIT;
  return { rows: result.rows.slice(0, ROW_LIMIT).map(toTract), truncated, limit: ROW_LIMIT };
}
/** Layer-4 rows of the run, bounded, ordered by tract and then by the property. Metropolitan tracts are excluded unless asked for. */
export async function ozEb5AssetRows(client: PoolClient, runId: string, filters: OzEb5AssetFilters) {
  const result = await client.query(
    `SELECT ${ASSET_COLUMNS} FROM research_oz_eb5_assets
     WHERE run_id=$1
       AND ($2::text IS NULL OR geoid_2010=$2)
       AND ($3::text IS NULL OR tract_state=$3)
       AND ($4::text IS NULL OR substr(geoid_2010,1,5)=$4)
       AND ($5::text IS NULL OR source=$5)
       AND (NOT $6::boolean OR expiration_status IN ('expired','expires_by_2030'))
       AND ($7::boolean OR eb5_rural_class <> 'not_rural_msa')
     ORDER BY tract_state, tract_county_name, geoid_2010, source, property_name, source_object_id
     LIMIT ${ROW_LIMIT + 1}`,
    [runId, filters.geoid, filters.state, filters.countyFips, filters.source, filters.expiring, filters.includeMetro],
  );
  const truncated = result.rows.length > ROW_LIMIT;
  return { rows: result.rows.slice(0, ROW_LIMIT).map(toAsset), truncated, limit: ROW_LIMIT };
}
export async function ozEb5TractByGeoid(client: PoolClient, runId: string, geoid: string) {
  // The Bedford alias is stored on the row: the CDFI list carries 51019050100 and 2010-vintage geometry
  // carries the retired city code 51515050100, so either identifier finds the same tract.
  const result = await client.query(
    `SELECT ${QUALIFIED_TRACT_COLUMNS}, coalesce(a.asset_count,0) asset_count, coalesce(a.asset_units,0) asset_units, coalesce(a.property_count,0) property_count
     FROM research_oz_eb5_tracts t ${ASSET_ROLLUP}
     WHERE t.run_id=$1 AND (t.geoid_2010=$2 OR (t.geoid_2010_geometry_alias <> '' AND t.geoid_2010_geometry_alias=$2)) LIMIT 1`,
    [runId, geoid],
  );
  return result.rows[0] ? toTract(result.rows[0]) : null;
}
export async function ozEb5CbsaForCounty(client: PoolClient, runId: string, countyFips: string): Promise<OzEb5Cbsa> {
  if (!/^[0-9]{5}$/.test(countyFips)) return noCbsa;
  const result = await client.query('SELECT cbsa_code,cbsa_title,cbsa_type FROM research_oz_eb5_cbsa_counties WHERE run_id=$1 AND county_fips=$2', [runId, countyFips]);
  const row = result.rows[0];
  // Absence from List 1 means the county is outside every core based statistical area.
  return row ? { code: row.cbsa_code, title: row.cbsa_title, type: row.cbsa_type } : noCbsa;
}
export async function ozEb5MarketRows(client: PoolClient, runId: string, filters: { state: string | null }): Promise<OzEb5Market[]> {
  const result = await client.query(
    `SELECT state, county_name, county_fips,
       count(*)::int designated,
       count(*) FILTER (WHERE eb5_rural_class='rural_clear')::int rural_clear,
       count(*) FILTER (WHERE eb5_rural_class='rural_interpretation_dependent')::int interpretation_dependent,
       count(*) FILTER (WHERE eb5_rural_class='not_rural_place_per_iiusa')::int not_rural_place,
       count(*) FILTER (WHERE eb5_rural_class='not_rural_msa')::int not_rural_msa,
       count(*) FILTER (WHERE eb5_rural_class='unknown')::int unknown_class,
       array_agg(DISTINCT cbsa_type) FILTER (WHERE eb5_rural_class IN ('rural_clear','rural_interpretation_dependent')) qualifying_types,
       array_agg(DISTINCT cbsa_title) FILTER (WHERE eb5_rural_class IN ('rural_clear','rural_interpretation_dependent')) qualifying_titles
     FROM research_oz_eb5_tracts
     WHERE run_id=$1 AND ($2::text IS NULL OR state=$2)
     GROUP BY state, county_name, county_fips
     HAVING count(*) FILTER (WHERE eb5_rural_class IN ('rural_clear','rural_interpretation_dependent')) > 0
     ORDER BY count(*) FILTER (WHERE eb5_rural_class='rural_clear') DESC, state, county_name
     LIMIT ${ROW_LIMIT}`,
    [runId, filters.state],
  );
  return result.rows.map(row => {
    // The CBSA columns describe the tracts that actually qualify in that county, not whichever designated
    // tract was read first; where the qualifying tracts disagree the type reads mixed and the title lists them.
    const types: string[] = row.qualifying_types ?? [];
    const titles: string[] = row.qualifying_titles ?? [];
    return {
      state: row.state, countyName: row.county_name, countyFips: row.county_fips,
      cbsaType: types.length === 1 ? types[0] : 'mixed',
      cbsaTitle: titles.length <= 1 ? titles[0] ?? '' : `mixed: ${titles.map(t => t || 'no CBSA').join('; ')}`,
      designated: row.designated, ruralClear: row.rural_clear, ruralInterpretationDependent: row.interpretation_dependent,
      notRuralPlacePerIiusa: row.not_rural_place, notRuralMsa: row.not_rural_msa, unknown: row.unknown_class,
    };
  });
}
export async function ozEb5GeometryRows(client: PoolClient, runId: string, state: string) {
  const result = await client.query(
    `SELECT geoid_2010, state, county_name, cbsa_title, eb5_rural_class, display_geometry
     FROM research_oz_eb5_tracts WHERE run_id=$1 AND state=$2 AND display_geometry IS NOT NULL ORDER BY geoid_2010`,
    [runId, state],
  );
  return {
    type: 'FeatureCollection' as const,
    features: result.rows.map(row => ({
      type: 'Feature' as const,
      id: row.geoid_2010,
      geometry: row.display_geometry,
      properties: { geoid: row.geoid_2010, state: row.state, county: row.county_name, cbsaTitle: row.cbsa_title, className: row.eb5_rural_class as OzEb5Class },
    })),
  };
}

// ---------- keyless public lookups used by the site test ----------
async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(SITE_TIMEOUT_MS), cache: 'no-store' });
  if (!response.ok) throw new Error(`Lookup returned HTTP ${response.status}.`);
  return await response.json() as Record<string, unknown>;
}
type Geographies = Record<string, Array<Record<string, string | number>>>;
export function pickLayer(geographies: Geographies, layer: string) {
  const list = geographies?.[layer];
  return Array.isArray(list) && list.length ? list[0] : null;
}
export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export async function geocodeLayers(lon: number, lat: number, vintage: string): Promise<Geographies> {
  const json = await fetchJson(`${GEOCODER}?x=${lon}&y=${lat}&benchmark=${OZ_EB5_BENCHMARK}&vintage=${vintage}&layers=all&format=json`);
  const result = json.result as { geographies?: Geographies } | undefined;
  return result?.geographies ?? {};
}
export async function hudPolygonsAt(lon: number, lat: number): Promise<string[]> {
  // The HUD service needs JSON geometry; the `x,y` shorthand is silently ignored by this layer.
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint',
    inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'GEOID10', returnGeometry: 'false', f: 'json',
  });
  const json = await fetchJson(`${HUD_OZ}?${params}`);
  if (json.error) throw new Error('The HUD Opportunity Zones service returned an error.');
  return ((json.features ?? []) as Array<{ attributes: { GEOID10: string } }>).map(f => f.attributes.GEOID10);
}
export function cbsaFromGeocoder(geographies: Geographies): OzEb5Cbsa {
  const metro = pickLayer(geographies, 'Metropolitan Statistical Areas');
  const micro = pickLayer(geographies, 'Micropolitan Statistical Areas');
  if (metro) return { code: String(metro.GEOID), title: String(metro.NAME), type: 'metropolitan' };
  if (micro) return { code: String(micro.GEOID), title: String(micro.NAME), type: 'micropolitan' };
  return noCbsa;
}
export function placeFromGeocoder(geographies: Geographies): SitePlace | null {
  const place = pickLayer(geographies, 'Incorporated Places');
  if (place) return { geoid: String(place.GEOID), name: String(place.NAME), pop: numberOrNull(place.POP100), kind: 'incorporated' };
  const cdp = pickLayer(geographies, 'Census Designated Places');
  if (cdp) return { geoid: String(cdp.GEOID), name: String(cdp.NAME), pop: numberOrNull(cdp.POP100), kind: 'cdp' };
  return null;
}
export function subdivisionFromGeocoder(geographies: Geographies): SiteSubdivision | null {
  const cousub = pickLayer(geographies, 'County Subdivisions');
  return cousub ? { name: String(cousub.NAME), pop: numberOrNull(cousub.POP100) } : null;
}

// ---------- incentive badges (the 1% sliver rule) ----------
export type OzEb5Badge = { flag: 'qct' | 'dda' | 'nmtc' | 'oz2027'; text: string | null; landPct: number | null; sliver: boolean };
const wholePct = (pct: number) => `${Math.round(pct)}%`;
/**
 * The positive incentive readings of a tract, one entry per flag that applies. A `partial` reading under
 * OZ_EB5_SLIVER_BADGE_PCT of the tract's land has `text: null` and `sliver: true`: no badge, and the detail shows
 * "Sliver only" with the share. The 2027 entry prefers the run's Treasury picture (migration 009) and falls back to the
 * IRS April appendix columns of migration 008 under the same rule.
 */
export function incentiveBadges(row: OzEb5TractRow): OzEb5Badge[] {
  const out: OzEb5Badge[] = [];
  const partial = (flag: OzEb5Badge['flag'], label: string, pct: number | null) => {
    if (pct === null || pct < OZ_EB5_SLIVER_BADGE_PCT) out.push({ flag, text: null, landPct: pct, sliver: true });
    else out.push({ flag, text: `${label} ${wholePct(pct)}`, landPct: pct, sliver: false });
  };
  if (row.lihtcQct2026 === 'yes') out.push({ flag: 'qct', text: 'QCT', landPct: row.lihtcQct2026LandPct, sliver: false });
  else if (row.lihtcQct2026 === 'partial') partial('qct', 'QCT', row.lihtcQct2026LandPct);
  if (row.lihtcDda2026 === 'yes') out.push({ flag: 'dda', text: 'DDA', landPct: null, sliver: false });
  if (row.nmtcLicEligible === 'yes') out.push({ flag: 'nmtc', text: 'NMTC', landPct: row.nmtcLicLandPct, sliver: false });
  else if (row.nmtcLicEligible === 'partial') partial('nmtc', 'NMTC', row.nmtcLicLandPct);
  if (row.oz2027) {
    const { badge, eligibleLandPct } = row.oz2027;
    if (badge === 'fully_eligible') out.push({ flag: 'oz2027', text: '2027', landPct: eligibleLandPct, sliver: false });
    else if (badge === 'partly_eligible') out.push({ flag: 'oz2027', text: `2027 ${wholePct(eligibleLandPct)}`, landPct: eligibleLandPct, sliver: false });
    else if (badge === 'sliver_only') out.push({ flag: 'oz2027', text: null, landPct: eligibleLandPct, sliver: true });
  } else if (row.oz2027Status === 'fully_eligible') out.push({ flag: 'oz2027', text: '2027', landPct: row.oz2027EligibleLandPct, sliver: false });
  else if (row.oz2027Status === 'partially_eligible') partial('oz2027', '2027', row.oz2027EligibleLandPct);
  return out;
}

/** What the list, map and filters need for one tract; the drawer fetches the full row (every basis string) on demand. */
export type OzEb5TractSummary = Pick<OzEb5TractRow,
  'geoid2010' | 'state' | 'countyName' | 'countyFips' | 'cbsaTitle' | 'cbsaType' | 'eb5RuralClass' | 'place20kNames'
  | 'lihtcQct2026' | 'lihtcQct2026LandPct' | 'lihtcDda2026' | 'nmtcLicEligible' | 'nmtcLicLandPct' | 'oz2027Status' | 'oz2027EligibleLandPct'
  | 'acs2015PovertyRate' | 'acs2015MfiRatioPct' | 'acs2024PovertyRate' | 'acs2024Coverage' | 'assetCount' | 'propertyCount' | 'labelLon' | 'labelLat'> & {
  oz2027: { badge: string; eligibleLandPct: number; ruralEligibleLandPct: number; headline: string | null; ozRuralAndEb5Rural: boolean } | null;
  badges: OzEb5Badge[];
};
export function toSummary(row: OzEb5TractRow): OzEb5TractSummary {
  const { geoid2010, state, countyName, countyFips, cbsaTitle, cbsaType, eb5RuralClass, place20kNames, lihtcQct2026, lihtcQct2026LandPct, lihtcDda2026, nmtcLicEligible,
    nmtcLicLandPct, oz2027Status, oz2027EligibleLandPct, acs2015PovertyRate, acs2015MfiRatioPct, acs2024PovertyRate, acs2024Coverage, assetCount, propertyCount, labelLon, labelLat } = row;
  return {
    geoid2010, state, countyName, countyFips, cbsaTitle, cbsaType, eb5RuralClass, place20kNames, lihtcQct2026, lihtcQct2026LandPct, lihtcDda2026, nmtcLicEligible,
    nmtcLicLandPct, oz2027Status, oz2027EligibleLandPct, acs2015PovertyRate, acs2015MfiRatioPct, acs2024PovertyRate, acs2024Coverage, assetCount, propertyCount, labelLon, labelLat,
    oz2027: row.oz2027 && { badge: row.oz2027.badge, eligibleLandPct: row.oz2027.eligibleLandPct, ruralEligibleLandPct: row.oz2027.ruralEligibleLandPct, headline: row.oz2027.headline, ozRuralAndEb5Rural: row.oz2027.ozRuralAndEb5Rural },
    badges: incentiveBadges(row),
  };
}
