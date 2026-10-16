> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Dates, revisions, findings and verification claims below apply only to the recorded work; they do not establish current status or resolved findings.

# BlackFin identity — September 14, 2026

An institutional BlackFin identity and uppercase short statistical labels were requested. The research masthead and shared navigation now use ink, with porcelain/white work surfaces and restrained slate accents. The bundled Manrope typeface, a solid fin silhouette and the exact single-color BlackFin wordmark are consistent across research, supporting routes and sign-in. Primary statistical labels are uppercase with prominent tabular figures; other content retains normal case.

The logo component and favicon share the same fin path. `public/brand/blackfin-logo.svg` is a reusable vector with Manrope 750 letter outlines, so its lettering does not depend on an installed font. No new dependencies or external font services were added. Sign-in and shell slogans were removed; account actions, errors and existing research disclosures remain available.

`npm run check` passed: lint, typecheck, 133 tests, 16 financial fault injections, production build and smoke checks. One existing database-dependent workspace test was skipped. The smoke assertion was updated from the retired greeting to the explicit Sign in heading. No financial arithmetic, authentication policy, schema or source observations changed.

Authenticated desktop browser checks used the isolated loopback QA snapshot: loaded map/screener, four statistical values and labels, property inspector/popups, shared navigation and brand links back to research. Responsive checks at 320, 390, 780, 820 and 1440px found no page overflow. The specialist exercised iPhone touch emulation, navigation targets, inspector/popups, Escape/focus restoration and 320px sign-in. Tablet metric alignment, narrow navigation targets and the dark-sidebar close icon contrast were corrected and rechecked. A positional legend rule was scoped to the imagery credit so both map markers remain visible at every checked width.

Sign-in, research, shared navigation and vector-logo screenshots were inspected. Physical-device behavior remains unverified. Private captures and QA scripts remain ignored; no production deployment is implied.
