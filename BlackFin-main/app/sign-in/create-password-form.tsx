"use client";

import { useActionState } from "react";
import { ArrowUpRight, KeyRound } from "lucide-react";
import { createPasswordAction, type CreatePasswordState } from "./actions";
import styles from "./sign-in.module.css";

const initial: CreatePasswordState = {};

export function CreatePasswordForm() {
  const [state, action, pending] = useActionState(createPasswordAction, initial);
  const invalid = (name: string) => state.fields?.[name] ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {};
  return <form className={styles.form} action={action} noValidate>
    <label htmlFor="email">Email</label>
    <input id="email" name="email" type="email" autoComplete="username" required disabled={pending} defaultValue={state.values?.email ?? ""} {...invalid("email")} />
    {state.fields?.email && <p id="email-error" className={styles.error}>{state.fields.email}</p>}
    <label htmlFor="password">New password</label>
    <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={pending} {...invalid("password")} />
    {state.fields?.password && <p id="password-error" className={styles.error}>{state.fields.password}</p>}
    <label htmlFor="confirm">Confirm password</label>
    <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={pending} {...invalid("confirm")} />
    {state.fields?.confirm && <p id="confirm-error" className={styles.error}>{state.fields.confirm}</p>}
    <button type="submit" disabled={pending} aria-busy={pending}><KeyRound size={19} />{pending ? "Saving…" : "Create password"}<ArrowUpRight size={18} /></button>
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
  </form>;
}
