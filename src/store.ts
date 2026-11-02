import {
  assignmentsFrom,
  can,
  canDecideSwap,
  currentUser,
  generatePassword,
  isLastAdmin,
  isRole,
  LAST_ADMIN_MESSAGE,
  newCredentials,
  normalizeUsername,
  passwordProblem,
  ROLE_DEFINITIONS,
  setAssignments,
  setStoredLogins,
  usernameProblem,
  verifyPassword,
} from './auth';
import type { Role, StoredLogin } from './auth';
import { formatDate, todayIso } from './dates';
import { flash } from './dom';
import { parseAway, parseConfig, parseHistory, parseLogin, parseMinistries, parsePerson, parseRoster, parseSwap } from './parse';
import { allMinistriesNow, byDate, generateOn, ministriesOn, nameOn, snapshotNow, windowDates } from './selectors';
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

/** How long a lease lasts. Leases cannot be released, so they must be short. */
const LEASE_MS = 3000;

/**
 * Runs `change` while holding a short lease on a document, so two people editing
 * at once do not overwrite each other. Retries for a few seconds, then gives up
 * with an error whose message is "busy".
 */
export async function withLock<T>(ref: DbDocumentReference, change: (ref: DbDocumentReference) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const lease = await ref.acquire({ holder: tabId, ttlMs: LEASE_MS });
    if (lease.acquired) return change(ref);
    await new Promise<void>((resolve) => setTimeout(resolve, 250 + Math.random() * 300));
  }
  throw new Error('busy');
}

/**
 * Creates a Sunday only if nobody has created it since this page last looked. The lease is as
 * short as in withLock: a lease cannot be released, so a long one would make everyone else's
 * edits to the new Sunday fail with "busy" until it ran out.
 */
async function createIfAbsent(date: IsoDate, roster: Roster): Promise<boolean> {
  const ref = requireDb().doc(`rosters/${date}`);
  let lease: DbAcquireResult;
  try {
    lease = await ref.acquire({ holder: tabId, ttlMs: LEASE_MS });
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

export async function addMinistry(name: string, headcount: number, exclusive: boolean, leaderId = ''): Promise<void> {
  const key = `m${Date.now().toString(36)}`;
  await saveMinistries((ms) => ms.push({ k: key, l: name, n: Math.max(0, headcount), x: exclusive ? 1 : 0 }));
  logit(`Added ministry: ${name}`);
  if (leaderId) await addLead(leaderId, key, name);
}

function requireAccessAdmin(): void {
  if (!can('manageMembers')) throw new Error('Only an admin can change roles');
}

/** Makes a person a team leader of a ministry. Someone who is already an admin stays an admin. */
async function addLead(id: PersonId, key: MinistryKey, label: string): Promise<void> {
  requireAccessAdmin();
  await withLock(requireDb().doc(`people/${id}`), async (ref) => {
    const current = await ref.get();
    if (!current.exists) return;
    const person = parsePerson(id, current.data() ?? {});
    const leads = person.leads ?? [];
    await ref.update({ role: person.role === 'admin' ? 'admin' : 'leader', leads: leads.includes(key) ? leads : [...leads, key] });
  });
  logit(`${personLabel(id)} is now a team leader of ${label}`);
}

/** Sets a person's access role. Moving off Team Leader clears their ministries. Returns a message when it is refused, or null. */
export async function setRole(id: PersonId, role: string): Promise<string | null> {
  requireAccessAdmin();
  if (!isRole(role)) return null;
  const next: Role = role;
  if (next !== 'admin' && isLastAdmin(id, state.people, state.logins)) return LAST_ADMIN_MESSAGE;
  await requireDb().doc(`people/${id}`).update(next === 'leader' ? { role: next } : { role: next, leads: [] });
  logit(`${personLabel(id)} is now ${ROLE_DEFINITIONS[next].label}`);
  return null;
}

/** Ticks or unticks one ministry in a team leader's assignments. */
export async function setLeads(id: PersonId, key: MinistryKey, leads: boolean): Promise<void> {
  requireAccessAdmin();
  await withLock(requireDb().doc(`people/${id}`), async (ref) => {
    const current = await ref.get();
    if (!current.exists) return;
    const list = parsePerson(id, current.data() ?? {}).leads ?? [];
    await ref.update({ leads: leads ? (list.includes(key) ? list : [...list, key]) : list.filter((k) => k !== key) });
  });
  logit(`${personLabel(id)} ${leads ? 'now leads' : 'no longer leads'} ${allMinistriesNow().find((m) => m.k === key)?.l ?? key}`);
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

/** Removes or restores a person. Refuses to remove the only admin who can sign in. Returns a message when refused, or null. */
export async function setPersonRemoved(id: PersonId, removed: boolean): Promise<string | null> {
  if (removed && isLastAdmin(id, state.people, state.logins)) return LAST_ADMIN_MESSAGE;
  await requireDb().doc(`people/${id}`).update({ gone: removed });
  logit(`${removed ? 'Removed' : 'Restored'} person: ${personLabel(id)}`);
  return null;
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

/* ---------- logins ---------- */

let resolveLogins: () => void = () => {};

/** Settles once the first snapshot of the logins collection has arrived, or when there is no database. */
export const loginsReady: Promise<void> = new Promise<void>((resolve) => {
  resolveLogins = resolve;
});

/** Hands the stored logins, with their people's current names, to the sign-in code. */
function refreshLogins(): void {
  const out: Record<string, StoredLogin> = {};
  for (const [username, doc] of Object.entries(state.logins)) {
    const person = state.people[doc.personId];
    if (person?.gone) continue;
    out[username] = {
      username,
      personId: doc.personId,
      displayName: person?.name ?? username,
      salt: doc.salt,
      passwordHash: doc.hash,
      temp: doc.temp === true,
    };
  }
  setStoredLogins(out);
}

/**
 * Creates a login for a person with a random temporary password, which is shown once to the admin (`state.issued`)
 * and which the person must replace the first time they sign in. Returns a message when it cannot, or null.
 */
export async function createLogin(personId: PersonId, rawUsername: string): Promise<string | null> {
  requireAccessAdmin();
  const person = state.people[personId];
  if (!person || person.gone) return 'Choose a person for this login.';
  const username = normalizeUsername(rawUsername);
  const problem = usernameProblem(username, Object.keys(state.logins));
  if (problem) return problem;
  if (Object.values(state.logins).some((l) => l.personId === personId)) return `${person.name} already has a login.`;
  const password = generatePassword();
  const { salt, hash } = await newCredentials(password);
  const taken = await withLock(requireDb().doc(`logins/${username}`), async (ref) => {
    if ((await ref.get()).exists) return true;
    await ref.set({ personId, salt, hash, temp: true });
    return false;
  });
  if (taken) return 'That username is taken.';
  state.issued = { username, password };
  logit(`Created login ${username} for ${person.name}`);
  return null;
}

/**
 * Gives a stored login a new random temporary password (an admin resetting a forgotten one), shown once to the admin.
 * The person must replace it at their next sign-in. An admin cannot reset their own login here. Returns a message when it cannot, or null.
 */
export async function resetLogin(username: string): Promise<string | null> {
  requireAccessAdmin();
  if (!state.logins[username]) return 'That login no longer exists.';
  if (currentUser()?.username === username) return 'Change your own password on the Profile tab.';
  const password = generatePassword();
  const { salt, hash } = await newCredentials(password);
  await requireDb().doc(`logins/${username}`).update({ salt, hash, temp: true });
  state.issued = { username, password };
  logit(`Reset the password for login ${username}`);
  return null;
}

/** Removes a login. Refuses to remove the only admin's login. Returns a message when refused, or null. */
export async function removeLogin(username: string): Promise<string | null> {
  requireAccessAdmin();
  const login = state.logins[username];
  if (login && isLastAdmin(login.personId, state.people, state.logins)) return LAST_ADMIN_MESSAGE;
  await requireDb().doc(`logins/${username}`).delete();
  logit(`Removed login ${username}`);
  return null;
}

/**
 * Replaces the temporary password of the signed-in login with one the person chose, which ends the first-sign-in
 * requirement. Returns a message when it cannot, or null.
 */
export async function setFirstPassword(next: string): Promise<string | null> {
  const user = currentUser();
  const login = user ? state.logins[user.username] : undefined;
  if (!user || user.kind !== 'stored' || !login) return 'Sign in again to set your password.';
  const problem = passwordProblem(next);
  if (problem) return problem;
  if (await verifyPassword(user.username, next)) return 'Choose a password that is different from the temporary one.';
  const { salt, hash } = await newCredentials(next);
  await requireDb().doc(`logins/${user.username}`).update({ salt, hash, temp: false });
  state.logins[user.username] = { ...login, salt, hash, temp: false };
  refreshLogins();
  logit(`Chose a new password for login ${user.username}`);
  return null;
}

/** Lets a signed-in stored login change its own password. Returns a message when it cannot, or null when it worked. */
export async function changeOwnPassword(current: string, next: string): Promise<string | null> {
  const user = currentUser();
  if (!user || user.kind !== 'stored') return 'Only logins created in the Admin tab can change their password here.';
  if (!(await verifyPassword(user.username, current))) return 'Your current password is not right.';
  const problem = passwordProblem(next);
  if (problem) return problem;
  if (next === current) return 'Choose a password that is different from the current one.';
  const { salt, hash } = await newCredentials(next);
  await requireDb().doc(`logins/${user.username}`).update({ salt, hash });
  logit(`Changed the password for login ${user.username}`);
  return null;
}

/** Saves the signed-in person's own name or phone number. */
export async function updateOwnProfile(field: string, value: string): Promise<void> {
  const user = currentUser();
  if (!user || !can('updateOwnProfile', user) || !user.personId) return;
  const person = state.people[user.personId];
  if (!person) return;
  const clean = value.trim().slice(0, 60);
  if (field === 'name') {
    if (!clean || clean === person.name) return;
    await requireDb().doc(`people/${person.id}`).update({ name: clean });
    logit(`${person.name} renamed themselves to ${clean}`);
  } else if (field === 'phone') {
    if (clean === (person.phone ?? '')) return;
    await requireDb().doc(`people/${person.id}`).update({ phone: clean });
    logit(`${person.name} updated their phone number`);
  }
}

/* ---------- swap requests ---------- */

const ministryLabel = (date: IsoDate, key: MinistryKey): string => ministriesOn(date).find((m) => m.k === key)?.l ?? key;

/** Asks to be covered in one ministry on one upcoming Sunday. Returns a message when it cannot, or null when it worked. */
export async function requestSwap(date: IsoDate, ministry: MinistryKey, note: string): Promise<string | null> {
  const user = currentUser();
  const me = user?.personId;
  if (!user || !can('requestSwap', user) || !me) return 'Your login is not linked to a person on the roster.';
  const roster = state.ros[date];
  if (!roster || date < todayIso()) return 'That Sunday is not open for swaps.';
  if (!(roster.s[ministry] ?? []).includes(me)) return 'You are not serving in that ministry on that Sunday.';
  if (Object.values(state.swaps).some((s) => s.status === 'open' && s.date === date && s.ministry === ministry && s.from === me)) {
    return 'You already have an open request for that.';
  }
  await requireDb()
    .collection('swaps')
    .add({ date, ministry, from: me, note: note.trim().slice(0, 300), status: 'open', cover: '', by: '', ts: new Date().toISOString() });
  logit(`Swap requested: ${personLabel(me)}, ${formatDate(date)}, ${ministryLabel(date, ministry)}`);
  return null;
}

/** Withdraws the signed-in person's own open request. */
export async function cancelSwap(id: string): Promise<string | null> {
  const user = currentUser();
  const swap = state.swaps[id];
  if (!user || !swap || swap.from !== user.personId) return 'You can only cancel your own requests.';
  let result: string | null = null;
  await withLock(requireDb().doc(`swaps/${id}`), async (ref) => {
    const current = await ref.get();
    if (!current.exists || parseSwap(id, current.data() ?? {}).status !== 'open') {
      result = 'That request has already been dealt with.';
      return;
    }
    await ref.update({ status: 'cancelled' });
  });
  if (!result) logit(`Swap cancelled: ${personLabel(swap.from)}, ${formatDate(swap.date)}`);
  return result;
}

/**
 * Approves a swap, putting `cover` in the requester's place on the roster, or declines it. Only someone who can
 * edit that ministry may decide, and never their own request unless they are an admin. Returns a message when
 * it cannot be done, or null when it worked.
 */
export async function decideSwap(id: string, decision: 'approved' | 'declined', cover: PersonId): Promise<string | null> {
  const user = currentUser();
  const swap = state.swaps[id];
  if (!user || !swap) return 'That request no longer exists.';
  if (!canDecideSwap(swap.ministry, swap.from, user)) return 'You cannot decide this request.';
  if (decision === 'approved') {
    if (!cover || cover === swap.from) return 'Choose someone else to cover.';
    if (!state.people[cover] || state.people[cover]?.gone) return 'That person is not available.';
  }
  const out: { error: string | null } = { error: null };
  await withLock(requireDb().doc(`swaps/${id}`), async (swapRef) => {
    const current = await swapRef.get();
    const latest = current.exists ? parseSwap(id, current.data() ?? {}) : null;
    if (!latest || latest.status !== 'open') {
      out.error = 'That request has already been dealt with.';
      return;
    }
    if (decision === 'approved') {
      await withLock(requireDb().doc(`rosters/${latest.date}`), async (rosterRef) => {
        const snapshot = await rosterRef.get();
        const roster = snapshot.exists ? parseRoster(latest.date, snapshot.data()) : null;
        if (!roster) {
          out.error = 'That Sunday no longer exists.';
          return;
        }
        const list = roster.s[latest.ministry] ?? [];
        if (!list.includes(latest.from)) {
          out.error = 'The person is no longer on that team, so the roster was not changed.';
          return;
        }
        const next = list.filter((x) => x !== latest.from);
        if (!next.includes(cover)) next.push(cover);
        await rosterRef.update({ s: { [latest.ministry]: next }, manual: true });
      });
      if (out.error) return;
    }
    await swapRef.update({ status: decision, cover: decision === 'approved' ? cover : '', by: user.username });
  });
  if (!out.error) {
    logit(
      decision === 'approved'
        ? `Swap approved: ${personLabel(cover)} covers ${personLabel(swap.from)}, ${formatDate(swap.date)}, ${ministryLabel(swap.date, swap.ministry)}`
        : `Swap declined: ${personLabel(swap.from)}, ${formatDate(swap.date)}, ${ministryLabel(swap.date, swap.ministry)}`,
    );
  }
  return out.error;
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
  if (locking || lockStop || !currentUser() || currentUser()?.mustChangePassword || !(loaded.config && loaded.people && loaded.rosters) || !cfg || !db) return;
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
  if (!db) {
    resolveLogins();
    return false;
  }
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
    setAssignments(assignmentsFrom(state.people));
    refreshLogins();
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
  db.collection('swaps').onSnapshot((snap) => {
    state.swaps = {};
    for (const doc of snap.docs) state.swaps[doc.id] = parseSwap(doc.id, doc.data() ?? {});
    redraw();
  });
  db.collection('logins').onSnapshot((snap) => {
    state.logins = {};
    for (const doc of snap.docs) {
      const login = parseLogin(doc.data());
      if (login) state.logins[doc.id] = login;
    }
    refreshLogins();
    resolveLogins();
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
