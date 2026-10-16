import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Pool } from "pg";
import { isAllowedEmail, isAllowedIdentity, isAllowedUser, isSameOrigin, type AuthConfig } from "./policy.ts";

// Kept free of Next.js globals so the actual auth configuration can be exercised
// against an isolated PostgreSQL database in integration tests.
export function createWorkspaceAuth(pool: Pool, config: AuthConfig) {
  const emailEnabled = config.allowedEmails.length > 0;
  const github = config.github;
  const allowedGithubIds = github?.allowedIds ?? [];

  // Sign-up creates the user, its credential and its session inside one Better Auth
  // transaction, so a hook must read the user through the transaction-aware adapter it is
  // handed. Direct adapter calls (tests, operator tools) carry no endpoint context; those
  // fall back to the pool, where the row is already committed.
  type HookContext = { context?: { internalAdapter?: { findUserById?: (id: string) => Promise<unknown> } } } | undefined;
  async function loadIdentity(userId: unknown, hookContext: unknown): Promise<Record<string, unknown> | undefined> {
    const finder = (hookContext as HookContext)?.context?.internalAdapter?.findUserById;
    if (finder) {
      const user = await finder(String(userId));
      if (user && typeof user === "object") return user as Record<string, unknown>;
      return undefined;
    }
    const result = await pool.query('SELECT "githubId", "githubLogin", "githubMfa", email FROM auth_user WHERE id = $1', [String(userId)]);
    return result.rows[0];
  }

  return betterAuth({
    appName: "BlackFin",
    baseURL: config.baseURL,
    secret: config.secret,
    database: pool,
    trustedOrigins: [config.baseURL],
    hooks: { before: createAuthMiddleware(async context => {
      const request = context.request;
      if (request?.method === "POST" && !isSameOrigin(request, config.baseURL)) throw new APIError("FORBIDDEN", { message: "Invalid origin." });
    }) },
    // Password creation is only reachable through the server action behind the
    // account-setup flag and the email allowlist; the HTTP /sign-up/email route is
    // refused by app/api/auth/[...all]/route.ts. autoSignIn keeps duplicate and
    // forbidden sign-ups as thrown errors instead of a generic synthetic success.
    emailAndPassword: emailEnabled
      ? { enabled: true, autoSignIn: true, requireEmailVerification: false, minPasswordLength: 12, maxPasswordLength: 128 }
      : { enabled: false },
    socialProviders: github ? {
      github: {
        clientId: github.clientId,
        clientSecret: github.clientSecret,
        overrideUserInfoOnSignIn: true,
        mapProfileToUser(profile) {
          // GitHub returns two_factor_authentication only in the private user response
          // (read:user or user scope). Its absence is a scope/configuration fault, not a denial.
          if (typeof profile.two_factor_authentication !== "boolean") {
            throw new APIError("FORBIDDEN", { message: "GitHub did not report two-factor status for this account. Check the OAuth app scopes before retrying." });
          }
          const identity = { githubId: String(profile.id), githubLogin: profile.login, githubMfa: profile.two_factor_authentication };
          if (!isAllowedIdentity(identity, allowedGithubIds)) {
            throw new APIError("FORBIDDEN", { message: "This account is not enabled for this workspace, or GitHub two-factor authentication is not enabled." });
          }
          return identity;
        }
      }
    } : {},
    user: {
      modelName: "auth_user",
      // Populated only by mapProfileToUser for GitHub identities; null for email identities
      // (db/004). Better Auth 1.7.4 drops `input: false` fields when it parses a provider
      // profile and then rejects the create, so that flag must not be set here. Clients still
      // cannot supply them: /sign-up/* and /update-user are refused by the route allowlist and
      // the account hook below refuses a credential account on any row carrying a GitHub identity.
      additionalFields: {
        githubId: { type: "string", required: false, unique: true },
        githubLogin: { type: "string", required: false },
        githubMfa: { type: "boolean", required: false }
      },
      deleteUser: { enabled: false },
      changeEmail: { enabled: false }
    },
    session: {
      modelName: "auth_session",
      expiresIn: 60 * 60 * 8,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      freshAge: 60 * 15
    },
    account: {
      modelName: "auth_account",
      accountLinking: { enabled: false, disableImplicitLinking: true },
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      storeAccountCookie: false
    },
    verification: { modelName: "auth_verification" },
    rateLimit: { enabled: true, storage: "database", modelName: "auth_rate_limit", window: 60, max: 60, customRules: { "/sign-in/social": { window: 60, max: 10 }, "/sign-in/email": { window: 60, max: 10 } } },
    advanced: {
      useSecureCookies: config.baseURL.startsWith("https://"),
      cookiePrefix: "radar",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      database: { generateId: "uuid" }
    },
    databaseHooks: {
      user: { create: { before: async user => {
        if (user.githubId !== null && user.githubId !== undefined) {
          if (!isAllowedIdentity(user, allowedGithubIds)) throw new APIError("FORBIDDEN");
          return;
        }
        if (!emailEnabled || !config.accountSetupOpen || !isAllowedEmail(user, config.allowedEmails)) {
          throw new APIError("FORBIDDEN", { message: "This address is not enabled for this workspace, or account setup is closed." });
        }
      } } },
      account: { create: { before: async (account, hookContext) => {
        if (account.providerId === "credential") {
          const identity = await loadIdentity(account.userId, hookContext);
          if (!emailEnabled || !config.accountSetupOpen || !identity || !isAllowedEmail(identity, config.allowedEmails)) throw new APIError("FORBIDDEN");
          return;
        }
        if (account.providerId !== "github" || !allowedGithubIds.includes(account.accountId)) throw new APIError("FORBIDDEN");
      } } },
      session: { create: { before: async (session, hookContext) => {
        const identity = await loadIdentity(session.userId, hookContext);
        if (!identity || !isAllowedUser(identity, config)) throw new APIError("FORBIDDEN");
      } } }
    },
    // Avoid provider responses or credentials appearing in application logs.
    logger: { disabled: true }
  });
}
