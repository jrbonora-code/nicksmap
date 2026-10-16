import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Controlled fault injection checks that the tests catch plausible financial mistakes.
// Only copies under this repository's ignored .local directory are mutated.
const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const parent = path.join(root, ".local");
mkdirSync(parent, { recursive: true });
const temporary = mkdtempSync(path.join(parent, "financial-guards-"));
const faults = [
  ["expenses added to income", "screening", "-money.operatingExpensesCents", "money.operatingExpensesCents"],
  ["reserves omitted from cash flow", "screening", "-money.replacementReservesCents", "0"],
  ["DSCR uses NOI instead of after-reserve cash flow", "screening", "cashFlowAfterReservesCents / money.annualDebtServiceCents", "noiCents / money.annualDebtServiceCents"],
  ["annual rate treated as monthly", "screening", "const rate = annualRate / 12;", "const rate = annualRate;"],
  ["largest loan cap chosen", "screening", "Math.min(...Object.values(limitsCents))", "Math.max(...Object.values(limitsCents))"],
  ["binary rounding changes a cent boundary", "screening", "check.floorRatio(value, [ltv], [], \"limitsCents.ltv\")", "Math.floor(value * ltv)"],
  ["360-day NPV convention substituted", "cash-flows", "/ 86_400_000 / 365", "/ 86_400_000 / 360"],
  ["NPV precision envelope bypassed", "cash-flows", "if (precisionReserveCents > NPV_ABSOLUTE_TOLERANCE_CENTS)", "if (false)"],
  ["zero net cash flows discounted", "cash-flows", "if (flow.amount === 0) continue;", ""],
  ["equity multiple inverted", "cash-flows", "distributionsCents / contributionsCents", "contributionsCents / distributionsCents"],
  ["one-cent imbalance hidden", "reconciliation", "balanced: differenceCents === 0", "balanced: Math.abs(differenceCents) <= 1"],
  ["duplicate lines allowed", "reconciliation", "if (ids.has(id))", "if (false && ids.has(id))"]
];

try {
  cpSync(path.join(root, "lib", "finance"), path.join(temporary, "lib", "finance"), { recursive: true });
  mkdirSync(path.join(temporary,"lib","research"),{recursive:true});
  for(const name of ['finance.ts','debt.ts','types.ts','package.json']) cpSync(path.join(root,'lib','research',name),path.join(temporary,'lib','research',name));
  cpSync(path.join(root, "tests", "finance"), path.join(temporary, "tests", "finance"), { recursive: true });
  writeFileSync(path.join(temporary, "package.json"), '{"private":true,"type":"module"}\n');
  const run = testFile => spawnSync(process.execPath, ["--test", "--test-reporter=tap", testFile], {
    cwd: temporary, encoding: "utf8", timeout: 30000, windowsHide: true
  });
  const baseline = run("tests/finance/*.test.ts");
  assert.equal(baseline.status, 0, `Unmodified baseline must pass before fault injection.\n${baseline.stdout}\n${baseline.stderr}`);
  for (const [name, module, before, after] of faults) {
    const file = path.join(temporary, "lib", "finance", `${module}.ts`);
    const original = readFileSync(file, "utf8");
    assert.equal(original.split(before).length - 1, 1, `Fault anchor must occur exactly once: ${name}`);
    writeFileSync(file, original.replace(before, after));
    try {
      const result = run(`tests/finance/${module}.test.ts`);
      assert.ok(!result.error && result.status === 1 && /# fail [1-9]\d*/.test(result.stdout) && /ERR_ASSERTION/.test(result.stdout),
        `Tests failed to catch the financial fault with an assertion: ${name}\n${result.stdout}\n${result.stderr}`);
      console.log(`Detected: ${name}`);
    } finally {
      writeFileSync(file, original);
    }
  }
  const thresholdFaults=[
    ['threshold reserves omitted','annual*s.minDscr+s.annualReserveCents','annual*s.minDscr'],
    ['weaker income constraint selected','requiredNoiCents:Math.max(dscr,dy)','requiredNoiCents:Math.min(dscr,dy)'],
    ['LTV multiplied instead of divided','requiredValueCents:principalCents/s.maxLtv','requiredValueCents:principalCents*s.maxLtv'],
    ['shared collateral used as property debt','d.sharedPropertyCount===1','d.sharedPropertyCount>=1']
  ];
  const thresholdFile=path.join(temporary,'lib','research','finance.ts');
  const thresholdOriginal=readFileSync(thresholdFile,'utf8');
  for(const [name,before,after] of thresholdFaults){
    assert.equal(thresholdOriginal.split(before).length-1,1);
    writeFileSync(thresholdFile,thresholdOriginal.replace(before,after));
    try{const result=run('tests/finance/threshold.test.ts');assert.ok(result.status===1&&/ERR_ASSERTION/.test(result.stdout),`Threshold tests missed: ${name}`);console.log(`Detected: ${name}`);}
    finally{writeFileSync(thresholdFile,thresholdOriginal);}
  }
  console.log(`Financial guard checks passed: ${faults.length+thresholdFaults.length} injected faults detected.`);
} finally {
  const resolved = realpathSync(temporary);
  const allowed = realpathSync(parent) + path.sep;
  assert.ok(resolved.startsWith(allowed) && path.basename(resolved).startsWith("financial-guards-"), "Refuse cleanup outside the task scratch directory");
  rmSync(resolved, { recursive: true, force: true });
}
