# BlackFin roadmap

## Current priority: national OZ / EB-5 discovery

Latest checkpoint (September 16, 2026): the offline OZ / EB-5 rural screen classified all 8,764 designated tracts (1,614 rural_clear) and tested the interior point of each of the 40 audited shortlist parcels: all 40 returned a designated OZ tract and passed the EB-5 rural point test. See [OZ-EB5-SCREEN.md](OZ-EB5-SCREEN.md) and the [current handoff](HANDOFF.md). Bringing the national list into the application is the next slice. Older local UI/debt-basis sequencing below is historical and does not supersede this priority.

The September 15 user direction expands discovery nationally. The first delivered slice is the offline OZ / EB-5 rural screen in [OZ-EB5-SCREEN.md](OZ-EB5-SCREEN.md): a national tract table and a site test built from ID joins on official public sources, with no new dependency, migration or deployment. The planning documents that preceded it are archived locally under `.local/handoff-history/oz-eb5-planning-20260915/` and are not pending assignments. National geographic intersection inside the application, market screening and real project investigation remain separate deliverables; the prior Florida-only discovery limit below is superseded for this work. Existing Florida workflows remain supported.

## Delivered foundation

The source-to-analysis application includes the linked map/screener/evidence workflow, private replayable imports, nomination-eligibility geometry, lender/maturity comparisons and saved financing-threshold scenarios. Mobile/contextual-help/identity polish and checkout reconciliation were delivered through PR #7 at `38e83f6`; this is historical release evidence, not current Railway verification. See [RESEARCH-RELEASE.md](RESEARCH-RELEASE.md).

## Local debt-basis continuation

The recommended preparer/basis slice is implemented locally on `codex/debt-basis-20260915`. [DEBT-BASIS.md](DEBT-BASIS.md) defines qualification exclusions, first-lien/date ranking, retained mortgage history and provider fields, saved-case behavior and verification. Release still requires the new prepared snapshot and code together. Next slices remain population reconciliation and the consolidated UX/navigation/theme work.

## Local UI pass for owner review

The September 15 pass on `codex/map-and-ideas-20260915` adds exact cluster narrowing to the shared query, map fitting and resizing, point previews, inline Community grid detail rows and consistent linked Ideas cards. Financing and case work remain in the full inspector. Desktop/mobile verification is recorded in [HANDOFF.md](HANDOFF.md). This task is local only; the owner reviews and releases separately. Analytics and strategy-execution scope has not expanded.

## Research to strategy case: delivered baseline

The first pass of [STRATEGY-EXECUTION.md](STRATEGY-EXECUTION.md) is implemented in the baseline: a research property record and, where selected, one recorded instrument become a case with a fixed origin (snapshot, record, instrument, assumptions and the research query at capture) and append-only versions carrying state, lane, hypothesis and its rejection test, potential payer, operator role, evidence status backed by an evidence register (each documented status needs an entry naming its claim, source, date, scope and reviewer), proposed and agreed economics kept separate, missing inputs, alternatives (including ordinary refinance and no action, compared on the same debt basis with threshold-1), disposition and next action. Rejected, deferred and outcome recorded (what actually happened, including no engagement) are first-class states. See the [handoff](HANDOFF.md) for the historical release receipt, verification evidence and limits.

Still open in this workflow, from the committee review: a note and a scenario on every compared alternative; base, adverse and improving cases as nested scenario variants; a readiness probe for the case tables; concurrent-append, interrupted-write and populated-upgrade tests; an actor column and fuller version history; draft preservation during a pending save; a reopen action restoring snapshot, instrument and assumptions from a case; a bounded list query. After that: linking cases to deal evidence records, a comparison view across cases, case export, and a real walkthrough on a permissioned property.

## Subsequent analytics

1. Reconcile authoritative parcels, communities and facilities; expand county and loan coverage with dated provenance.
2. Add versioned operating inputs and financing/market evidence with unknowns and conflicts visible.
3. Add full underwriting only with independently reviewed reference cases and reproducible dated cash flows.
4. Broaden strategy execution and defensible comparison cohorts; retain service/partnership opportunities alongside investments.
5. Validate future grading separately from screening, program eligibility and personal suitability.

All 67 Florida counties remain intended scope; retained acquisition covers seven. Personal limits gate suitability and calibrated grading, not neutral discovery. Source rights, access and recovery requirements apply to each new data path. This roadmap does not authorize purchases, new hosted services, recurring jobs, outreach or investment action.
