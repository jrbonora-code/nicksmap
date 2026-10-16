// The EB-5 rural site rule set and the list route's input validation.
//
// classifySite is the application copy of the reviewed `sites` mode of scripts/oz-eb5-screen.mjs. These tests
// pin the boundaries that copy has to hold: the 20,000 turn, which entity kinds decide versus flag, the paths
// that must stay unknown rather than be read as a population of zero, and the one deliberate difference from
// the script (an undecided point collapses to `unknown`, not to `N`), which docs/OZ-EB5-SCREEN.md records.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { ResearchValidationError } from '../../lib/research/finance.ts';
import {
  OZ_EB5_ASSET_SOURCES, OZ_EB5_CLASSES, OZ_EB5_MAPPED_CLASSES, OZ_EB5_POP_THRESHOLD, cbsaFromGeocoder, classifySite, noCbsa,
  numberOrNull, ombBasis, ozEb5TractByGeoid, parseOzEb5AssetFilters, parseOzEb5AssetSource, parseOzEb5Class, parseOzEb5CountyFips, parseOzEb5Filters,
  parseOzEb5Geoid, parseOzEb5Point, parseOzEb5State, placeFromGeocoder, subdivisionFromGeocoder,
  type OzEb5Cbsa, type SiteGeography, type SitePlace,
} from '../../lib/research/oz-eb5.ts';

const metropolitan: OzEb5Cbsa = { code: '15380', title: 'Testville, ST', type: 'metropolitan' };
const micropolitan: OzEb5Cbsa = { code: '23456', title: 'Smalltown, ST', type: 'micropolitan' };
const place = (pop: number | null, kind: SitePlace['kind'] = 'incorporated'): SitePlace => ({ geoid: '3012345', name: 'Testville', pop, kind });
/** A designated, non-metropolitan Montana point with nothing else returned: the rural_clear baseline. */
const at = (over: Partial<SiteGeography> = {}): SiteGeography => ({
  tract2010: '30003940600', tract2020: '30003940600', countyFips: '30003', countyName: 'Big Horn County',
  ombKey: '30003', cbsa: noCbsa, geocoderCbsa: noCbsa, place: null, countySubdivision: null, designated: true, ...over,
});
// Massachusetts: a state where the town is the governmental unit and the county-subdivision leg applies.
const newEngland = (townPop: number | null) => at({ countyFips: '25011', countyName: 'Franklin County', ombKey: '25011', countySubdivision: { name: 'Greenfield Town', pop: townPop } });

test('the 20,000 city or town test turns at exactly 20,000 and only an incorporated place decides it', () => {
  assert.equal(OZ_EB5_POP_THRESHOLD, 20000);
  assert.equal(classifySite(at({ place: place(19999) })).eb5RuralClass, 'rural_clear');
  assert.equal(classifySite(at({ place: place(20000) })).eb5RuralClass, 'not_rural_place');
  assert.equal(classifySite(at({ place: place(20001) })).eb5RuralClass, 'not_rural_place');

  // A census designated place is not settled as a city or town, so it flags rather than fails.
  assert.equal(classifySite(at({ place: place(19999, 'cdp') })).eb5RuralClass, 'rural_clear');
  assert.equal(classifySite(at({ place: place(20000, 'cdp') })).eb5RuralClass, 'rural_interpretation_dependent');
  assert.equal(classifySite(at({ place: place(44186, 'cdp') })).verdict, 'CHECK');

  // The New England town leg is the same threshold on the county subdivision.
  assert.equal(classifySite(newEngland(19999)).eb5RuralClass, 'rural_clear');
  assert.equal(classifySite(newEngland(20000)).eb5RuralClass, 'rural_interpretation_dependent');
  assert.equal(classifySite(newEngland(20001)).verdict, 'CHECK');
  // Outside the six New England states a county subdivision is not a city or town and never moves the class.
  assert.equal(classifySite(at({ countySubdivision: { name: 'Hardin Township', pop: 91000 } })).eb5RuralClass, 'rural_clear');
  // Connecticut is carried on the same leg because OMB 2023 keys it on planning regions.
  assert.equal(classifySite(at({ countyFips: '09110', ombKey: '09110', countySubdivision: { name: 'Salisbury', pop: 20000 } })).eb5RuralClass, 'rural_interpretation_dependent');
});

test('an incorporated place of 20,000 outranks the New England town leg and both report their basis', () => {
  const failed = classifySite(newEngland(500));
  assert.equal(failed.eb5RuralClass, 'rural_clear');
  assert.match(failed.classReason, /not inside any incorporated place or CDP/);
  const town = classifySite(newEngland(20500));
  assert.match(town.classReason, /Greenfield Town \(20,500\)/);
  const city = classifySite({ ...newEngland(20500), place: place(31000) });
  assert.equal(city.eb5RuralClass, 'not_rural_place');
  assert.match(city.classReason, /inside Testville, 2020 population 31,000/);
  assert.match(classifySite(at({ place: place(1567) })).classReason, /inside Testville, 2020 population 1,567, below 20,000/);
});

test('a metropolitan county fails on the MSA leg regardless of place, and a micropolitan county does not exclude', () => {
  for (const over of [{}, { place: place(12) }, { place: place(90000) }, { place: place(null) }, { countyFips: '25011', countySubdivision: { name: 'Greenfield Town', pop: null } }]) {
    const result = classifySite(at({ cbsa: metropolitan, geocoderCbsa: metropolitan, ...over }));
    assert.equal(result.eb5RuralClass, 'not_rural_msa', `metropolitan should win for ${JSON.stringify(over)}`);
    assert.equal(result.verdict, 'N');
    assert.match(result.classReason, /Big Horn County|Franklin County/);
    assert.match(result.classReason, /OMB 2023 metropolitan statistical area/);
  }
  const micro = classifySite(at({ cbsa: micropolitan, geocoderCbsa: micropolitan }));
  assert.equal(micro.eb5RuralClass, 'rural_clear');
  assert.equal(micro.verdict, 'Y');
  assert.match(micro.classReason, /Smalltown, ST micropolitan area does not exclude/);
});

test('the four unknown paths never resolve a leg the sources did not answer', () => {
  // 1. Nothing was fetched at all.
  const nothing = classifySite(null);
  assert.equal(nothing.eb5RuralClass, 'unknown');
  assert.equal(nothing.verdict, 'unknown');
  assert.equal(nothing.ozDesignated, 'unknown');
  assert.match(nothing.classReason, /no 2010 census tract/);

  // 2. The geocoder returned no 2010 tract, so designated-OZ membership was never established.
  const noTract = classifySite(at({ tract2010: null, designated: null }));
  assert.equal(noTract.eb5RuralClass, 'unknown');
  assert.equal(noTract.verdict, 'unknown');
  assert.match(noTract.classReason, /designated-OZ membership was not established/);

  // 3. A place came back with no POP100. Number('') is 0, which would read as a hamlet and pass the 20,000 test.
  for (const kind of ['incorporated', 'cdp'] as const) {
    const missing = classifySite(at({ place: place(null, kind) }));
    assert.equal(missing.eb5RuralClass, 'unknown');
    assert.equal(missing.verdict, 'unknown');
    assert.match(missing.classReason, /place population not returned by the geocoder for Testville/);
    assert.match(missing.classReason, /the 20,000 city-or-town test was not performed/);
  }

  // 4. The same rule on the New England county subdivision.
  const town = classifySite(newEngland(null));
  assert.equal(town.eb5RuralClass, 'unknown');
  assert.equal(town.verdict, 'unknown');
  assert.match(town.classReason, /town population not returned by the geocoder for New England town Greenfield Town/);

  // A population of zero is a returned answer and is tested, not treated as missing.
  assert.equal(classifySite(at({ place: place(0) })).eb5RuralClass, 'rural_clear');
  assert.equal(numberOrNull(0), 0);
  assert.equal(numberOrNull(''), null);
  assert.equal(numberOrNull(null), null);
  assert.equal(numberOrNull(undefined), null);
  assert.equal(numberOrNull('not a number'), null);
  assert.equal(numberOrNull('20000'), 20000);
});

test('"N (not a designated OZ)" is written only for a tract that came back and is absent from the run', () => {
  assert.equal(classifySite(at({ designated: true })).verdict, 'Y');
  assert.equal(classifySite(at({ designated: true })).ozDesignated, 'Y');

  const absent = classifySite(at({ designated: false }));
  assert.equal(absent.ozDesignated, 'N');
  assert.equal(absent.verdict, 'N (not a designated OZ)');
  // The rural legs are still reported; only the designation finding is negative.
  assert.equal(absent.eb5RuralClass, 'rural_clear');

  // Membership that was never established is unknown, not a negative finding about the designated list.
  const unestablished = classifySite(at({ designated: null }));
  assert.equal(unestablished.ozDesignated, 'unknown');
  assert.equal(unestablished.verdict, 'unknown');
  assert.equal(unestablished.eb5RuralClass, 'rural_clear', 'the rural legs are still decided');

  // A designated tract whose class is unknown collapses to unknown rather than to a "not rural" finding.
  assert.equal(classifySite(at({ designated: true, place: place(null) })).verdict, 'unknown');
});

test('every classification carries the point-test note and flags a CBSA disagreement', () => {
  const agreed = classifySite(at({ cbsa: micropolitan, geocoderCbsa: micropolitan }));
  assert.deepEqual(agreed.notes, ['Point test only: a parcel may straddle a tract, place or county boundary.']);
  const disagreed = classifySite(at({ cbsa: noCbsa, geocoderCbsa: metropolitan }));
  assert.equal(disagreed.notes.length, 2);
  assert.match(disagreed.notes[0], /Geocoder current-vintage CBSA \(Testville, ST \(metropolitan\)\) differs from OMB 2023 by county/);
  assert.match(classifySite(at({ cbsa: micropolitan, geocoderCbsa: noCbsa })).notes[0], /CBSA \(none\) differs/);
});

test('the OMB leg names a Connecticut planning region and an ordinary county differently', () => {
  assert.equal(ombBasis('09110'), 'OMB 2023 List 1 by planning region 09110');
  assert.equal(ombBasis('09190'), 'OMB 2023 List 1 by planning region 09190');
  assert.equal(ombBasis('30003'), 'OMB 2023 List 1 by county 30003');
  assert.match(ombBasis(''), /No county was returned at this point/);

  // A Connecticut point resolves on the planning region the geocoder returned at the current vintage.
  const northwest = classifySite(at({ countyFips: '09005', countyName: 'Litchfield County', ombKey: '09160', cbsa: micropolitan, geocoderCbsa: micropolitan }));
  assert.equal(northwest.msaBasis, 'OMB 2023 List 1 by planning region 09160');
  assert.equal(northwest.eb5RuralClass, 'rural_clear');
  const capitol = classifySite(at({ countyFips: '09003', countyName: 'Hartford County', ombKey: '09110', cbsa: metropolitan, geocoderCbsa: metropolitan }));
  assert.equal(capitol.msaBasis, 'OMB 2023 List 1 by planning region 09110');
  assert.equal(capitol.eb5RuralClass, 'not_rural_msa');
  assert.equal(classifySite(at({ ombKey: '', countyName: '' })).msaBasis, ombBasis(''));
});

test('the Bedford alias finds one tract under either 2010-vintage identifier', async () => {
  // CDFI lists Bedford County 51019050100; 2010-vintage geometry and the geocoder carry the retired Bedford
  // city code 51515050100. Either identifier must reach the same row through the stored alias column.
  const row = {
    geoid_2010: '51019050100', state: 'Virginia', county_name: 'Bedford', county_fips: '51019', tract_type: 'Low-Income Community',
    oz_status: 'designated_2018', oz_authority: 'CDFI Fund', geoid_2010_geometry_alias: '51515050100',
    cbsa_code: '31340', cbsa_title: 'Lynchburg, VA', cbsa_type: 'metropolitan', msa_basis: 'OMB 2023 List 1 by county 51019', town_basis: '',
    bridge_type: 'renumbered', tracts_2020: '51019050100', dropped_successors: '', iiusa_rows: 1, iiusa_coverage_pct: 100,
    iiusa_rural_tea: 'FALSE', iiusa_msa: 'Lynchburg, VA', place_20k_names: '', place_20k_kind: 'none', place_20k_successor_land_pct: 0,
    eb5_rural_class: 'not_rural_msa', class_reason: 'County is in a 2023 metropolitan statistical area.', notes: '',
    // A run imported by the earlier parser carries NULL in every migration-008 column; pg hands numerics back as strings.
    oz2027_eligible_land_pct: null, oz2027_status: null, oz2027_rural_land_pct: null, oz2027_rural_flag: null, oz2027_basis: null,
    lihtc_qct_2026_land_pct: '0.0', lihtc_qct_2026: 'no', lihtc_qct_2026_basis: 'HUD QCT 2026', lihtc_dda_2026: 'metro_zcta_not_evaluated', lihtc_dda_2026_basis: 'HUD DDA 2026',
    nmtc_lic_land_pct: '100.0', nmtc_lic_eligible: 'yes', nmtc_poverty_rate: '25.5', nmtc_mfi_ratio_pct: null, nmtc_basis: 'CDFI NMTC',
    acs2015_poverty_rate: '14.5', acs2015_mfi_ratio_pct: '80.0', acs2015_poverty_universe_pop: 4895, acs2015_lic_eligible: 'no', acs2015_basis: 'CDFI 2011-2015',
    acs2024_coverage: 'partial', acs2024_population: null, acs2024_poverty_universe_pop: null, acs2024_poverty_rate: null, acs2024_median_family_income_usd: null, acs2024_basis: 'ACS 2020-2024',
    asset_count: 2, asset_units: '48',
  };
  const asked: Array<{ sql: string; params: unknown[] }> = [];
  const client = { query: async (sql: string, params: unknown[]) => { asked.push({ sql, params }); return { rows: [row] }; } } as unknown as PoolClient;
  for (const identifier of ['51019050100', '51515050100']) {
    const found = await ozEb5TractByGeoid(client, 'run', identifier);
    assert.equal(found?.geoid2010, '51019050100');
    assert.equal(found?.geometryAlias, '51515050100');
    assert.equal(found?.eb5RuralClass, 'not_rural_msa');
    assert.equal(found?.iiusaRows, 1, 'numeric columns are returned as numbers');
    assert.equal(found?.place20kSuccessorLandPct, 0);
    // Migration-008 columns: a NULL stays null (the run does not carry the value), a numeric string becomes a number.
    assert.equal(found?.oz2027Status, null);
    assert.equal(found?.oz2027EligibleLandPct, null);
    assert.equal(found?.lihtcQct2026, 'no');
    assert.equal(found?.lihtcQct2026LandPct, 0);
    assert.equal(found?.lihtcDda2026, 'metro_zcta_not_evaluated');
    assert.equal(found?.nmtcPovertyRate, 25.5);
    assert.equal(found?.nmtcMfiRatioPct, null);
    assert.equal(found?.acs2015PovertyUniversePop, 4895);
    assert.equal(found?.acs2015LicEligible, 'no');
    assert.equal(found?.acs2024Coverage, 'partial');
    assert.equal(found?.acs2024Population, null);
    assert.equal(found?.assetCount, 2);
    assert.equal(found?.assetUnits, 48);
  }
  for (const call of asked) {
    assert.match(call.sql, /t\.geoid_2010=\$2 OR \(t\.geoid_2010_geometry_alias <> '' AND t\.geoid_2010_geometry_alias=\$2\)/);
    assert.match(call.sql, /research_oz_eb5_assets WHERE run_id=\$1 GROUP BY run_id, geoid_2010/, 'the asset roll-up is bound to the same run');
    assert.equal(call.params[0], 'run');
  }
  // A row without the roll-up columns (an older caller shape) reads zero assets rather than NaN.
  const bare = { query: async () => ({ rows: [{ ...row, asset_count: undefined, asset_units: undefined }] }) } as unknown as PoolClient;
  assert.equal((await ozEb5TractByGeoid(bare, 'run', '51019050100'))?.assetCount, 0);
  assert.deepEqual(asked.map(call => call.params[1]), ['51019050100', '51515050100']);
  const empty = { query: async () => ({ rows: [] }) } as unknown as PoolClient;
  assert.equal(await ozEb5TractByGeoid(empty, 'run', '00000000000'), null);
});

test('list filters accept only a known state, a known class and a five-digit county code', () => {
  const filters = (query: string) => parseOzEb5Filters(new URLSearchParams(query));
  assert.deepEqual(filters(''), { state: null, className: null, county: null, countyFips: null, includeMetro: false, boost: false, withAssets: false });
  // The two migration-008 filters are opt-in switches and accept only the literal 1.
  assert.equal(filters('boost=1').boost, true);
  assert.equal(filters('boost=true').boost, false);
  assert.equal(filters('assets=1').withAssets, true);
  assert.equal(filters('assets=yes').withAssets, false);

  assert.equal(filters('state=Montana').state, 'Montana');
  assert.equal(filters('state=MT').state, 'Montana');
  assert.equal(filters('state=mt').state, 'Montana');
  assert.equal(filters('state=  MT  ').state, 'Montana');
  assert.equal(filters('state=Puerto Rico').state, 'Puerto Rico');
  assert.equal(parseOzEb5State(null), null);
  assert.equal(parseOzEb5State(''), null);
  for (const value of ['Montanna', 'XX', "Montana'; DROP TABLE research_oz_eb5_tracts; --", '%']) {
    assert.throws(() => parseOzEb5State(value), ResearchValidationError, `state ${value} must be refused`);
  }

  for (const name of OZ_EB5_CLASSES) assert.equal(filters(`class=${name}`).className, name);
  assert.equal(parseOzEb5Class(null), null);
  for (const value of ['rural', 'not_rural', 'RURAL_CLEAR']) assert.throws(() => parseOzEb5Class(value), ResearchValidationError);

  assert.equal(filters('countyFips=30003').countyFips, '30003');
  assert.equal(parseOzEb5CountyFips(''), null);
  for (const value of ['3003', '300031', '3000a', '30 003', "30003' OR '1'='1"]) {
    assert.throws(() => parseOzEb5CountyFips(value), ResearchValidationError, `county code ${value} must be refused`);
  }

  // A county search is free text, so it is length-bounded here and escaped for ILIKE in the query.
  assert.equal(filters('county=Big Horn').county, 'Big Horn');
  assert.equal(filters('county=').county, null);
  assert.equal(filters(`county=${'x'.repeat(80)}`).county?.length, 80);
  assert.throws(() => filters(`county=${'x'.repeat(81)}`), ResearchValidationError);

  // Metropolitan tracts are 6,796 of the 8,764 rows and fail outright, so they are excluded unless asked for.
  assert.equal(filters('state=Montana').includeMetro, false);
  assert.equal(filters('all=1').includeMetro, true);
  assert.equal(filters('all=0').includeMetro, false);
  assert.equal(filters('all=true').includeMetro, false);
  assert.equal(filters('class=not_rural_msa').includeMetro, true, 'asking for the metro class is asking for metro rows');
  assert.equal(filters('class=rural_clear').includeMetro, false);
});

test('asset filters accept only an eleven-digit tract, a known state, a five-digit county, a known source and literal switches', () => {
  const filters = (query: string) => parseOzEb5AssetFilters(new URLSearchParams(query));
  assert.deepEqual(filters(''), { geoid: null, state: null, countyFips: null, source: null, expiring: false, includeMetro: false });
  assert.equal(filters('geoid=30003940600').geoid, '30003940600');
  assert.equal(filters('geoid= 30003940600 ').geoid, '30003940600');
  for (const value of ['3000394060', '300039406001', '3000394060a', "30003940600' OR 1=1"]) {
    assert.throws(() => filters(`geoid=${value}`), ResearchValidationError, `tract ${value} must be refused`);
  }
  assert.equal(filters('state=MT').state, 'Montana');
  assert.throws(() => filters('state=Nowhere'), ResearchValidationError);
  assert.equal(filters('countyFips=30003').countyFips, '30003');
  assert.throws(() => filters('countyFips=3003'), ResearchValidationError);
  for (const source of OZ_EB5_ASSET_SOURCES) assert.equal(filters(`source=${source}`).source, source);
  assert.equal(parseOzEb5AssetSource(null), null);
  for (const value of ['hud', 'HUD_ASSISTED', 'usda', 'lihtc']) assert.throws(() => filters(`source=${value}`), ResearchValidationError, `source ${value} must be refused`);
  assert.equal(filters('expiring=1').expiring, true);
  assert.equal(filters('expiring=true').expiring, false);
  // Assets in metropolitan tracts are outside the rural screen and are excluded unless asked for, as tracts are.
  assert.equal(filters('all=1').includeMetro, true);
  assert.equal(filters('all=0').includeMetro, false);
  assert.equal(parseOzEb5Geoid(''), null);
});

test('a site point needs both halves, finite and in range', () => {
  assert.deepEqual(parseOzEb5Point('45.71792', '-107.57763'), { lat: 45.71792, lon: -107.57763 });
  assert.deepEqual(parseOzEb5Point(' 26.5629 ', ' -81.9495 '), { lat: 26.5629, lon: -81.9495 });
  assert.deepEqual(parseOzEb5Point('0', '0'), { lat: 0, lon: 0 });
  assert.deepEqual(parseOzEb5Point('-90', '180'), { lat: -90, lon: 180 });
  // Number('') is 0: a row carrying only a latitude would otherwise be tested in the Gulf of Guinea.
  for (const [lat, lon] of [['45.7', ''], ['', '-107.5'], ['', ''], [null, null], ['45.7', null]] as Array<[string | null, string | null]>) {
    assert.throws(() => parseOzEb5Point(lat, lon), ResearchValidationError, `${lat}/${lon} must be refused`);
  }
  for (const [lat, lon] of [['90.1', '0'], ['-90.1', '0'], ['0', '180.1'], ['0', '-180.1'], ['abc', '0'], ['0', 'abc'], ['NaN', '0'], ['Infinity', '0']]) {
    assert.throws(() => parseOzEb5Point(lat, lon), ResearchValidationError, `${lat}/${lon} must be refused`);
  }
});

test('the geocoder readers prefer an incorporated place and never invent a population', () => {
  const geographies = {
    'Incorporated Places': [{ GEOID: '3012345', NAME: 'Testville', POP100: 1567 }],
    'Census Designated Places': [{ GEOID: '3099999', NAME: 'Hilo CDP', POP100: 44186 }],
    'County Subdivisions': [{ NAME: 'Greenfield Town', POP100: 17768 }],
    'Metropolitan Statistical Areas': [{ GEOID: '15380', NAME: 'Testville, ST' }],
    'Micropolitan Statistical Areas': [{ GEOID: '23456', NAME: 'Smalltown, ST' }],
  };
  assert.deepEqual(placeFromGeocoder(geographies), { geoid: '3012345', name: 'Testville', pop: 1567, kind: 'incorporated' });
  assert.deepEqual(placeFromGeocoder({ ...geographies, 'Incorporated Places': [] }), { geoid: '3099999', name: 'Hilo CDP', pop: 44186, kind: 'cdp' });
  assert.equal(placeFromGeocoder({}), null);
  assert.deepEqual(subdivisionFromGeocoder(geographies), { name: 'Greenfield Town', pop: 17768 });
  assert.equal(subdivisionFromGeocoder({}), null);
  // A place returned with no POP100 keeps a null population so classifySite can refuse the test.
  assert.equal(placeFromGeocoder({ 'Incorporated Places': [{ GEOID: '1', NAME: 'Unreported', POP100: '' }] })?.pop, null);
  assert.equal(subdivisionFromGeocoder({ 'County Subdivisions': [{ NAME: 'Unreported town' }] })?.pop, null);
  // Metropolitan membership outranks micropolitan on the cross-check, and neither present means no CBSA.
  assert.deepEqual(cbsaFromGeocoder(geographies), { code: '15380', title: 'Testville, ST', type: 'metropolitan' });
  assert.deepEqual(cbsaFromGeocoder({ ...geographies, 'Metropolitan Statistical Areas': [] }), { code: '23456', title: 'Smalltown, ST', type: 'micropolitan' });
  assert.deepEqual(cbsaFromGeocoder({}), noCbsa);
});

test('every non-metropolitan class is drawn on the map, the unknown island tracts included', () => {
  assert.deepEqual(OZ_EB5_MAPPED_CLASSES, ['rural_clear', 'rural_interpretation_dependent', 'not_rural_place_per_iiusa', 'unknown']);
  assert.equal(OZ_EB5_MAPPED_CLASSES.includes('not_rural_msa' as never), false);
  assert.equal(OZ_EB5_CLASSES.length, 5);
});

test('the page URL round-trips every piece of state and refuses malformed values without throwing', async () => {
  const { DEFAULT_OZ_STATE, parseOzState, serialiseOzState } = await import('../../components/research/oz-eb5-url.ts');
  assert.equal(serialiseOzState(DEFAULT_OZ_STATE), '', 'the default state is the bare page');
  const state = { ...DEFAULT_OZ_STATE, mode: '2027' as const, state: 'Alabama', q: 'choctaw', status: 'nominated' as const, ozRural: true, both: true, compare: true,
    tab: 'tracts', tract: '01023956900', view: 'table' as const, at: [-88.1234, 32.0123, 8.5] as [number, number, number], area: true };
  const query = serialiseOzState(state);
  assert.deepEqual(parseOzState(new URLSearchParams(query)), state);
  const classes = { ...DEFAULT_OZ_STATE, cls: ['rural_clear' as const, 'unknown' as const], inc: 'qct' as const, props: true, sort: 'poverty' as const, tab: 'assets' };
  assert.deepEqual(parseOzState(new URLSearchParams(serialiseOzState(classes))), classes);
  const junk = parseOzState(new URLSearchParams('mode=2030&state=Atlantis&inc=gold&cls=metro,rural_clear&status=designated&tab=secret&tract=123&view=globe&at=999,1,2&sort=price'));
  assert.deepEqual({ ...junk, cls: junk.cls }, { ...DEFAULT_OZ_STATE, cls: ['rural_clear'] });
});
