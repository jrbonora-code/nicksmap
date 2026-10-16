import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { checkMapAssets } from "./check-map-assets.mjs";

const probe = net.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  windowsHide: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "", BETTER_AUTH_URL: "", BETTER_AUTH_SECRET: "", GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "", ALLOWED_GITHUB_IDS: "", ALLOWED_EMAILS: "", ACCOUNT_SETUP_OPEN: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { output += data.toString(); });

try {
  const url = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { healthy = true; break; }
    } catch { /* Wait for process startup. */ }
    await delay(200);
  }
  assert.ok(healthy, `Server did not start: ${output}`);
  const health = await fetch(`${url}/api/health`);
  assert.deepEqual(await health.json(), { status: "ok" });
  assert.equal(health.headers.get("cache-control"), "no-store");
  for (const path of ["/", "/research", "/research/cases", "/research/cases/00000000-0000-4000-8000-000000000000", "/research/oz-eb5", "/overview", "/deals", "/deals/new", "/deals/00000000-0000-4000-8000-000000000000", "/counties", "/ideas", "/settings"]) {
    const response = await fetch(url + path, { redirect: "manual" });
    const body = await response.text();
    assert.ok((response.status === 307 && response.headers.get("location") === "/sign-in") || (response.status === 200 && body.includes('NEXT_REDIRECT') && body.includes('/sign-in')), `Unauthenticated path did not redirect: ${path} (${response.status})`);
    assert.ok(!body.includes('workspace_deals') && !body.includes('postgres://'), "No internal details in unauthenticated response");
    if (path === "/ideas") assert.ok(!body.includes("OZ nomination and site research") && !body.includes("Sponsor and fund interests"), "Private ideas must not render before authentication");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  }
  const signIn = await fetch(`${url}/sign-in`);
  assert.equal(signIn.status, 200);
  assert.match(await signIn.text(), /<h1\b[^>]*>Sign in<\/h1>/, "Public sign-in heading is missing");
  const forged = await fetch(`${url}/deals`, { redirect: "manual", headers: { Cookie: "radar.session_token=forged" } });
  assert.ok([200,307].includes(forged.status));
  assert.ok(forged.headers.get("location") === "/sign-in" || (await forged.text()).includes("NEXT_REDIRECT"));
  assert.equal((await fetch(`${url}/api/readiness`)).status, 503);
  const createPassword = await fetch(`${url}/sign-in/create-password`);
  assert.equal(createPassword.status, 200);
  assert.ok((await createPassword.text()).includes("Account setup is closed."));
  assert.equal((await fetch(`${url}/api/auth/sign-in/email`, { method: "POST" })).status, 503);
  for (const closedPath of ["/api/auth/sign-up/email", "/api/auth/set-password", "/api/auth/change-password", "/api/auth/forget-password", "/api/auth/update-user", "/api/auth/link-social"]) {
    assert.equal((await fetch(`${url}${closedPath}`, { method: "POST" })).status, 404, closedPath);
  }
  assert.equal((await fetch(`${url}/api/deals`)).status, 404);
  for(const path of ['/api/research','/api/research/history','/api/research/saved','/api/research/cases','/api/research/cases/00000000-0000-4000-8000-000000000000','/api/research/tracts?snapshot='+('0'.repeat(64)),'/api/research/licenses?snapshot='+('0'.repeat(64)),'/api/research/property/reapi:fixture?snapshot='+('0'.repeat(64)),'/api/research/oz-eb5','/api/research/oz-eb5/assets','/api/research/oz-eb5/markets','/api/research/oz-eb5/geometry?state=Montana','/api/research/oz-eb5/site?lat=45.7&lon=-107.5','/api/research/oz-eb5/geometry?state=Montana&run='+('0'.repeat(64)),'/api/research/oz2027','/api/research/oz2027?state=FL&status=nominated','/api/research/oz2027/states','/api/research/oz2027/geometry?state=Florida','/api/research/oz2027/geometry?bbox=-82.5,26.3,-81.5,27.1&run='+('0'.repeat(64)),'/api/research/oz2027/tract?geoid=12071040305','/api/research/oz2027/points?run='+('0'.repeat(64)),'/api/research/oz-eb5/tract?geoid=01023956800','/api/research/oz-eb5?summary=1','/api/research/debt/outside','/api/research/debt/run','/api/research/debt/loan?run='+('0'.repeat(64))+'&seq=0']){
    const r=await fetch(url+path);assert.equal(r.status,401,path);assert.match(r.headers.get('cache-control'),/no-store/);
  }
  for(const path of ['/api/research/cases','/api/research/cases/00000000-0000-4000-8000-000000000000','/api/research/saved']){
    const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json','Origin':url},body:'{}'});assert.equal(r.status,401,`POST ${path}`);assert.match(r.headers.get('cache-control'),/no-store/);
  }
  await checkMapAssets(url);
  console.log("Smoke passed: production health, protected routes, forged cookie, public sign-in, closed password setup, unavailable readiness, closed signup/password/linking/API.");
} finally {
  const closed = once(server, "close");
  server.kill();
  await Promise.race([closed, delay(5000)]);
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
}
