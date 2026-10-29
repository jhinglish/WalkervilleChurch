# Walkerville Sunday Roster

A single-file web tool that builds and maintains a rotating Sunday-morning ministry roster for Walkerville Church Plant. It auto-generates a rolling three months of Sundays, lets you move people around by hand, tracks who is away, records who has served, flags Sundays that need attention, and prints a one-page "who is serving this Sunday" PDF.

The source lives in a **private GitHub repository named `WalkervilleChurch`**. The running app is a **claude.ai Artifact** published from that source, and its live data lives in the artifact's database (not in the repository).

> **Important:** this app is built as a **claude.ai Artifact** and depends on the Artifact runtime (`window.claude`) for its database, user identity and file downloads. Cloning this repo and opening `dist/index.html` in a browser will show a sign-in message, not the app. See [Running it](#running-it) and [Porting off claude.ai](#porting-off-claudeai).

> **Privacy:** this repository contains members' names (in `Sunday_Ministries.xlsx`). It must stay **private**. See [Privacy](#privacy).

---

## Contents

- [Features](#features)
- [Business rules](#business-rules)
- [Running it](#running-it)
- [Using each tab](#using-each-tab)
- [Architecture](#architecture)
- [Source control and deployment (GitHub)](#source-control-and-deployment-github)
- [Data model](#data-model)
- [How the roster is generated](#how-the-roster-is-generated)
- [Locked Sundays (snapshots)](#locked-sundays-snapshots)
- [How concurrent writes are handled](#how-concurrent-writes-are-handled)
- [Invariants the tool must keep](#invariants-the-tool-must-keep)
- [Known issues and roadmap](#known-issues-and-roadmap)
- [Porting off claude.ai](#porting-off-claudeai)
- [Repository layout](#repository-layout)
- [Privacy](#privacy)
- [License](#license)

---

## Features

- **Auto-generated rotation** for every Sunday, starting from the first Sunday of 2027, on a rolling 3-month horizon.
- **Locked Sundays**: every generated Sunday stores a snapshot of the ministry names, headcounts, exclusive flags, and people's names and eligibility as they were at generation. Later renames, eligibility changes, headcount changes or ministry removals never alter how an existing Sunday displays, flags or prints. Sundays generated before snapshots existed are locked automatically the first time an editor opens the page.
- **Safe generation**: generating never overwrites a Sunday that already exists, even one created or edited by someone else after your page last refreshed.
- **Manual overrides**: tap-then-tap or drag-and-drop to move people between ministries or to "Not serving". Extra people may be added to any ministry beyond the usual headcount.
- **Conflict warnings** (red names): away that day, not eligible for that ministry, double-booked, clashing with an exclusive ministry, removed from the people list. "Needs N more" flags short slots.
- **Serving tab**: shows only the next Sunday and only the people on duty, with manual edits, a weekly verse and notes, and a **PDF export** (verse at the top).
- **Away tab**: flag a person unavailable for a date or range; generation skips them.
- **Service record**: grid of who served what and when, current/longest consecutive runs, totals, a per-person detail view and an optional highlight threshold. For insight only; it never changes the roster by itself.
- **Needs-attention flags** on the Service record: a flag row marks every upcoming Sunday with a problem (short ministry, someone away, not eligible, double-booked, exclusive clash, removed person still assigned). Click a flag to open that Sunday, see each issue, and fix it in place (remove or add people, or regenerate that Sunday).
- **Admin tab**: add, rename, remove and restore people and ministries; set eligibility, family number, headcount and exclusivity; view the change log.
- **Per-Sunday verse and notes**, retained permanently.
- **CSV export** of the full roster, including ministries that have since been removed.
- Light and dark theme, mobile-friendly, in-app help on every tab.

## Business rules

| Rule | Value |
|---|---|
| Ministries | Security/Lock Up, Welcoming, Tea and Coffee, Creche, Ushers (Communion Prep is not currently used) |
| Headcount per Sunday (auto-generation only) | Security/Lock Up 1, Welcoming 1, Ushers 2, Creche 2, Tea and Coffee 2 |
| Exclusive ministries | Security/Lock Up and Creche: anyone serving in one cannot serve in anything else that Sunday |
| Frequency | Every ministry, every Sunday |
| Doubling up | Allowed, but avoided where possible |
| Families | People share a family number; family members are kept together where possible |
| Fairness balancing | None for now. Uneven pools are expected and people marked "No" everywhere is correct |
| Consecutive Sundays | Not avoided by the generator (only shown in the Service record) |
| Horizon | 3 rolling months, history retained |
| Manual headcount | Headcounts apply only to automatic generation; manually, any number of people may serve |
| Existing Sundays | Locked at generation; people/ministry changes never alter them unless a regeneration is explicitly requested |

## Running it

### As intended: claude.ai Artifact

1. Publish `dist/index.html` from the `main` branch as an Artifact on claude.ai (private to you until you choose to share it). It is built from `src/` by `npm run build`. The published link is recorded in `Artifact_Link`; see [Deployment](#deployment-publishing-to-claudeai) for the update procedure.
2. Declare these runtime capabilities (inferred from the code, so confirm against your own artifact's settings):
   - `db`: shared documents, realtime snapshots, and short-lived document leases (`acquire`) used for safe generation
   - `user`: viewer identity, used to attribute change-log entries and to check write permission
   - `downloads`: PDF and CSV saving
3. **Seed the database** (the app does not hard-code data). `Sunday_Ministries.xlsx` in this repository is the source workbook for the people, families and eligibility. You need:
   - `config/main` with the roster start date (`start`, `YYYY-MM-DD`, first Sunday of 2027) and the `ministries` array.
   - A `people/<id>` document for each person.
4. Open the **Roster** tab and press **Generate** to create the first 3 months.

People who use the tool must be able to sign in to claude.ai (organisation members or invited guests). Public-link visitors cannot read or write the database. People who only have view access can read the roster but cannot generate, edit or lock Sundays.

### Locally

`dist/index.html` alone will not work. The code calls `claude.use('db')`, which only exists inside the Artifact runtime. Without it the page shows "Sign in to claude.ai to use the roster."

## Using each tab

**Serving**: this coming Sunday only (a Sunday that is today still counts; it moves on the Monday). Press *Edit* to remove a name with ✕ or add one from the dropdown. Enter the week's verse and press *Save verse*; add notes with *Save note*. *Export PDF* produces a one-page sheet. The sheet lists the ministries that Sunday was generated with, even if one has since been removed. If nothing has been generated, go to Roster and press Generate.

**Roster**: every Sunday in the window. Tap a name then tap the ministry box (or drag). Dropping on "Not serving" removes someone. *Regenerate this Sunday* rebuilds one Sunday after a confirmation click, using the current ministries, people and away dates and storing a fresh snapshot; manual edits to that Sunday are lost, its note and verse are kept. *Show past* reveals earlier Sundays. *Export CSV* downloads the roster.

**Away**: choose a person and a first date (and last date for a range), then Add. Already-generated Sundays show the person in red; regenerate or move them by hand.

**Service record**: rows are people, columns are Sundays; letters show the ministry served and hatched cells show away. *Run* is consecutive Sundays served up to the upcoming Sunday. Click a name for the detail view.
- The **Needs attention** row under the dates shows a ⚑ and a count for each upcoming Sunday with a problem; hover for the reasons. A summary line above the table lists the affected Sundays as buttons. Past Sundays are not flagged.
- Click a flag (or a date button) to open that Sunday below the table: the issues are listed, affected names are highlighted, and you can remove people with ✕, add someone from a per-ministry dropdown (it shows who is away or already serving), or regenerate that Sunday. Click the flag again or press Close to shut it.
- Verses and notes for any Sunday are listed and editable at the bottom.

**Admin**: edit ministries (name, people needed, exclusive) and people (name, family, eligibility). Removing hides a person or ministry from future generation and the pickers but keeps history; use Restore to bring it back. Changes never alter Sundays that already exist. A ministry added later only appears on an existing Sunday if that Sunday is regenerated. The change log is at the bottom.

## Architecture

The system has three parts, and each has one job:

| Part | Holds | Authoritative for |
|---|---|---|
| **GitHub repository** (private) | `index.html`, docs, seed workbook, artifact link, changelog | The application code and its history |
| **claude.ai Artifact** | A published copy of `index.html` | What people actually run (deployment target) |
| **Artifact database** | `config`, `people`, `rosters`, `away`, `history` documents | All live roster data |

```
 local clone ──push/PR──▶ GitHub (main) ──publish index.html──▶ claude.ai Artifact ◀──reads/writes──▶ Artifact db
 (edit, review)           (source of truth)    (manual step)      (what users open)                    (live data)
```

Application design:

- The source is strictly typed TypeScript under `src/` (see [Source of truth](#source-of-truth)). `npm run build` bundles it into one self-contained `dist/index.html` (HTML, CSS and one inline script), which is what is published.
- The only external dependency is [jsPDF 2.5.1](https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js) from cdnjs, used for PDF export.
- State lives in the Artifact `db`. The page subscribes with `onSnapshot` to `people`, `rosters`, `away`, `history` (latest 200) and `config/main`, keeps in-memory copies, and **re-renders the whole view** on every change. Roster documents without an `s` field are ignored.
- Rendering is string-template `innerHTML`. A single document-level click, change, input and drag/drop handler set drives all interaction.
- The roster generator runs in the browser.
- Per-Sunday display resolves through three helpers in `src/model.ts`: `ministriesForSunday` (the ministries for that Sunday), `personName` (a person's name for that Sunday) and `personEligibility` (their eligibility for that Sunday). Each prefers the Sunday's own snapshot and falls back to live data only for Sundays that have none.
- Local UI state (selected tab, selection, open flagged Sunday, unsaved verse/note drafts) is held in `src/state.ts` only (never saved).

## Source control and deployment (GitHub)

### What is in the repository

| File | Purpose | Sensitive? |
|---|---|---|
| `dist/index.html` | The built single-file app that is published (generated by `npm run build`; commit it with the source change) | No |
| `src/` | The application source: strictly typed TypeScript, the markup and CSS, and unit tests | No |
| `scripts/build.mjs` | Bundles `src/` into `dist/index.html` | No |
| `tsconfig.json`, `package.json` | Strict TypeScript settings and the npm scripts | No |
| `README.md`, `CHANGELOG.md` | Documentation and release notes | No |
| `Sunday_Ministries.xlsx` | Seed workbook: people, family numbers, eligibility | **Yes: member names** |
| `Artifact_Link` | URL of the published artifact | Treat as private |
| `.gitignore`, `.gitattributes`, `.editorconfig` | Repository hygiene and consistent formatting | No |

Because the workbook and the artifact link are tracked, **the repository must remain private** (see [Privacy](#privacy)).

### What must never be committed

- Anything exported from the live app or its database: roster CSVs, database dumps, backups (all are covered by `.gitignore`).
- Credentials of any kind (`.env`, keys, tokens). The app currently needs none.
- Other documents containing member details that are not the seed workbook.

Git history is permanent. A file that is committed and later deleted can still be recovered from history.

### Repository settings (set once on GitHub)

- Visibility: **Private**. Do not enable GitHub Pages or make forks public.
- Protect `main`: block force-pushes and branch deletion; require pull requests if more than one person contributes.
- Turn on secret scanning and push protection.
- Keep collaborators to the minimum needed, with the lowest role that works; require two-factor authentication on every account with access.
- Dependabot alerts are worth enabling: `package.json` now has dev dependencies (TypeScript, Vitest, esbuild).

### Source of truth

`src/` is the only place the app is edited. `npm run build` turns it into the single self-contained `dist/index.html` that claude.ai needs. That built file is committed, because publishing is manual and having the exact published file in Git makes it easy to hand over and compare. Never edit `dist/index.html` by hand.

The move from the original JavaScript to TypeScript is finished and published:

| Stage | Status |
|---|---|
| 1. Markup and CSS (`src/index.html`) | Done |
| 2. Data-model and runtime types (`src/types.ts`, `src/claude.d.ts`) | Done |
| 3. Pure logic with tests (`src/dates.ts`, `model.ts`, `issues.ts`, `generate.ts`) | Done |
| 4. UI and database code (`src/main.ts`, `store.ts`, `handlers.ts`, `views/`, and friends) | Done |
| 5. Build step and switch-over | Done: published on 2026-10-29, and the published artifact is byte-identical to `dist/index.html` |

Rules for changes:

- Edit `src/`, run `npm run check` (type-check, tests and build), and commit `src/` and the rebuilt `dist/index.html` together.
- Publish `dist/index.html` to the existing artifact (see [Deployment](#deployment-publishing-to-claudeai)).
- The original single-file JavaScript version, and the browser and equivalence checks used to prove the port matched it, are in Git history at the tag `pre-typescript`.

### Local development

The repository is named `WalkervilleChurch`. You need Node 20 or later.

```
git clone git@github.com:jhinglish/WalkervilleChurch.git
cd WalkervilleChurch
npm install
npm run check
```

| Command | What it does |
|---|---|
| `npm run typecheck` | Strict TypeScript check of `src/` (no files are emitted) |
| `npm test` | Runs the unit tests with Vitest |
| `npm run test:watch` | Re-runs the tests as you edit |
| `npm run build` | Bundles `src/` into the single page `dist/index.html` that claude.ai needs |
| `npm run check` | Type-check, tests and build; run it before every commit |

### Branching and commits

- `main` always matches what is published (or is about to be). Do work on short-lived branches: `feat/<name>`, `fix/<name>`, `docs/<name>`, then merge to `main`.
- Write commit messages in the imperative, optionally with a [Conventional Commits](https://www.conventionalcommits.org/) prefix, for example `fix: keep removed ministries visible on past Sundays`.
- Each commit should leave `index.html` working. Do not mix a refactor and a feature in one commit.
- Add a line under **Unreleased** in `CHANGELOG.md` for every user-visible change. When publishing, move those lines under a dated heading and tag the commit (for example `v2026.10.27`).
- The workbook is binary, so Git cannot show a useful diff. Commit it on its own, with a message that says what changed (for example `data: add two new volunteers to workbook`).

### Deployment (publishing to claude.ai)

Publishing is a manual step; there is no automatic pipeline yet.

1. Merge the change to `main` and confirm `CHANGELOG.md` is up to date and `dist/index.html` was rebuilt (`npm run check`).
2. In claude.ai, open this project and ask Claude to publish `dist/index.html` to the **existing** artifact at the link in `Artifact_Link`, so the link and the sharing settings stay the same. Do not create a new artifact for an update.
3. If the capabilities (`db`, `user`, `downloads`) have changed, confirm they are still declared.
4. Open the artifact, check each tab loads and the live data is intact, then tag the release.
5. If the artifact URL ever changes, update `Artifact_Link` in the same commit.

**Keep the repository and the artifact in sync.** The repository is the source of truth. Do not edit the artifact directly. If a quick fix is made in claude.ai, copy the change into `src/`, rebuild and commit it straight away, or the next publish will silently undo it. To check for drift, ask Claude to read the published artifact and compare it with `dist/index.html` on `main`.

**Database changes are not deployed from Git.** Publishing a new `dist/index.html` never touches the live data. Anything stored in the database (people, rosters, away entries) is changed only through the app. The workbook is a seed, not a sync source (see issue 4 below).

## Data model

All documents are in the Artifact database.

**`config/main`**
```json
{
  "start": "2027-01-03",
  "ministries": [
    { "k": "sec", "l": "Security/Lock Up", "n": 1, "x": 1 },
    { "k": "wel", "l": "Welcoming",        "n": 1, "x": 0 },
    { "k": "tea", "l": "Tea and Coffee",   "n": 2, "x": 0 },
    { "k": "cre", "l": "Creche",           "n": 2, "x": 1 },
    { "k": "ush", "l": "Ushers",           "n": 2, "x": 0 }
  ]
}
```
`k` is the stable key, `l` the label, `n` the headcount for auto-generation, `x` marks an exclusive ministry, and `gone: true` soft-deletes it.

**`people/<id>`**
```json
{ "name": "Jane Doe", "family": 3, "elig": ["wel", "tea", "cre"], "gone": false }
```
`id` is a slug of the name. `family` groups people (0 means none). `elig` lists ministry keys the person can serve in. `gone` soft-deletes.

**`rosters/<YYYY-MM-DD>`** (one per Sunday)
```json
{
  "date": "2027-01-03",
  "s": { "sec": ["person-id"], "wel": ["person-id"], "tea": ["a", "b"], "cre": ["a", "b"], "ush": ["a", "b"] },
  "gen": true,
  "manual": false,
  "note": "",
  "verse": "",
  "meta": {
    "m": [ { "k": "sec", "l": "Security/Lock Up", "n": 1, "x": 1 } ],
    "p": { "person-id": { "n": "Jane Doe", "e": ["wel", "tea", "cre"] } }
  }
}
```
`s` maps ministry key to person IDs. `manual` becomes true after any hand edit. `meta` is the snapshot taken at generation (or at automatic locking): `m` is the list of ministries as they were (key, label, headcount, exclusive flag) and `p` maps every person ID to their name and eligibility at that time. `meta` never records who is assigned; only `s` does.

**`away/<auto-id>`**: `{ "person": "<id>", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "note": "" }`

**`history/<auto-id>`**: `{ "ts": "<ISO timestamp>", "by": "<user id>", "msg": "<text>" }`

## How the roster is generated

For each ungenerated Sunday, in date order, using all earlier Sundays as history:

1. Order ministries: exclusive ones first, then smallest eligible pool first.
2. For each slot, build candidates: eligible for the ministry, not away, not already in this ministry, not already in an exclusive ministry that day.
3. Prefer people not yet used that Sunday. Exclusive ministries require this; others fall back to people already placed if nobody else is left.
4. Score candidates (lower wins):
   - how recently they last served *this ministry* (never served ranks best),
   - minus 1.5 if a family member is already placed that day,
   - plus 0.01 per total past service (a small tiebreak),
   - then alphabetical.
5. Take the top candidate. If no one qualifies, the slot stays unfilled and shows as "needs N more".
6. Store the Sunday with a fresh snapshot (`meta`), but only if no document for that date exists yet (see below).

Generated Sundays are stored as fixed assignments.

## Locked Sundays (snapshots)

- **At generation and regeneration**, the Sunday stores `meta` (ministries and people as they were).
- **Display and warnings** for that Sunday use the snapshot: ministry names and headcounts, "needs N more", exclusive-clash detection, eligibility warnings, names on the Roster, Serving tab, PDF and CSV.
- **Removed ministries** keep appearing, with their assigned people, on every Sunday generated while they existed. Assignments under a ministry key found in neither the snapshot nor the config still display, labelled by key.
- **Older Sundays** generated before snapshots existed are locked automatically the first time an editor opens the page, using the settings in force at that moment. Until then they resolve live, with removed ministries that still have assignments kept visible. Locking never changes assignments and is recorded in the change log.
- **What stays live on purpose**: away dates (a later away entry still flags the Sunday red), the "Removed from the people list" flag, the ministry labels in the Service record, and the choices offered in the "Add…" dropdowns.
- **Trade-offs**: a person renamed to fix a typo keeps the old spelling on already-generated Sundays; a ministry added later only appears on an existing Sunday if that Sunday is regenerated.

## How concurrent writes are handled

The database offers no transactions and no create-if-absent write, so the app works around that where it matters:

- **Generation** takes a short cooperative lease on `rosters/<date>` (`acquire`, per-tab holder id), re-reads the document, and writes only if no roster exists there. If another viewer holds the lease or the Sunday already exists, that Sunday is skipped. The lease coordinates only clients running this code; it is not a security boundary.
- **All other edits** (manual moves, regeneration, verse and note saves, eligibility changes, ministry edits, and locking older Sundays) go through `withLock`. It takes a 3-second lease on the document, retries up to 10 times with a short random delay, and gives up with a "busy" message if someone else holds it. Inside the lease the app re-reads the document and applies only its own change.
- **Manual moves** write only the ministries that changed. `update` merges nested objects but replaces arrays, so each affected ministry's list is replaced and the others are untouched. If the person is no longer where the move expects them, the move is skipped and a notice says someone else already changed it.
- **Regeneration** (an explicit, confirmed action) keeps the latest note and verse and replaces the assignments and snapshot.
- **Verse, note, eligibility and ministry saves** re-read the document and update only the fields they change. The ministry list is replaced as a whole array inside the lease.
- **Errors** show a short message in a banner at the top of the page.
- **Limits:** leases only coordinate clients that use them. Some writes do not take a lease: adding, renaming and removing people, family numbers, away entries and the change log.

## Invariants the tool must keep

1. **Updating people or ministries must never change an existing roster** unless a regeneration is explicitly requested. Workbook or Admin changes only affect ungenerated Sundays, or Sundays explicitly regenerated.
2. **Manual moves are never overwritten** without an explicit action.
3. **History is retained**, including changes.
4. **A generated Sunday is never replaced by background generation.** Only the confirmed *Regenerate this Sunday* action may replace one.

Invariants 1, 2 (apart from simultaneous edits to the same Sunday) and 4 are now enforced by the snapshot and safe-generation design above. See below for what remains.

## Known issues and roadmap

Highest priority first.

1. **Cooperative locking only.** Edits to rosters, eligibility and ministries take a short lease and re-read before writing, which prevents lost updates between clients running this code. A lease is not a security boundary, and the writes listed under [How concurrent writes are handled](#how-concurrent-writes-are-handled) do not use one, so they remain last-writer-wins.
2. **Access control.** No per-path database rules in the code; defaults let any Contributor overwrite or delete anything. The change log's `by` field is client-supplied. Everyone needs a claude.ai sign-in. Add rules (for example, only Editors write `config` and `people`, Contributors write `rosters`, `away` and `history`).
3. **No database backup or restore.** Git protects the code, the workbook and the changelog only. Live data (rosters, away entries, verses, notes) exists only in the artifact database. Only a lossy roster CSV export exists, and it must not be committed. The change log is plain text with no before/after data, and log writes are best-effort.
4. **Two sources of truth for people and ministries.** `Sunday_Ministries.xlsx` is under version control but was a one-time seed. There is no import, diff or export path between it and the Admin tab, so the workbook and the database can drift apart.
5. **Render pipeline.** Every snapshot re-renders everything and wipes unsaved form inputs (except verse/note drafts). `render()` has no error handling, so one malformed document can blank the UI.
6. **Generation is manual and non-atomic.** The window only extends when someone presses Generate, and the sequential writes can leave a partial set (it is safe to press Generate again).
7. **Snapshot gaps.** The Service record still shows ministry labels live; the lease used for generation is cooperative only; Sundays locked automatically capture the settings at the moment of first open.
8. **Manual deployment, no CI.** Publishing to claude.ai is a manual step. Unit tests cover dates, model helpers, issue detection and generation (`npm test`), but nothing runs them automatically. Add a GitHub Actions workflow that runs `npm run check` on every push, plus HTML validation and secret scanning. The UI and database code have no automated tests. They were checked once, at the switch-over, by running the original page and the new build side by side in a headless browser against an in-memory stand-in for the runtime (all 63 states identical). That stand-in is in Git history at the tag `pre-typescript`, under `scripts/ui-compare/`, and is a good base for a Playwright smoke test.
9. **Page size.** The built page is about 54 KB because it is not minified. Set `minify: true` in `scripts/build.mjs` if size ever matters.
10. **Minor:** family `0` is treated as a real family by the generator; dates use UTC rather than South African time; ministry abbreviations in the Service record can collide; the Away dropdown excludes people with no eligibility; away entries are never pruned.

## Porting off claude.ai

To run this independently of claude.ai you would need to replace the runtime shims:

- `claude.use('db')` with an adapter exposing the calls the app makes: `collection(path).add / onSnapshot / orderBy / limit`, and `doc(path).get / set / update / delete / onSnapshot / acquire`. Firebase Firestore has a near-identical API surface; replace the lease-based create-if-absent with a Firestore transaction or `create()` call.
- `claude.use('user')` with your auth provider (`id()`, `can('data.write')` and `profiles(ids)` for change-log attribution and write checks).
- `claude.use('downloads')` with a plain Blob download.

Add real authentication and per-collection write rules at the same time (see issue 2).

## Repository layout

```
WalkervilleChurch/
├── dist/
│   └── index.html          # the built single-file app that is published (generated; commit it)
├── src/
│   ├── index.html          # markup and CSS, with a script placeholder for the build
│   ├── types.ts            # data model types
│   ├── claude.d.ts         # types for the claude.ai runtime and jsPDF
│   ├── dates.ts            # date helpers and the rolling three-month window
│   ├── model.ts            # per-Sunday ministries, snapshots, names, eligibility, away check
│   ├── issues.ts           # problem detection and flag counting
│   ├── generate.ts         # the rotation generator
│   ├── parse.ts            # turns database documents into typed objects, tolerating bad data
│   ├── state.ts            # the one place the page keeps its data and view state
│   ├── selectors.ts        # applies the pure logic to the current state
│   ├── store.ts            # database: connect, subscribe, leases and every write
│   ├── exports.ts          # PDF and CSV export
│   ├── handlers.ts         # click, change, input and drag-and-drop handling
│   ├── render.ts           # redraws the active tab
│   ├── main.ts             # entry point
│   ├── dom.ts, help.ts     # HTML escaping and banner helpers; the in-app help text
│   ├── views/              # one file per tab (roster, serving, away, record, admin) plus shared boxes
│   ├── *.test.ts           # Vitest unit tests for the pure modules
│   └── test-fixtures.ts    # shared test data
├── scripts/
│   └── build.mjs           # bundles src/ into dist/index.html
├── tsconfig.json           # strict TypeScript settings (type-check only, no emit)
├── package.json            # npm scripts and dev dependencies (TypeScript, Vitest, esbuild)
├── README.md               # this file
├── CHANGELOG.md            # user-visible changes, newest first
├── Sunday_Ministries.xlsx  # seed workbook (member names: private repo only)
├── Artifact_Link           # URL of the published claude.ai artifact
├── .gitignore              # keeps exports, secrets, OS/editor and tooling files out
├── .gitattributes          # LF line endings; workbook treated as binary
└── .editorconfig           # consistent editor settings
```

## Privacy

This repository contains members' names and family groupings (in `Sunday_Ministries.xlsx`) and the link to the published artifact. Because both are tracked:

- Keep the repository **private** at all times. Never make it public, enable GitHub Pages, or allow public forks.
- Only people who are allowed to see the church's member list should have access.
- Do not commit exported CSVs, database dumps or backups. `.gitignore` blocks the common patterns, but check `git status` before every commit.
- The artifact link is not a password. Access to the artifact is controlled by claude.ai sharing and sign-in, but the link should still be treated as private.
- If the repository is ever exposed or member data is committed by mistake, make it private immediately, remove the data from history (for example with `git filter-repo`), and treat the data as disclosed. Deleting the file in a new commit is not enough.

## License

None. This is a private project, so no license is needed for now (all rights are reserved by default). If the repository is ever made public, choose a license first and re-read the Privacy section: a public repository is not recommended while the workbook is tracked.
