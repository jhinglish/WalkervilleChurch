import { esc } from '../dom';
import { peopleByName } from '../selectors';
import { state } from '../state';

/** The Away tab: a form to flag someone unavailable, and the current list. */
export function awayTab(): string {
  const people = peopleByName().filter((p) => p.elig.length && !p.gone);
  const entries = Object.entries(state.away).sort((a, b) => (a[1].from < b[1].from ? -1 : 1));
  return `<div class="card"><h3>Flag unavailability</h3><div class="l"><select id="ap">${people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
  <input type="date" id="af"><span>to</span><input type="date" id="at"><input id="an" placeholder="Note (optional)"><button class="p" id="aadd">Add</button></div>
  <div class="mut">Leave “to” blank for a single date. Rosters already generated are flagged in red; use “Regenerate this Sunday” to refill.</div></div>
  <div class="card"><h3>Away</h3>${
    entries
      .map(
        ([k, a]) =>
          `<div class="l">${esc(state.people[a.person]?.name || a.person)} · ${a.from}${a.to !== a.from ? ` to ${a.to}` : ''} ${a.note ? `· ${esc(a.note)}` : ''}<button data-del="${esc(k)}">Remove</button></div>`,
      )
      .join('') || '<span class="mut">Nobody flagged.</span>'
  }</div>`;
}
