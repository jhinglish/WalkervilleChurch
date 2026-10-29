import { formatDate, formatShortDate, todayIso } from '../dates';
import { esc } from '../dom';
import { flaggedDates } from '../issues';
import {
  allMinistriesNow,
  awayOn,
  flagsOn,
  issuesOn,
  ministriesOn,
  nameOn,
  peopleByName,
  peopleList,
  rosterAt,
} from '../selectors';
import { state } from '../state';
import type { IsoDate, MinistryKey, PersonId } from '../types';
import { noteBox, verseBox } from './shared';

/** Summary line above the grid: which upcoming Sundays need attention. */
function flagSummary(dates: readonly IsoDate[]): string {
  const flagged = flaggedDates(dates, todayIso(), (d) => issuesOn(d));
  return flagged.length
    ? `<div class="warn" style="margin-top:6px">⚑ ${flagged.length} upcoming Sunday${flagged.length === 1 ? '' : 's'} need${flagged.length === 1 ? 's' : ''} attention: ${flagged.map((d) => `<button data-fl="${d}">${formatShortDate(d)}</button>`).join(' ')}</div>`
    : '<div class="mut" style="margin-top:6px">No upcoming Sundays have problems.</div>';
}

/** The "Needs attention" row of the grid: a clickable flag under each upcoming Sunday with a problem. */
function flagRow(dates: readonly IsoDate[]): string {
  return (
    `<tr><td>⚑ Needs attention</td><td colspan="4" class="mut" style="text-align:left">click a flag to fix it</td>` +
    dates
      .map((d) => {
        if (d < todayIso()) return '<td></td>';
        const f = flagsOn(d);
        if (!f.n) return '<td></td>';
        const tip = [...f.sum, ...Object.entries(f.out).map(([id, l]) => `${nameOn(d, id)}: ${l.join('; ')}`)].join(' | ');
        return `<td data-fl="${d}" class="fl" style="cursor:pointer" title="${esc(tip)}">⚑ ${f.n}</td>`;
      })
      .join('') +
    '</tr>'
  );
}

/** The panel opened by clicking a flag: what is wrong on that Sunday, and controls to fix it. */
function flagDetail(): string {
  const d = state.fd;
  const r = d ? state.ros[d] : undefined;
  if (!d || !r) return '';
  const { out, sum } = issuesOn(d);
  const on: Record<PersonId, string> = {};
  for (const m of ministriesOn(d)) for (const i of r.s[m.k] || []) on[i] = m.l;
  const lines = [
    ...sum.map((s) => `<li>${esc(s)}</li>`),
    ...Object.entries(out).map(([id, l]) => `<li><b>${esc(nameOn(d, id))}</b>: ${esc(l.join('; '))}</li>`),
  ];
  return (
    `<div class="card"><h3>${formatDate(d)} <button data-fl="${d}">Close</button></h3>` +
    (lines.length
      ? `<ul class="warn" style="margin:0 0 8px;padding-left:20px">${lines.join('')}</ul>`
      : '<div class="mut">No issues on this Sunday.</div>') +
    ministriesOn(d)
      .map((m) => {
        const ids = r.s[m.k] || [];
        const opts = peopleByName().filter((p) => !p.gone && p.elig.includes(m.k) && !ids.includes(p.id));
        return `<div class="row"><b>${esc(m.l)}<div class="mut">${m.n} needed</div></b><div>${
          ids
            .map(
              (i) =>
                `<span${out[i] ? ' class="warn"' : ''}>${esc(nameOn(d, i))}<span class="x" data-srm="${m.k}|${esc(i)}" data-d="${d}" title="Remove">✕</span></span>`,
            )
            .join(', ') || '<span class="mut">Unfilled</span>'
        }<div class="l"><select id="sa-${m.k}"><option value="">Add…</option>${opts
          .map(
            (p) =>
              `<option value="${esc(p.id)}">${esc(p.name)}${awayOn(p.id, d) ? ' (away)' : on[p.id] ? ` (also: ${esc(on[p.id])})` : ''}</option>`,
          )
          .join('')}</select><button data-sadd="${m.k}" data-d="${d}">Add</button></div></div></div>`;
      })
      .join('') +
    `<div class="l"><button data-regen="${d}">${state.cf === d ? 'Confirm: replace this Sunday' : 'Regenerate this Sunday'}</button></div></div>`
  );
}

interface PersonRow {
  p: ReturnType<typeof peopleList>[number];
  /** Per Sunday, the ministries this person served in. */
  cells: MinistryKey[][];
  run: number;
  best: number;
  tot: number;
  last: IsoDate | '';
}

/** The Service record tab: who served what and when, with runs, flags and per-Sunday verses and notes. */
export function recordTab(): string {
  const M = allMinistriesNow;
  const ds = Object.keys(state.ros).sort();
  const nx = ds.find((x) => x >= todayIso()) || '';
  const up = ds.filter((d) => !nx || d <= nx);
  const sd = formatShortDate;
  if (!ds.length) return '<div class="card"><p class="mut">No Sundays generated yet.</p></div>';
  const ab: Record<MinistryKey, string> = {};
  for (const m of M()) ab[m.k] = m.l.split(/[ \/&]+/).map((w) => w.charAt(0)).join('').slice(0, 2);

  const rows: PersonRow[] = peopleList()
    .map((p) => {
      const cells = ds.map((d) => M().filter((m) => (rosterAt(d).s[m.k] || []).includes(p.id)).map((m) => m.k));
      let run = 0;
      let best = 0;
      let tot = 0;
      let last: IsoDate | '' = '';
      up.forEach((d, i) => {
        if ((cells[i] ?? []).length) {
          run++;
          tot++;
          last = d;
          best = Math.max(best, run);
        } else run = 0;
      });
      return { p, cells, run, best, tot, last };
    })
    .filter((x) => (x.p.elig.length && !x.p.gone) || x.tot || x.cells.some((c) => c.length))
    .sort((a, b) => b.run - a.run || a.p.name.localeCompare(b.p.name));

  const x0 = rows.find((r) => r.p.id === state.pick);
  const cnt: Record<MinistryKey, number> = {};
  let det = '';
  if (x0) {
    x0.cells.forEach((c, i) => {
      const d = ds[i];
      if (d !== undefined && up.includes(d)) for (const k of c) cnt[k] = (cnt[k] || 0) + 1;
    });
    det = `<div class="card"><h3>${esc(x0.p.name)}</h3><div class="mut">Run ${x0.run} · Longest ${x0.best} · Total ${x0.tot} · Last served ${x0.last ? formatDate(x0.last) : 'never'}</div>
  <div class="l">${M()
    .map((m) => `<span style="border:1px solid var(--bd);border-radius:14px;padding:3px 10px">${esc(m.l)}: ${cnt[m.k] || 0}</span>`)
    .join('')}</div>
  <div style="overflow-x:auto"><table class="rec"><tr><th>Sunday</th><th>Serving</th><th>Note</th></tr>${ds
    .slice()
    .reverse()
    .map((d) => {
      const c = x0.cells[ds.indexOf(d)] ?? [];
      return `<tr class="${up.includes(d) ? '' : 'fu'}"><td>${formatDate(d)}</td><td>${
        c.length ? c.map((k) => esc(M().find((m) => m.k === k)?.l)).join(' + ') : awayOn(x0.p.id, d) ? 'Away' : '-'
      }</td><td style="text-align:left;white-space:pre-wrap">${esc(rosterAt(d).note || '')}</td></tr>`;
    })
    .join('')}</table></div></div>`;
  }

  const ns = state.nd && ds.includes(state.nd) ? state.nd : nx || (ds[ds.length - 1] ?? '');
  const withNotes = ds.filter((d) => rosterAt(d).note || rosterAt(d).verse);
  const nt = `<div class="card"><h3>Sunday verses and notes</h3><div class="mut">Each verse and note belongs to one Sunday and is kept permanently. Choose a Sunday to read or edit them.</div><div class="l"><select id="nsel">${ds
    .map((d) => `<option value="${d}"${d === ns ? ' selected' : ''}>${formatDate(d)}</option>`)
    .join('')}</select></div><b>Verse</b>${verseBox(ns)}<b>Notes</b>${noteBox(ns)}${
    withNotes.length
      ? '<div class="mut">All verses and notes</div>' +
        withNotes
          .map(
            (d) =>
              `<div class="l"><b>${formatDate(d)}</b><span style="white-space:pre-wrap">${rosterAt(d).verse ? `<i>${esc(rosterAt(d).verse)}</i> ` : ''}${esc(rosterAt(d).note || '')}</span></div>`,
          )
          .join('')
      : ''
  }</div>`;

  const thr = state.thr;
  return (
    `<div class="card"><h3>Service record</h3><div class="l">Optional highlight: runs of <input id="thr" type="number" min="0" max="12" value="${thr}" style="width:64px"> or more Sundays (0 = off)</div>
 <div class="mut">Run = consecutive Sundays served up to ${nx ? formatDate(nx) : 'the last Sunday'} (an away Sunday or a Sunday off resets it). Later columns are planned and dimmed. Ministries: ${M()
   .map((m) => `${ab[m.k]} = ${esc(m.l)}`)
   .join(', ')}. Sorted by current run.</div>${flagSummary(ds)}</div>
 <div style="overflow-x:auto"><table class="rec"><tr><th>Name</th><th>Run</th><th>Longest</th><th>Total</th><th>Last served</th>${ds
   .map((d) => `<th class="${up.includes(d) ? '' : 'fu'}">${sd(d)}</th>`)
   .join('')}</tr>` +
    flagRow(ds) +
    rows
      .map(
        (x) =>
          `<tr><td data-pick="${esc(x.p.id)}" style="cursor:pointer;${x.p.id === state.pick ? 'font-weight:700;text-decoration:underline' : ''}" title="Click for details">${thr > 0 && x.run >= thr ? '<span class="fl">⚑</span> ' : ''}${esc(x.p.name)}</td><td class="${thr > 0 && x.run >= thr ? 'fl' : ''}">${x.run}</td><td>${x.best}</td><td>${x.tot}</td><td>${x.last ? sd(x.last) : '-'}</td>${x.cells
            .map((c, i) => {
              const d = ds[i] ?? '';
              return `<td class="${c.length ? 'hit' : ''}${awayOn(x.p.id, d) ? ' aw' : ''}${up.includes(d) ? '' : ' fu'}">${c.map((k) => ab[k]).join('+')}</td>`;
            })
            .join('')}</tr>`,
      )
      .join('') +
    '</table></div>' +
    flagDetail() +
    det +
    nt
  );
}
