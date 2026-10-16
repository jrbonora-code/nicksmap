import { Inspection, type CalculationResult } from "./validation.ts";

export type Reconciliation = { sourcesCents: number; usesCents: number; differenceCents: number; fundingGapCents: number; surplusCents: number; balanced: boolean };

/** Signed difference is sources minus uses; any one-cent mismatch needs review. */
export function reconcileSourcesAndUses(input: unknown): CalculationResult<Reconciliation> {
  const check = new Inspection();
  const raw = check.record(input, ["currency", "sources", "uses"]);
  check.literal(raw.currency, "USD", "currency");
  const ids = new Set<string>();
  const read = (value: unknown, path: string) => check.list(value, path).map((item, index) => {
    const linePath = `${path}[${index}]`;
    const line = check.record(item, ["id", "amountCents"], linePath);
    const id = check.text(line.id, `${linePath}.id`);
    if (ids.has(id)) check.issue("DUPLICATE_LINE", `${linePath}.id`, "A line identifier must be unique across sources and uses.");
    ids.add(id);
    return check.cents(line.amountCents, `${linePath}.amountCents`);
  });
  const sources = read(raw.sources, "sources");
  const uses = read(raw.uses, "uses");
  if (check.failed) return check.blocked();
  const sourcesCents = check.sum(sources, "sourcesCents");
  const usesCents = check.sum(uses, "usesCents");
  const differenceCents = check.sum([sourcesCents, -usesCents], "differenceCents");
  if (check.failed) return check.blocked();
  if (differenceCents !== 0) check.issue("UNBALANCED_SOURCES_USES", "differenceCents", "Sources and uses do not reconcile; resolve the funding gap or unallocated surplus.", "warning");
  return check.result({ sourcesCents, usesCents, differenceCents, fundingGapCents: Math.max(0, -differenceCents),
    surplusCents: Math.max(0, differenceCents), balanced: differenceCents === 0 });
}
