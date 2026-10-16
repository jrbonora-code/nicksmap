"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient } from "../../lib/auth/client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await authClient.signOut();
      if (response.error) throw new Error("Sign-out failed");
      // Discard the in-memory authenticated page and navigate after revocation.
      window.location.replace("/sign-in");
    } catch {
      setError("Sign-out could not complete. Please try again.");
      setPending(false);
    }
  }
  return <><button className="button button-secondary full-width" type="button" onClick={signOut} disabled={pending} aria-busy={pending}><LogOut size={16} />{pending ? "Signing out…" : "Sign out"}</button>{error && <p className="field-error" role="alert">{error}</p>}</>;
}
