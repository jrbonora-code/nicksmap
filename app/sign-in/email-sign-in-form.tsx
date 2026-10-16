"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, LogIn } from "lucide-react";
import { authClient } from "../../lib/auth/client";
import styles from "./sign-in.module.css";

export function EmailSignInForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await authClient.signIn.email({ email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? ""), callbackURL: "/research" });
      if (response.error) { setError("Sign-in failed. Check your address and password."); setPending(false); }
    } catch { setError("Sign-in is temporarily unavailable. Please try again."); setPending(false); }
  }
  return <form className={styles.form} onSubmit={submit} noValidate>
    <label htmlFor="email">Email</label>
    <input id="email" name="email" type="email" autoComplete="username" required disabled={pending} />
    <label htmlFor="password">Password</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required disabled={pending} />
    <button type="submit" disabled={pending} aria-busy={pending}><LogIn size={19} />{pending ? "Signing in…" : "Sign in"}<ArrowUpRight size={18} /></button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </form>;
}
