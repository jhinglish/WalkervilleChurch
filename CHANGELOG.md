# Changelog

All notable changes to the Walkerville Sunday Roster are recorded here. Dates are `YYYY-MM-DD`. Add new entries under **Unreleased**, and move them under a dated heading when `index.html` is published to the claude.ai artifact.

## [Unreleased]

### Added
- GitHub repository structure: `.gitignore`, `.gitattributes`, `.editorconfig`, `CHANGELOG.md`, `Artifact_Link`, and the seed workbook `Sunday_Ministries.xlsx` under version control (private repository only).

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
