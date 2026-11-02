import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOCK_USERS,
  PERMISSIONS,
  ROLE_DEFINITIONS,
  SESSION_STORAGE_KEY,
  SESSION_TTL_MS,
  TAB_REQUIRES,
  can,
  canEditAnyMinistry,
  canEditMinistry,
  canManageAway,
  canMoveBetween,
  canViewTab,
  currentUser,
  generatePassword,
  hashPassword,
  isLastAdmin,
  isPermission,
  isTabId,
  LAST_ADMIN_MESSAGE,
  restoreSession,
  setAssignments,
  assignmentsFrom,
  canDecideSwap,
  clearAttempts,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  newCredentials,
  normalizeUsername,
  passwordProblem,
  setStoredLogins,
  signInAdmins,
  usernameProblem,
  verifyPassword,
  signIn,
  signOut,
} from './auth';
import type { PublicUser, Role } from './auth';
import { demoLogins } from './test-fixtures';
import type { TabId } from './types';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const NOW = Date.UTC(2027, 0, 3, 9, 0, 0);

async function userFor(role: Role): Promise<PublicUser> {
  const login = demoLogins[role];
  const result = await signIn(login.username, login.password, NOW);
  if (!result.ok) throw new Error(`could not sign in as ${role}`);
  return result.user;
}

let storage: Storage;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('sessionStorage', storage);
});

afterEach(() => {
  signOut();
  clearAttempts();
  setStoredLogins({});
  vi.unstubAllGlobals();
});

describe('mock profiles', () => {
  it('have unique ids and usernames, one account per role', () => {
    expect(new Set(MOCK_USERS.map((u) => u.id)).size).toBe(MOCK_USERS.length);
    expect(new Set(MOCK_USERS.map((u) => u.username)).size).toBe(MOCK_USERS.length);
    expect(MOCK_USERS.map((u) => u.role).sort()).toEqual(['admin', 'leader', 'member']);
  });

  it('store a salted hash that matches the demo password, not the password itself', async () => {
    for (const user of MOCK_USERS) {
      const login = Object.values(demoLogins).find((l) => l.username === user.username);
      expect(login).toBeDefined();
      expect(user.passwordHash).toMatch(/^[0-9a-f]{64}$/);
      expect(await hashPassword(login?.password ?? '', user.salt)).toBe(user.passwordHash);
      expect(JSON.stringify(user)).not.toContain(login?.password ?? '#');
    }
  });
});

describe('signIn', () => {
  it('signs in each demo account with its role', async () => {
    for (const role of ['admin', 'leader', 'member'] as const) {
      const user = await userFor(role);
      expect(user.role).toBe(role);
      expect(currentUser(NOW)).toEqual(user);
      signOut();
    }
  });

  it('never hands the salt or hash to the rest of the app', async () => {
    const user = await userFor('admin');
    expect(Object.keys(user)).not.toContain('passwordHash');
    expect(Object.keys(user)).not.toContain('salt');
  });

  it('ignores case and surrounding spaces in the username', async () => {
    const result = await signIn(`  ${demoLogins.leader.username.toUpperCase()}  `, demoLogins.leader.password, NOW);
    expect(result.ok).toBe(true);
  });

  it('rejects a wrong password, an unknown username and an empty password the same way, and signs nobody in', async () => {
    for (const [name, password] of [
      [demoLogins.admin.username, 'wrong'],
      ['nobody', demoLogins.admin.password],
      [demoLogins.admin.username, ''],
      ['', ''],
    ] as const) {
      expect(await signIn(name, password, NOW)).toEqual({ ok: false, reason: 'invalid' });
      expect(currentUser(NOW)).toBeNull();
    }
  });

  it('does not accept one account’s password for another', async () => {
    const result = await signIn(demoLogins.admin.username, demoLogins.member.password, NOW);
    expect(result.ok).toBe(false);
  });

  it('stores a session with a random token and an expiry in sessionStorage', async () => {
    await userFor('admin');
    const saved = JSON.parse(storage.getItem(SESSION_STORAGE_KEY) ?? 'null') as Record<string, unknown>;
    expect(saved['token']).toMatch(/^[0-9a-f]{32}$/);
    expect(saved['userId']).toBe('u-elder');
    expect(saved['expiresAt']).toBe(NOW + SESSION_TTL_MS);
    expect(JSON.stringify(saved)).not.toContain(demoLogins.admin.password);
  });

  it('gives each sign-in a different token', async () => {
    await userFor('admin');
    const first = (JSON.parse(storage.getItem(SESSION_STORAGE_KEY) ?? '{}') as { token: string }).token;
    await userFor('admin');
    const second = (JSON.parse(storage.getItem(SESSION_STORAGE_KEY) ?? '{}') as { token: string }).token;
    expect(first).not.toBe(second);
  });

  it('still works when browser storage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', undefined);
    const user = await userFor('member');
    expect(currentUser(NOW)).toEqual(user);
  });
});

describe('session lifetime', () => {
  it('lasts 24 hours', () => {
    expect(SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('ends at the expiry time', async () => {
    await userFor('admin');
    expect(currentUser(NOW + SESSION_TTL_MS - 1)).not.toBeNull();
    expect(currentUser(NOW + SESSION_TTL_MS)).toBeNull();
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('ends on sign-out', async () => {
    await userFor('admin');
    signOut();
    expect(currentUser(NOW)).toBeNull();
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('is restored after a reload', async () => {
    const user = await userFor('leader');
    const saved = storage.getItem(SESSION_STORAGE_KEY) ?? '';
    signOut();
    storage.setItem(SESSION_STORAGE_KEY, saved);
    expect(restoreSession(NOW + 1000)).toEqual(user);
    expect(currentUser(NOW + 1000)).toEqual(user);
  });

  it('is not restored once expired, and the saved copy is removed', () => {
    storage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ token: 'a'.repeat(32), userId: 'u-elder', issuedAt: NOW, expiresAt: NOW + 1000 }),
    );
    expect(restoreSession(NOW + 1000)).toBeNull();
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('is not restored when it is malformed, names an unknown user or starts in the future', () => {
    const cases = [
      'not json',
      '{}',
      JSON.stringify({ token: 'short', userId: 'u-elder', issuedAt: NOW, expiresAt: NOW + 1000 }),
      JSON.stringify({ token: 'a'.repeat(32), userId: 'u-ghost', issuedAt: NOW, expiresAt: NOW + 1000 }),
      JSON.stringify({ token: 'a'.repeat(32), userId: 'u-elder', issuedAt: NOW + 5000, expiresAt: NOW + 9000 }),
      JSON.stringify({ token: 'a'.repeat(32), userId: 'u-elder', issuedAt: 'now', expiresAt: NOW + 1000 }),
    ];
    for (const raw of cases) {
      storage.setItem(SESSION_STORAGE_KEY, raw);
      expect(restoreSession(NOW)).toBeNull();
      expect(currentUser(NOW)).toBeNull();
    }
  });
});

describe('failed-attempt lockout', () => {
  it('locks a username after the maximum number of failures, and says until when', async () => {
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      expect(await signIn('elder', 'wrong', NOW)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(await signIn('elder', 'wrong', NOW)).toEqual({ ok: false, reason: 'locked', until: NOW + LOCKOUT_MS });
  });

  it('refuses even the right password while locked, then allows it again afterwards', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) await signIn('elder', 'wrong', NOW);
    expect((await signIn('elder', demoLogins.admin.password, NOW + 1000)).ok).toBe(false);
    expect(currentUser(NOW + 1000)).toBeNull();
    const later = await signIn('elder', demoLogins.admin.password, NOW + LOCKOUT_MS);
    expect(later.ok).toBe(true);
  });

  it('counts each username separately, including ones that do not exist', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) await signIn('nobody', 'wrong', NOW);
    expect((await signIn('nobody', 'wrong', NOW)).ok).toBe(false);
    expect((await signIn('elder', demoLogins.admin.password, NOW)).ok).toBe(true);
  });

  it('resets the count after a successful sign-in', async () => {
    for (let i = 1; i < MAX_ATTEMPTS; i++) await signIn('elder', 'wrong', NOW);
    expect((await signIn('elder', demoLogins.admin.password, NOW)).ok).toBe(true);
    for (let i = 1; i < MAX_ATTEMPTS; i++) expect(await signIn('elder', 'wrong', NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('does not lock an empty username', async () => {
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) expect(await signIn('', 'x', NOW)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('stored logins', () => {
  async function storedLogin(username: string, password: string, personId: string): Promise<void> {
    const { salt, hash } = await newCredentials(password);
    setStoredLogins({ [username]: { username, personId, displayName: 'Jane Doe', salt, passwordHash: hash } });
  }

  it('sign in with the password they were created with, as a member by default', async () => {
    await storedLogin('jane', 'Sunday-Pass-1', 'jane-doe');
    const result = await signIn(' Jane ', 'Sunday-Pass-1', NOW);
    expect(result.ok).toBe(true);
    const user = currentUser(NOW);
    expect(user).toMatchObject({ username: 'jane', displayName: 'Jane Doe', role: 'member', personId: 'jane-doe', kind: 'stored' });
    expect(user?.managedMinistries).toEqual([]);
  });

  it('reject a wrong password', async () => {
    await storedLogin('jane', 'Sunday-Pass-1', 'jane-doe');
    expect((await signIn('jane', 'Sunday-Pass-2', NOW)).ok).toBe(false);
  });

  it('take their role and ministries from their person', async () => {
    await storedLogin('jane', 'Sunday-Pass-1', 'jane-doe');
    setAssignments({ 'jane-doe': { role: 'leader', leads: ['sec'] } });
    await signIn('jane', 'Sunday-Pass-1', NOW);
    expect(currentUser(NOW)).toMatchObject({ role: 'leader', managedMinistries: ['sec'] });
    setAssignments({});
  });

  it('end a session when the login is removed', async () => {
    await storedLogin('jane', 'Sunday-Pass-1', 'jane-doe');
    await signIn('jane', 'Sunday-Pass-1', NOW);
    expect(currentUser(NOW)).not.toBeNull();
    setStoredLogins({});
    expect(currentUser(NOW)).toBeNull();
  });

  it('restore from a saved session once the logins have loaded, not before', async () => {
    await storedLogin('jane', 'Sunday-Pass-1', 'jane-doe');
    await signIn('jane', 'Sunday-Pass-1', NOW);
    const saved = storage.getItem(SESSION_STORAGE_KEY) ?? '';
    signOut();
    const logins = { jane: { username: 'jane', personId: 'jane-doe', displayName: 'Jane Doe', salt: 's', passwordHash: 'h' } };
    storage.setItem(SESSION_STORAGE_KEY, saved);
    setStoredLogins({});
    expect(restoreSession(NOW + 1000)).toBeNull();
    storage.setItem(SESSION_STORAGE_KEY, saved);
    setStoredLogins(logins);
    expect(restoreSession(NOW + 1000)?.username).toBe('jane');
  });

  it('cannot reuse a built-in username', () => {
    expect(usernameProblem('elder', [])).toBe('That username is taken.');
    expect(usernameProblem('jane', ['jane'])).toBe('That username is taken.');
    expect(usernameProblem('jane.d', ['jane'])).toBeNull();
  });

  it('need a sensible username and password', () => {
    for (const bad of ['ab', 'Jane', 'has space', '-lead', 'x'.repeat(33), '']) expect(usernameProblem(bad, [])).not.toBeNull();
    expect(normalizeUsername('  JANE.D ')).toBe('jane.d');
    expect(passwordProblem('short')).not.toBeNull();
    expect(passwordProblem('long enough')).toBeNull();
    expect(passwordProblem('x'.repeat(201))).not.toBeNull();
  });

  it('give each new password its own random salt', async () => {
    const a = await newCredentials('Sunday-Pass-1');
    const b = await newCredentials('Sunday-Pass-1');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('can be checked without signing in or counting an attempt', async () => {
    await storedLogin('jane', 'Sunday-Pass-1', 'jane-doe');
    expect(await verifyPassword('jane', 'Sunday-Pass-1')).toBe(true);
    expect(await verifyPassword('JANE', 'wrong')).toBe(false);
    expect(await verifyPassword('nobody', 'x')).toBe(false);
    expect(currentUser(NOW)).toBeNull();
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await verifyPassword('jane', 'wrong');
    expect((await signIn('jane', 'Sunday-Pass-1', NOW)).ok).toBe(true);
  });
});

describe('temporary passwords', () => {
  it('are random, 16 characters in groups of four, without look-alike characters, and acceptable as passwords', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const password = generatePassword();
      expect(password).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
      expect(passwordProblem(password)).toBeNull();
      seen.add(password);
    }
    expect(seen.size).toBe(50);
  });

  it('make a signed-in login that may do nothing until its person chooses a password', async () => {
    const { salt, hash } = await newCredentials('Temp-Pass-1');
    const login = { username: 'jane', personId: 'jane-doe', displayName: 'Jane Doe', salt, passwordHash: hash, temp: true };
    setStoredLogins({ jane: login });
    setAssignments({ 'jane-doe': { role: 'admin', leads: [] } });
    const result = await signIn('jane', 'Temp-Pass-1', NOW);
    expect(result.ok).toBe(true);
    const user = currentUser(NOW);
    expect(user?.mustChangePassword).toBe(true);
    expect(can('viewOwnSchedule', user)).toBe(false);
    expect(can('manageMembers', user)).toBe(false);
    expect(canViewTab('m', user)).toBe(false);

    setStoredLogins({ jane: { ...login, temp: false } });
    const after = currentUser(NOW);
    expect(after?.mustChangePassword).toBeUndefined();
    expect(can('manageMembers', after)).toBe(true);
    setAssignments({});
  });

  it('are not required of a login without the flag', async () => {
    const { salt, hash } = await newCredentials('Own-Pass-1');
    setStoredLogins({ jane: { username: 'jane', personId: 'jane-doe', displayName: 'Jane Doe', salt, passwordHash: hash } });
    await signIn('jane', 'Own-Pass-1', NOW);
    expect(currentUser(NOW)?.mustChangePassword).toBeUndefined();
    expect(can('viewOwnSchedule')).toBe(true);
  });
});

describe('keeping at least one admin', () => {
  const people = {
    ann: { id: 'ann', name: 'Ann', family: 0, elig: [], role: 'admin' as const },
    bob: { id: 'bob', name: 'Bob', family: 0, elig: [], role: 'admin' as const },
    cy: { id: 'cy', name: 'Cy', family: 0, elig: [], role: 'leader' as const },
    dee: { id: 'dee', name: 'Dee', family: 0, elig: [], role: 'admin' as const, gone: true },
  };
  const login = (personId: string) => ({ personId });

  it('counts only admins who are not removed and have a login', () => {
    const logins = { 'ann.w': login('ann'), 'cy.w': login('cy'), 'dee.w': login('dee') };
    expect(signInAdmins(people, logins)).toEqual(['ann']);
    expect(signInAdmins(people, {})).toEqual([]);
  });

  it('names the only admin who can sign in as the last one', () => {
    const logins = { 'ann.w': login('ann'), 'cy.w': login('cy') };
    expect(isLastAdmin('ann', people, logins)).toBe(true);
    expect(isLastAdmin('cy', people, logins)).toBe(false);
  });

  it('does not call anyone the last admin while another admin can sign in, or when none can', () => {
    expect(isLastAdmin('ann', people, { 'ann.w': login('ann'), 'bob.w': login('bob') })).toBe(false);
    expect(isLastAdmin('ann', people, {})).toBe(false);
  });

  it('has a message that says what to do', () => {
    expect(LAST_ADMIN_MESSAGE).toContain('Make another person an admin');
  });
});

describe('swap decisions', () => {
  it('let an admin decide any request, including their own', async () => {
    const admin = await userFor('admin');
    expect(canDecideSwap('sec', 'someone', admin)).toBe(true);
    expect(canDecideSwap('sec', admin.personId ?? 'x', admin)).toBe(true);
  });

  it('let a leader decide requests only in ministries they manage, and not their own', async () => {
    const leader = await userFor('leader');
    expect(canDecideSwap('wel', 'someone', leader)).toBe(true);
    expect(canDecideSwap('sec', 'someone', leader)).toBe(false);
    expect(canDecideSwap('wel', 'demo-leader', leader)).toBe(false);
  });

  it('never let a member decide', async () => {
    const member = await userFor('member');
    expect(canDecideSwap('wel', 'someone', member)).toBe(false);
    expect(canDecideSwap('wel', 'someone', null)).toBe(false);
  });
});

describe('role assignments made by an admin', () => {
  afterEach(() => setAssignments({}));

  it('are built only from people who have a role and are not removed', () => {
    const people = {
      a: { id: 'a', name: 'A', family: 0, elig: [], role: 'leader' as const, leads: ['wel'] },
      b: { id: 'b', name: 'B', family: 0, elig: [] },
      c: { id: 'c', name: 'C', family: 0, elig: [], role: 'admin' as const, gone: true },
      d: { id: 'd', name: 'D', family: 0, elig: [], role: 'member' as const },
    };
    expect(assignmentsFrom(people)).toEqual({ a: { role: 'leader', leads: ['wel'] }, d: { role: 'member', leads: [] } });
  });

  it('change the role and ministries of the login linked to that person', async () => {
    setAssignments({ 'demo-member': { role: 'leader', leads: ['sec'] } });
    const user = await userFor('member');
    expect(user.role).toBe('leader');
    expect(user.managedMinistries).toEqual(['sec']);
    expect(canEditMinistry('sec', user)).toBe(true);
    expect(canEditMinistry('wel', user)).toBe(false);
    expect(currentUser(NOW)?.role).toBe('leader');
  });

  it('take effect for a session that is already signed in', async () => {
    await userFor('leader');
    expect(currentUser(NOW)?.managedMinistries).toEqual(['wel', 'tea']);
    setAssignments({ 'demo-leader': { role: 'member', leads: [] } });
    expect(currentUser(NOW)?.role).toBe('member');
    expect(currentUser(NOW)?.managedMinistries).toEqual([]);
  });

  it('can make a linked login an admin', async () => {
    setAssignments({ 'demo-member': { role: 'admin', leads: [] } });
    expect(can('manageMembers', await userFor('member'))).toBe(true);
  });

  it('never change the elder login, which is not linked to a person', async () => {
    setAssignments({ elder: { role: 'member', leads: [] }, 'u-elder': { role: 'member', leads: [] } });
    expect((await userFor('admin')).role).toBe('admin');
  });
});

describe('role definitions', () => {
  it('give the admin every permission', () => {
    expect([...ROLE_DEFINITIONS.admin.permissions].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('keep generation and member management to the admin', () => {
    for (const permission of ['generateRoster', 'manageMembers', 'editAllMinistries'] as const) {
      expect(ROLE_DEFINITIONS.admin.permissions).toContain(permission);
      expect(ROLE_DEFINITIONS.leader.permissions).not.toContain(permission);
      expect(ROLE_DEFINITIONS.member.permissions).not.toContain(permission);
    }
  });

  it('let a leader see the full roster and decide swaps, and a member neither', () => {
    for (const permission of ['viewFullRoster', 'decideSwaps', 'exportCsv', 'editRoster', 'editNotes', 'manageAnyAway'] as const) {
      expect(ROLE_DEFINITIONS.leader.permissions).toContain(permission);
      expect(ROLE_DEFINITIONS.member.permissions).not.toContain(permission);
    }
  });

  it('let a member only view Serving, mark their own unavailability and update their profile', () => {
    expect([...ROLE_DEFINITIONS.member.permissions].sort()).toEqual([
      'manageOwnAway',
      'requestSwap',
      'updateOwnProfile',
      'viewOwnSchedule',
      'viewServing',
    ]);
  });

  it('recognise permission and tab names, and nothing else', () => {
    expect(isPermission('generateRoster')).toBe(true);
    expect(isPermission('generateRosters')).toBe(false);
    expect(isPermission(undefined)).toBe(false);
    expect(isTabId('h')).toBe(true);
    expect(isTabId('toString')).toBe(false);
    expect(isTabId('x')).toBe(false);
  });
});

describe('permission checks', () => {
  it('deny everything when nobody is signed in', () => {
    expect(can('viewServing')).toBe(false);
    expect(canViewTab('s')).toBe(false);
    expect(canEditMinistry('wel')).toBe(false);
    expect(canEditAnyMinistry()).toBe(false);
    expect(canMoveBetween('wel', 'tea')).toBe(false);
    expect(canManageAway('ann')).toBe(false);
  });

  it('open tabs by role', async () => {
    const open = (user: PublicUser): TabId[] => (Object.keys(TAB_REQUIRES) as TabId[]).filter((t) => canViewTab(t, user));
    expect(open(await userFor('admin')).sort()).toEqual(['a', 'h', 'm', 'p', 'r', 's', 'v', 'w']);
    expect(open(await userFor('leader')).sort()).toEqual(['a', 'm', 'p', 'r', 's', 'v', 'w']);
    expect(open(await userFor('member')).sort()).toEqual(['a', 'm', 'p', 's', 'w']);
  });

  it('let an admin edit every ministry and move anyone anywhere', async () => {
    const admin = await userFor('admin');
    expect(canEditMinistry('sec', admin)).toBe(true);
    expect(canEditMinistry('anything', admin)).toBe(true);
    expect(canMoveBetween('sec', 'cre', admin)).toBe(true);
    expect(canMoveBetween('', 'sec', admin)).toBe(true);
  });

  it('limit a leader to the ministries they manage', async () => {
    const leader = await userFor('leader');
    expect(leader.managedMinistries).toEqual(['wel', 'tea']);
    expect(canEditMinistry('wel', leader)).toBe(true);
    expect(canEditMinistry('sec', leader)).toBe(false);
    expect(canEditAnyMinistry(leader)).toBe(true);
    expect(canMoveBetween('wel', 'tea', leader)).toBe(true);
    expect(canMoveBetween('', 'tea', leader)).toBe(true);
    expect(canMoveBetween('wel', '', leader)).toBe(true);
  });

  it('stop a leader moving anyone into, out of or between ministries they do not manage', async () => {
    const leader = await userFor('leader');
    expect(canMoveBetween('sec', '', leader)).toBe(false);
    expect(canMoveBetween('', 'sec', leader)).toBe(false);
    expect(canMoveBetween('wel', 'cre', leader)).toBe(false);
    expect(canMoveBetween('sec', 'cre', leader)).toBe(false);
    expect(canMoveBetween('', '', leader)).toBe(false);
  });

  it('give a member no roster editing at all', async () => {
    const member = await userFor('member');
    expect(canEditAnyMinistry(member)).toBe(false);
    expect(canEditMinistry('wel', member)).toBe(false);
    expect(canMoveBetween('', 'wel', member)).toBe(false);
  });

  it('let admins and leaders manage anyone’s away entries, and members only their own', async () => {
    expect(canManageAway('ann', await userFor('admin'))).toBe(true);
    expect(canManageAway('ann', await userFor('leader'))).toBe(true);
    const member = await userFor('member');
    expect(canManageAway('demo-member', member)).toBe(true);
    expect(canManageAway('ann', member)).toBe(false);
  });

  it('give a member with no linked person no away access', async () => {
    const member = { ...(await userFor('member')), personId: null };
    expect(canManageAway('demo-member', member)).toBe(false);
    expect(canManageAway('', member)).toBe(false);
  });
});
