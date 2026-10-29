import { addDays, formatDate, todayIso } from '../dates';
import { esc } from '../dom';
import { awayOn, issuesOn, ministriesOn, nameOn, peopleByName, windowDates } from '../selectors';
import { state } from '../state';
import type { IsoDate, MinistryKey, PersonId } from '../types';

/** One Sunday's card on the Roster tab: each ministry's people, plus everyone not serving. */
export function card(d: IsoDate): string {
  const r = state.ros[d];
  if (!r) return `<section class="card"><h3>${formatDate(d)}</h3><p class="mut">Not generated yet.</p></section>`;
  const { out, sum } = issuesOn(d);
  const placed = new Set(Object.values(r.s).flat());
  const sel = state.sel;
  const chip = (id: PersonId, k: MinistryKey): string => {
    const bad = out[id];
    const on = sel && sel.id === id && sel.d === d && sel.k === k;
    return `<span class="chip${bad ? ' bad' : ''}${on ? ' on' : ''}" draggable="true" data-id="${esc(id)}" data-d="${d}" data-k="${k}" title="${esc((bad || []).join('; '))}">${esc(nameOn(d, id))}</span>`;
  };
  const bench = peopleByName().filter((p) => !p.gone && !placed.has(p.id));
  return `<section class="card"><h3>${formatDate(d)} ${r.manual ? '<span class="mut">· edited</span>' : ''}</h3>
 ${sum.length ? `<div class="warn">⚠ ${esc(sum.join(' · '))}</div>` : ''}
 ${ministriesOn(d)
   .map(
     (m) =>
       `<div class="row"><b>${esc(m.l)}${m.x ? ' <span class="mut">(exclusive)</span>' : ''}<div class="mut">${m.n} needed</div></b><div class="drop" data-drop="${m.k}" data-d="${d}">${(r.s[m.k] || []).map((id) => chip(id, m.k)).join('')}</div></div>`,
   )
   .join('')}
 <div class="row bench"><b>Not serving</b><div class="drop" data-drop="" data-d="${d}">${bench
   .map(
     (p) =>
       `<span class="chip${awayOn(p.id, d) ? ' aw' : ''}${sel && sel.id === p.id && sel.d === d && !sel.k ? ' on' : ''}" draggable="true" data-id="${esc(p.id)}" data-d="${d}" data-k="" title="${awayOn(p.id, d) ? 'Away' : ''}">${esc(p.name)}</span>`,
   )
   .join('')}</div></div>
 <div class="l noprint"><button data-regen="${d}">${state.cf === d ? 'Confirm: replace this Sunday' : 'Regenerate this Sunday'}</button></div></section>`;
}

/** The Roster tab: generate, show past, export, then one card per Sunday. */
export function rosterTab(): string {
  const dates = windowDates();
  const miss = dates.filter((d) => !state.ros[d]).length;
  const cut = addDays(todayIso(), -7);
  const shown = [...new Set([...dates, ...Object.keys(state.ros)])].sort().filter((d) => state.past || d >= cut);
  return (
    `<div class="l noprint"><button class="p" id="gen">Generate ${miss} missing Sunday${miss === 1 ? '' : 's'}</button><button id="past">${state.past ? 'Hide' : 'Show'} past</button><button id="csv">Export CSV</button><span class="mut">Window: 3 rolling months. Existing Sundays are never overwritten.</span></div>` +
    shown.map((d) => card(d)).join('')
  );
}
