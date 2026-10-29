import type {
  AwayEntry,
  Config,
  HistoryEntry,
  IsoDate,
  Person,
  PersonId,
  Roster,
  Selection,
  TabId,
} from './types';

/** Everything the page remembers. Held in one place so every module reads the same state. */
export interface AppState {
  // Runtime capabilities (null until connected, or when unavailable).
  db: ClaudeDb | null;
  user: ClaudeUser | null;
  downloads: ClaudeDownloads | null;
  /** The viewer's id, or an empty string when unknown. */
  me: string;

  // Data mirrored from the database.
  cfg: Config | null;
  people: Record<PersonId, Person>;
  ros: Record<IsoDate, Roster>;
  away: Record<string, AwayEntry>;
  log: HistoryEntry[];
  /** Display names for ids in the change log. */
  names: Record<string, string>;
  /** Which collections have delivered their first snapshot. Locking waits for all three. */
  loaded: { config: boolean; people: boolean; rosters: boolean };
  /** True once any snapshot has arrived, so the first render has something to show. */
  ready: boolean;

  // View state.
  tab: TabId;
  sel: Selection | null;
  past: boolean;
  /** The thing awaiting a second click to confirm: a date, `p:<id>` or `m:<key>`. */
  cf: string | null;
  sedit: boolean;
  /** Service record highlight threshold (0 = off). */
  thr: number;
  /** Person whose detail view is open on the Service record. */
  pick: PersonId | '';
  /** Sunday chosen in the verses and notes box. */
  nd: IsoDate | '';
  /** Sunday opened from a needs-attention flag. */
  fd: IsoDate | '';
  /** Unsaved verse (`v<date>`) and note (`<date>`) text. */
  drafts: Record<string, string>;
}

export const state: AppState = {
  db: null,
  user: null,
  downloads: null,
  me: '',
  cfg: null,
  people: {},
  ros: {},
  away: {},
  log: [],
  names: {},
  loaded: { config: false, people: false, rosters: false },
  ready: false,
  tab: 's',
  sel: null,
  past: false,
  cf: null,
  sedit: false,
  thr: 0,
  pick: '',
  nd: '',
  fd: '',
  drafts: {},
};

/** Identifies this browser tab as the holder of a lease. Not the user id: two tabs must not share a lease. */
export const tabId = `t${Math.random().toString(36).slice(2)}`;
