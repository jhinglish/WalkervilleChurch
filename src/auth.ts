/**
 * Mock authentication for the Walkerville Sunday Roster: user profiles, role definitions and session state.
 *
 * IMPORTANT: this is a front-end gate, not security. Every stored login's salt and password hash (and, in the
 * test builds only, the demo profiles) is readable by anyone who can open the page or the artifact database,
 * so a hash can be attacked offline. A session is a record in sessionStorage that anyone with the page open can forge, and
 * the lockout below only slows down someone typing into this page. It controls what the interface shows.
 * It does not protect the data, which is protected only by claude.ai sign-in and the artifact database's own
 * rules (README > Known issues, item 2). Replace this module with a real identity provider before relying on it.
 */
import type { MinistryKey, Person, PersonId, Role, TabId } from './types';

/* ---------- roles and permissions ---------- */

export type { Role };

export const ROLES: readonly Role[] = ['admin', 'leader', 'member'];

export const isRole = (value: string | undefined): value is Role => value !== undefined && (ROLES as readonly string[]).includes(value);

/** Everything a role may be allowed to do. Views mark action elements with these names (see mask.ts). */
export const PERMISSIONS = [
  'viewOwnSchedule',
  'viewServing',
  'viewFullRoster',
  'exportCsv',
  'generateRoster',
  'editRoster',
  'editAllMinistries',
  'editNotes',
  'manageAnyAway',
  'manageOwnAway',
  'manageMembers',
  'requestSwap',
  'decideSwaps',
  'updateOwnProfile',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const isPermission = (value: string | undefined): value is Permission =>
  value !== undefined && (PERMISSIONS as readonly string[]).includes(value);

export interface RoleDefinition {
  role: Role;
  /** Name shown beside the signed-in user. */
  label: string;
  description: string;
  permissions: readonly Permission[];
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  admin: {
    role: 'admin',
    label: 'Admin / Elder',
    description: 'Full control of settings, roster generation and member management.',
    permissions: PERMISSIONS,
  },
  leader: {
    role: 'leader',
    label: 'Team Leader',
    description: 'Views the full roster, requests swaps and manages the ministries assigned to them.',
    permissions: [
      'viewOwnSchedule',
      'viewServing',
      'viewFullRoster',
      'exportCsv',
      'editRoster',
      'editNotes',
      'manageAnyAway',
      'manageOwnAway',
      'requestSwap',
      'decideSwaps',
      'updateOwnProfile',
    ],
  },
  member: {
    role: 'member',
    label: 'Member',
    description: 'Views their own schedule, requests swaps, marks their own unavailability and updates their profile.',
    permissions: ['viewOwnSchedule', 'viewServing', 'manageOwnAway', 'requestSwap', 'updateOwnProfile'],
  },
};

/** The permission needed to open each tab. */
export const TAB_REQUIRES: Record<TabId, Permission> = {
  m: 'viewOwnSchedule',
  w: 'requestSwap',
  s: 'viewServing',
  r: 'viewFullRoster',
  a: 'manageOwnAway',
  v: 'viewFullRoster',
  p: 'updateOwnProfile',
  h: 'manageMembers',
};

export const isTabId = (value: string): value is TabId => Object.hasOwn(TAB_REQUIRES, value);

/* ---------- user profiles ---------- */

export interface UserProfile {
  id: string;
  /** Lower-case sign-in name. */
  username: string;
  displayName: string;
  /** For a stored login this is only the default; the person's assigned role replaces it. */
  role: Role;
  /** Ministry keys a team leader manages. Unused for other roles. */
  managedMinistries: readonly MinistryKey[];
  /** The person on the roster this login belongs to, if any. Members can only flag this person away. */
  personId: PersonId | null;
  /** `demo` accounts are built into the code; `stored` logins are created by an admin and kept in the database. */
  kind: 'demo' | 'stored';
  salt: string;
  /** SHA-256 (hex) of `<salt>:<password>`. */
  passwordHash: string;
  /** A stored login whose password an admin set: its person must choose their own at the next sign-in. */
  temp?: boolean;
}

/** A profile without its credentials, which is all the rest of the app ever sees. */
export type PublicUser = Omit<UserProfile, 'salt' | 'passwordHash' | 'temp'> & {
  /** True while the login still has the temporary password. Such a session may do nothing but set a new password. */
  mustChangePassword?: boolean;
};

/**
 * Demo accounts with made-up names, for the unit and browser tests only. `leader` manages Welcoming and Tea and
 * Coffee (keys `wel` and `tea`); `leader` and `member` are linked to roster people with ids `demo-leader` and
 * `demo-member`. Their passwords cannot be changed in the app. Never exported directly: see MOCK_USERS.
 */
const DEMO_USERS: readonly UserProfile[] = [
  {
    id: 'u-elder',
    username: 'elder',
    displayName: 'Demo Elder',
    role: 'admin',
    managedMinistries: [],
    personId: null,
    kind: 'demo',
    salt: 'wv-elder-1',
    passwordHash: '1440851cacd7b12eedcceca71057739c07f9908945e53cfc011caa1d4fd186fd',
  },
  {
    id: 'u-leader',
    username: 'leader',
    displayName: 'Demo Team Leader',
    role: 'leader',
    managedMinistries: ['wel', 'tea'],
    personId: 'demo-leader',
    kind: 'demo',
    salt: 'wv-leader-1',
    passwordHash: '126154c6af9883d15f288cda99789a023d7a6afb40de4c3cccc498ee25d6e380',
  },
  {
    id: 'u-member',
    username: 'member',
    displayName: 'Demo Member',
    role: 'member',
    managedMinistries: [],
    personId: 'demo-member',
    kind: 'demo',
    salt: 'wv-member-1',
    passwordHash: '7820064a13c399dedd44d4a011cdf815a1894dee45f6d46f2715e6f8365f8c14',
  },
];

/**
 * The built-in accounts. `__DEMO_ACCOUNTS__` is a build-time constant (scripts/build.mjs, vitest.config.ts): it is
 * false in the production build, where esbuild folds this to an empty list and drops DEMO_USERS, so the published
 * page has no built-in logins. Its first admin is a stored login (README > Sign-in and roles > First admin).
 */
export const MOCK_USERS: readonly UserProfile[] = __DEMO_ACCOUNTS__ ? DEMO_USERS : [];

/* ---------- logins created by an admin ---------- */

/** A login an admin created, with the name of its person for display. */
export interface StoredLogin {
  username: string;
  personId: PersonId;
  displayName: string;
  salt: string;
  passwordHash: string;
  /** The password is a temporary one an admin set; see UserProfile.temp. */
  temp?: boolean;
}

let storedLogins: Record<string, StoredLogin> = {};

/** Replaces the stored logins, keyed by username. Called whenever the database's logins or people change. */
export function setStoredLogins(next: Record<string, StoredLogin>): void {
  storedLogins = next;
}

const storedProfile = (l: StoredLogin): UserProfile => ({
  id: `l:${l.username}`,
  username: l.username,
  displayName: l.displayName,
  role: 'member',
  managedMinistries: [],
  personId: l.personId,
  kind: 'stored',
  salt: l.salt,
  passwordHash: l.passwordHash,
  ...(l.temp ? { temp: true } : {}),
});

const allProfiles = (): UserProfile[] => [...MOCK_USERS, ...Object.values(storedLogins).map(storedProfile)];
const profileByName = (username: string): UserProfile | undefined => allProfiles().find((u) => u.username === username);
const profileById = (id: string): UserProfile | undefined => allProfiles().find((u) => u.id === id);

export const normalizeUsername = (raw: string): string => raw.trim().toLowerCase();

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

/** Why a new username cannot be used, or null. `taken` lists the stored usernames; the demo ones are always taken. */
export function usernameProblem(name: string, taken: readonly string[]): string | null {
  if (!USERNAME_PATTERN.test(name)) return 'Usernames are 3 to 32 letters, digits, dots, dashes or underscores.';
  if (MOCK_USERS.some((u) => u.username === name) || taken.includes(name)) return 'That username is taken.';
  return null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return 'That password is too long.';
  return null;
}

function toPublic(profile: UserProfile): PublicUser {
  // An admin's assignment for the linked person overrides the profile's default role.
  const assigned = profile.personId ? assignments[profile.personId] : undefined;
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    role: assigned?.role ?? profile.role,
    managedMinistries: assigned ? (assigned.role === 'leader' ? assigned.leads : []) : profile.managedMinistries,
    personId: profile.personId,
    kind: profile.kind,
    ...(profile.temp ? { mustChangePassword: true } : {}),
  };
}

/* ---------- role assignments made by an admin ---------- */

/** A role an admin has given to a person on the roster. */
export interface AccessAssignment {
  role: Role;
  leads: readonly MinistryKey[];
}

let assignments: Record<PersonId, AccessAssignment> = {};

/** Replaces the assignments. A login linked to one of these people takes that role and those ministries. */
export function setAssignments(next: Record<PersonId, AccessAssignment>): void {
  assignments = next;
}

/** Builds assignments from the people list: only people who are not removed and have a stored role. */
export function assignmentsFrom(people: Record<PersonId, Person>): Record<PersonId, AccessAssignment> {
  const out: Record<PersonId, AccessAssignment> = {};
  for (const person of Object.values(people)) {
    if (person.role && !person.gone) out[person.id] = { role: person.role, leads: person.leads ?? [] };
  }
  return out;
}

/* ---------- keeping at least one admin ---------- */

export const LAST_ADMIN_MESSAGE =
  'That would leave nobody who can sign in as an admin. Make another person an admin, and give them a login, first.';

/** People who can manage roles and logins right now: an admin who is not removed and has a stored login. */
export function signInAdmins(people: Record<PersonId, Person>, logins: Record<string, { personId: PersonId }>): PersonId[] {
  const withLogin = new Set(Object.values(logins).map((l) => l.personId));
  return Object.values(people)
    .filter((p) => p.role === 'admin' && !p.gone && withLogin.has(p.id))
    .map((p) => p.id);
}

/** Whether this person is the only admin who can sign in, so demoting, removing or un-logging them would lock everyone out. */
export function isLastAdmin(personId: PersonId, people: Record<PersonId, Person>, logins: Record<string, { personId: PersonId }>): boolean {
  const admins = signInAdmins(people, logins);
  return admins.length === 1 && admins[0] === personId;
}

/* ---------- session state ---------- */

export interface Session {
  /** Random 128-bit token, hex. Identifies this sign-in; it is not checked by any server. */
  token: string;
  userId: string;
  /** Milliseconds since the epoch. */
  issuedAt: number;
  expiresAt: number;
}

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const SESSION_STORAGE_KEY = 'walkerville.session';

/** The live session. Held in memory first, so signing in still works when browser storage does not. */
let session: Session | null = null;

/** sessionStorage, or null where it is missing or blocked. */
function store(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function persist(value: Session | null): void {
  try {
    const s = store();
    if (!s) return;
    if (value) s.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
    else s.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage is a convenience; the in-memory session still works.
  }
}

function parseSession(raw: string): Session | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { token, userId, issuedAt, expiresAt } = value as Record<string, unknown>;
    if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) return null;
    if (typeof userId !== 'string' || typeof issuedAt !== 'number' || typeof expiresAt !== 'number') return null;
    return { token, userId, issuedAt, expiresAt };
  } catch {
    return null;
  }
}

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** SHA-256 (hex) of `<salt>:<password>`. Throws when the browser has no Web Crypto (an insecure page). */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto is not available');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
  return toHex(new Uint8Array(digest));
}

/** A fresh random salt and the hash of the password with it, for a new or changed stored login. */
export async function newCredentials(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomHex(16);
  return { salt, hash: await hashPassword(password, salt) };
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random temporary password such as `K7QM-X2PD-9WTE-HR4N`: 16 characters without look-alikes (0/O, 1/I), about 80 bits. */
export function generatePassword(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => PASSWORD_ALPHABET.charAt(b % PASSWORD_ALPHABET.length));
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** Whether this password is right for this username. Does not start a session or count as a failed attempt. */
export async function verifyPassword(username: string, password: string): Promise<boolean> {
  const profile = profileByName(normalizeUsername(username));
  if (!profile) return false;
  try {
    return (await hashPassword(password, profile.salt)) === profile.passwordHash;
  } catch {
    return false;
  }
}

/* ---------- failed-attempt lockout ---------- */

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
const ATTEMPTS_KEY = 'walkerville.attempts';

interface Attempt {
  count: number;
  /** Locked until this time (ms since the epoch); 0 when not locked. */
  until: number;
}

let attempts: Record<string, Attempt> | null = null;

function loadAttempts(): Record<string, Attempt> {
  if (attempts) return attempts;
  const loaded: Record<string, Attempt> = {};
  try {
    const raw = store()?.getItem(ATTEMPTS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (typeof value === 'object' && value !== null) {
      for (const [name, entry] of Object.entries(value)) {
        const { count, until } = (entry ?? {}) as Record<string, unknown>;
        if (typeof count === 'number' && typeof until === 'number') loaded[name] = { count, until };
      }
    }
  } catch {
    // Start with a clean slate.
  }
  attempts = loaded;
  return loaded;
}

function saveAttempts(): void {
  try {
    store()?.setItem(ATTEMPTS_KEY, JSON.stringify(loadAttempts()));
  } catch {
    // Best effort.
  }
}

/** Forgets every failed attempt. */
export function clearAttempts(): void {
  attempts = {};
  try {
    store()?.removeItem(ATTEMPTS_KEY);
  } catch {
    // Best effort.
  }
}

/** When this username is locked until, or 0 if it is not locked. */
export function lockedUntil(username: string, now: number = Date.now()): number {
  const entry = loadAttempts()[username];
  return entry && entry.until > now ? entry.until : 0;
}

/** Counts a failed attempt. Returns the lock expiry if this one locked the username, otherwise 0. */
function recordFailure(username: string, now: number): number {
  const all = loadAttempts();
  const entry = all[username] ?? { count: 0, until: 0 };
  const count = (entry.until && entry.until <= now ? 0 : entry.count) + 1;
  if (count >= MAX_ATTEMPTS) {
    const until = now + LOCKOUT_MS;
    all[username] = { count: 0, until };
    saveAttempts();
    return until;
  }
  all[username] = { count, until: 0 };
  saveAttempts();
  return 0;
}

/* ---------- signing in and out ---------- */

export type SignInResult =
  | { ok: true; user: PublicUser }
  | { ok: false; reason: 'invalid' | 'unavailable' }
  | { ok: false; reason: 'locked'; until: number };

/**
 * Checks a username and password against the demo accounts and the stored logins and, if they match,
 * starts a session. An unknown username and a wrong password give the same result, and both take a hash
 * to answer. After MAX_ATTEMPTS failures in a row for one username it is locked for LOCKOUT_MS.
 */
export async function signIn(username: string, password: string, now: number = Date.now()): Promise<SignInResult> {
  const name = normalizeUsername(username);
  const lock = name ? lockedUntil(name, now) : 0;
  if (lock) return { ok: false, reason: 'locked', until: lock };
  const profile = profileByName(name);
  let hash: string;
  try {
    hash = await hashPassword(password, profile?.salt ?? 'no-such-user');
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!profile || hash !== profile.passwordHash) {
    const until = name ? recordFailure(name, now) : 0;
    return until ? { ok: false, reason: 'locked', until } : { ok: false, reason: 'invalid' };
  }
  const all = loadAttempts();
  if (all[name]) {
    delete all[name];
    saveAttempts();
  }
  session = { token: randomHex(16), userId: profile.id, issuedAt: now, expiresAt: now + SESSION_TTL_MS };
  persist(session);
  return { ok: true, user: toPublic(profile) };
}

/** Picks up a session saved earlier in this browser tab. Returns the user, or null when there is none worth keeping. */
export function restoreSession(now: number = Date.now()): PublicUser | null {
  let raw: string | null = null;
  try {
    raw = store()?.getItem(SESSION_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  const saved = raw ? parseSession(raw) : null;
  const profile = saved ? profileById(saved.userId) : undefined;
  if (!saved || !profile || saved.expiresAt <= now || saved.issuedAt > now) {
    if (raw) persist(null);
    return null;
  }
  session = saved;
  return toPublic(profile);
}

/** The signed-in user, or null when nobody is signed in, the session has expired or the login was removed. */
export function currentUser(now: number = Date.now()): PublicUser | null {
  if (!session) return null;
  if (session.expiresAt <= now) {
    signOut();
    return null;
  }
  const profile = profileById(session.userId);
  return profile ? toPublic(profile) : null;
}

export function signOut(): void {
  session = null;
  persist(null);
}

/* ---------- permission checks ---------- */

export function can(permission: Permission, user: PublicUser | null = currentUser()): boolean {
  return user !== null && !user.mustChangePassword && ROLE_DEFINITIONS[user.role].permissions.includes(permission);
}

export const canViewTab = (tab: TabId, user: PublicUser | null = currentUser()): boolean => can(TAB_REQUIRES[tab], user);

/** Whether the user may add or remove people in one ministry. Admins may edit all; leaders only their own. */
export function canEditMinistry(key: MinistryKey, user: PublicUser | null = currentUser()): boolean {
  if (!user) return false;
  if (can('editAllMinistries', user)) return true;
  return can('editRoster', user) && user.managedMinistries.includes(key);
}

/** Whether the user may edit at least one ministry, so editing controls are worth showing. */
export function canEditAnyMinistry(user: PublicUser | null = currentUser()): boolean {
  if (!user) return false;
  return can('editAllMinistries', user) || (can('editRoster', user) && user.managedMinistries.length > 0);
}

/**
 * Whether the user may move someone between two places on a Sunday. An empty key means "Not serving",
 * which is not a ministry, so a leader may move someone to or from it only alongside a ministry they manage.
 */
export function canMoveBetween(from: MinistryKey | '', to: MinistryKey | '', user: PublicUser | null = currentUser()): boolean {
  if (!user) return false;
  if (can('editAllMinistries', user)) return true;
  const keys = [from, to].filter((k) => k !== '');
  return keys.length > 0 && keys.every((k) => canEditMinistry(k, user));
}

/** Whether the user may see and change this person's away entries. Members: only their own. */
export function canManageAway(personId: PersonId, user: PublicUser | null = currentUser()): boolean {
  if (!user) return false;
  if (can('manageAnyAway', user)) return true;
  return can('manageOwnAway', user) && user.personId !== null && user.personId === personId;
}

/**
 * Whether the user may approve or decline a swap request: they must be able to edit that ministry, and only
 * an admin may decide their own request.
 */
export function canDecideSwap(ministry: MinistryKey, requester: PersonId, user: PublicUser | null = currentUser()): boolean {
  if (!user || !can('decideSwaps', user) || !canEditMinistry(ministry, user)) return false;
  return can('editAllMinistries', user) || user.personId !== requester;
}
