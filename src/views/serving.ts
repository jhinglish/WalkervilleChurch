import { formatDate, todayIso } from '../dates';
import { esc } from '../dom';
import { awayOn, issuesOn, ministriesOn, nameOn, peopleByName } from '../selectors';
import { state } from '../state';
import type { PersonId } from '../types';
import { noteBox, verseBox } from './shared';

/** The Serving tab: the next Sunday only, with optional editing, the verse and the notes. */
export function servingTab(): string {
  const d = Object.keys(state.ros)
    .sort()
    .find((x) => x >= todayIso());
  const r = d ? state.ros[d] : undefined;
  if (!d || !r) return '<div class="card"><p class="mut">No upcoming Sunday has been generated yet.</p></div>';
  const { out, sum } = issuesOn(d);
  const on: Record<PersonId, string> = {};
  const ministries = ministriesOn(d);
  for (const m of ministries) for (const i of r.s[m.k] || []) on[i] = m.l;
  const sedit = state.sedit;
  return (
    `<div class="l noprint"><button class="p" id="pdf" data-d="${d}">Export PDF</button><button id="sedit">${sedit ? 'Done editing' : 'Edit'}</button></div>
 <section class="card sv"><h3>${formatDate(d)}</h3>${r.verse ? `<p style="white-space:pre-wrap;font-style:italic">${esc(r.verse)}</p>` : ''}${sedit && sum.length ? `<div class="warn noprint">⚠ ${esc(sum.join(' · '))}</div>` : ''}` +
    ministries
      .map((m) => {
        const ids = r.s[m.k] || [];
        const opts = peopleByName().filter((p) => !p.gone && p.elig.includes(m.k) && !ids.includes(p.id));
        return `<div class="row"><b>${esc(m.l)}</b><div>${
          ids
            .map(
              (i) =>
                `<span${out[i] && sedit ? ' class="warn"' : ''}>${esc(nameOn(d, i))}${sedit ? `<span class="x" data-srm="${m.k}|${esc(i)}" data-d="${d}" title="Remove">✕</span>` : ''}</span>`,
            )
            .join(', ') || '<span class="mut">Unfilled</span>'
        }
  ${
    sedit
      ? `<div class="l noprint"><select id="sa-${m.k}"><option value="">Add…</option>${opts
          .map(
            (p) =>
              `<option value="${esc(p.id)}">${esc(p.name)}${awayOn(p.id, d) ? ' (away)' : on[p.id] ? ` (also: ${esc(on[p.id])})` : ''}</option>`,
          )
          .join('')}</select><button data-sadd="${m.k}" data-d="${d}">Add</button></div>`
      : ''
  }</div></div>`;
      })
      .join('') +
    '</section><div class="card noprint"><b>Verse for this Sunday</b><div class="mut">Shown at the top of the PDF.</div>' +
    verseBox(d) +
    '</div><div class="card noprint"><b>Notes for this Sunday</b>' +
    noteBox(d) +
    '</div>'
  );
}
