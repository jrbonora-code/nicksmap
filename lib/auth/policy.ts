export type GithubAuthConfig = { clientId: string; clientSecret: string; allowedIds: string[] };

export type AuthConfig = {
  baseURL: string;
  secret: string;
  /** Lower-cased addresses that may create a password and sign in. Empty disables email sign-in. */
  allowedEmails: string[];
  /** While true, an allowlisted address without a password may create one. Close it once both users are in. */
  accountSetupOpen: boolean;
  /** Present only when all three GitHub variables are configured. */
  github: GithubAuthConfig | null;
};

export function parseAllowedGithubIds(value: string): string[] {
  const ids = value.split(",").map(id => id.trim());
  if (ids.length < 1 || ids.length > 2 || ids.some(id => !/^[1-9]\d{0,19}$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Configure one or two distinct numeric GitHub account IDs.");
  }
  return ids;
}

export function parseAllowedEmails(value: string): string[] {
  const emails = value.split(",").map(email => email.trim().toLowerCase());
  const shape = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
  if (emails.length < 1 || emails.length > 2 || emails.some(email => email.length > 254 || !shape.test(email)) || new Set(emails).size !== emails.length) {
    throw new Error("Configure one or two distinct email addresses.");
  }
  return emails;
}

export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  const { BETTER_AUTH_URL, BETTER_AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ALLOWED_GITHUB_IDS, ALLOWED_EMAILS, ACCOUNT_SETUP_OPEN } = env;
  if (![BETTER_AUTH_URL, BETTER_AUTH_SECRET, env.DATABASE_URL].every(Boolean)) return null;
  // GitHub is enabled only by its OAuth app credentials. A credential without its partner or
  // without an ID list is a misconfiguration; an ID list alone (the historical default in the
  // Railway IaC) simply leaves GitHub disabled.
  const githubCredentials = [GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET];
  const githubConfigured = githubCredentials.some(Boolean);
  if (githubConfigured && (!githubCredentials.every(Boolean) || !ALLOWED_GITHUB_IDS)) throw new Error("Configure GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and ALLOWED_GITHUB_IDS together, or none of the credentials.");
  if (!githubConfigured && !ALLOWED_EMAILS) return null;
  const url = new URL(BETTER_AUTH_URL!);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) {
    throw new Error("Authentication requires a fixed HTTPS origin (HTTP is allowed only on loopback).");
  }
  if (BETTER_AUTH_SECRET!.trim().length < 32) throw new Error("Authentication secret must have at least 32 characters.");
  return {
    baseURL: url.origin,
    secret: BETTER_AUTH_SECRET!,
    allowedEmails: ALLOWED_EMAILS ? parseAllowedEmails(ALLOWED_EMAILS) : [],
    accountSetupOpen: ACCOUNT_SETUP_OPEN === "true",
    github: githubConfigured ? { clientId: GITHUB_CLIENT_ID!, clientSecret: GITHUB_CLIENT_SECRET!, allowedIds: parseAllowedGithubIds(ALLOWED_GITHUB_IDS!) } : null
  };
}

/** A GitHub identity is allowed only by numeric ID, with GitHub two-factor on and a non-empty login. */
export function isAllowedIdentity(user: Record<string, unknown>, allowedIds: readonly string[]): boolean {
  return typeof user.githubId === "string" && allowedIds.includes(user.githubId) &&
    user.githubMfa === true && typeof user.githubLogin === "string" && user.githubLogin.length > 0;
}

/** An email identity is allowed only when it carries no GitHub identity and its address is allowlisted. */
export function isAllowedEmail(user: Record<string, unknown>, allowedEmails: readonly string[]): boolean {
  return (user.githubId === null || user.githubId === undefined) &&
    typeof user.email === "string" && allowedEmails.includes(user.email.trim().toLowerCase());
}

/** Users with a GitHub identity must pass the GitHub allowlist; every other user must be an allowlisted address. An address match never rescues a foreign GitHub identity. */
export function isAllowedUser(user: Record<string, unknown>, config: Pick<AuthConfig, "allowedEmails" | "github">): boolean {
  if (user.githubId !== null && user.githubId !== undefined) return isAllowedIdentity(user, config.github?.allowedIds ?? []);
  return isAllowedEmail(user, config.allowedEmails);
}

export function isSameOrigin(request: Request, baseURL: string): boolean {
  return request.headers.get("origin") === baseURL;
}
