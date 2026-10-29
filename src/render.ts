import { $ } from './dom';
import { state } from './state';
import { adminTab, changeLog } from './views/admin';
import { awayTab } from './views/away';
import { recordTab } from './views/record';
import { rosterTab } from './views/roster';
import { servingTab } from './views/serving';
import { helpBox } from './views/shared';

/** Redraws the active tab. Called after every database update and every click. */
export function render(): void {
  const view = $('#v');
  if (!view || !state.ready) return;
  if (!state.cfg) {
    view.innerHTML = '<p class="mut">No configuration found yet.</p>';
    return;
  }
  let html: string;
  switch (state.tab) {
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
}
