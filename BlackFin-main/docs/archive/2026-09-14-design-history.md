# Archived visual-system notes

> Historical evidence only. Follow [current handoff](../HANDOFF.md), [project instructions](../../AGENTS.md) and the current runbook. Old state and commands below are not active instructions.

# Current research interface guidance — September 14, 2026

The current content rule is to keep the research interface concise: instructional text belongs in `(i)` help, and supporting context belongs in compact badges with disclosures. Repeated explanatory prose is easily ignored.

- Keep primary data, units, dates, substantive status and actionable errors inline. Missing or conflicting evidence must remain visible without opening help.
- Put instructions and definitions in `InfoHint` help available on hover, keyboard focus and tap. Do not rely on hover alone; mobile users must be able to open and dismiss the explanation.
- Represent evidence limitations with a short, explicit badge and an accessible popup/disclosure for the detail. The badge must communicate the limitation before it is opened.
- Keep source access discoverable beside the relevant observation. Help and disclosures must not conceal missing/conflict status, prevent source inspection or make a financial result appear more certain.
- Omit marketing mottos, repeated guidance and generic footnote prose. Place explanation at the control, value or status it explains.

Apply this rule to the delivered `/research` workflow. Verify focus, tap targets, popup placement and readable disclosure content on desktop and mobile. See [HANDOFF.md](../HANDOFF.md) for current implementation work.

## Current BlackFin identity — September 14, 2026

Use the exact BlackFin name and supplied logo geometry. The identity is institutional and restrained: porcelain `#f4f5f5`, white surfaces, ink `#111f27`, slate `#526773` and accent `#284f60`. The shared mark and wordmark use one color; preserve their proportions and use the existing bundled Manrope typeface.

Use the original dot-matrix fin rather than the solid silhouette. Preserve the 37-dot geometry and use a compact 5px gap between the mark and BlackFin in the app. The downloadable outlined logo uses the same dot pattern and tight spacing. This logo exception does not reintroduce decorative dot backgrounds.

The disclaimer is visible at the bottom as a muted-grey text footer, rather than a disclosure badge. Use small, readable text explaining internal research use, third-party data limitations, illustrative assumptions and independent verification. This footer is an exception to the general help/badge rule. Keep existing evidence limitations visible alongside the data and do not invent regulatory affiliations, endorsements or guarantees.

Use light borders and precise 4px control/panel corners. Remove gradients, decorative dot textures, floating-card shadows and rounded bubble treatments. Sign-in is sparse: a strong BlackFin identity, the title “Sign in,” credentials and necessary account status/actions. Marketing slogans and repeated coverage/privacy footers do not belong in the flow. Controls retain at least 44px mobile touch targets, 16px input text and visible keyboard focus.

This identity rule supersedes conflicting colors, textures and shapes in the historical visual-system record below. It does not change authentication or evidence requirements.

## Historical context: visual direction

The following visual-system record is retained for provenance and existing component details. County-map and manual-workspace descriptions refer to the earlier foundation; the linked research map and dense screener define the current primary workflow. The content rule above governs current polish.

# BlackFin visual direction

## Direction

BlackFin means finance, with a secondary coastal association. The requested direction is light, modern, clean and softly futuristic, with light blue and subtle dot-matrix character. There is no dark theme in this release.

## Visual system

| Role | Color / treatment |
| --- | --- |
| Canvas | Porcelain blue `#f5f8fc` |
| Primary surface | White; subtle cool borders and low elevation |
| Primary ink | `#202d40` |
| Secondary ink | `#41566e` |
| Muted text | `#586c82` |
| Primary action | `#2469b4` with white text |
| Selection | Ice blue `#e9f3ff` with dark blue text and `#c7ddf3` borders |
| Error | `#a53732`; retain warning/positive colors for actual semantic states |
| Typography | Self-hosted Manrope, with system monospace for instrumentation and numeric alignment |
| Shape | 14px panels, 9–11px controls, thin borders, restrained shadows |

The original dot-matrix fin appears in the wordmark and favicon. Static dot textures belong in decorative areas such as the login background and the statewide card; they do not sit behind financial tables. Use calm, legible type for money and research. Icons supplement labels, and color alone does not express selection, risk or evidence status.

The county map uses neutral blue-gray for counties with no entered deals, pale blue for counties with entered deals, and a stronger blue selection outline. Counts describe workspace records, not successful projects or verified source coverage. Preserve unknowns, error messages, source notes and contrasting status badges.

## Implementation and accessibility

- Tokens and workspace components: `app/globals.css`.
- Shared SVG mark and wordmark: `components/brand.tsx`; application icon: `app/icon.svg`.
- Sign-in composition: `app/sign-in/sign-in.module.css`.
- Locally hosted font and unmodified SIL Open Font License: `public/fonts/`; see provenance in that directory.
- Keep keyboard focus visible, respect reduced motion, and retain the existing accessible mobile navigation behavior.
- Styling changes must pass repository checks and browser review of sign-in, overview, table, forms, financial results and map. A requested viewport size alone is not mobile verification: confirm the rendered dimensions.
- Financial, access, mandate, data-coverage and deployment readiness are independent of the visual theme. This design does not introduce data, success grades, eligibility claims or return assumptions.
