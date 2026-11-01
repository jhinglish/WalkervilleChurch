import { canMoveBetween } from './auth';
import { fail, flash, isChecked, valueOf } from './dom';
import { exportCsv, exportMyIcs, exportPdf } from './exports';
import { render } from './render';
import { state } from './state';
import {
  addAway,
  addMinistry,
  addPerson,
  cancelSwap,
  changeOwnPassword,
  createLogin,
  decideSwap,
  genMissing,
  move,
  regen,
  removeAway,
  removeLogin,
  renamePerson,
  requestSwap,
  resetLogin,
  saveNote,
  saveVerse,
  setEligibility,
  setFamily,
  setLeads,
  setMinistryRemoved,
  setPersonRemoved,
  setRole,
  updateMinistry,
  updateOwnProfile,
} from './store';
import type { TabId } from './types';

const TABS: readonly string[] = ['m', 'w', 's', 'r', 'a', 'v', 'p', 'h'];
const isTab = (v: string): v is TabId => TABS.includes(v);

/** Asks for a second click before a destructive action: the first click arms it, the second confirms. */
function confirmed(key: string): boolean {
  if (state.cf === key) {
    state.cf = null;
    return true;
  }
  state.cf = key;
  return false;
}

/** Moves a person, unless the signed-in role may not edit the ministries involved. */
async function moveIfAllowed(date: string, id: string, from: string, to: string): Promise<void> {
  if (!canMoveBetween(from, to)) {
    state.sel = null;
    flash('Your role cannot change that ministry.');
    return;
  }
  await move(date, id, from, to);
}

async function onClick(e: MouseEvent): Promise<void> {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.closest('input,textarea,select,label')) return;
  const chip = t.closest<HTMLElement>('.chip');
  const drop = t.closest<HTMLElement>('[data-drop]');
  const ds = t.dataset;
  /** Set when a form should keep what was typed (for example after a rejected password) instead of being redrawn. */
  let skipRender = false;
  try {
    if (ds['t']) {
      if (isTab(ds['t'])) state.tab = ds['t'];
      document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b === t));
    } else if (ds['goto']) {
      // Action buttons on My schedule that open another tab.
      if (isTab(ds['goto'])) {
        state.tab = ds['goto'];
        state.sel = null;
        state.cf = null;
      }
    } else if (t.id === 'gen') await genMissing();
    else if (t.id === 'past') state.past = !state.past;
    else if (t.id === 'csv') exportCsv();
    else if (ds['regen']) {
      if (confirmed(ds['regen'])) await regen(ds['regen']);
    } else if (t.id === 'aadd') {
      const from = valueOf('af');
      const to = valueOf('at') || from;
      if (from && to >= from) await addAway(valueOf('ap'), from, to, valueOf('an'));
    } else if (ds['del']) await removeAway(ds['del']);
    else if (t.id === 'sedit') state.sedit = !state.sedit;
    else if (t.id === 'pdf') await exportPdf(ds['d'] ?? '');
    else if (ds['srm']) {
      const [key = '', ...id] = ds['srm'].split('|');
      await moveIfAllowed(ds['d'] ?? '', id.join('|'), key, '');
    } else if (ds['sadd']) {
      const id = valueOf(`sa-${ds['sadd']}`);
      if (id) await moveIfAllowed(ds['d'] ?? '', id, '', ds['sadd']);
    } else if (ds['vsave']) await saveVerse(ds['vsave']);
    else if (ds['nsave']) await saveNote(ds['nsave']);
    else if (t.closest('[data-fl]')) {
      const date = t.closest<HTMLElement>('[data-fl]')?.dataset['fl'] ?? '';
      state.fd = state.fd === date ? '' : date;
    } else if (t.closest('[data-pick]')) {
      const id = t.closest<HTMLElement>('[data-pick]')?.dataset['pick'] ?? '';
      state.pick = state.pick === id ? '' : id;
    } else if (t.id === 'padd') {
      const name = valueOf('pn').trim();
      if (name) await addPerson(name, Number(valueOf('pf')) || 0);
    } else if (ds['prm']) {
      if (confirmed(`p:${ds['prm']}`)) await setPersonRemoved(ds['prm'], true);
    } else if (ds['prs']) await setPersonRemoved(ds['prs'], false);
    else if (t.id === 'madd') {
      const name = valueOf('mn').trim();
      if (name) await addMinistry(name, Math.max(0, Number(valueOf('mc')) || 1), isChecked('mx'), valueOf('ml'));
    } else if (ds['mrm']) {
      if (confirmed(`m:${ds['mrm']}`)) await setMinistryRemoved(ds['mrm'], true);
    } else if (ds['mrs']) await setMinistryRemoved(ds['mrs'], false);
    else if (ds['swapfor']) {
      state.swapDraft = ds['swapfor'];
      state.tab = 'w';
    } else if (t.id === 'swreq') {
      const [date = '', ministry = ''] = valueOf('swslot').split('|');
      const error = await requestSwap(date, ministry, valueOf('swnote'));
      if (error) {
        flash(error);
        skipRender = true;
      } else {
        state.swapDraft = '';
        flash('Swap requested. A team leader will review it.');
      }
    } else if (ds['swcancel']) {
      const error = await cancelSwap(ds['swcancel']);
      if (error) flash(error);
    } else if (ds['swok'] || ds['swno']) {
      const id = ds['swok'] ?? ds['swno'] ?? '';
      const error = await decideSwap(id, ds['swok'] ? 'approved' : 'declined', valueOf(`swc-${id}`));
      if (error) flash(error);
    } else if (t.id === 'ics') exportMyIcs();
    else if (t.id === 'pwsave') {
      const next = valueOf('pw-new');
      const error = next !== valueOf('pw-new2') ? 'The new passwords do not match.' : await changeOwnPassword(valueOf('pw-cur'), next);
      flash(error ?? 'Password changed.');
      skipRender = error !== null;
    } else if (t.id === 'ladd') {
      const error = await createLogin(valueOf('lperson'), valueOf('lname'), valueOf('lpass'));
      flash(error ?? 'Login created.');
      skipRender = error !== null;
    } else if (ds['lreset']) {
      const error = await resetLogin(ds['lreset'], valueOf(`lp-${ds['lreset']}`));
      flash(error ?? 'Password reset.');
      skipRender = error !== null;
    } else if (ds['lrm']) {
      if (confirmed(`l:${ds['lrm']}`)) await removeLogin(ds['lrm']);
    } else if (chip) {
      const next = { id: chip.dataset['id'] ?? '', d: chip.dataset['d'] ?? '', k: chip.dataset['k'] ?? '' };
      const cur = state.sel;
      state.sel = cur && cur.id === next.id && cur.d === next.d && cur.k === next.k ? null : next;
    } else if (drop && state.sel && state.sel.d === drop.dataset['d']) {
      await moveIfAllowed(state.sel.d, state.sel.id, state.sel.k, drop.dataset['drop'] ?? '');
    }
  } catch (error) {
    fail(error);
  }
  if (!skipRender) render();
}

async function onChange(e: Event): Promise<void> {
  const t = e.target;
  if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) return;
  const d = t.dataset;
  if (t.id === 'thr') {
    state.thr = Math.max(0, Number(t.value) || 0);
    render();
  }
  if (t.id === 'nsel') {
    state.nd = t.value;
    render();
  }
  const checked = t instanceof HTMLInputElement && t.checked;
  try {
    const person = d['pid'] ?? '';
    if (d['pf'] === 'name' && t.value.trim()) await renamePerson(person, t.value.trim());
    else if (d['pf'] === 'fam') await setFamily(person, Number(t.value) || 0);
    else if (d['pe']) await setEligibility(person, d['pe'], checked);
    else if (d['prole']) await setRole(person, t.value);
    else if (d['plead']) await setLeads(person, d['plead'], checked);
    else if (d['prof']) await updateOwnProfile(d['prof'], t.value);
    else if (d['mf'] === 'l' || d['mf'] === 'n' || d['mf'] === 'x') {
      await updateMinistry(d['mk'] ?? '', d['mf'], t.value, checked);
    }
  } catch (error) {
    fail(error);
  }
}

function onInput(e: Event): void {
  const t = e.target;
  if (!(t instanceof HTMLTextAreaElement)) return;
  if (t.dataset['note']) state.drafts[t.dataset['note']] = t.value;
  if (t.dataset['verse']) state.drafts[`v${t.dataset['verse']}`] = t.value;
}

const chipOf = (e: Event): HTMLElement | null => (e.target instanceof Element ? e.target.closest<HTMLElement>('.chip') : null);
const dropOf = (e: Event): HTMLElement | null =>
  e.target instanceof Element ? e.target.closest<HTMLElement>('[data-drop]') : null;

/** Attaches every click, change, input and drag-and-drop handler to the page. Call once. */
export function bindEvents(): void {
  document.addEventListener('click', (e) => void onClick(e));
  document.addEventListener('change', (e) => void onChange(e));
  document.addEventListener('input', onInput);
  document.addEventListener('dragstart', (e) => {
    const c = chipOf(e);
    if (c) state.sel = { id: c.dataset['id'] ?? '', d: c.dataset['d'] ?? '', k: c.dataset['k'] ?? '' };
  });
  document.addEventListener('dragover', (e) => {
    if (dropOf(e)) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    const target = dropOf(e);
    const sel = state.sel;
    if (!target || !sel || sel.d !== target.dataset['d']) return;
    e.preventDefault();
    moveIfAllowed(sel.d, sel.id, sel.k, target.dataset['drop'] ?? '').catch(fail);
  });
}
