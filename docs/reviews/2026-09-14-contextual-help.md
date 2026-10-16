> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Dates, revisions, findings and verification claims below apply only to the recorded work; they do not establish current status or resolved findings.

# Contextual help — September 14, 2026

The research workspace now puts instructions in small information controls and supporting context in badges with popups. Repeated footer text and explanatory paragraphs were removed from the default view. Values, units, dates, errors and concise missing/conflict indicators remain visible. Source records and financing sensitivity remain accessible.

Reusable `InfoHint` controls open on hover, keyboard focus or tap. `ContextBadge` disclosures open on activation. Native top-layer popovers remain within the viewport and escape scroll-container clipping; Escape closes the popup without closing its property inspector, and returns focus to its trigger. Outside interaction dismisses the popup. Mobile controls have 44px touch targets.

Validation: `npm run check` passed (133 tests, 16 financial fault injections, production build and smoke checks). One existing database-dependent workspace test was skipped. Authenticated browser checks against the isolated local snapshot passed for desktop and iPhone touch emulation, including 320px layout, hover/focus/tap, dismissal, focus restoration, all research tabs and the five-case financing sensitivity table. Screenshots were inspected; no document overflow or popup clipping was observed. Physical-device behavior remains unverified.

No financial formulas, imports, schema or production deployment changed. Private QA artifacts remain ignored. The content rule is recorded in [DESIGN.md](../DESIGN.md).
