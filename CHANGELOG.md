# Changelog

All notable changes to the Walkerville Sunday Roster are recorded here. Dates are `YYYY-MM-DD`. Add new entries under **Unreleased**, and move them under a dated heading when `dist/index.html` is published to the claude.ai artifact.

## [Unreleased]

### Fixed
- Generating Sundays held a 15-second lease on every new Sunday. A lease cannot be released, so another admin editing one of those Sundays within 15 seconds got "Someone else is editing right now". It now uses the same 3-second lease as every other write (`LEASE_MS` in `src/store.ts`).

### Added
- Browser test that generating takes only short leases. The in-memory runtime now records every lease requested (`leases` in `tests/e2e/support/fake-runtime.ts`, `app.leases()`).

## 2026-10-30

### Added
- Browser regression tests (`tests/e2e/`, 41 tests, run with `npm run test:e2e`): they open the built page in headless Chromium against an in-memory stand-in for the claude.ai runtime and check startup, generation, locked Sundays, editing, needs-attention flags, exports and HTML escaping. `npm run verify` now runs the type-check, unit tests, build and browser tests together.
- README: a step-by-step "Workflow: making a change" section (branch, edit `src/`, verify, document, commit, merge, publish, check live, tag, and how to roll back) and a "Testing" section.

### Fixed
- Adding a person checked the page's own copy of the people list for a free id. If the page had not yet seen someone else's new person with the same name, the new person overwrote them. It now checks the database and takes a short lease first, so a repeated name always gets its own id (`zoe`, `zoe-2`, ...). Found by a browser test that failed on a fast machine.

### Changed
- Published to the existing artifact. Before publishing, the live artifact was checked for changes since the last publish (none), and afterwards it was read back and is byte-identical to `dist/index.html`.
- `npm run typecheck` also type-checks the browser tests (`tsconfig.e2e.json`). `vitest.config.ts` keeps Vitest to the unit tests in `src/`.

## 2026-10-29

### Changed
- The artifact now runs the TypeScript build (`dist/index.html`, built from `src/`) instead of the original single-file JavaScript. Behaviour is unchanged: before publishing, the original page and the build were run side by side in a headless browser against the same in-memory database across 63 steps (every tab, edit, database write, download and PDF call) and were identical apart from the fix below. The published artifact was read back and is byte-identical to `dist/index.html`.
- `index.html` had been synced with the live artifact, which another session had updated: edits to rosters, eligibility and ministries take a short lease and re-read before writing, manual moves write only the ministries that changed, and save errors show a banner at the top of the page.
- README: repository name `WalkervilleChurch`, the "Source of truth" section, local development commands, and no license (private project).

### Added
- GitHub repository structure: `.gitignore`, `.gitattributes`, `.editorconfig`, `CHANGELOG.md`, `Artifact_Link`, and the seed workbook `Sunday_Ministries.xlsx` under version control (private repository only).
- Strictly typed TypeScript source in `src/`: markup and CSS, data-model and runtime types, tested pure logic (`dates`, `model`, `issues`, `generate`), and the UI and database code (`parse`, `state`, `selectors`, `store`, `exports`, `handlers`, `render`, `main`, `views/`). `npm test` runs the unit tests, `npm run typecheck` the type-check, and `npm run build` bundles everything into `dist/index.html`.

### Fixed
- Locking older Sundays wrote its "Locked N existing Sunday(s)" change-log line twice. It is now written once.
- Locking older Sundays checked write permission without awaiting `user.can()`, so the check never worked. It is now awaited.

### Removed
- The original root `index.html` and the temporary port checks (`scripts/equivalence.ts`, `scripts/ui-compare/`). They remain in Git history at the tag `pre-typescript`.

## 2026-10-27

### Added
- Each generated Sunday stores a snapshot (`meta`) of ministry names, headcounts, exclusive flags, and people's names and eligibility, so later Admin changes never alter existing Sundays.
- Sundays generated before snapshots existed are locked automatically the first time an editor opens the page.
- "Needs attention" flags on the Service record for upcoming Sundays with a problem, with click-through to that Sunday to fix it in place.

### Fixed
- Generation no longer overwrites a Sunday that already exists (lease plus re-read, write only if absent).
- Removed ministries no longer disappear from Sundays that were generated while they existed (Roster, Serving, PDF, CSV).
- Manual moves re-read the Sunday and update only `s` and `manual`, so a verse, note or snapshot saved by someone else is not overwritten.
- Regenerate re-reads the Sunday so the latest note and verse are kept.

### Changed
- Admin and in-app help text updated to describe locked Sundays.
