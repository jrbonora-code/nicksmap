// The national 2027 OZ round (migration 009): the tier ranking, the 1% land-share rule that keeps a sliver from being
// badged, the combined OZ-rural and EB-5-rural flag, the IRS Notice 2026-40 label, the input validators, the bundle
// validator's refusals (D06 and privacy), and the 2018-screen fixes that ride with this release (the sliver badge rule,
// distinct property counts, the unknown class on the map, and label points that sit inside their tract).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ResearchValidationError } from '../../lib/research/finance.ts';
import {
  NOTICE_2026_40_URL, OZ2027_CONFIDENCE, OZ2027_LAND_SHARE_THRESHOLD_PCT, OZ2027_SIGNAL_TIERS, OZ2027_TIERS, notice202640Label, oz2027Picture, ozRuralAndEb5Rural,
  parseOz2027Bbox, parseOz2027Filters, parseOz2027Geoid, parseOz2027RunId, parseOz2027Tier, tierRank, type Oz2027Successor,
} from '../../lib/research/oz2027.ts';
import { OZ_EB5_CLASSES, OZ_EB5_MAPPED_CLASSES, OZ_EB5_SLIVER_BADGE_PCT, incentiveBadges, propertyKey, type OzEb5TractRow } from '../../lib/research/oz-eb5.ts';
import { statesInView } from '../../lib/research/oz-eb5-states.ts';
import * as lib from '../../scripts/oz2027-lib.mjs';
import { validateOz2027Bundle } from '../../scripts/oz2027-import-core.mjs';
import { oz2027Fixture } from './oz2027-fixture.ts';

const hex = (value: string) => createHash('sha256').update(value).digest('hex');

test('the tier list is the same in the application and in the pipeline, best first', () => {
  assert.deepEqual([...OZ2027_TIERS], lib.OZ2027_TIERS);
  assert.deepEqual([...OZ2027_SIGNAL_TIERS], lib.OZ2027_SIGNAL_TIERS);
  assert.deepEqual([...OZ2027_CONFIDENCE], lib.OZ2027_CONFIDENCE);
  assert.deepEqual([...OZ2027_TIERS], ['certified', 'nominated', 'state_recommended', 'draft_for_comment', 'local_recommended', 'eligible']);
  assert.ok(tierRank('certified') < tierRank('nominated') && tierRank('nominated') < tierRank('state_recommended') && tierRank('state_recommended') < tierRank('draft_for_comment')
    && tierRank('draft_for_comment') < tierRank('local_recommended') && tierRank('local_recommended') < tierRank('eligible'));
});

test('a headline is the best shipped tier, then the higher confidence, and off-list or absent signals leave a tract eligible', () => {
  const s = (source_id: string, status: string, confidence = 'high', on_eligible_list = true) => ({ source_id, status, confidence, on_eligible_list });
  assert.deepEqual(lib.headlineOf([]), { status: 'eligible', confidence: null, sourceId: null });
  assert.deepEqual(lib.headlineOf([s('a', 'local_recommended'), s('b', 'nominated', 'medium'), s('c', 'state_recommended')]), { status: 'nominated', confidence: 'medium', sourceId: 'b' });
  assert.deepEqual(lib.headlineOf([s('mi-option-b', 'state_recommended', 'low'), s('mi-option-a', 'state_recommended', 'medium')]), { status: 'state_recommended', confidence: 'medium', sourceId: 'mi-option-a' });
  assert.deepEqual(lib.headlineOf([s('x', 'state_recommended'), s('y', 'state_recommended')]), { status: 'state_recommended', confidence: 'high', sourceId: 'x' }, 'ties resolve by source id, not by input order');
  assert.deepEqual(lib.headlineOf([s('off', 'nominated', 'high', false)]), { status: 'eligible', confidence: null, sourceId: null }, 'a list naming an off-list tract does not lift it');
  assert.throws(() => lib.headlineOf([s('z', 'designated')]), /Unknown tier/);
});

// Choctaw County, Alabama: the 2018-designated 2010 tract 01023956800 maps onto two 2020 tracts. Its own successor
// (99.997% of its land) is not on Treasury's list; the eligible successor 01023956900 is a 0.003% sliver.
const choctaw: Oz2027Successor[] = [
  { geoid2020: '01023956800', shareOf2010Pct: 99.997, shareOf2020Pct: 100, eligible: false, status: null, ruralStatus: null, confidence: null },
  { geoid2020: '01023956900', shareOf2010Pct: 0.003, shareOf2020Pct: 0.001, eligible: true, status: 'eligible', ruralStatus: 1, confidence: null },
];
test('a 2027-eligible sliver under 1% of the land is shown, never badged as partly eligible', () => {
  assert.equal(OZ2027_LAND_SHARE_THRESHOLD_PCT, 1);
  const picture = oz2027Picture(choctaw);
  assert.equal(picture.badge, 'sliver_only');
  assert.equal(picture.eligibleLandPct, 0.003);
  assert.equal(picture.headline, null);
  assert.deepEqual(picture.slivers.map(s => s.geoid2020), ['01023956900'], 'the sliver stays visible for the detail');
  const at = (share: number) => oz2027Picture([{ ...choctaw[1], shareOf2010Pct: share, status: 'nominated' }, { ...choctaw[0], shareOf2010Pct: 100 - share }]);
  assert.equal(at(0.999).badge, 'sliver_only');
  assert.equal(at(1).badge, 'partly_eligible');
  assert.equal(at(1).headline, 'nominated');
  assert.equal(at(98.999).badge, 'partly_eligible');
  assert.equal(at(99).badge, 'fully_eligible');
  assert.equal(oz2027Picture([choctaw[0]]).badge, 'not_eligible');
  // A nominated sliver does not lift the headline; the counted part's tier does.
  const mixed = oz2027Picture([{ ...choctaw[1], shareOf2010Pct: 0.5, status: 'certified' }, { geoid2020: '01023957000', shareOf2010Pct: 99.5, shareOf2020Pct: 90, eligible: true, status: 'local_recommended', ruralStatus: 0, confidence: 'medium' }]);
  assert.equal(mixed.headline, 'local_recommended');
  assert.equal(mixed.badge, 'fully_eligible');
});

test('OZ-rural and EB-5-rural needs Treasury rural_status on at least 1% of the land and the EB-5 rural_clear class', () => {
  const rural = oz2027Picture([{ geoid2020: '30003940600', shareOf2010Pct: 100, shareOf2020Pct: 100, eligible: true, status: 'eligible', ruralStatus: 1, confidence: null }]);
  const urban = oz2027Picture([{ geoid2020: '30003940600', shareOf2010Pct: 100, shareOf2020Pct: 100, eligible: true, status: 'eligible', ruralStatus: 0, confidence: null }]);
  assert.equal(ozRuralAndEb5Rural('rural_clear', rural), true);
  assert.equal(ozRuralAndEb5Rural('rural_interpretation_dependent', rural), false, 'an unresolved EB-5 class never counts');
  assert.equal(ozRuralAndEb5Rural('rural_clear', urban), false, 'the OZ 2.0 rural flag is its own test, never inferred from EB-5');
  assert.equal(ozRuralAndEb5Rural('rural_clear', oz2027Picture(choctaw)), false, 'a rural sliver under 1% does not qualify');
  assert.equal(ozRuralAndEb5Rural('rural_clear', null), false);
});

test('every 2018-designated tract carries the Notice 2026-40 label and link', () => {
  const label = notice202640Label('01');
  assert.equal(label.text, "2018 zone · ends 12/31/2028 · new purchases after 12/31/2026 generally don't qualify (IRS Notice 2026-40)");
  assert.equal(label.url, 'https://www.irs.gov/pub/irs-drop/n-26-40.pdf');
  assert.equal(label.url, NOTICE_2026_40_URL);
  assert.equal(label.endDate, '2028-12-31');
  assert.deepEqual([label.zone, label.ends, label.citation], ['2018 zone', 'Ends 12/31/2028', 'IRS Notice 2026-40']);
  // Puerto Rico's low-income tracts were deemed designated on 2017-12-22, so the tenth calendar year closes a year earlier.
  const pr = notice202640Label('72');
  assert.equal(pr.endDate, '2027-12-31');
  assert.match(pr.text, /ends 12\/31\/2027/);
});

test('2027 list, bbox, tract and run inputs are validated', () => {
  assert.deepEqual(parseOz2027Filters(new URLSearchParams('state=FL&status=local_recommended&rural=1&both=0&overlap2018=1&county=Lee')),
    { state: 'Florida', status: 'local_recommended', county: 'Lee', rural: true, eb5RuralBoth: false, overlap2018: true });
  assert.deepEqual(parseOz2027Filters(new URLSearchParams()), { state: null, status: null, county: null, rural: false, eb5RuralBoth: false, overlap2018: false });
  assert.throws(() => parseOz2027Filters(new URLSearchParams('status=designated')), ResearchValidationError);
  assert.throws(() => parseOz2027Filters(new URLSearchParams('rural=yes')), /must be 1 or 0/);
  assert.throws(() => parseOz2027Filters(new URLSearchParams('state=Atlantis')), /Unknown state/);
  assert.throws(() => parseOz2027Filters(new URLSearchParams(`county=${'x'.repeat(81)}`)), /too long/);
  assert.equal(parseOz2027Tier(''), null);
  assert.deepEqual(parseOz2027Bbox('-82.5,26.3,-81.5,27.1'), [-82.5, 26.3, -81.5, 27.1]);
  assert.equal(parseOz2027Bbox(null), null);
  for (const bad of ['1,2,3', '-81,26,-82,27', '-82,27,-81,26', 'a,b,c,d', '-181,0,-170,10', '-120,20,-80,30', '-82,,-81,27']) assert.throws(() => parseOz2027Bbox(bad), ResearchValidationError, bad);
  assert.equal(parseOz2027Geoid('12071040305'), '12071040305');
  for (const bad of ['1207104030', '120710403050', '12071O40305', '']) assert.throws(() => parseOz2027Geoid(bad), ResearchValidationError, bad);
  assert.equal(parseOz2027RunId(''), null);
  assert.equal(parseOz2027RunId('a'.repeat(64)), 'a'.repeat(64));
  assert.throws(() => parseOz2027RunId('A'.repeat(64)), ResearchValidationError);
});

// ---------- the 2018 screen ----------
const row = (over: Partial<OzEb5TractRow>): OzEb5TractRow => ({
  geoid2010: '01023956800', state: 'Alabama', countyName: 'Choctaw County', countyFips: '01023', tractType: '', ozStatus: '', ozAuthority: '', geometryAlias: '',
  cbsaCode: '', cbsaTitle: '', cbsaType: 'none', msaBasis: '', townBasis: '', bridgeType: 'split', tracts2020: '', droppedSuccessors: '', iiusaRows: 1, iiusaCoveragePct: 100,
  iiusaRuralTea: 'TRUE', iiusaMsa: '', place20kNames: '', place20kKind: 'none', place20kSuccessorLandPct: 0, eb5RuralClass: 'rural_clear', classReason: '', notes: '',
  oz2027EligibleLandPct: 0, oz2027Status: 'partially_eligible', oz2027RuralLandPct: 0, oz2027RuralFlag: 'rural', oz2027Basis: '',
  lihtcQct2026LandPct: 0, lihtcQct2026: 'no', lihtcQct2026Basis: '', lihtcDda2026: 'no', lihtcDda2026Basis: '',
  nmtcLicLandPct: 0, nmtcLicEligible: 'partial', nmtcPovertyRate: null, nmtcMfiRatioPct: null, nmtcBasis: '',
  acs2015PovertyRate: null, acs2015MfiRatioPct: null, acs2015PovertyUniversePop: null, acs2015LicEligible: null, acs2015Basis: '',
  acs2024Coverage: null, acs2024Population: null, acs2024PovertyUniversePop: null, acs2024PovertyRate: null, acs2024MedianFamilyIncomeUsd: null, acs2024Basis: '',
  assetCount: 10, assetUnits: 365, propertyCount: 5, labelLon: null, labelLat: null, oz2027: null, ...over,
});
test('a partial incentive flag under 1% of the land gets no badge and is marked a sliver (Choctaw 01023956800)', () => {
  assert.equal(OZ_EB5_SLIVER_BADGE_PCT, 1);
  const badges = incentiveBadges(row({}));
  assert.deepEqual(badges.filter(b => b.text !== null), [], 'no 2027 or NMTC badge on a 0% land share');
  assert.deepEqual(badges.filter(b => b.sliver).map(b => b.flag).sort(), ['nmtc', 'oz2027']);
  // The run's Treasury picture replaces the April appendix columns and applies the same rule.
  const withPicture = incentiveBadges(row({ oz2027: { ...oz2027Picture(choctaw), ozRuralAndEb5Rural: false, notice: notice202640Label('01') } }));
  assert.deepEqual(withPicture.find(b => b.flag === 'oz2027'), { flag: 'oz2027', text: null, landPct: 0.003, sliver: true });
  assert.deepEqual(incentiveBadges(row({ lihtcQct2026: 'partial', lihtcQct2026LandPct: 52.6 })).find(b => b.flag === 'qct'), { flag: 'qct', text: 'QCT 53%', landPct: 52.6, sliver: false });
  assert.equal(incentiveBadges(row({ lihtcQct2026: 'partial', lihtcQct2026LandPct: 0.99 })).find(b => b.flag === 'qct')?.text, null);
  assert.equal(incentiveBadges(row({ lihtcQct2026: 'partial', lihtcQct2026LandPct: 1 })).find(b => b.flag === 'qct')?.text, 'QCT 1%');
  assert.deepEqual(incentiveBadges(row({ lihtcQct2026: 'yes', lihtcDda2026: 'yes', nmtcLicEligible: 'yes', oz2027Status: 'fully_eligible', oz2027EligibleLandPct: 100 })).map(b => b.text), ['QCT', 'DDA', 'NMTC', '2027']);
});

test('records of one building across HUD, USDA and LIHTC count as one property (Choctaw: 10 records, 5 buildings)', () => {
  const records = [['611 Vanity Fair Ave', 'Butler'], ['511 Vanity Fair Ave', 'Butler'], ['203 Minor Rd', 'Butler'], ['820 Vanity Fair Ave', 'Butler'], ['820 Vanity Fair Ave', 'Butler'],
    ['803 Vanity Fair Ave', 'Butler'], ['511 Vanity Fair Ave', 'Butler'], ['611 Vanity Fair Ave', 'Butler'], ['203 Minor Rd Apt 1', 'Butler'], ['820 Vanity Fair Ave', 'Butler']];
  assert.equal(new Set(records.map(([a, c]) => propertyKey(a, c))).size, 5);
  assert.equal(propertyKey('203 Minor Rd., Unit 4B', 'BUTLER'), propertyKey('203 Minor Rd', 'Butler'));
  assert.equal(propertyKey('', 'Butler', 'usda_rural:7'), 'usda_rural:7', 'a record with no address is its own property');
  assert.notEqual(propertyKey('1 Main St', 'Hardin'), propertyKey('1 Main St', 'Lodge Grass'));
});

test('every non-metropolitan class is drawn, including the unknown island tracts', () => {
  assert.deepEqual(OZ_EB5_MAPPED_CLASSES, ['rural_clear', 'rural_interpretation_dependent', 'not_rural_place_per_iiusa', 'unknown']);
  assert.equal(OZ_EB5_MAPPED_CLASSES.includes('not_rural_msa' as never), false);
  assert.equal(OZ_EB5_CLASSES.length, 5);
});

test('a label point lies inside its polygon, including C-shaped and holed tracts', () => {
  const square = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] };
  const cShape = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [4, 3], [4, 4], [0, 4], [0, 0]]] };
  const holed = { type: 'Polygon', coordinates: [[[0, 0], [6, 0], [6, 6], [0, 6], [0, 0]], [[1, 1], [5, 1], [5, 5], [1, 5], [1, 1]]] };
  const multi = { type: 'MultiPolygon', coordinates: [[[[10, 10], [10.1, 10], [10.1, 10.1], [10, 10.1], [10, 10]]], [[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]]] };
  for (const g of [square, cShape, holed, multi]) assert.ok(lib.pointInGeometry(lib.labelPoint(g), g), JSON.stringify(g).slice(0, 40));
  assert.ok(lib.labelPoint(multi)[0] < 3, 'the largest polygon is labelled');
});

test('viewport-to-state lookup uses the state boxes, Alaska on both sides of the antimeridian', () => {
  assert.ok(statesInView([-82.5, 26.3, -81.5, 27.1]).includes('Florida'));
  assert.ok(!statesInView([-82.5, 26.3, -81.5, 27.1]).includes('Texas'));
  assert.ok(statesInView([173, 51.5, 175, 52.5]).includes('Alaska'));
});

test('the pipeline never requests a personal or contact field', () => {
  assert.doesNotThrow(() => lib.assertNoPersonalFields(['GEOID', 'Muni', 'Applicant_government_entity']));
  for (const field of ['CONTACT', 'Email', 'phone_number', 'MGMT_AGENT_PH_NBR', 'Organization_Name__c', 'first_name', 'Address']) assert.throws(() => lib.assertNoPersonalFields([field]), /personal or contact/, field);
  assert.doesNotThrow(() => lib.assertNoPersonalFields(['Organization_Name__c'], ['Organization_Name__c']), 'an aggregate-only field is allowed only by name');
});

// ---------- the bundle validator ----------
type Bundle = ReturnType<typeof oz2027Fixture>;
const rehash = (b: Bundle) => { b.manifest.transformedHash = hex(JSON.stringify({ tracts: b.tracts, signals: b.signals, states: b.states, links: b.links })); b.id = hex(JSON.stringify(b.manifest)); return b; };
test('the bundle validator accepts a coherent bundle and refuses every inconsistency before writing', () => {
  validateOz2027Bundle(oz2027Fixture());
  const mutate = (change: (b: Bundle) => void) => { const b = structuredClone(oz2027Fixture()); change(b); return rehash(b); };
  assert.throws(() => validateOz2027Bundle({ ...oz2027Fixture(), id: 'x' }), /Invalid OZ 2027 import manifest/);
  const tampered = structuredClone(oz2027Fixture()); tampered.tracts[0].county = 'edited';
  assert.throws(() => validateOz2027Bundle(tampered), /Transformed rows do not match/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.tracts[1].headline_status = 'nominated'; })), /does not follow from its signals/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.signals[0].source_id = 'id-certified-tracker'; b.signals[0].status = 'certified'; b.signals[0].confidence = 'unverified'; })), /may not be shipped \(D06\)/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.signals[0].status = 'certified'; })), /tier its source does not/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.signals[1].jurisdiction = 'call 555-123-4567'; })), /contact data/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.signals[1].jurisdiction = 'someone@example.com'; })), /contact data/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { (b.signals[0] as Record<string, unknown>).submitter_name = 'x'; })), /undocumented field submitter_name/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.signals.find(s => !s.on_eligible_list)!.on_eligible_list = true; })), /misstates whether the tract is on Treasury/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.states[1].eligible_count = 3; })), /state counts do not agree/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.tracts[0].label_lon = 10; })), /bounding box out of range/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.links[0].share_of_2010_pct = 101; })), /out-of-range share/);
  assert.throws(() => validateOz2027Bundle(mutate(b => { b.tracts[0].eligibility_route = 'vibes'; })), /eligibility field is malformed/);
  const miscounted = structuredClone(oz2027Fixture()); miscounted.manifest.counts.tracts = 9; miscounted.id = hex(JSON.stringify(miscounted.manifest));
  assert.throws(() => validateOz2027Bundle(miscounted), /count mismatch/);
});
