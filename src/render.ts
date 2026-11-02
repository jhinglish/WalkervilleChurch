import { canViewTab, currentUser } from './auth';
import { $ } from './dom';
import { applyRoleMask, syncNav } from './mask';
import { requirePasswordChange } from './login';
import { state } from './state';
import { adminTab, changeLog } from './views/admin';
import { awayTab } from './views/away';
import { mineTab } from './views/mine';
import { profileTab } from './views/profile';
import { recordTab } from './views/record';
import { rosterTab } from './views/roster';
import { servingTab } from './views/serving';
import { helpBox } from './views/shared';
import { swapsTab } from './views/swaps';

/** True while someone is typing in a form that must not be redrawn under them (a password, a new login, a note). */
function typingInKeptField(view: HTMLElement): boolean {
  const active = document.activeElement;
  return (
    (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) && active.dataset['keep'] !== undefined && view.contains(active)
  );
}

/** Redraws the active tab for the signed-in user. Called after every database update and every click. */
export function render(): void {
  const view = $('#v');
  if (!view || !state.ready || !state.loaded.people) return;
  const user = currentUser();
  if (!user) return;
  if (user.mustChangePassword) {
    // Someone reset this login while its page was open: nothing is drawn until they choose a new password.
    requirePasswordChange();
    return;
  }
  if (!canViewTab(state.tab, user)) state.tab = 'm';
  view.dataset['role'] = user.role;
  syncNav();
  if (typingInKeptField(view)) return;
  if (!state.cfg) {
    view.innerHTML = '<p class="mut">No configuration found yet.</p>';
    return;
  }
  let html: string;
  switch (state.tab) {
    case 'm':
      html = mineTab();
      break;
    case 'w':
      html = swapsTab();
      break;
    case 'p':
      html = profileTab();
      break;
    case 'r':
      html = rosterTab();
      break;
    case 's':
      html = servingTab();
      break;
    case 'v':
      html = recordTab();
      break;
    case 'a':
      html = awayTab();
      break;
    case 'h':
      html = adminTab() + changeLog();
      break;
  }
  view.innerHTML = helpBox(state.tab) + html;
  applyRoleMask(view);
}
