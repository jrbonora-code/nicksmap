import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function checkMapAssets(origin) {
  for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    const response = await fetch(`${origin}/maplibre/${file}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, `Missing map runtime asset: ${file}`);
    assert.match(response.headers.get("content-type") ?? "", /javascript/, `Wrong module MIME type: ${file}`);
    assert.equal(response.headers.get("content-security-policy"), null, "Worker modules cannot inherit a per-document nonce policy");
    const expected = await readFile(`node_modules/maplibre-gl/dist/${file}`);
    const actual = Buffer.from(await response.arrayBuffer());
    const hash = bytes => createHash("sha256").update(bytes).digest("hex");
    assert.equal(hash(actual), hash(expected), `Map asset differs from the pinned package: ${file}`);
  }
}

if (process.argv[2]) {
  await checkMapAssets(process.argv[2]);
  console.log("Both map modules served with correct MIME types and exact package hashes.");
}
