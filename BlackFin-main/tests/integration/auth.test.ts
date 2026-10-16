import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { serializeSignedCookie } from "better-call";
import { createWorkspaceAuth } from "../../lib/auth/factory.ts";
import { isAllowedIdentity, isAllowedUser } from "../../lib/auth/policy.ts";

// Explicit dedicated local database; no production URL is ever inherited.
const input = process.env.TEST_DATABASE_URL;
if (!input) throw new Error("Set TEST_DATABASE_URL to an isolated local PostgreSQL database to run integration checks.");
const source = new URL(input);
if (!["127.0.0.1", "localhost", "[::1]"].includes(source.hostname) || !source.pathname.startsWith("/radar_test")) throw new Error("Integration tests require a loopback radar_test database.");
const dbName = `radar_test_auth_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Pool({ connectionString: input });
const target = new URL(input); target.pathname = `/${dbName}`;
const pool = new pg.Pool({ connectionString: target.toString() });
// Force-dropping the database at teardown terminates any client the pool still holds; the
// server's notice would otherwise surface as an uncaught exception after the last test.
pool.on("error", () => {});
// A second synthetic allowlisted ID exercises the real OAuth callback path below without
// colliding with the directly created reviewer row.
const SECOND_ALLOWED_ID = "424242";
const OWNER_EMAIL = "nick.test@example.invalid";
const SECOND_EMAIL = "member2.test@example.invalid";
const PASSWORD = "isolated-test-passphrase-42";
const config = {
  baseURL: "http://127.0.0.1:3107",
  secret: randomUUID() + randomUUID(),
  allowedEmails: [OWNER_EMAIL, SECOND_EMAIL],
  accountSetupOpen: true,
  github: { clientId: "isolated-test-client", clientSecret: "isolated-test-secret", allowedIds: ["110749578", SECOND_ALLOWED_ID] }
};
const auth = createWorkspaceAuth(pool, config);
let userId: string;
let cookie: string;
let token: string;

before(async () => {
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await pool.query(await readFile(new URL("../../db/002-auth.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("../../db/004-email-identities.sql", import.meta.url), "utf8"));
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Isolated reviewer", email: "reviewer@example.invalid", emailVerified: true, githubId: "110749578", githubLogin: "npstewart87", githubMfa: true }, { method: "admin" });
  userId = user.id;
  const session = await context.internalAdapter.createSession(user.id);
  assert.ok(session);
  token = session.token;
  cookie = (await serializeSignedCookie(context.authCookies.sessionToken.name, token, config.secret, context.authCookies.sessionToken.attributes)).split(";")[0];
});
after(async () => {
  // Let Better Auth's post-response writes (rate-limit rows) settle before the pool closes.
  await new Promise(resolve => setTimeout(resolve, 250));
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end();
});
test("real Better Auth config validates signed database sessions and rejects tampering", async () => {
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal(session?.user.id, userId);
  assert.equal(isAllowedIdentity(session!.user, config.github.allowedIds), true);
  assert.equal(await auth.api.getSession({ headers: new Headers() }), null);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: cookie.replace(token, "tampered") }) }), null);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: `radar.session_token=${token}` }) }), null);
});
test("removed account fails workspace authorization even while its session is valid", async () => {
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.ok(session);
  assert.equal(isAllowedIdentity(session.user, ["999"]), false);
});
test("database hooks prevent unauthorized identities and accounts", async () => {
  const context = await auth.$context;
  await assert.rejects(context.internalAdapter.createUser({ name: "Rejected", email: "reject@example.invalid", emailVerified: true, githubId: "999", githubLogin: "outsider", githubMfa: true }, { method: "admin" }));
  await assert.rejects(context.internalAdapter.createUser({ name: "No MFA", email: "no-mfa@example.invalid", emailVerified: true, githubId: "110749578", githubLogin: "owner", githubMfa: false }, { method: "admin" }));
  const row = await pool.query('SELECT count(*)::int AS count FROM auth_user');
  assert.equal(row.rows[0].count, 1);
});
test("OAuth start uses state, PKCE and an exact trusted callback; cross-origin requests fail", async () => {
  const request = (origin: string, callbackURL = "/overview") => new Request(`${config.baseURL}/api/auth/sign-in/social`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "x-forwarded-for": "127.0.0.1" }, body: JSON.stringify({ provider: "github", callbackURL, disableRedirect: true }) });
  const response = await auth.handler(request(config.baseURL));
  assert.equal(response.status, 200);
  const body = await response.json();
  const url = new URL(body.url);
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.searchParams.get("redirect_uri"), `${config.baseURL}/api/auth/callback/github`);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok((url.searchParams.get("code_challenge") ?? "").length >= 43);
  assert.ok((url.searchParams.get("state") ?? "").length >= 20);
  assert.ok(response.headers.getSetCookie().some(value => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)));
  assert.equal((await auth.handler(request("https://evil.example"))).status, 403);
  assert.equal((await auth.handler(request(config.baseURL, "https://evil.example"))).status, 403);
});
test("expiry and explicit revocation invalidate existing cookies", async () => {
  await pool.query('UPDATE auth_session SET "expiresAt"=now()-interval \'1 second\' WHERE token=$1', [token]);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  assert.ok(session);
  const newCookie = (await serializeSignedCookie(context.authCookies.sessionToken.name, session.token, config.secret, context.authCookies.sessionToken.attributes)).split(";")[0];
  const response = await auth.handler(new Request(`${config.baseURL}/api/auth/sign-out`, { method: "POST", headers: { cookie: newCookie, origin: config.baseURL, "content-type": "application/json" }, body: "{}" }));
  assert.equal(response.status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: newCookie }) }), null);
  assert.ok(response.headers.getSetCookie().some(value => value.includes("Max-Age=0")));
});

// The callback tests below drive the installed Better Auth handler through the real
// /sign-in/social -> /callback/github path. Only GitHub's two HTTPS endpoints are replaced,
// by intercepting global fetch for the duration of one callback; no network is used.
type SyntheticGithubProfile = { id: number; login: string; name?: string; avatar_url?: string; email: string; two_factor_authentication?: boolean };

async function completeGithubCallback(profile: SyntheticGithubProfile) {
  const start = await auth.handler(new Request(`${config.baseURL}/api/auth/sign-in/social`, { method: "POST", headers: { "Content-Type": "application/json", Origin: config.baseURL, "x-forwarded-for": "127.0.0.1" }, body: JSON.stringify({ provider: "github", callbackURL: "/overview", errorCallbackURL: "/sign-in?error=failed", disableRedirect: true }) }));
  assert.equal(start.status, 200);
  const state = new URL((await start.json()).url).searchParams.get("state");
  assert.ok(state);
  const stateCookies = start.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push(url);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "isolated-access-token", token_type: "bearer", scope: "read:user,user:email" });
    if (url === "https://api.github.com/user") return Response.json(profile);
    if (url === "https://api.github.com/user/emails") return Response.json([{ email: profile.email, primary: true, verified: true, visibility: "private" }]);
    throw new Error(`Unexpected network request during isolated test: ${url}`);
  }) as typeof fetch;
  try {
    const response = await auth.handler(new Request(`${config.baseURL}/api/auth/callback/github?code=isolated-code&state=${encodeURIComponent(state)}`, { headers: { cookie: stateCookies, "x-forwarded-for": "127.0.0.1" } }));
    return { response, requests };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function sessionCookieFrom(response: Response) {
  return response.headers.getSetCookie().find(value => value.startsWith("radar.session_token=") && !/Max-Age=0/i.test(value));
}

test("first GitHub callback for an allowlisted account creates the user with its identity fields and a session", async () => {
  const { response, requests } = await completeGithubCallback({ id: Number(SECOND_ALLOWED_ID), login: "second-owner", name: "Second Owner", avatar_url: "https://avatars.example.invalid/second", email: "second@example.invalid", two_factor_authentication: true });
  assert.equal(response.status, 302);
  assert.ok((response.headers.get("location") ?? "").endsWith("/overview"), response.headers.get("location") ?? "no location");
  assert.deepEqual(requests, ["https://github.com/login/oauth/access_token", "https://api.github.com/user", "https://api.github.com/user/emails"]);
  const sessionCookie = sessionCookieFrom(response);
  assert.ok(sessionCookie, "session cookie must be set on a successful callback");
  const user = await pool.query('SELECT "githubId", "githubLogin", "githubMfa", email, "emailVerified" FROM auth_user WHERE "githubId" = $1', [SECOND_ALLOWED_ID]);
  assert.deepEqual(user.rows, [{ githubId: SECOND_ALLOWED_ID, githubLogin: "second-owner", githubMfa: true, email: "second@example.invalid", emailVerified: true }]);
  const account = await pool.query('SELECT a."providerId", a."accountId" FROM auth_account a JOIN auth_user u ON u.id = a."userId" WHERE u."githubId" = $1', [SECOND_ALLOWED_ID]);
  assert.deepEqual(account.rows, [{ providerId: "github", accountId: SECOND_ALLOWED_ID }]);
  const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie!.split(";")[0] }) });
  assert.equal(session?.user.githubId, SECOND_ALLOWED_ID);
  assert.equal(isAllowedIdentity(session!.user, config.github.allowedIds), true);
});

test("returning GitHub callback refreshes the stored login and reuses the single account row", async () => {
  const { response } = await completeGithubCallback({ id: Number(SECOND_ALLOWED_ID), login: "second-owner-renamed", name: "Second Owner", email: "second@example.invalid", two_factor_authentication: true });
  assert.equal(response.status, 302);
  assert.ok(sessionCookieFrom(response));
  const user = await pool.query('SELECT "githubLogin", "githubMfa" FROM auth_user WHERE "githubId" = $1', [SECOND_ALLOWED_ID]);
  assert.deepEqual(user.rows, [{ githubLogin: "second-owner-renamed", githubMfa: true }]);
  const accounts = await pool.query('SELECT count(*)::int AS count FROM auth_account WHERE "accountId" = $1', [SECOND_ALLOWED_ID]);
  assert.equal(accounts.rows[0].count, 1);
});

test("GitHub callbacks for an unlisted account, disabled MFA or a missing MFA field create nothing", async () => {
  const usersBefore = (await pool.query("SELECT count(*)::int AS count FROM auth_user")).rows[0].count;
  const denied: SyntheticGithubProfile[] = [
    { id: 999, login: "outsider", email: "outsider@example.invalid", two_factor_authentication: true },
    { id: Number(SECOND_ALLOWED_ID), login: "second-owner", email: "second@example.invalid", two_factor_authentication: false },
    { id: Number(SECOND_ALLOWED_ID), login: "second-owner", email: "second@example.invalid" }
  ];
  for (const profile of denied) {
    const { response } = await completeGithubCallback(profile);
    const location = response.headers.get("location") ?? "";
    assert.ok(response.status === 403 || (response.status === 302 && !location.endsWith("/overview")), `unexpected ${response.status} ${location} for ${profile.login}`);
    assert.equal(sessionCookieFrom(response), undefined);
  }
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM auth_user")).rows[0].count, usersBefore);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM auth_user WHERE "githubId" = $1', ["999"])).rows[0].count, 0);
});

// Email identities: password creation goes through Better Auth's own sign-up API (as the
// server action does), sign-in through the real /sign-in/email handler.
function signInWithEmail(instance: ReturnType<typeof createWorkspaceAuth>, email: string, password: string) {
  return instance.handler(new Request(`${config.baseURL}/api/auth/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: config.baseURL, "x-forwarded-for": "127.0.0.1" }, body: JSON.stringify({ email, password, callbackURL: "/overview" }) }));
}

test("an allowlisted address creates its password once while setup is open, then signs in with it", async () => {
  const created = await auth.api.signUpEmail({ body: { name: "nick.test", email: "Nick.Test@example.invalid", password: PASSWORD } });
  assert.equal(created.user.email, OWNER_EMAIL);
  const user = await pool.query('SELECT "githubId", "githubLogin", "githubMfa" FROM auth_user WHERE email = $1', [OWNER_EMAIL]);
  assert.deepEqual(user.rows, [{ githubId: null, githubLogin: null, githubMfa: null }]);
  const account = await pool.query('SELECT a."providerId", a.password IS NOT NULL AS hashed, a.password <> $2 AS not_plaintext FROM auth_account a JOIN auth_user u ON u.id = a."userId" WHERE u.email = $1', [OWNER_EMAIL, PASSWORD]);
  assert.deepEqual(account.rows, [{ providerId: "credential", hashed: true, not_plaintext: true }]);
  const response = await signInWithEmail(auth, OWNER_EMAIL, PASSWORD);
  assert.equal(response.status, 200);
  const cookie = sessionCookieFrom(response);
  assert.ok(cookie, "session cookie must be set after email sign-in");
  const session = await auth.api.getSession({ headers: new Headers({ cookie: cookie!.split(";")[0] }) });
  assert.equal(session?.user.email, OWNER_EMAIL);
  assert.equal(isAllowedUser(session!.user, config), true);
  assert.equal(isAllowedIdentity(session!.user, config.github.allowedIds), false);
});

test("wrong password, unlisted address, and a second password for the same address are refused", async () => {
  const wrong = await signInWithEmail(auth, OWNER_EMAIL, `${PASSWORD}-wrong`);
  assert.equal(wrong.status, 401);
  assert.equal(sessionCookieFrom(wrong), undefined);
  await assert.rejects(auth.api.signUpEmail({ body: { name: "outsider", email: "outsider@example.invalid", password: PASSWORD } }));
  await assert.rejects(auth.api.signUpEmail({ body: { name: "nick.test", email: OWNER_EMAIL, password: "a-different-long-passphrase" } }));
  assert.equal((await signInWithEmail(auth, "outsider@example.invalid", PASSWORD)).status, 401);
  assert.equal((await signInWithEmail(auth, OWNER_EMAIL, "a-different-long-passphrase")).status, 401);
  assert.equal((await signInWithEmail(auth, OWNER_EMAIL, PASSWORD)).status, 200);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM auth_user WHERE email = $1", ["outsider@example.invalid"])).rows[0].count, 0);
});

test("closing account setup blocks new passwords but not existing sign-ins; short passwords are refused", async () => {
  const closed = createWorkspaceAuth(pool, { ...config, accountSetupOpen: false });
  await assert.rejects(closed.api.signUpEmail({ body: { name: "member2.test", email: SECOND_EMAIL, password: PASSWORD } }));
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM auth_user WHERE email = $1", [SECOND_EMAIL])).rows[0].count, 0);
  assert.equal((await signInWithEmail(closed, OWNER_EMAIL, PASSWORD)).status, 200);
  await assert.rejects(auth.api.signUpEmail({ body: { name: "member2.test", email: SECOND_EMAIL, password: "short-pw" } }));
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM auth_user WHERE email = $1", [SECOND_EMAIL])).rows[0].count, 0);
});

test("a credential cannot be attached to a row that carries a GitHub identity", async () => {
  const context = await auth.$context;
  const githubUser = await pool.query('SELECT id FROM auth_user WHERE "githubId" = $1', [SECOND_ALLOWED_ID]);
  assert.equal(githubUser.rows.length, 1);
  await assert.rejects(context.internalAdapter.linkAccount({ userId: githubUser.rows[0].id, providerId: "credential", accountId: githubUser.rows[0].id, password: await context.password.hash(PASSWORD) }));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM auth_account WHERE "providerId" = $1', ["credential"])).rows[0].count, 1);
});
