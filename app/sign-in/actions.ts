"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readAuthConfig } from "../../lib/auth/policy";
import { getAuth, isAuthConfigured } from "../../lib/auth/server";

export type CreatePasswordState = { error?: string; fields?: Record<string, string>; values?: { email: string } };

// One message for every refusal that would otherwise reveal which addresses are enabled.
const REFUSED = "That address cannot be set up right now. Check it, or ask the workspace owner whether account setup is open.";

export async function createPasswordAction(_previous: CreatePasswordState, formData: FormData): Promise<CreatePasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const values = { email };
  if (!isAuthConfigured()) return { error: "Sign-in is being configured.", values };
  const config = readAuthConfig()!;
  if (!config.allowedEmails.length || !config.accountSetupOpen) return { error: "Account setup is closed.", values };

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fields: Record<string, string> = {};
  if (!email) fields.email = "Enter the email address enabled for this workspace.";
  if (password.length < 12 || password.length > 128) fields.password = "Use 12 to 128 characters.";
  if (confirm !== password) fields.confirm = "Passwords do not match.";
  if (Object.keys(fields).length) return { error: "Fix the highlighted fields.", fields, values };
  if (!config.allowedEmails.includes(email)) return { error: REFUSED, values };

  const auth = getAuth();
  const context = await auth.$context;
  const existing = await context.internalAdapter.findUserByEmail(email, { includeAccounts: true });
  if (existing?.accounts.some(account => account.providerId === "credential")) return { error: "A password already exists for this address. Sign in instead.", values };
  if (existing?.user) return { error: REFUSED, values };

  let response: Response;
  try {
    // Runs Better Auth's own hashing, transaction and the allowlist hooks. The session it
    // creates is not forwarded; the user signs in once with the password they just set.
    response = await auth.api.signUpEmail({ body: { name: email.split("@")[0], email, password }, headers: await headers(), asResponse: true });
  } catch {
    return { error: REFUSED, values };
  }
  if (!response.ok) return { error: REFUSED, values };
  redirect("/sign-in?created=1");
}
