import { formatDate } from './dates';
import { flash } from './dom';
import { parseAway, parseConfig, parseHistory, parseMinistries, parsePerson, parseRoster } from './parse';
import { allMinistriesNow, byDate, generateOn, nameOn, snapshotNow, windowDates } from './selectors';
import { state, tabId } from './state';
import { ministriesForSunday } from './model';
import type { IsoDate, Ministry, MinistryKey, PersonId, Roster } from './types';

/** Everything that talks to the database: connecting, subscribing, and every write. */

const toDoc = (value: object): DbData => ({ ...value });
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

function requireDb(): ClaudeDb {
  if (!state.db) throw new Error('The database is not connected');
  return state.db;
}

/** Writes a line to the change log. Failures are ignored: the log is best-effort. */
export function logit(message: string): void {
  void requireDb()
    .collection('history')
    .add({ ts: new Date().toISOString(), by: state.me, msg: message })
    .catch(() => {});
}

/**
 * Runs `change` while holding a short lease on a document, so two people editing
 * at once do not overwrite each other. Retries for a few seconds, then gives up
 * with an error whose message is "busy".
 */
export async function withLock<T>(ref: DbDocumentReference, change: (ref: DbDocumentReference) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const lease = await ref.acquire({ holder: tabId, ttlMs: 3000 });
    if (lease.acquired) return change(ref);
    await new Promise<void>((resolve) => setTimeout(resolve, 250 + Math.random() * 300));
  }
  throw new Error('busy');
}

/** Creates a Sunday only if nobody has created it since this page last looked. */
async function createIfAbsent(date: IsoDate, roster: Roster): Promise<boolean> {
  const ref = requireDb().doc(`rosters/${date}`);
  let lease: DbAcquireResult;
  try {
    lease = await ref.acquire({ holder: tabId, ttlMs: 15000 });
  } catch {
    return false;
  }
  if (!lease.acquired) return false;
  const current = await ref.get();
  if (current.exists && current.data()?.['s']) return false;
  await ref.set(toDoc(roster));
  return true;
}

/** Generates every Sunday in the window that does not exist yet. Never overwrites one. */
export async function genMissing(): Promise<void> {
  const missing = windowDates().filter((d) => !state.ros[d]);
  const prior = Object.values(state.ros);
  const made: IsoDate[] = [];
  for (const date of missing) {
    const doc: Roster = {
      date,
      s: generateOn(date, prior.filter((x) => x.date < date).sort(byDate)),
      gen: true,
      manual: false,
      meta: snapshotNow(),
    };
    if (await createIfAbsent(date, doc)) {
      prior.push(doc);
      made.push(date);
    }
  }
  const first = made[0];
  const last = made[made.length - 1];
  if (first && last) logit(`Generated ${made.length} Sunday(s): ${formatDate(first)} to ${formatDate(last)}`);
}

/** Rebuilds one Sunday from scratch, keeping its note and verse. */
export async function regen(date: IsoDate): Promise<void> {
  const s = generateOn(date, Object.values(state.ros).filter((x) => x.date < date).sort(byDate));
  await withLock(requireDb().doc(`rosters/${date}`), async (ref) => {
    const current = await ref.get();
    const c = current.exists ? (current.data() ?? {}) : {};
    await ref.set({
      date,
      s,
      gen: true,
      manual: false,
      note: text(c['note']),
      verse: text(c['verse']),
      meta: snapshotNow(),
    });
    logit(`Regenerated ${formatDate(date)}`);
  });
}

/** Moves a person between ministries on one Sunday. An empty key means "Not serving". */
export async function move(date: IsoDate, id: PersonId, from: MinistryKey | '', to: MinistryKey | ''): Promise<void> {
  if (from === to) return;
  state.sel = null;
  await withLock(requireDb().doc(`rosters/${date}`), async (ref) => {
    const current = await ref.get();
    const roster = current.exists ? parseRoster(date, current.data()) : null;
    if (!roster) return;
    const fromList = from ? (roster.s[from] ?? []) : [];
    const toList = to ? (roster.s[to] ?? []) : [];
    const patch: Record<MinistryKey, PersonId[]> = {};
    if (from && !fromList.includes(id)) {
      flash('Someone else already changed this. The latest version is shown.');
      return;
    }
    if (from) patch[from] = fromList.filter((x) => x !== id);
    if (to && !toList.includes(id)) patch[to] = [...toList, id];
    if (Object.keys(patch).length === 0) return;
    const ministries = ministriesForSunday(state.cfg, roster);
    const label = (k: MinistryKey | ''): string => ministries.find((m) => m.k === k)?.l || 'Not serving';
    await ref.update({ s: patch, manual: true });
    logit(`${formatDate(date)}: moved ${nameOn(date, id)} from ${label(from)} to ${label(to)}`);
  });
}

/** Saves the typed verse for a Sunday. */
export async function saveVerse(date: IsoDate): Promise<void> {
  const verse = state.drafts[`v${date}`] ?? state.ros[date]?.verse ?? '';
  await withLock(requireDb().doc(`rosters/${date}`), (ref) => ref.update({ verse }));
  delete state.drafts[`v${date}`];
  logit(`Verse saved for ${formatDate(date)}${verse ? `: ${verse.slice(0, 200)}` : ' (cleared)'}`);
}

/** Saves the typed note for a Sunday. */
export async function saveNote(date: IsoDate): Promise<void> {
  const note = state.drafts[date] ?? state.ros[date]?.note ?? '';
  await withLock(requireDb().doc(`rosters/${date}`), (ref) => ref.update({ note }));
  delete state.drafts[date];
  logit(`Note saved for ${formatDate(date)}`);
}

/** Applies a change to the ministry list inside a lease, re-reading it first. */
async function saveMinistries(change: (ministries: Ministry[]) => void): Promise<void> {
  await withLock(requireDb().doc('config/main'), async (ref) => {
    const current = await ref.get();
    if (!current.exists) return;
    const ministries = parseMinistries(current.data()?.['ministries']);
    change(ministries);
    await ref.update({ ministries });
  });
}

export async function addMinistry(name: string, headcount: number, exclusive: boolean): Promise<void> {
  await saveMinistries((ms) =>
    ms.push({ k: `m${Date.now().toString(36)}`, l: name, n: Math.max(0, headcount), x: exclusive ? 1 : 0 }),
  );
  logit(`Added ministry: ${name}`);
}

export async function setMinistryRemoved(key: MinistryKey, removed: boolean): Promise<void> {
  await saveMinistries((ms) => {
    const m = ms.find((x) => x.k === key);
    if (m) m.gone = removed;
  });
  logit(`${removed ? 'Removed' : 'Restored'} ministry: ${allMinistriesNow().find((m) => m.k === key)?.l ?? key}`);
}

/** Changes one setting of a ministry: its label (`l`), headcount (`n`) or exclusive flag (`x`). */
export async function updateMinistry(key: MinistryKey, field: 'l' | 'n' | 'x', value: string, checked: boolean): Promise<void> {
  await saveMinistries((ms) => {
    const m = ms.find((x) => x.k === key);
    if (!m) return;
    if (field === 'l' && value.trim()) m.l = value.trim();
    if (field === 'n') m.n = Math.max(0, Number(value) || 0);
    if (field === 'x') m.x = checked ? 1 : 0;
  });
  logit(`Updated ministry settings: ${field === 'l' ? value : allMinistriesNow().find((m) => m.k === key)?.l}`);
}

/**
 * Adds a person under an id made from their name, adding "-2" until the id is free. Free is
 * checked in the database, not in the page's copy, which may not have seen someone else's new
 * person yet; otherwise this would overwrite them.
 */
export async function addPerson(name: string, family: number): Promise<void> {
  let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person';
  for (let attempt = 0; attempt < 50; attempt++, id += '-2') {
    const created = await withLock(requireDb().doc(`people/${id}`), async (ref) => {
      if ((await ref.get()).exists) return false;
      await ref.set({ name, family, elig: [] });
      return true;
    });
    if (created) {
      logit(`Added person: ${name}`);
      return;
    }
  }
  throw new Error('Could not find a free id for this person');
}

const personLabel = (id: PersonId): string => state.people[id]?.name ?? id;

export async function setPersonRemoved(id: PersonId, removed: boolean): Promise<void> {
  await requireDb().doc(`people/${id}`).update({ gone: removed });
  logit(`${removed ? 'Removed' : 'Restored'} person: ${personLabel(id)}`);
}

export async function renamePerson(id: PersonId, name: string): Promise<void> {
  const before = personLabel(id);
  await requireDb().doc(`people/${id}`).update({ name });
  logit(`Renamed ${before} to ${name}`);
}

export async function setFamily(id: PersonId, family: number): Promise<void> {
  await requireDb().doc(`people/${id}`).update({ family });
  logit(`Family number for ${personLabel(id)} set to ${family}`);
}

/** Ticks or unticks one ministry in a person's eligibility. */
export async function setEligibility(id: PersonId, key: MinistryKey, eligible: boolean): Promise<void> {
  await withLock(requireDb().doc(`people/${id}`), async (ref) => {
    const current = await ref.get();
    if (!current.exists) return;
    const list = parsePerson(id, current.data() ?? {}).elig;
    const elig = eligible ? (list.includes(key) ? list : [...list, key]) : list.filter((k) => k !== key);
    await ref.update({ elig });
  });
  logit(
    `${personLabel(id)}${eligible ? ' can now serve in ' : ' can no longer serve in '}${allMinistriesNow().find((m) => m.k === key)?.l || key}`,
  );
}

export async function addAway(person: PersonId, from: IsoDate, to: IsoDate, note: string): Promise<void> {
  await requireDb().collection('away').add({ person, from, to, note });
  logit(`Away: ${personLabel(person)} ${from}${to !== from ? ` to ${to}` : ''}`);
}

export async function removeAway(key: string): Promise<void> {
  await requireDb().doc(`away/${key}`).delete();
  logit('Removed an away entry');
}

let locking = false;
let lockStop = false;

/**
 * Locks Sundays that were generated before snapshots existed, using the
 * ministries and people as they stand now. Runs once everything has loaded, and
 * only for people who may write. Locking never changes who is assigned.
 */
export async function autoLock(): Promise<void> {
  const { db, user, cfg, loaded } = state;
  if (locking || lockStop || !(loaded.config && loaded.people && loaded.rosters) || !cfg || !db) return;
  const todo = Object.keys(state.ros).filter((d) => !state.ros[d]?.meta);
  if (todo.length === 0) return;
  locking = true;
  try {
    if (user && (await user.can('data.write')) === false) {
      lockStop = true;
      return;
    }
    let locked = 0;
    for (const date of todo) {
      await withLock(db.doc(`rosters/${date}`), async (ref) => {
        const current = await ref.get();
        const roster = current.exists ? parseRoster(date, current.data()) : null;
        if (roster && !roster.meta) {
          await ref.update({ meta: snapshotNow(roster) });
          locked++;
        }
      });
    }
    if (locked > 0) logit(`Locked ${locked} existing Sunday(s) to their current ministry and people settings`);
  } catch (error) {
    lockStop = true;
    console.error(error);
  } finally {
    locking = false;
  }
}

/**
 * Connects to the database and subscribes to every collection. `onChange` runs
 * after each update so the page can redraw. Returns false when the viewer is
 * not signed in.
 */
export async function connect(onChange: () => void): Promise<boolean> {
  try {
    const [db, user, downloads] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
    state.db = db;
    state.user = user;
    state.downloads = downloads;
  } catch {
    // Leave whatever connected; the checks below handle absence.
  }
  const db = state.db;
  if (!db) return false;
  try {
    state.me = (await state.user?.id()) ?? '';
  } catch {
    // The change log then records an empty id.
  }

  const redraw = (): void => {
    state.ready = true;
    onChange();
  };

  db.doc('config/main').onSnapshot((snap) => {
    state.cfg = snap.exists ? parseConfig(snap.data()) : null;
    state.loaded.config = true;
    redraw();
    void autoLock();
  });
  db.collection('people').onSnapshot((snap) => {
    state.people = {};
    for (const doc of snap.docs) state.people[doc.id] = parsePerson(doc.id, doc.data() ?? {});
    state.loaded.people = true;
    void autoLock();
    redraw();
  });
  db.collection('rosters').onSnapshot((snap) => {
    state.ros = {};
    for (const doc of snap.docs) {
      const roster = parseRoster(doc.id, doc.data());
      if (roster) state.ros[doc.id] = roster;
    }
    state.loaded.rosters = true;
    void autoLock();
    redraw();
  });
  db.collection('away').onSnapshot((snap) => {
    state.away = {};
    for (const doc of snap.docs) state.away[doc.id] = parseAway(doc.data() ?? {});
    redraw();
  });
  db.collection('history')
    .orderBy('ts', 'desc')
    .limit(200)
    .onSnapshot((snap) => {
      state.log = snap.docs.map((doc) => parseHistory(doc.data() ?? {}));
      void resolveNames();
      redraw();
    });
  return true;
}

/** Looks up display names for everyone named in the change log. They show on the next redraw. */
async function resolveNames(): Promise<void> {
  const ids = [...new Set(state.log.map((h) => h.by).filter(Boolean))];
  try {
    const profiles = await state.user?.profiles(ids);
    for (const id of ids) state.names[id] = profiles?.[id]?.name || '';
  } catch {
    // Names stay as "Someone".
  }
}
