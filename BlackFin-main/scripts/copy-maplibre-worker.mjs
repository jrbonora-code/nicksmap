import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// Next's asset bundling does not preserve the worker's relative shared-module
// import. Copy both from the installed, lockfile-pinned package on every build.
// https://maplibre.org/maplibre-gl-js/docs/#esm
const packageRoot = path.dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json"));
const destination = path.resolve("public/maplibre");
await mkdir(destination, { recursive: true });
for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(path.join(packageRoot, "dist", name), path.join(destination, name));
}
await copyFile(path.join(packageRoot, "LICENSE.txt"), path.join(destination, "LICENSE.txt"));
console.log("Prepared pinned MapLibre worker, shared module, and license.");
