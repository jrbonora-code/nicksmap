import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultScenario, validateScenario } from '../../lib/research/finance.ts';

// Fixed calendar references, independent of the production formatter or host timezone.
const dateCases = [
  ['EDT evening', '2026-09-14T01:00:00Z', '2026-09-13'],
  ['EST evening', '2026-01-15T02:00:00Z', '2026-01-14'],
  ['before EDT midnight', '2026-09-14T03:59:59Z', '2026-09-13'],
  ['at EDT midnight', '2026-09-14T04:00:00Z', '2026-09-14'],
  ['before EST midnight', '2026-01-15T04:59:59Z', '2026-01-14'],
  ['at EST midnight', '2026-01-15T05:00:00Z', '2026-01-15'],
  ['before spring DST transition', '2026-03-08T06:59:59Z', '2026-03-08'],
  ['after spring DST transition', '2026-03-08T07:00:00Z', '2026-03-08'],
  ['before fall DST transition', '2026-11-01T05:59:59Z', '2026-11-01'],
  ['after fall DST transition', '2026-11-01T06:00:00Z', '2026-11-01'],
] as const;

for (const [label, instant, expected] of dateCases) {
  test(`new scenario uses America/New_York calendar date: ${label}`, (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(instant) });
    assert.equal(defaultScenario().asOf, expected);
  });
}

test('an injected instant determines the default date without changing the clock', () => {
  assert.equal(defaultScenario(new Date('2026-09-14T01:00:00Z')).asOf, '2026-09-13');
});

test('explicit and saved scenario dates survive validation unchanged', () => {
  const explicit = { ...defaultScenario(), asOf: '2024-02-29' };
  assert.equal(validateScenario(explicit).asOf, '2024-02-29');
  const saved = JSON.parse(JSON.stringify(explicit));
  assert.deepEqual(validateScenario(saved), explicit);
});
