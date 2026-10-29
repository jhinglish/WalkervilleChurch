import type {
  Assignments,
  AwayEntry,
  Config,
  HistoryEntry,
  IsoDate,
  Ministry,
  MinistrySnapshot,
  Person,
  PersonId,
  PersonSnapshot,
  Roster,
  RosterMeta,
} from './types';

/**
 * Database documents arrive as `Record<string, unknown>`. These functions turn
 * them into the app's types, tolerating missing or malformed fields so one bad
 * document cannot break the page.
 */

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function parseMinistry(v: unknown): Ministry | null {
  if (!isRecord(v)) return null;
  const k = str(v['k']);
  if (!k) return null;
  const ministry: Ministry = { k, l: str(v['l'], k), n: num(v['n']), x: v['x'] ? 1 : 0 };
  if (v['gone']) ministry.gone = true;
  return ministry;
}

export function parseMinistries(v: unknown): Ministry[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseMinistry).filter((m): m is Ministry => m !== null);
}

export function parseConfig(data: Raw | undefined): Config | null {
  if (!data) return null;
  return { start: str(data['start']), ministries: parseMinistries(data['ministries']) };
}

export function parsePerson(id: PersonId, data: Raw): Person {
  const person: Person = {
    id,
    name: str(data['name'], id),
    family: num(data['family']),
    elig: strings(data['elig']),
  };
  if (data['gone']) person.gone = true;
  return person;
}

function parseAssignments(v: unknown): Assignments | null {
  if (!isRecord(v)) return null;
  const out: Assignments = {};
  for (const [k, ids] of Object.entries(v)) out[k] = strings(ids);
  return out;
}

function parseMinistrySnapshot(v: unknown): MinistrySnapshot | null {
  const m = parseMinistry(v);
  return m ? { k: m.k, l: m.l, n: m.n, x: m.x } : null;
}

function parseMeta(v: unknown): RosterMeta | undefined {
  if (!isRecord(v) || !Array.isArray(v['m']) || !isRecord(v['p'])) return undefined;
  const people: Record<PersonId, PersonSnapshot> = {};
  for (const [id, p] of Object.entries(v['p'])) {
    if (isRecord(p)) people[id] = { n: str(p['n'], id), e: strings(p['e']) };
  }
  return {
    m: v['m'].map(parseMinistrySnapshot).filter((m): m is MinistrySnapshot => m !== null),
    p: people,
  };
}

/** Returns null for documents without assignments, which the app ignores. */
export function parseRoster(docId: IsoDate, data: Raw | undefined): Roster | null {
  if (!data) return null;
  const s = parseAssignments(data['s']);
  if (!s) return null;
  const roster: Roster = { date: str(data['date'], docId), s };
  if (data['gen']) roster.gen = true;
  if (data['manual']) roster.manual = true;
  if (typeof data['note'] === 'string') roster.note = data['note'];
  if (typeof data['verse'] === 'string') roster.verse = data['verse'];
  const meta = parseMeta(data['meta']);
  if (meta) roster.meta = meta;
  return roster;
}

export function parseAway(data: Raw): AwayEntry {
  return { person: str(data['person']), from: str(data['from']), to: str(data['to']), note: str(data['note']) };
}

export function parseHistory(data: Raw): HistoryEntry {
  return { ts: str(data['ts']), by: str(data['by']), msg: str(data['msg']) };
}
