// Migration 010 against an isolated database (run by scripts/research-db-test.mjs after the other research tests, so a
// research snapshot with the property reapi:fixture is current): the loan-source import's replay, rollback, refusals and
// immutability, the overlay that attaches linked loans to properties, the outside-loan layer and the balance order.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { importDebt } from '../../scripts/debt-import-core.mjs';
import { cmbsLoan, currentDebtRun, debtOverlay, outsideLoans } from '../../lib/research/debt-sources.ts';
import { bestBalance } from '../../lib/research/balance-estimate.ts';
import type { ResearchProperty } from '../../lib/research/types.ts';
import { debtBundle, hudLoan } from './debt-fixture.ts';

const url = process.env.RESEARCH_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith('/radar_test_research_')) throw new Error('An isolated research test database is required.');
const count = async (pool: pg.Pool, sql: string, params: unknown[] = []) => Number((await pool.query(sql, params)).rows[0].n);

test('loan sources: import, replay, rollback, refusals, immutable rows and the property overlay', async () => {
  const pool = new pg.Pool({ connectionString: url });
  try {
    const snapshot = (await pool.query('SELECT snapshot_id FROM research_current')).rows[0].snapshot_id as string;
    const property = (await pool.query("SELECT record FROM research_snapshot_properties WHERE snapshot_id=$1 AND property_id='reapi:fixture'", [snapshot])).rows[0].record as ResearchProperty;
    const client = await pool.connect();
    try { assert.equal((await debtOverlay(client, [property]))[0].servicer, null, 'no run yet'); } finally { client.release(); }

    const first = debtBundle(snapshot);
    assert.equal((await importDebt(pool, first, { importedBy: 'synthetic-operator' })).status, 'imported');
    for (const [table, n] of [['research_debt_hud_loans', 1], ['research_debt_cmbs_loans', 2], ['research_debt_releases', 1], ['research_debt_links', 3], ['research_debt_clerk_days', 1]] as const)
      assert.equal(await count(pool, `SELECT count(*) n FROM ${table} WHERE run_id=$1`, [first.id]), n, table);
    assert.equal((await importDebt(pool, first)).status, 'replayed');
    assert.equal(await count(pool, 'SELECT count(*) n FROM research_debt_runs'), 1, 'a replay writes no second copy');

    const second = debtBundle(snapshot, { hud: [hudLoan({ balanceCents: 900_000_000 })] }, 'second');
    await assert.rejects(importDebt(pool, second, { failAfterLoans: true }), /Controlled loan-source import fault/);
    assert.equal(await count(pool, 'SELECT count(*) n FROM research_debt_runs WHERE id=$1', [second.id]), 0);
    assert.equal((await pool.query('SELECT run_id FROM research_debt_current')).rows[0].run_id, first.id, 'the previous run stays live');
    await assert.rejects(importDebt(pool, debtBundle('d'.repeat(64), {}, 'other snapshot')), /not imported/);
    await assert.rejects(pool.query('UPDATE research_debt_hud_loans SET balance_cents=1 WHERE run_id=$1', [first.id]), /append-only|immutable|history/i);
    await assert.rejects(pool.query('DELETE FROM research_debt_links WHERE run_id=$1', [first.id]), /append-only|immutable|history/i);

    const c = await pool.connect();
    try {
      const run = await currentDebtRun(c);
      assert.equal(run?.id, first.id);
      const [p] = await debtOverlay(c, [property]);
      assert.deepEqual([p.servicer?.hud.length, p.servicer?.cmbs.length, p.servicer?.releases.length], [1, 1, 1]);
      assert.equal(p.servicer?.hud[0].row.balanceCents, 1_050_000_000);
      assert.deepEqual(p.servicer?.releases[0].row.lenders, ['FIXTURE BANK NA']);
      // A confirmed active HUD loan is the property's balance, ahead of every estimate.
      assert.deepEqual(bestBalance(p, '2026-10-16'), { source: 'servicer', cents: 1_050_000_000, via: 'hud', asOf: null });
      const outside = await outsideLoans(c);
      assert.deepEqual(outside?.rows.map(r => [r[0], r[3], r[8]]), [[1, 'ELSEWHERE', 1]], 'only the unlinked, placed loan');
      assert.equal((await cmbsLoan(c, first.id, 1))?.specialServicerTransfer, '2026-05-01');
    } finally { c.release(); }
    assert.equal((await pool.query("SELECT status FROM research_import_runs WHERE snapshot_id=$1 ORDER BY started_at LIMIT 1", [first.id])).rows[0].status, 'imported');
  } finally { await pool.end(); }
});
