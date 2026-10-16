> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Dates, revisions, findings and verification claims below apply only to the recorded work; they do not establish current status or resolved findings.

# Mobile polish and review disposition — September 14, 2026

Scope: local changes on `codex/mobile-polish-20260913`, based on delivered revision `a685d6c`. No production mutation, new acquisition, schema migration or financial arithmetic change.

## Changes

- Saved analyses and import history distinguish loading, empty results and failures. HTTP errors and malformed list responses are visible; retries recover and failed requests clear stale rows. In-flight requests are cancelled on replacement/unmount. Saved-list refresh follows explicit save/reload actions rather than unrelated notifications.
- New scenario dates use America/New_York, with deterministic date injection for tests. Explicit and saved dates retain their values; threshold-1 arithmetic is unchanged.
- Mobile controls and grid rows have larger touch targets; forms wrap, the screener scrolls horizontally within its panel, and selected evidence appears before the map. The inspector accepts focus and Escape, and closing restores the recreated grid cell via AG Grid's focus API. The grid's automatic focus restoration is suppressed only on mobile.
- Map controls expose pressed states and clearer two-corner area instructions. Cancelling drawing restores the prior boundary. Coarse pointers receive a larger selection area and cooperative map gestures.
- Current README/setup/handoff/roadmap replace stale entrypoint guidance. The September 12 handoff is retained in a dated archive. Original-checkout historical review files were restored. Ten old local build logs were archived with before/after SHA-256 checks; acquisitions, credentials, backups and worktrees were preserved.

## Verification

- `npm run check`: lint, typecheck, 133 passing tests and 16 detected financial fault injections, production build and unauthenticated smoke checks. One pre-existing database-dependent workspace test is skipped without its dedicated database configuration. The suite is not underwriting signoff.
- Date regressions: four failing cases reproduced before the fix; twelve cases now pass, including EDT/EST evenings, local-midnight boundaries and preservation of explicit/saved dates.
- Authenticated browser checks used the existing isolated loopback QA database containing the retained research snapshot. Controlled 503 responses for saved analyses/history, a 401 response and a malformed 200 history response produced visible errors and recovered through retry; stale history tables were absent.
- Reopening the same saved analysis after changing a filter passed. Grok's constant-select-value diagnosis was not reproduced: React resets the selector to its placeholder after selection.
- Keyboard regression: Enter on a mobile grid cell focuses the inspector; Escape closes it, restores a current grid cell and clears the row highlight. Browser focus tracing reproduced the grid reclaiming focus before the final fix.
- Specialist responsive browser QA covered 320×780, 390×844, 780×1024, 820×1180 and 1440×1000 without document horizontal overflow, including advanced filters, assumptions, licenses and the inspector. Inspected mobile/tablet/desktop screenshots preserve the dense desktop layout. iPhone 13 touch emulation verified row-tap selection, inspector focus/close, two-tap rectangular filtering, drawing cancellation and OZ/region controls. No JavaScript errors were observed in that flow; development-only stylesheet preload warnings remained. Two-finger gesture behavior on physical devices is unverified.
- Documentation review checked 55 local links and preservation of the archived handoff body. `git diff --check` passed.

Private browser scripts, screenshots and logs remain ignored under `.local/` and `output/playwright/`. Viewport emulation does not establish physical iOS/Android behavior. Historical production receipts describe the September 13 release, not deployment of these changes.
