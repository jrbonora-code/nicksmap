"use client";

import { useState } from "react";
import { authClient } from "../../lib/auth/client";
import { ArrowUpRight, LogIn } from "lucide-react";

export function SignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setPending(true); setError("");
    try {
      const response = await authClient.signIn.social({ provider: "github", callbackURL: "/research", errorCallbackURL: "/sign-in?error=failed" });
      if (response.error) { setError("Sign-in could not start. Please try again."); setPending(false); }
    } catch { setError("Sign-in is temporarily unavailable. Please try again."); setPending(false); }
  }
  return <><button type="button" onClick={signIn} disabled={pending} aria-busy={pending}><LogIn size={19} />{pending ? "Connecting to GitHub…" : "Continue with GitHub"}<ArrowUpRight size={18} /></button>{error && <p role="alert">{error}</p>}</>;
}
