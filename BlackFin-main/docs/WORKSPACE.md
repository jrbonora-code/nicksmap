# Workspace map

## Active checkout

Original workspace: the primary local checkout of this repository.

The original checkout is maintained on `main`. The application worktree `.local/blackfin-build` holds the existing local development configuration and can be used for feature branches. Both use the current released application source after the September 14 reconciliation. Use `git worktree list` and `git status --short --branch` to refresh this inventory before work.

The former original-checkout edits were reviewed against release `e072d4d`. Superseded UI work and duplicate research documents are preserved in `.local/archive/2026-09-14-original-checkout/` under the original workspace, with all 40 files, a binary Git patch and a SHA-256 manifest. Useful documentation corrections were consolidated into current source. Follow the [reconciliation review](reviews/2026-09-14-checkout-reconciliation.md); the archive is historical, not an alternate application to deploy.

Continuation branch: `codex/strategy-case-workflow-20260914` in `.local/blackfin-build`, merged to main through PR #8 on September 15, 2026; read Git for the current commit state before reusing it. The private `.env.local` lives in the original checkout, not the worktree. [HANDOFF.md](HANDOFF.md) is canonical; the root handoff only links to it. Auto-appended session logs are historical observations.

## Directory ownership

| Location | Purpose |
| --- | --- |
| Active worktree: `app/`, `components/`, `lib/` | Application routes, interface and deterministic domain logic |
| Active worktree: `db/`, `scripts/`, `tests/` | Explicit migrations, operator tools and verification |
| Active worktree: `docs/` | Current runbooks, release contract, research and dated reviews |
| `docs/archive/` in each checkout | Clearly dated historical handoffs; follow current HANDOFF first |
| Original: `.local/realestateapi/` | Private acquired source files, staging SQLite, collector and provenance |
| Original: `.local/oz-research/`, `.local/census/` | Retained source/geometry research inputs |
| Active worktree: `.local/` | Private build/import/delivery evidence and local QA artifacts |
| Original: `.local/ideas-release/` | Preserved detached historical Ideas release worktree |
| Original: `.local/archive/2026-09-12-build-logs/` | Ten inactive build logs archived on September 14 with byte lengths and SHA-256 manifest |
| Original: `.local/archive/2026-09-14-original-checkout/` | Verified snapshots of the 40 reconciled files, original base revision, binary patch and recovery instructions; private and ignored |
| Original: `.local/*review*/`, `.local/fable-*/` | Prior agent review or design evidence; not the active implementation |
| Original: `.local/archive/2026-09-14-instruction-cleanup/` | Preserved auto-generated root handoff before replacement by the canonical pointer |
| Original: `.local/sharing/` | Inactive exports and history preparation; not development checkouts or pending publication |
| `.local/backups/` | Private recovery archives; preserve and protect separately |
| `node_modules/`, `.next/`, generated map assets | Reproducible dependencies/build outputs, not source evidence |
| `output/playwright/`, `.playwright-cli/` | Local browser artifacts; may include private content |
| `.env.local`, local keys and credential files | Server/operator configuration; never commit or print values |

Paths labelled Original are relative to the original workspace. Paths labelled Active worktree are relative to `.local/blackfin-build`; do not accidentally add a second nested copy of that path. Ignored local source files do not automatically appear in a fresh clone or worktree.

## Cleanup and archival policy

Keep current entrypoint documents short and link historical context from dated archives. Preserve review reports, acquisition/provenance records, database archives and earlier user changes. A review describes its recorded revision, not every later commit.

Before moving local artifacts, identify their role and references. Archive only identified inactive artifacts within this repository, preserve filenames or a move manifest, and verify contents. Do not remove or relocate Git worktrees as ordinary directories. Never move private exports into tracked documentation or public assets.

Use [HANDOFF.md](HANDOFF.md) for current actions, [ROADMAP.md](ROADMAP.md) for remaining scope and the dated records under [archive/](archive/) for history. [README.md](../README.md) contains current local setup commands.
