"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BlackFinWordmark, FinMark } from "../brand";
import { ResearchDisclosures } from "../research-disclosures";
import type { WorkspaceUser } from "../../lib/workspace/types";
import "../research/workspace.css";

const navigation = [
  { href: "/research", label: "Research" },
  { href: "/research/oz-eb5", label: "OZ / EB-5" },
  { href: "/ideas", label: "Ideas" },
  { href: "/research/cases", label: "Cases" },
  { href: "/deals", label: "Saved deals" },
  { href: "/settings", label: "Settings" },
  { href: "/overview", label: "Overview" },
  { href: "/counties", label: "Florida coverage" },
];

export function WorkspaceShell({ user, children }: { user: WorkspaceUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const research = pathname === "/research" || pathname.startsWith("/research/");
  const active = navigation.filter(item => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return <div className="research-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="research-appbar">
      <Link href="/research" className="brand"><FinMark /><BlackFinWordmark /></Link>
      <nav aria-label="Workspace navigation">{navigation.map(({ href, label }) =>
        <Link key={href} href={href} className={active === href ? "active" : undefined} aria-current={active === href ? "page" : undefined}>{label}</Link>
      )}</nav>
      <span className="research-user">{user.name} · Private workspace</span>
    </header>
    <main id="main-content" className={research ? undefined : "main-content"}>{children}</main>
    {/* The property and OZ / EB-5 pages are full height; their About sheets carry the same disclosure. */}
    {pathname === "/research" || pathname.startsWith("/research/oz-eb5") ? null : <ResearchDisclosures />}
  </div>;
}
