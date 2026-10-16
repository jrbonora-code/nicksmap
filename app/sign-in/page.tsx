import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { BlackFinWordmark, FinMark } from "../../components/brand";
import { ResearchDisclosures } from "../../components/research-disclosures";
import { readAuthConfig } from "../../lib/auth/policy";
import { getWorkspaceSession } from "../../lib/auth/session";
import { isAuthConfigured } from "../../lib/auth/server";
import { EmailSignInForm } from "./email-sign-in-form";
import { SignInButton } from "./sign-in-button";
import styles from "./sign-in.module.css";

export const metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
  if (await getWorkspaceSession()) redirect("/research");
  const configured = isAuthConfigured();
  const config = configured ? readAuthConfig() : null;
  const params = await searchParams;
  const failed = Boolean(params.error);
  const created = params.created === "1";
  const emailEnabled = (config?.allowedEmails.length ?? 0) > 0;
  const githubEnabled = Boolean(config?.github);
  return <main className={styles.page}>
    <div className={styles.brand}><FinMark className={styles.brandMark} /><BlackFinWordmark /></div>
    <section className={styles.card}>
      <span className={styles.eyebrow}><LockKeyhole size={14} /> PRIVATE WORKSPACE</span>
      <h1>Sign in</h1>
      {created && <p className={styles.success} role="status">Your password is set. Sign in below.</p>}
      {configured ? <>
        {emailEnabled && <EmailSignInForm />}
        {emailEnabled && githubEnabled && <p className={styles.divider}>OR</p>}
        {githubEnabled && <SignInButton />}
        {emailEnabled && config?.accountSetupOpen && <p className={styles.note}>First time here? <Link href="/sign-in/create-password">Create your password</Link>.</p>}
      </> : <div className={styles.setup} role="status"><strong>Sign-in is being configured.</strong><p>The workspace will open once its identity connection is ready.</p></div>}
      {failed && <p className={styles.error} role="alert">Sign-in was not completed. Check your address and password, or use an enabled GitHub account with two-factor authentication.</p>}
    </section>
    <ResearchDisclosures />
  </main>;
}
