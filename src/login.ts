import { ROLE_DEFINITIONS, currentUser, restoreSession, signIn, signOut } from './auth';
import type { PublicUser } from './auth';

/**
 * The sign-in screen: intercepts the form, checks the credentials in auth.ts and swaps the screen for the app.
 * A login whose password an admin set is a temporary one: its person gets a second screen, to choose their own
 * password, before the app opens.
 */

export interface LoginHooks {
  /** Resolves once stored logins have loaded, so a saved session or a sign-in can be checked against them. */
  whenReady?: () => Promise<void>;
  /** Runs after a successful sign-in, and when a saved session is picked up on load. */
  onSignedIn(user: PublicUser): void;
  /** Runs after sign-out and when a session expires. */
  onSignedOut(): void;
  /** Saves the password chosen on the first sign-in. Returns a message to show when it cannot, or null when it worked. */
  onSetPassword(password: string): Promise<string | null>;
}

/** How often to check whether the session has run out while the page stays open. */
const EXPIRY_CHECK_MS = 60_000;

const LOGIN_ERRORS = {
  missing: 'Enter your username and password.',
  invalid: 'Incorrect username or password.',
  unavailable: 'Sign-in is not available in this browser context. Open the page over HTTPS.',
  expired: 'Your session has expired. Please sign in again.',
} as const;

function lockedMessage(until: number): string {
  const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

function input(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

function setText(id: string, message: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

const setError = (message: string): void => setText('login-error', message);

function setBusy(id: string, busy: boolean): void {
  const button = document.getElementById(id);
  if (button instanceof HTMLButtonElement) button.disabled = busy;
}

function setHidden(id: string, hidden: boolean): void {
  const el = document.getElementById(id);
  if (el) el.hidden = hidden;
}

function showLogin(message = ''): void {
  setHidden('app', true);
  setHidden('setpw', true);
  setHidden('login', false);
  const password = input('login-password');
  if (password) password.value = '';
  setError(message);
  input('login-username')?.focus();
}

function showApp(user: PublicUser): void {
  const who = document.getElementById('who');
  if (who) who.textContent = `${user.displayName} · ${ROLE_DEFINITIONS[user.role].label}`;
  setHidden('login', true);
  setHidden('setpw', true);
  setHidden('app', false);
  setError('');
}

/** The "choose your password" screen, for a login that still has the temporary password an admin set. */
function showSetPassword(user: PublicUser): void {
  setHidden('app', true);
  setHidden('login', true);
  setHidden('setpw', false);
  setText('setpw-for', `Signed in as ${user.username} with a temporary password. Choose your own to continue.`);
  setText('setpw-error', '');
  for (const id of ['setpw-new', 'setpw-new2']) {
    const field = input(id);
    if (field) field.value = '';
  }
  input('setpw-new')?.focus();
}

/**
 * Shows the "choose your password" screen if the signed-in login has just been given a temporary password (an
 * admin reset it while the page was open). Does nothing while that screen is already showing, so typing is not lost.
 */
export function requirePasswordChange(): void {
  const user = currentUser();
  const screen = document.getElementById('setpw');
  if (user?.mustChangePassword && screen?.hidden) showSetPassword(user);
}

function enter(user: PublicUser, hooks: LoginHooks): void {
  if (user.mustChangePassword) {
    showSetPassword(user);
    return;
  }
  showApp(user);
  hooks.onSignedIn(user);
}

async function submit(hooks: LoginHooks): Promise<void> {
  const username = input('login-username');
  const password = input('login-password');
  if (!username || !password) return;
  setError('');
  if (!username.value.trim() || !password.value) {
    setError(LOGIN_ERRORS.missing);
    return;
  }
  setBusy('login-submit', true);
  try {
    await hooks.whenReady?.();
    const result = await signIn(username.value, password.value);
    if (result.ok) {
      username.value = '';
      password.value = '';
      enter(result.user, hooks);
    } else {
      password.value = '';
      password.focus();
      setError(result.reason === 'locked' ? lockedMessage(result.until) : LOGIN_ERRORS[result.reason]);
    }
  } finally {
    setBusy('login-submit', false);
  }
}

async function submitNewPassword(hooks: LoginHooks): Promise<void> {
  const next = input('setpw-new');
  const again = input('setpw-new2');
  if (!next || !again) return;
  setText('setpw-error', '');
  if (next.value !== again.value) {
    setText('setpw-error', 'The two passwords do not match.');
    return;
  }
  setBusy('setpw-submit', true);
  try {
    const error = await hooks.onSetPassword(next.value);
    if (error) {
      setText('setpw-error', error);
      return;
    }
    const user = currentUser();
    if (user && !user.mustChangePassword) enter(user, hooks);
    else showLogin();
  } catch (failure) {
    console.error(failure);
    setText('setpw-error', 'The new password could not be saved. Please try again.');
  } finally {
    setBusy('setpw-submit', false);
  }
}

/** Wires up the sign-in form and the sign-out buttons, then shows either the app (saved session) or the form. Call once. */
export function initLogin(hooks: LoginHooks): void {
  const form = document.getElementById('login-form');
  if (!(form instanceof HTMLFormElement)) throw new Error('The sign-in form is missing from the page');
  const setForm = document.getElementById('setpw-form');
  if (!(setForm instanceof HTMLFormElement)) throw new Error('The choose-a-password form is missing from the page');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit(hooks);
  });

  setForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitNewPassword(hooks);
  });

  const leave = (): void => {
    signOut();
    showLogin();
    hooks.onSignedOut();
  };
  document.getElementById('signout')?.addEventListener('click', leave);
  document.getElementById('setpw-signout')?.addEventListener('click', leave);

  window.setInterval(() => {
    const shown = ['app', 'setpw'].some((id) => document.getElementById(id)?.hidden === false);
    if (shown && !currentUser()) {
      showLogin(LOGIN_ERRORS.expired);
      hooks.onSignedOut();
    }
  }, EXPIRY_CHECK_MS);

  // A saved session may belong to a login kept in the database, so wait for those to load first.
  void (async () => {
    await hooks.whenReady?.();
    const saved = restoreSession();
    if (saved) enter(saved, hooks);
    else showLogin();
  })();
}
