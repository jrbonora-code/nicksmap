// Migration 009 against an isolated database (run by scripts/research-db-test.mjs after database.integration.ts):
// the import's replay, rollback and immutability, every bounded read, the 2018-screen joins (the Choctaw sliver, the
// combined rural flag, distinct properties, label points), the Florida research overlay, and identity-first routes.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { importOz2027, validateOz2027Bundle } from '../../scripts/oz2027-import-core.mjs';
import { importOzEb5 } from '../../scripts/oz-eb5-import-core.mjs';
import { currentOz2027Run, oz2027ForTracts, oz2027Geometry, oz2027PicturesFor2010, oz2027StateRows, oz2027TractDetail, oz2027TractRows, type Oz2027Filters } from '../../lib/research/oz2027.ts';
import { currentOzEb5Run, ozEb5TractRows, type OzEb5TractRow } from '../../lib/research/oz-eb5.ts';
import { ozOverlay } from '../../lib/research/oz-overlay.ts';
import type { ResearchProperty } from '../../lib/research/types.ts';
import { eb5FixtureFor2027, oz2027Fixture } from './oz2027-fixture.ts';
import type { WorkspaceUser } from '../../lib/workspace/types.ts';

const url = process.env.RESEARCH_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith('/radar_test_research_')) throw new Error('An isolated research test database is required.');
const hex = (value: string) => createHash('sha256').update(value).digest('hex');
const count = async (pool: pg.Pool, sql: string, params: unknown[] = []) => Number((await pool.query(sql, params)).rows[0].n);

test('OZ 2027 import: one transaction, replay without duplicates, rollback, an atomic pointer and immutable history', async () => {
  const pool = new pg.Pool({ connectionString: url });
  try {
    const first = oz2027Fixture();
    validateOz2027Bundle(first);
    const imported = await importOz2027(pool, first, { importedBy: 'synthetic-operator' });
    assert.equal(imported.status, 'imported');
    for (const [table, n] of [['research_oz2027_tracts', 4], ['research_oz2027_signals', 4], ['research_oz2027_states', 4], ['research_oz2027_links', 4]] as const) {
      assert.equal(await count(pool, `SELECT count(*) n FROM ${table} WHERE run_id=$1`, [first.id]), n, table);
    }
    assert.equal((await pool.query('SELECT run_id FROM research_oz2027_current')).rows[0].run_id, first.id);
    assert.equal((await pool.query('SELECT status FROM research_import_runs WHERE snapshot_id=$1', [first.id])).rows[0].status, 'imported');
    // Typed round trip: a null measure stays null, a numeric stays numeric, an off-list signal is kept and flagged.
    const lee = (await pool.query("SELECT mfi_ub_ratio, rural_status, overlap_2018_land_pct, headline_status, label_lon FROM research_oz2027_tracts WHERE run_id=$1 AND geoid_2020='12071040305'", [first.id])).rows[0];
    assert.deepEqual({ ...lee, overlap_2018_land_pct: Number(lee.overlap_2018_land_pct), label_lon: Number(lee.label_lon) }, { mfi_ub_ratio: null, rural_status: 0, overlap_2018_land_pct: 62.5, headline_status: 'local_recommended', label_lon: -82.45 });
    assert.equal((await pool.query("SELECT on_eligible_list FROM research_oz2027_signals WHERE run_id=$1 AND geoid_2020='12071040306'", [first.id])).rows[0].on_eligible_list, false);

    const replay = await importOz2027(pool, first, { importedBy: 'synthetic-operator' });
    assert.equal(replay.status, 'replayed');
    assert.equal(await count(pool, 'SELECT count(*) n FROM research_oz2027_tracts WHERE run_id=$1', [first.id]), 4, 'a replay writes no second copy');
    assert.equal(await count(pool, 'SELECT count(*) n FROM research_oz2027_runs'), 1);

    const second = oz2027Fixture('second run');
    assert.equal((await importOz2027(pool, second, { importedBy: 'synthetic-operator' })).status, 'imported');
    assert.equal((await pool.query('SELECT run_id FROM research_oz2027_current')).rows[0].run_id, second.id);
    assert.equal(await count(pool, 'SELECT count(*) n FROM research_oz2027_tracts WHERE run_id=$1', [first.id]), 4, 'the superseded run is retained');

    const third = oz2027Fixture('rolled back');
    await assert.rejects(importOz2027(pool, third, { failAfterTracts: true }), /Controlled OZ 2027 import fault/);
    assert.equal(await count(pool, 'SELECT count(*) n FROM research_oz2027_runs WHERE id=$1', [third.id]), 0);
    assert.equal(await count(pool, 'SELECT count(*) n FROM research_oz2027_tracts WHERE run_id=$1', [third.id]), 0);
    assert.equal((await pool.query('SELECT run_id FROM research_oz2027_current')).rows[0].run_id, second.id, 'the previous run stays live');
    assert.equal((await pool.query('SELECT status FROM research_import_runs WHERE snapshot_id=$1', [third.id])).rows[0].status, 'failed');
    const tracker = structuredClone(first);
    tracker.signals[0].source_id = 'id-certified-tracker'; tracker.signals[0].status = 'certified'; tracker.signals[0].confidence = 'unverified';
    tracker.manifest.transformedHash = hex(JSON.stringify({ tracts: tracker.tracts, signals: tracker.signals, states: tracker.states, links: tracker.links })); tracker.id = hex(JSON.stringify(tracker.manifest));
    await assert.rejects(importOz2027(pool, tracker), /may not be shipped \(D06\)/);
    assert.equal(await count(pool, 'SELECT count(*) n FROM research_oz2027_runs'), 2, 'a refused bundle writes nothing');

    for (const statement of [
      "UPDATE research_oz2027_runs SET imported_by='x'", 'DELETE FROM research_oz2027_runs',
      "UPDATE research_oz2027_tracts SET headline_status='certified'", 'DELETE FROM research_oz2027_tracts',
      "UPDATE research_oz2027_signals SET status='certified'", 'DELETE FROM research_oz2027_signals',
      "UPDATE research_oz2027_states SET status='certified'", 'DELETE FROM research_oz2027_states',
      'UPDATE research_oz2027_links SET share_of_2010_pct=50', 'DELETE FROM research_oz2027_links',
    ]) await assert.rejects(pool.query(statement), /append-only/, statement);
    // The schema itself refuses what the validator refuses, should a row ever arrive another way.
    await assert.rejects(pool.query("INSERT INTO research_oz2027_signals(run_id,geoid_2020,source_id,state,status,jurisdiction,source_url,confidence,receipt_sha256,on_eligible_list,notes) VALUES($1,'12071040305','x-y','Florida','designated','','https://x.gov','high',$2,true,'')", [first.id, hex('x')]), /check constraint/);
  } finally { await pool.end(); }
});

test('OZ 2027 reads: bounded filtered list, state progress, geometry by state and box, tract detail and the 2018 joins', async () => {
  const pool = new pg.Pool({ connectionString: url });
  // A 2018-screen run that holds the 2010 tracts the 2027 links name, so the EB-5 joins have something to join.
  assert.equal((await importOzEb5(pool, eb5FixtureFor2027(), { importedBy: 'synthetic-operator' })).status, 'imported');
  const client = await pool.connect();
  try {
    const run = await currentOz2027Run(client);
    const eb5 = await currentOzEb5Run(client);
    assert.ok(run && eb5);
    assert.equal(run.sources.length, 4);
    const list = (over: Partial<Oz2027Filters> = {}) => oz2027TractRows(client, run.id, eb5.id, { state: null, status: null, county: null, rural: false, eb5RuralBoth: false, overlap2018: false, ...over });
    const all = await list();
    assert.equal(all.total, 4); assert.equal(all.limit, 2000); assert.equal(all.truncated, false);
    assert.deepEqual(all.rows.map(r => r.geoid2020), ['01023956900', '30003940600', '12071040305', '12071050100'], 'ordered by tier, then state, county and tract');
    assert.deepEqual((await list({ state: 'Florida' })).rows.map(r => r.geoid2020), ['12071040305', '12071050100']);
    assert.deepEqual((await list({ status: 'local_recommended' })).rows.map(r => r.geoid2020), ['12071040305']);
    assert.deepEqual((await list({ rural: true })).rows.map(r => r.geoid2020), ['01023956900', '30003940600']);
    assert.deepEqual((await list({ overlap2018: true })).rows.map(r => r.geoid2020), ['30003940600', '12071040305'], 'a 0.001% overlap is a sliver, not an overlap');
    // Both rural: Montana is OZ-rural and inside a rural_clear 2010 tract. Choctaw's eligible successor is OZ-rural too, but
    // it is a 0.003% sliver of its 2010 tract, below the screen's 0.05% place-test filter, so EB-5 never tested it.
    assert.deepEqual((await list({ eb5RuralBoth: true })).rows.map(r => r.geoid2020), ['30003940600']);
    assert.deepEqual((await list({ county: 'lee' })).rows.length, 2);
    assert.equal((await list({ county: '%' })).rows.length, 0, 'LIKE wildcards are literal');
    const montana = all.rows.find(r => r.geoid2020 === '30003940600')!;
    assert.deepEqual(montana.eb5Classes, ['rural_clear']); assert.equal(montana.eb5RuralBoth, true);
    assert.equal(all.rows.find(r => r.geoid2020 === '01023956900')!.eb5Classes.length, 0);
    assert.equal(all.rows.find(r => r.geoid2020 === '12071050100')!.inAprilAppendix, false);
    assert.equal((await oz2027TractRows(client, run.id, null, { state: null, status: null, county: null, rural: false, eb5RuralBoth: true, overlap2018: false })).total, 0, 'with no EB-5 run nothing is both');

    const states = await oz2027StateRows(client, run.id);
    assert.deepEqual(states.map(s => s.state), ['Alabama', 'Florida', 'Idaho', 'Montana']);
    const florida = states.find(s => s.state === 'Florida')!;
    assert.equal(florida.eligibleCount, 2); assert.equal(florida.tiers.local_recommended, 1); assert.equal(florida.tiers.eligible, 1);
    assert.equal(states.find(s => s.state === 'Idaho')!.status, 'certified');

    const byState = await oz2027Geometry(client, run.id, { state: 'Florida' });
    assert.deepEqual(byState.features.map(f => f.id), ['12071040305', '12071050100']);
    assert.deepEqual(byState.features[0].properties, { geoid: '12071040305', state: 'Florida', county: 'Lee County', status: 'local_recommended', rural: 0, overlap2018: 62.5 });
    assert.deepEqual((await oz2027Geometry(client, run.id, { bbox: [-82.6, 26.4, -82.3, 26.7] })).features.map(f => f.id), ['12071040305'], 'the box query uses the bounding-box columns');
    assert.deepEqual((await oz2027Geometry(client, run.id, { bbox: [-100, 40, -99, 41] })).features, []);

    const detail = await oz2027TractDetail(client, run, eb5.id, '12071040305');
    assert.equal(detail.onEligibleList, true);
    assert.equal(detail.tract?.headlineStatus, 'local_recommended');
    assert.equal(detail.signals.length, 1);
    assert.equal(detail.signals[0].jurisdiction, 'Lee County Board of County Commissioners');
    assert.equal(detail.signals[0].source?.publisher, 'Lee County BoCC (synthetic)');
    assert.deepEqual(detail.links2018.map(l => [l.geoid2010, l.shareOf2020Pct, l.eb5RuralClass]), [['12071040300', 62.5, 'not_rural_msa']]);
    assert.equal(detail.links2018[0].notice.url, 'https://www.irs.gov/pub/irs-drop/n-26-40.pdf');
    assert.equal(detail.state?.state, 'Florida');
    const offList = await oz2027TractDetail(client, run, eb5.id, '12071040306');
    assert.equal(offList.tract, null); assert.equal(offList.onEligibleList, false); assert.equal(offList.signals[0].onEligibleList, false);
    const nothing = await oz2027TractDetail(client, run, eb5.id, '99999999999');
    assert.equal(nothing.tract, null); assert.deepEqual(nothing.signals, []);

    // The 2018 screen's 2027 picture: Choctaw's only eligible part is a 0.003% sliver.
    const pictures = await oz2027PicturesFor2010(client, run.id, ['01023956800', '30003940600', '72001956700']);
    assert.equal(pictures.get('01023956800')?.badge, 'sliver_only');
    assert.equal(pictures.get('01023956800')?.eligibleLandPct, 0.003);
    assert.equal(pictures.get('30003940600')?.badge, 'fully_eligible');
    assert.equal(pictures.get('30003940600')?.headline, 'state_recommended');
    assert.equal(pictures.has('72001956700'), false, 'a tract with no links has no picture');
    const tracts = await oz2027ForTracts(client, run.id, ['12071040305', '12071040306']);
    assert.equal(tracts.get('12071040305')?.status, 'local_recommended'); assert.equal(tracts.has('12071040306'), false);

    // The Florida research view: a mapped property reads Treasury's revised list and the 2027 tier, never the snapshot's April flag.
    const property = (tractId: string | null, oz: ResearchProperty['oz']) => ({ id: `reapi:${tractId}`, tractId, oz, rural: null } as unknown as ResearchProperty);
    const overlay = await ozOverlay(client, [property('12071040305', 'not_in_list'), property('12071050100', 'not_in_list'), property('12071999999', 'eligible'), property(null, 'unmapped')]);
    assert.equal(overlay.basis.source, 'treasury_2026_09_23'); assert.equal(overlay.basis.runId, run.id);
    const [lee, september, dropped, unmapped] = overlay.properties;
    assert.equal(lee.oz, 'eligible'); assert.equal(lee.oz2027?.status, 'local_recommended'); assert.equal(lee.oz2027?.notice?.citation, 'IRS Notice 2026-40', 'a 62.5% overlap with a 2018 zone carries the notice');
    assert.equal(september.oz, 'eligible'); assert.equal(september.oz2027?.inAprilAppendix, false); assert.equal(september.oz2027?.notice, null);
    assert.equal(dropped.oz, 'not_in_list', 'a tract absent from Treasury is not eligible whatever the snapshot said'); assert.equal(dropped.oz2027, null);
    assert.equal(unmapped.oz, 'unmapped');

    // Distinct properties: ten Choctaw records describe five buildings; units stay per record.
    const choctaw = (await ozEb5TractRows(client, eb5.id, { state: 'Alabama', className: null, county: null, countyFips: null, includeMetro: false, boost: false, withAssets: false })).rows[0];
    assert.equal(choctaw.assetCount, 10); assert.equal(choctaw.propertyCount, 5); assert.equal(choctaw.assetUnits, 365);
  } finally { client.release(); await pool.end(); }
});

test('OZ 2027 routes, the enriched 2018 list and the Florida overlay authenticate first', async () => {
  let session: WorkspaceUser | null = null;
  mock.module('server-only', { defaultExport: {} });
  mock.module(new URL('../../lib/research/service.ts', import.meta.url).href, { namedExports: { identity: async () => { if (!session) throw new Error('AUTH_REQUIRED'); return session; } } });
  const service = await import('../../lib/research/oz2027-service.ts');
  const eb5Service = await import('../../lib/research/oz-eb5-service.ts');
  const database = await import('../../lib/workspace/db.ts');
  try {
    for (const call of [
      () => service.oz2027Tracts(new URLSearchParams('status=invented&state=Nowhere')), () => service.oz2027States(),
      () => service.oz2027GeometryFor(new URLSearchParams('bbox=nonsense')), () => service.oz2027Tract('nonsense'), () => service.oz2027Tract('12071040305'),
      () => eb5Service.ozEb5GeometryCached('Alabama', 'nonsense'),
    ]) await assert.rejects(call, /AUTH_REQUIRED/);
    session = { id: randomUUID(), name: 'Synthetic analyst', login: 'synthetic-oz2027', avatarUrl: null };
    await assert.rejects(() => service.oz2027Tracts(new URLSearchParams('status=invented')), /Unknown 2027 status tier/);
    await assert.rejects(() => service.oz2027GeometryFor(new URLSearchParams('state=Florida&bbox=-82,26,-81,27')), /exactly one of state or bbox/);
    await assert.rejects(() => service.oz2027GeometryFor(new URLSearchParams()), /exactly one of state or bbox/);
    await assert.rejects(() => service.oz2027Tract('120710403'), /exactly eleven digits/);
    const list = await service.oz2027Tracts(new URLSearchParams('state=FL'));
    assert.ok(list); assert.equal(list.total, 2); assert.equal(list.run.counts.tracts, 4);
    const geometry = await service.oz2027GeometryFor(new URLSearchParams(`state=Florida&run=${list.run.id}`));
    assert.equal(geometry.immutable, true, 'a request naming the current run may be cached');
    assert.equal((await service.oz2027GeometryFor(new URLSearchParams(`state=Florida&run=${'0'.repeat(64)}`))).immutable, false, 'a stale run is never cached');
    assert.equal((await service.oz2027GeometryFor(new URLSearchParams('state=Florida'))).immutable, false);
    const detail = await service.oz2027Tract('30003940600');
    assert.ok(detail); assert.equal(detail.tract?.eb5RuralBoth, true);
    assert.equal((await service.oz2027States())?.states.length, 4);

    // The 2018 list carries each row's 2027 picture, the combined flag, the notice, distinct properties and label points.
    const screen = await eb5Service.ozEb5Tracts(new URLSearchParams('state=Alabama'));
    const choctaw = screen!.rows[0] as OzEb5TractRow;
    assert.equal(choctaw.oz2027?.badge, 'sliver_only');
    assert.equal(choctaw.oz2027?.ozRuralAndEb5Rural, false);
    assert.match(choctaw.oz2027!.notice.text, /^2018 zone · ends 12\/31\/2028/);
    assert.equal(choctaw.propertyCount, 5);
    assert.ok(choctaw.labelLon !== null && choctaw.labelLon > -88.2 && choctaw.labelLon < -88.1 && choctaw.labelLat! > 31.9 && choctaw.labelLat! < 32);
    const big = (await eb5Service.ozEb5Tracts(new URLSearchParams('state=Montana')))!.rows[0] as OzEb5TractRow;
    assert.equal(big.oz2027?.ozRuralAndEb5Rural, true);
    const eb5Geometry = await eb5Service.ozEb5GeometryCached('Alabama', screen!.run.id);
    assert.equal(eb5Geometry.immutable, true);

  } finally { await database.getPool().end(); mock.reset(); }
});
