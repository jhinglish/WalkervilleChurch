import { fail, isChecked, valueOf } from './dom';
import { exportCsv, exportPdf } from './exports';
import { render } from './render';
import { state } from './state';
import {
  addAway,
  addMinistry,
  addPerson,
  genMissing,
  move,
  regen,
  removeAway,
  renamePerson,
  saveNote,
  saveVerse,
  setEligibility,
  setFamily,
  setMinistryRemoved,
  setPersonRemoved,
  updateMinistry,
} from './store';
import type { TabId } from './types';

const TABS: readonly string[] = ['s', 'r', 'a', 'v', 'h'];
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

async function onClick(e: MouseEvent): Promise<void> {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.closest('input,textarea,select,label')) return;
  const chip = t.closest<HTMLElement>('.chip');
  const drop = t.closest<HTMLElement>('[data-drop]');
  const ds = t.dataset;
  try {
    if (ds['t']) {
      if (isTab(ds['t'])) state.tab = ds['t'];
      document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b === t));
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
      await move(ds['d'] ?? '', id.join('|'), key, '');
    } else if (ds['sadd']) {
      const id = valueOf(`sa-${ds['sadd']}`);
      if (id) await move(ds['d'] ?? '', id, '', ds['sadd']);
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
      if (name) await addMinistry(name, Math.max(0, Number(valueOf('mc')) || 1), isChecked('mx'));
    } else if (ds['mrm']) {
      if (confirmed(`m:${ds['mrm']}`)) await setMinistryRemoved(ds['mrm'], true);
    } else if (ds['mrs']) await setMinistryRemoved(ds['mrs'], false);
    else if (chip) {
      const next = { id: chip.dataset['id'] ?? '', d: chip.dataset['d'] ?? '', k: chip.dataset['k'] ?? '' };
      const cur = state.sel;
      state.sel = cur && cur.id === next.id && cur.d === next.d && cur.k === next.k ? null : next;
    } else if (drop && state.sel && state.sel.d === drop.dataset['d']) {
      await move(state.sel.d, state.sel.id, state.sel.k, drop.dataset['drop'] ?? '');
    }
  } catch (error) {
    fail(error);
  }
  render();
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
    move(sel.d, sel.id, sel.k, target.dataset['drop'] ?? '').catch(fail);
  });
}
