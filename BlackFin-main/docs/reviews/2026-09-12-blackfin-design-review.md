> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Dates, revisions, findings and verification claims below apply only to the recorded work; they do not establish current status or resolved findings.

# BlackFin light design review

The chosen direction is BlackFin, a light interface, pale blue and a clean dot-matrix/soft futuristic character. This change applies that direction to the existing workspace and login page. The review below was performed by the implementing agent with synthetic records in an isolated loopback database; it is not the earlier independent implementation review.

## Delivered

- Original dot-matrix fin, BlackFin wordmark, browser title/icon and auth display name.
- White sidebar, porcelain canvas, ice-blue selection and map palette, self-hosted Manrope, restrained shadows and tabular money.
- Existing evidence/decision labels and semantic warning, positive and error colors retained. Unknown values remain explicit.
- Palette provenance and usage contract in `docs/DESIGN.md`; the font's original OFL license and pinned source/hash are in `public/fonts/`.

## Browser and calculation checks

- Actual desktop DOM width 1280px and phone width 390px; no document-level horizontal overflow on the checked overview, county and form layouts. Wide tables retain their own horizontal scrolling.
- Overview, settings, county rendering/selection, deal form and saved decision history were exercised with existing synthetic records. The font loaded from the application origin.
- County map reached `ready`; Lee selection and the corresponding county heading agreed. All 67 boundaries remain geographic references, not certified source coverage.
- Invalid `12.345` asking-price input displayed the expected dollar validation error in the phone layout. No valid deal was created by this check.
- Saved annual case still displayed all ten reference metrics, including $210,000 NOI, 1.70 DSCR and $125,000 per unit; the reviewed/source and unknown-state labels remained visible.
- Final browser sign-out reached the new sign-in page, and revisiting `/deals` stayed at sign-in. The configured local login layout was inspected at 390px and 1280px. This was a synthetic session, not production GitHub onboarding.
- Eighteen sampled text/background pairs passed a 4.5:1 contrast threshold, including primary actions, muted labels, selections, warnings and reviewed evidence. This samples the declared palette, not every possible rendered state or a complete accessibility audit.
- `npm run check` passed after the final CSS correction: lint, types, financial references/invariants, deliberate faults, auth/input checks, production build and protected-route HTTP smoke. CI and the exact deployed revision require a separate release readback.

## Mobile navigation regression

The first 390px browser pass showed the menu button hidden (`display: none`). Important declarations reversed CSS layer precedence, so the component-level hide rule beat the responsive show rule. The correction uses normal layer precedence and a specific base selector that also beats the generic icon-button display rule. The final desktop readback hides the phone-only menu/close buttons, while the phone layout exposes them.

Opening the drawer, following navigation, using Escape from inside the drawer, making the page inert while open and returning focus to the opener were checked. Automatic initial focus on the close button was **not confirmed** in this browser session. A temporary animation-frame focus experiment did not change that observation and was reverted. The existing focus logic is retained; this remaining accessibility behavior needs a focused native-keyboard follow-up.

## Scope boundary

No financial formula, threshold, data schema, membership policy, provider connection or Railway infrastructure changed. Real GitHub OAuth onboarding, production recovery and reviewed underwriting workbooks remain the previously recorded gates. This visual review does not close them.
