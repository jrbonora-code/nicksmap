# Current research interface guidance — September 14, 2026

The current content rule is to keep the research interface concise: instructional text belongs in `(i)` help, and supporting context belongs in compact badges with disclosures. Repeated explanatory prose is easily ignored.

- Keep primary data, units, dates, substantive status and actionable errors inline. Missing or conflicting evidence must remain visible without opening help.
- Put instructions and definitions in `InfoHint` help available on hover, keyboard focus and tap. Do not rely on hover alone; mobile users must be able to open and dismiss the explanation.
- Represent evidence limitations with a short, explicit badge and an accessible popup/disclosure for the detail. The badge must communicate the limitation before it is opened.
- Keep source access discoverable beside the relevant observation. Help and disclosures must not conceal missing/conflict status, prevent source inspection or make a financial result appear more certain.
- Omit marketing mottos, repeated guidance and generic footnote prose. Place explanation at the control, value or status it explains.

Apply this rule to the delivered `/research` workflow. Verify focus, tap targets, popup placement and readable disclosure content on desktop and mobile. See [HANDOFF.md](HANDOFF.md) for current implementation work.

## Current BlackFin identity — September 14, 2026

Use the exact BlackFin name and supplied logo geometry. The identity is institutional and restrained: porcelain `#f4f5f5`, white surfaces, ink `#111f27`, slate `#526773` and accent `#284f60`. The shared mark and wordmark use one color; preserve their proportions and use the existing bundled Manrope typeface.

Use the original dot-matrix fin rather than the solid silhouette. Preserve the 37-dot geometry and use a compact 5px gap between the mark and BlackFin in the app. The downloadable outlined logo uses the same dot pattern and tight spacing. This logo exception does not reintroduce decorative dot backgrounds.

The disclaimer is visible at the bottom as a muted-grey text footer, rather than a disclosure badge. Use small, readable text explaining internal research use, third-party data limitations, illustrative assumptions and independent verification. This footer is an exception to the general help/badge rule. The full-height OZ / EB-5 page has no footer; it carries the same text in its About this data sheet. Keep existing evidence limitations visible alongside the data and do not invent regulatory affiliations, endorsements or guarantees.

Use light borders and precise 4px control/panel corners. Remove gradients, decorative dot textures, floating-card shadows and rounded bubble treatments. Sign-in is sparse: a strong BlackFin identity, the title “Sign in,” credentials and necessary account status/actions. Marketing slogans and repeated coverage/privacy footers do not belong in the flow. Controls retain at least 44px mobile touch targets, 16px input text and visible keyboard focus.

This identity rule supersedes conflicting colors, textures and shapes in the [archived visual-system record](archive/2026-09-14-design-history.md). It does not change authentication or evidence requirements.

## Type scale and copy rules — October 16, 2026

Nothing in the application is set below 13px. Body text, table cells, values and inputs are 16px; badges and labels at least 14px. Never shrink type to make content fit: move long caveats and source text into a drawer or the page's About sheet.

| Role | px / weight |
| --- | --- |
| Page title | 26 / 700 |
| Drawer title | 23 / 700 |
| Section heading | 16 / 700 |
| Body, cells, values, inputs | 16 / 500 |
| Tabs, buttons, legend, filters | 15 / 600 |
| Column headers, field labels | 14 / 600 |
| Captions, town labels | 13 / 600 |

The October 2026 sweep raised every declaration under 13px in `app/globals.css`, `components/research/workspace.css`, `cases.css`, `context-note.css` and `components/workspace/ideas-view.module.css` (8–10px to 13px, 11–12px to 14px; 235 declarations), and the shared research grid to 16px text in 44px rows. MapLibre's scale and attribution text is held to 13px.

Copy: label, don't explain. At most one short sentence per section; caveats appear once, in the page's About sheet; long source text appears only in a drawer as field and value rows. No pills or chips, and no "·" or "→" joiners in labels.

**OZ / EB-5 map palette.** EB-5 classes: rural clear `#1c6e8c` (filled circle), interpretation dependent `#c98a0c` with edge `#7a5208` (diamond), not rural (place) `#b2452e` (ring; hatched polygon), unknown `#7b8990` (square). 2027 tiers, darkest first: certified `#0e3b4c`, nominated `#1f6680`, state recommended `#3f8ba6`, draft for comment `#7db3c6`, locally recommended `#bcd8e2`, eligible outline only. Every class also has its own shape, so colour is never the only cue. The design review reports this palette's minimum ΔE2000 under every colour-vision-deficiency simulation as 14.9 (light) and 11.4 (dark); the check script is the design agent's and is not in this repository.

## Implementation and accessibility

- Tokens and workspace components: `app/globals.css`.
- Shared SVG mark and wordmark: `components/brand.tsx`; application icon: `app/icon.svg`.
- Sign-in composition: `app/sign-in/sign-in.module.css`.
- Locally hosted font and unmodified SIL Open Font License: `public/fonts/`; see provenance in that directory.
- Keep keyboard focus visible, respect reduced motion, and retain the existing accessible mobile navigation behavior.
- Styling changes must pass repository checks and browser review of sign-in, overview, table, forms, financial results and map. A requested viewport size alone is not mobile verification: confirm the rendered dimensions.
- Financial, access, mandate, data-coverage and deployment readiness are independent of the visual theme. This design does not introduce data, success grades, eligibility claims or return assumptions.
