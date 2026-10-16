import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { BlackFinWordmark, FinMark } from "../../../components/brand";
import { ResearchDisclosures } from "../../../components/research-disclosures";
import { readAuthConfig } from "../../../lib/auth/policy";
import { isAuthConfigured } from "../../../lib/auth/server";
import { getWorkspaceSession } from "../../../lib/auth/session";
import { CreatePasswordForm } from "../create-password-form";
import styles from "../sign-in.module.css";

export const metadata = { title: "Create password" };

export default async function CreatePassword() {
  if (await getWorkspaceSession()) redirect("/research");
  const config = isAuthConfigured() ? readAuthConfig() : null;
  const open = Boolean(config && config.allowedEmails.length > 0 && config.accountSetupOpen);
  return <main className={styles.page}>
    <div className={styles.brand}><FinMark className={styles.brandMark} /><BlackFinWordmark /></div>
    <section className={styles.card}>
      <span className={styles.eyebrow}><KeyRound size={14} /> FIRST SIGN-IN</span>
      <h1>Create your password</h1>
      <p>Use your enabled email address and a password of at least 12 characters.</p>
      {open ? <CreatePasswordForm /> : <div className={styles.setup} role="status"><strong>Account setup is closed.</strong><p>Ask the workspace owner to open it, then return here.</p></div>}
      <p className={styles.note}><Link href="/sign-in">Back to sign in</Link></p>
    </section>
    <ResearchDisclosures />
  </main>;
}
