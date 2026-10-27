/**
 * Data model for the Walkerville Sunday Roster.
 *
 * These types mirror the documents stored in the claude.ai artifact database
 * (see README > Data model). Documents come back from the database typed as
 * `Record<string, unknown>`, so they must be validated or narrowed before use;
 * these interfaces describe the shape the app expects after that step.
 */

/** Calendar date as `YYYY-MM-DD` (UTC). */
export type IsoDate = string;

/** Slug of a person's name, used as the `people/<id>` document id. */
export type PersonId = string;

/** Stable key of a ministry, for example `sec` or `m1k2j3`. Never changes after creation. */
export type MinistryKey = string;

/** Boolean stored as a number in the database. */
export type Flag01 = 0 | 1;

/** One ministry in `config/main`. */
export interface Ministry {
  k: MinistryKey;
  /** Display label. */
  l: string;
  /** People needed per Sunday. Applies to automatic generation only. */
  n: number;
  /** Exclusive: anyone serving here cannot serve in anything else that Sunday. */
  x: Flag01;
  /** Soft delete. A removed ministry is not used for new Sundays. */
  gone?: boolean;
}

/** The `config/main` document. */
export interface Config {
  /** First Sunday of the roster. */
  start: IsoDate;
  ministries: Ministry[];
}

/** A `people/<id>` document as stored (the id is the document id, not a field). */
export interface PersonDoc {
  name: string;
  /** Family group number. 0 means no family. */
  family: number;
  /** Keys of the ministries this person can serve in. */
  elig: MinistryKey[];
  /** Soft delete. A removed person is not used for new Sundays. */
  gone?: boolean;
}

/** A person as held in memory: the stored document plus its id. */
export interface Person extends PersonDoc {
  id: PersonId;
}

/** Who is serving in which ministry on one Sunday. */
export type Assignments = Record<MinistryKey, PersonId[]>;

/** A ministry as it was when a Sunday was generated. */
export interface MinistrySnapshot {
  k: MinistryKey;
  l: string;
  n: number;
  x: Flag01;
}

/** A person's name and eligibility as they were when a Sunday was generated. */
export interface PersonSnapshot {
  n: string;
  e: MinistryKey[];
}

/**
 * Snapshot stored with every generated Sunday so later changes to ministries
 * or people never alter how that Sunday displays or flags. It never records
 * who is assigned; only `Roster.s` does.
 */
export interface RosterMeta {
  m: MinistrySnapshot[];
  p: Record<PersonId, PersonSnapshot>;
}

/** A `rosters/<YYYY-MM-DD>` document. */
export interface Roster {
  date: IsoDate;
  s: Assignments;
  /** Created by the generator. */
  gen?: boolean;
  /** Edited by hand after generation. */
  manual?: boolean;
  note?: string;
  verse?: string;
  /** Absent only on Sundays generated before snapshots existed. */
  meta?: RosterMeta;
}

/** An `away/<auto-id>` document. `from` and `to` are inclusive. */
export interface AwayEntry {
  person: PersonId;
  from: IsoDate;
  to: IsoDate;
  note: string;
}

/** A `history/<auto-id>` change-log entry. */
export interface HistoryEntry {
  /** ISO timestamp. */
  ts: string;
  /** Viewer id, or an empty string when unknown. */
  by: string;
  msg: string;
}

/** Problems found on one Sunday. */
export interface RosterIssues {
  /** Problems per person. */
  out: Record<PersonId, string[]>;
  /** Ministry-level problems, such as a short headcount. */
  sum: string[];
}

/** Tabs in the app. */
export type TabId = 's' | 'r' | 'a' | 'v' | 'h';

/** The person currently selected for a tap-to-move. `k` is empty for "Not serving". */
export interface Selection {
  id: PersonId;
  d: IsoDate;
  k: MinistryKey | '';
}
