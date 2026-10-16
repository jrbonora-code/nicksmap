> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Dates, revisions, findings and verification claims below apply only to the recorded work; they do not establish current status or resolved findings.

# Original checkout reconciliation — September 14, 2026

A file-by-file decision on undeployed original-checkout edits, incorporation of useful work and a clean checkout was requested. Review compared original base `1ddcff8` and its 40 modified/untracked files with deployed release `e072d4d`. Independent documentation and UI reviews supplemented the main comparison.

## Disposition

| Original files | Decision |
| --- | --- |
| `AGENTS.md` | Already matches the released instructions; no additional change. |
| `CLAUDE.md`, `README.md`, `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/WORKSPACE.md`, root `HANDOFF.md` | Consolidate useful checkout/release guidance in current entrypoints; remove stale branch and undeployed-polish claims. Archive the obsolete root pointer. |
| `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `docs/DECISIONS.md`, `docs/SOURCES-AND-REUSE.md` | Retain the reset's aggregation/map/screener requirements, native record grain, scoped decision gates and source/reuse references. Update status to the actual release; retain future underwriting boundaries. Correct the old architecture claim that startup applies migrations. |
| `docs/DEPLOYMENT.md`, `docs/DESIGN.md` | Current deployment and institutional identity guidance supersedes the old reset notices and green theme. |
| `docs/adr/0001-private-workspace.md`, four `docs/reviews/2026-09-12-*.md` files | Preserve substantive history and add historical-context notices so old reviews and the manual-first scope do not govern the current release. |
| The dated September 12 handoff and the `docs/rebuild/*.md` records | Already retained in current source. Five match after line-ending normalization; four differ only by current historical context. No research corpus is missing. |
| `app/(workspace)/overview/page.tsx`, `components/workspace/deals-table.tsx`, `components/workspace/deal-detail.tsx` | Salvage exact asking-price display with USD labels, explicit missing units and accessible table navigation. Preserve current layouts, stage filters and next actions. |
| `components/workspace/sidebar.tsx` | Salvage the exact mobile/desktop breakpoint boundary. Preserve current research navigation, branding and footer. |
| `app/globals.css` | Salvage table keyboard-focus cues in current colors; archive the obsolete theme and responsive rewrite. |
| `app/(workspace)/deals/page.tsx`, `app/(workspace)/loading.tsx`, `app/icon.svg`, both sign-in pages, sign-in CSS, `components/workspace/county-map.tsx`, `components/architectural-study.tsx` | Superseded cosmetic work: green colors, renamed headings, decorative art and sign-in copy. No missing backend, authentication, ingestion or persistence behavior. Archive without deploying. |

Copying the old UI wholesale would remove research navigation and the shared disclaimer, replace next-action columns, reintroduce excess copy, and undo mobile touch-target improvements. The narrow retained changes preserve the current BlackFin design. Asking-price formatting uses the existing cents formatter; financial formulas and stored values are unchanged.

Browser verification also exposed a hidden absolute-positioned table heading escaping its scroll container: the document measured 879px wide at a 390px viewport. Positioning the scroll container relatively reduced it to 390px; removing that change reproduced 879px. The final CSS contains the heading within the table scroller while preserving horizontal keyboard scrolling.

## Preservation and cleanup

All 40 original files were copied byte-for-byte to `.local/archive/2026-09-14-original-checkout/` under the original workspace, with a SHA-256 manifest, original base revision and binary Git patch. Each source and archive hash was rechecked before explicitly restoring only the listed tracked paths and removing only the verified duplicate untracked files. Original `main` was then fast-forwarded to the released source. No broad reset or clean command was used.

The archive README describes recovery into an isolated worktree at the recorded base. Private source acquisitions, databases, credentials, prior reviews and Git worktrees remain at their existing paths and stay excluded from Git/deployment.

## Verification

- `npm run check` passed after the final CSS fix: lint/types, 133 passing unit tests, 16 detected financial fault injections, production build and unauthenticated HTTP smoke. One existing database-dependent workspace test is skipped by the unit command; CI runs separate database integration procedures.
- Authenticated browser checks used only an isolated loopback QA database and three temporary fixtures. `$1,234,567.89`, `$0.00` and missing values were verified across overview, Deals and detail; USD headings and explicit missing units passed.
- Named focusable scroll regions, column scopes, keyboard focus/row highlighting, search/stage filtering, retained next actions, mobile keyboard scrolling and absence of page-wide overflow passed. Opening the drawer at 780px and resizing to 781px cleared the modal/inert state. Research navigation and the disclaimer remained present.
- Desktop/mobile captures were inspected. The three fixtures and temporary session were removed, private browser-state files deleted, and the local app/database stopped after QA.
- GitHub CI and actual Railway revision/status must match the merged release before delivery is reported. Private receipts record those post-merge checks without changing historical evidence in this report.

Dated local archive manifests remain private; this review contains no source exports or credentials. No migrations, authentication configuration or production data changes are part of this update.
