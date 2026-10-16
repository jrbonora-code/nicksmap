// Synthetic national 2027 bundle shaped exactly like scripts/oz2027-refresh.mjs output, shared by the unit and the
// database tests. Choctaw 01023956800 (a 0.003% eligible sliver), a Lee County tract with a county resolution and an
// off-list neighbour, a Montana tract that is OZ-rural and EB-5 rural_clear, and an Idaho state row whose tracker list
// is withheld under D06.
import { createHash } from 'node:crypto';
import { OZ2027_PARSER_VERSION } from '../../scripts/oz2027-import-core.mjs';
const hex = (value: string) => createHash('sha256').update(value).digest('hex');
const square = (w: number, s: number) => ({ type: 'Polygon', coordinates: [[[w, s], [w + 0.1, s], [w + 0.1, s + 0.1], [w, s + 0.1], [w, s]]] });
export function oz2027Fixture(note = 'baseline') {
  const tract = (geoid: string, state: string, over: Record<string, unknown> = {}) => ({
    geoid_2020: geoid, state, state_fips: geoid.slice(0, 2), county: 'Synthetic County', county_fips: geoid.slice(0, 5), cbsa: '', poverty_rate: 31.2, mfi_ratio: 55.1, mfi_ub_ratio: null,
    temp_displacement: false, eligibility_route: 'poverty_and_median_income', rural_status: 1, in_april_appendix: true, headline_status: 'eligible', headline_confidence: null,
    headline_source_id: null, signal_count: 0, overlap_2018_land_pct: 0, min_lon: -82.5, min_lat: 26.5, max_lon: -82.4, max_lat: 26.6, label_lon: -82.45, label_lat: 26.55,
    display_geometry: square(-82.5, 26.5), ...over,
  });
  const signal = (geoid: string, source: { id: string; state: string; tier: string; confidence: string }, on = true, jurisdiction = '') => ({
    geoid_2020: geoid, source_id: source.id, state: source.state, status: source.tier, jurisdiction, source_url: 'https://example.gov/list.pdf', source_date: '2026-09-28',
    confidence: source.confidence, receipt_sha256: hex(source.id), on_eligible_list: on, notes: on ? '' : "Not on Treasury's eligible list of 2026-09-23.",
  });
  const sources = [
    { id: 'fl-lee-bocc-20260317', state: 'Florida', tier: 'local_recommended', confidence: 'high', publisher: 'Lee County BoCC (synthetic)', publisherClass: 'government', shipped: true, url: null, documentUrl: 'https://example.gov/lee.pdf', date: '2026-03-17', fetch: 'snapshot', notes: '' },
    { id: 'mt-governor-selected', state: 'Montana', tier: 'state_recommended', confidence: 'low', publisher: 'Montana Commerce (synthetic)', publisherClass: 'government', shipped: true, url: 'https://example.gov/arcgis', documentUrl: null, date: '2026-09-22', fetch: 'arcgis', notes: '' },
    { id: 'al-nominated', state: 'Alabama', tier: 'nominated', confidence: 'medium', publisher: 'Alabama (synthetic)', publisherClass: 'government', shipped: true, url: 'https://example.gov/al', documentUrl: null, date: '2026-10-01', fetch: 'arcgis', notes: '' },
    { id: 'id-certified-tracker', state: 'Idaho', tier: 'certified', confidence: 'unverified', publisher: 'Tracker (synthetic)', publisherClass: 'tracker', shipped: false, reason: 'D06: tracker only.', url: 'https://example.com/idaho', documentUrl: null, date: '2026-10-01', fetch: 'none', notes: '' },
  ];
  const [lee, montana, alabama] = sources;
  const signals = [
    signal('12071040305', lee, true, 'Lee County Board of County Commissioners'),
    signal('12071040306', lee, false),
    signal('30003940600', montana),
    signal('01023956900', alabama),
  ].sort((a, b) => a.geoid_2020.localeCompare(b.geoid_2020) || a.source_id.localeCompare(b.source_id));
  const tracts = [
    tract('01023956900', 'Alabama', { headline_status: 'nominated', headline_confidence: 'medium', headline_source_id: 'al-nominated', signal_count: 1, overlap_2018_land_pct: 0.001, county: 'Choctaw County',
      min_lon: -88.2, min_lat: 31.9, max_lon: -88.1, max_lat: 32, label_lon: -88.15, label_lat: 31.95, display_geometry: square(-88.2, 31.9) }),
    tract('12071040305', 'Florida', { headline_status: 'local_recommended', headline_confidence: 'high', headline_source_id: 'fl-lee-bocc-20260317', signal_count: 1, rural_status: 0, overlap_2018_land_pct: 62.5, county: 'Lee County' }),
    tract('12071050100', 'Florida', { rural_status: 0, in_april_appendix: false, county: 'Lee County', min_lon: -81.9, max_lon: -81.8, label_lon: -81.85, display_geometry: square(-81.9, 26.5) }),
    tract('30003940600', 'Montana', { headline_status: 'state_recommended', headline_confidence: 'low', headline_source_id: 'mt-governor-selected', signal_count: 1, overlap_2018_land_pct: 100, county: 'Big Horn County',
      min_lon: -107.6, min_lat: 45.7, max_lon: -107.5, max_lat: 45.8, label_lon: -107.55, label_lat: 45.75, display_geometry: square(-107.6, 45.7) }),
  ];
  const stateRow = (state: string, eligible: number, rural: number, signalled: number, over: Record<string, unknown> = {}) => ({
    state, status: 'extension', nominated_date: null, certified_date: null, cap: 25, eligible_count: eligible, eligible_rural_count: rural, nominated_count: null,
    tract_signal_count: signalled, list_url: '', source_url: 'https://example.gov/state', confidence: 'medium', deadline_track: 'extension_automatic_unverified', notes: `Synthetic ${note}.`, ...over,
  });
  const states = [
    stateRow('Alabama', 1, 1, 1, { status: 'nominated', nominated_date: '2026-10-01' }),
    stateRow('Florida', 2, 0, 1),
    stateRow('Idaho', 0, 0, 0, { status: 'certified', certified_date: '2026-10-01', confidence: 'medium', notes: 'Tract list withheld: D06: tracker only.' }),
    stateRow('Montana', 1, 1, 1, { status: 'state_recommended' }),
  ];
  const links = [
    { geoid_2010: '01023956800', geoid_2020: '01023956800', land_part_sqm: 2999910000, share_of_2010_pct: 99.997, share_of_2020_pct: 100 },
    { geoid_2010: '01023956800', geoid_2020: '01023956900', land_part_sqm: 90000, share_of_2010_pct: 0.003, share_of_2020_pct: 0.001 },
    { geoid_2010: '12071040300', geoid_2020: '12071040305', land_part_sqm: 1000000, share_of_2010_pct: 40, share_of_2020_pct: 62.5 },
    { geoid_2010: '30003940600', geoid_2020: '30003940600', land_part_sqm: 5000000000, share_of_2010_pct: 100, share_of_2020_pct: 100 },
  ];
  const manifest = {
    parserVersion: OZ2027_PARSER_VERSION, preparedUtc: '2026-10-15T20:00:00.000Z', refreshScriptSha256: hex('synthetic refresh'), federal: { treasury: { url: 'https://example.gov/treasury.xlsx', sha256: hex(`treasury ${note}`) } },
    sources, counts: { tracts: tracts.length, signals: signals.length, states: states.length, links: links.length }, rule: 'Synthetic 2027 rule.',
    transformedHash: hex(JSON.stringify({ tracts, signals, states, links })),
  };
  return { id: hex(JSON.stringify(manifest)), parserVersion: OZ2027_PARSER_VERSION, manifest, tracts, signals, states, links };
}

/**
 * A small 2018-screen run (migrations 007 and 008) holding the three 2010 tracts the 2027 fixture links to, with Choctaw's
 * ten real asset records (five buildings described by USDA and LIHTC records) so the distinct-property count is tested
 * in SQL against the same addresses the unit test uses.
 */
export function eb5FixtureFor2027() {
  const blank = {
    tract_type: 'Low-Income Community', oz_status: 'designated_2018', oz_authority: 'CDFI Fund designated QOZ list, December 14, 2018', geoid_2010_geometry_alias: '',
    cbsa_code: '', cbsa_title: '', cbsa_type: 'none', msa_basis: 'OMB 2023 List 1 by county', town_basis: '', bridge_type: 'same_id', tracts_2020: '', dropped_successors: '',
    iiusa_rows: 1, iiusa_coverage_pct: 100, iiusa_rural_tea: 'TRUE', iiusa_msa: '', place_20k_names: '', place_20k_kind: 'none', place_20k_successor_land_pct: 0,
    class_reason: 'Synthetic fixture row.', notes: '',
    oz2027_eligible_land_pct: null, oz2027_status: null, oz2027_rural_land_pct: null, oz2027_rural_flag: null, oz2027_basis: '',
    lihtc_qct_2026_land_pct: null, lihtc_qct_2026: null, lihtc_qct_2026_basis: '', lihtc_dda_2026: null, lihtc_dda_2026_basis: '',
    nmtc_lic_land_pct: null, nmtc_lic_eligible: null, nmtc_poverty_rate: null, nmtc_mfi_ratio_pct: null, nmtc_basis: '',
    acs2015_poverty_rate: null, acs2015_mfi_ratio_pct: null, acs2015_poverty_universe_pop: null, acs2015_lic_eligible: null, acs2015_basis: '',
    acs2024_coverage: null, acs2024_population: null, acs2024_poverty_universe_pop: null, acs2024_poverty_rate: null, acs2024_median_family_income_usd: null, acs2024_basis: '',
  };
  const tracts = [
    { ...blank, geoid_2010: '01023956800', state: 'Alabama', county_name: 'Choctaw County', county_fips: '01023', eb5_rural_class: 'rural_clear', bridge_type: 'split',
      tracts_2020: '01023956800', dropped_successors: '01023956900 (0.003%; no 20k place; no MSA)', oz2027_eligible_land_pct: 0, oz2027_status: 'partially_eligible', oz2027_basis: 'IRS appendix (synthetic)' },
    { ...blank, geoid_2010: '12071040300', state: 'Florida', county_name: 'Lee County', county_fips: '12071', cbsa_code: '15980', cbsa_title: 'Cape Coral-Fort Myers, FL', cbsa_type: 'metropolitan', eb5_rural_class: 'not_rural_msa' },
    { ...blank, geoid_2010: '30003940600', state: 'Montana', county_name: 'Big Horn County', county_fips: '30003', cbsa_code: '20500', cbsa_title: 'Hardin, MT', cbsa_type: 'micropolitan', eb5_rural_class: 'rural_clear' },
  ];
  const geometry = { '01023956800': square(-88.2, 31.9), '30003940600': square(-107.6, 45.7) };
  const omb = [{ countyFips: '12071', countyName: 'Lee County, FL', cbsaCode: '15980', cbsaTitle: 'Cape Coral-Fort Myers, FL', cbsaType: 'metropolitan' }];
  const asset = (source: string, id: string, name: string, address: string, units: number) => ({
    source, source_object_id: id, source_property_id: `P${id}`, property_name: name, address, city: 'Butler', state_abbr: 'AL', zip: '36904', latitude: 32.09, longitude: -88.22,
    geoid_2010: '01023956800', tract_state: 'Alabama', tract_county_name: 'Choctaw County', eb5_rural_class: 'rural_clear', cbsa_type: 'none', cbsa_title: '',
    total_units: units, assisted_units: null, assisted_units_basis: 'synthetic', program_or_designation: '', program_2: '', contract_or_restriction_expiration_raw: '',
    contract_or_restriction_expiration_year: null, expiration_status: 'none', second_expiration_raw: '', loan_maturity_year: null, effective_year: null,
    source_layer: 'https://example.invalid/FeatureServer/0', retrieved_utc: '2026-09-17T18:17:10.587Z',
  });
  const assets = [
    asset('usda_rural', '1', 'PINEBROOK APTS', '611 Vanity Fair Ave', 56), asset('usda_rural', '2', 'FOREST MANOR APTS', '511 Vanity Fair Ave', 47),
    asset('usda_rural', '3', 'MINOR ROAD APTS', '203 Minor Rd', 24), asset('usda_rural', '4', 'BEDFORD PINES APTS', '820 Vanity Fair Ave', 44),
    asset('hud_lihtc', '5', 'BEDFORD PINES APTS', '820 Vanity Fair Ave', 44), asset('hud_lihtc', '6', 'PEBBLE CREEK APTS', '803 Vanity Fair Ave', 24),
    asset('hud_lihtc', '7', 'FOREST MANOR APTS', '511 Vanity Fair Ave', 47), asset('hud_lihtc', '8', 'PINEBROOK APTS', '611 Vanity Fair Ave', 55),
    asset('hud_lihtc', '9', 'MINOR ROAD APTS', '203 Minor Rd Apt 1', 24), asset('hud_lihtc', '10', 'BEDFORD PINES', '820 Vanity Fair Ave', 0),
  ];
  const manifest = {
    parserVersion: 'oz-eb5-import-2', preparedUtc: '2026-10-15T20:00:00.000Z', screenScriptSha256: hex('synthetic screen for 2027'),
    counts: { tracts: tracts.length, withGeometry: Object.keys(geometry).length, ombCounties: omb.length, assets: assets.length },
    transformedHash: hex(JSON.stringify({ tracts, geometry, omb, assets })), rule: 'EB-5 rural area (synthetic).', sources: {},
  };
  return { id: hex(JSON.stringify(manifest)), parserVersion: 'oz-eb5-import-2', manifest, tracts, geometry, omb, assets };
}
