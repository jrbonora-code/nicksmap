import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedIdentity, isAllowedUser, isSameOrigin, parseAllowedEmails, parseAllowedGithubIds, readAuthConfig } from "../../lib/auth/policy.ts";

const valid = { BETTER_AUTH_URL: "https://radar.example.com", BETTER_AUTH_SECRET: "a-long-isolated-test-secret-with-entropy", GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", ALLOWED_GITHUB_IDS: "110749578", ALLOWED_EMAILS: "Owner@Example.com, second@example.com", ACCOUNT_SETUP_OPEN: "true", DATABASE_URL: "postgres://localhost/test" };
const noGithub = { GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "", ALLOWED_GITHUB_IDS: "" };

test("configuration stays closed without a fixed origin, secret, database, or any sign-in method", () => {
  for (const key of ["BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "DATABASE_URL"]) assert.equal(readAuthConfig({ ...valid, [key]: "" }), null);
  assert.equal(readAuthConfig({ ...valid, ...noGithub, ALLOWED_EMAILS: "" }), null);
  assert.equal(readAuthConfig({ ...valid, GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "", ALLOWED_EMAILS: "" }), null, "an ID list without credentials enables nothing");
  for (const key of ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "ALLOWED_GITHUB_IDS"]) assert.throws(() => readAuthConfig({ ...valid, [key]: "" }), /together/);
  assert.throws(() => readAuthConfig({ ...valid, BETTER_AUTH_SECRET: " ".repeat(40) }));
});
test("each sign-in method is enabled only by its own complete variables", () => {
  const both = readAuthConfig(valid)!;
  assert.deepEqual(both.allowedEmails, ["owner@example.com", "second@example.com"]);
  assert.deepEqual(both.github, { clientId: "test", clientSecret: "test", allowedIds: ["110749578"] });
  assert.equal(both.accountSetupOpen, true);
  const emailOnly = readAuthConfig({ ...valid, ...noGithub })!;
  assert.equal(emailOnly.github, null);
  assert.deepEqual(emailOnly.allowedEmails, ["owner@example.com", "second@example.com"]);
  const emailWithStaleIds = readAuthConfig({ ...valid, GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "" })!;
  assert.equal(emailWithStaleIds.github, null, "a lone ALLOWED_GITHUB_IDS leaves GitHub disabled");
  assert.deepEqual(emailWithStaleIds.allowedEmails, ["owner@example.com", "second@example.com"]);
  const githubOnly = readAuthConfig({ ...valid, ALLOWED_EMAILS: "" })!;
  assert.deepEqual(githubOnly.allowedEmails, []);
  assert.equal(githubOnly.github?.allowedIds[0], "110749578");
  for (const flag of ["", "TRUE", "yes", "1", "false"]) assert.equal(readAuthConfig({ ...valid, ACCOUNT_SETUP_OPEN: flag })?.accountSetupOpen, false);
});
test("only fixed HTTPS origins or explicit loopback HTTP are accepted", () => {
  for (const origin of ["http://radar.example.com", "https://user:pass@radar.example.com", "https://radar.example.com/next", "https://radar.example.com?next=evil", "https://radar.example.com#fragment", "file:///C:/tmp", "http://localhost.evil.example"]) assert.throws(() => readAuthConfig({ ...valid, BETTER_AUTH_URL: origin }));
  assert.equal(readAuthConfig({ ...valid, BETTER_AUTH_URL: "http://127.0.0.1:3000" })?.baseURL, "http://127.0.0.1:3000");
});
test("GitHub allowlist accepts at most two distinct immutable numeric IDs", () => {
  assert.deepEqual(parseAllowedGithubIds("110749578, 123"), ["110749578", "123"]);
  for (const ids of ["", "npstewart87", "1,1", "1,2,3", "01", "-1", "1.0", "1e3", "1,", "0", "1\n2", "123456789012345678901"]) assert.throws(() => parseAllowedGithubIds(ids));
});
test("email allowlist accepts at most two distinct addresses, compared case-insensitively", () => {
  assert.deepEqual(parseAllowedEmails("Nick@Example.com ,member2@example.org"), ["nick@example.com", "member2@example.org"]);
  for (const emails of ["", "nick", "nick@", "@example.com", "nick@example", "a@b.c,a@b.c", "A@b.c,a@B.c", "a@b.c,d@e.f,g@h.i", "a b@c.d", "a@b.c,", "a@b.c,,d@e.f", `${"x".repeat(250)}@example.com`]) assert.throws(() => parseAllowedEmails(emails));
});
test("email, login, coercion, or absent MFA never grant a GitHub identity", () => {
  const user = { githubId: "110749578", githubLogin: "npstewart87", githubMfa: true };
  assert.equal(isAllowedIdentity(user, ["110749578"]), true);
  assert.equal(isAllowedIdentity(user, []), false);
  for (const update of [{ githubId: 110749578 }, { githubId: "1" }, { githubMfa: false }, { githubMfa: "true" }, { githubMfa: null }, { githubLogin: "" }, { githubId: undefined, email: "owner@example.com" }]) assert.equal(isAllowedIdentity({ ...user, ...update }, ["110749578"]), false);
});
test("email identities pass only by allowlisted address, and an address never rescues a foreign GitHub identity", () => {
  const config = { allowedEmails: ["owner@example.com"], github: { clientId: "x", clientSecret: "y", allowedIds: ["110749578"] } };
  assert.equal(isAllowedUser({ email: "Owner@Example.com", githubId: null, githubLogin: null, githubMfa: null }, config), true);
  assert.equal(isAllowedUser({ email: "owner@example.com" }, config), true);
  assert.equal(isAllowedUser({ email: "other@example.com" }, config), false);
  assert.equal(isAllowedUser({ email: 42 }, config), false);
  assert.equal(isAllowedUser({ email: "owner@example.com", githubId: "999", githubLogin: "outsider", githubMfa: true }, config), false);
  assert.equal(isAllowedUser({ email: "anything@example.com", githubId: "110749578", githubLogin: "npstewart87", githubMfa: true }, config), true);
  assert.equal(isAllowedUser({ email: "owner@example.com" }, { allowedEmails: [], github: null }), false);
  assert.equal(isAllowedUser({ githubId: "110749578", githubLogin: "npstewart87", githubMfa: true }, { allowedEmails: ["owner@example.com"], github: null }), false);
});
test("signout origin requires exact configured scheme, host and port", () => {
  assert.equal(isSameOrigin(new Request(valid.BETTER_AUTH_URL, { headers: { origin: valid.BETTER_AUTH_URL } }), valid.BETTER_AUTH_URL), true);
  for (const origin of ["null", "https://radar.example.com.evil.test", "http://radar.example.com", "https://radar.example.com:444"]) assert.equal(isSameOrigin(new Request(valid.BETTER_AUTH_URL, { headers: { origin } }), valid.BETTER_AUTH_URL), false);
  assert.equal(isSameOrigin(new Request(valid.BETTER_AUTH_URL), valid.BETTER_AUTH_URL), false);
});
