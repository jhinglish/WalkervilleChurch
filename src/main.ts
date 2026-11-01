import { $ } from './dom';
import { bindEvents } from './handlers';
import { initLogin } from './login';
import { syncNav } from './mask';
import { render } from './render';
import { state } from './state';
import { autoLock, connect, loginsReady } from './store';

bindEvents();

/**
 * The database connects as the page opens, not after sign-in, because logins created in the Admin tab are
 * stored there and the sign-in form has to check them. Nothing is drawn until someone has signed in.
 */
const connection: Promise<boolean> = connect(render);

/** How long the sign-in screen waits for stored logins before carrying on with the built-in accounts only. */
const LOGINS_WAIT_MS = 3000;

const whenReady = (): Promise<void> =>
  Promise.race([
    connection.then(() => loginsReady),
    new Promise<void>((resolve) => {
      setTimeout(resolve, LOGINS_WAIT_MS);
    }),
  ]);

async function start(): Promise<void> {
  if (await connection) {
    render();
    void autoLock();
    return;
  }
  const view = $('#v');
  if (view) view.innerHTML = '<p class="mut">Sign in to claude.ai to use the roster.</p>';
}

initLogin({
  whenReady,
  onSignedIn: () => {
    // Start each sign-in on My schedule, which every role may open.
    state.tab = 'm';
    state.sel = null;
    state.cf = null;
    state.sedit = false;
    state.swapDraft = '';
    syncNav();
    void start();
  },
  onSignedOut: () => {
    const view = $('#v');
    if (view) view.innerHTML = '';
  },
});
