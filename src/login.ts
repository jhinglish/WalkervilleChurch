import { ROLE_DEFINITIONS, currentUser, restoreSession, signIn, signOut } from './auth';
import type { PublicUser } from './auth';

/** The sign-in screen: intercepts the form, checks the credentials in auth.ts and swaps the screen for the app. */

export interface LoginHooks {
  /** Resolves once stored logins have loaded, so a saved session or a sign-in can be checked against them. */
  whenReady?: () => Promise<void>;
  /** Runs after a successful sign-in, and when a saved session is picked up on load. */
  onSignedIn(user: PublicUser): void;
  /** Runs after sign-out and when a session expires. */
  onSignedOut(): void;
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

function setError(message: string): void {
  const el = document.getElementById('login-error');
  if (el) el.textContent = message;
}

function setBusy(busy: boolean): void {
  const button = document.getElementById('login-submit');
  if (button instanceof HTMLButtonElement) button.disabled = busy;
}

function showLogin(message = ''): void {
  const login = document.getElementById('login');
  const app = document.getElementById('app');
  if (app) app.hidden = true;
  if (login) login.hidden = false;
  const password = input('login-password');
  if (password) password.value = '';
  setError(message);
  input('login-username')?.focus();
}

function showApp(user: PublicUser): void {
  const login = document.getElementById('login');
  const app = document.getElementById('app');
  const who = document.getElementById('who');
  if (who) who.textContent = `${user.displayName} · ${ROLE_DEFINITIONS[user.role].label}`;
  if (login) login.hidden = true;
  if (app) app.hidden = false;
  setError('');
}

function enter(user: PublicUser, hooks: LoginHooks): void {
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
  setBusy(true);
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
    setBusy(false);
  }
}

/** Wires up the sign-in form and the sign-out button, then shows either the app (saved session) or the form. Call once. */
export function initLogin(hooks: LoginHooks): void {
  const form = document.getElementById('login-form');
  if (!(form instanceof HTMLFormElement)) throw new Error('The sign-in form is missing from the page');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit(hooks);
  });

  document.getElementById('signout')?.addEventListener('click', () => {
    signOut();
    showLogin();
    hooks.onSignedOut();
  });

  window.setInterval(() => {
    const app = document.getElementById('app');
    if (app && !app.hidden && !currentUser()) {
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
