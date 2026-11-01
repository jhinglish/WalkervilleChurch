import { currentUser } from '../auth';
import { formatDate, todayIso } from '../dates';
import { esc } from '../dom';
import { slotsFor } from '../schedule';
import { state } from '../state';
import type { Slot } from '../schedule';

/** How many past Sundays to list. */
const PAST_SHOWN = 5;

const withText = (s: Slot): string => (s.with.length ? ` <span class="mut">with ${esc(s.with.join(', '))}</span>` : '');

/** The My schedule tab: the Sundays the signed-in person is serving, with swap requests, a calendar file and their past service. */
export function mineTab(): string {
  const personId = currentUser()?.personId ?? null;
  const person = personId ? state.people[personId] : undefined;
  if (!personId || !person) {
    return '<div class="card"><h3>My schedule</h3><p class="mut">Your login is not linked to a person on the roster, so there is no personal schedule to show. Use the Serving tab to see who is serving this Sunday. An admin links a login to a person.</p></div>';
  }
  const { upcoming, past } = slotsFor(personId);
  const today = todayIso();
  const next = upcoming[0];
  const away = Object.values(state.away)
    .filter((a) => a.person === personId && a.to >= today)
    .sort((a, b) => (a.from < b.from ? -1 : 1));
  const requested = (s: Slot): boolean =>
    Object.values(state.swaps).some((x) => x.status === 'open' && x.from === personId && x.date === s.date && x.ministry === s.ministryKey);

  const nextCard = next
    ? `<div class="card sv"><b>Next time you are serving</b><h3>${formatDate(next.date)}: ${esc(next.ministry)}</h3>${
        next.with.length ? `<div class="mut">With ${esc(next.with.join(', '))}</div>` : ''
      }${next.away ? '<div class="warn">⚠ You are marked away on this date. Tell a team leader.</div>' : ''}</div>`
    : '<div class="card"><b>Next time you are serving</b><p class="mut">You are not on the roster for any upcoming Sunday that has been generated.</p></div>';

  const list = upcoming.length
    ? upcoming
        .map(
          (s) =>
            `<div class="row"><b>${formatDate(s.date)}</b><div>${esc(s.ministry)}${withText(s)}${s.away ? ' <span class="warn">⚠ marked away</span>' : ''} ${
              requested(s)
                ? '<span class="mut">· swap requested</span>'
                : `<button class="noprint" data-requires="requestSwap" data-swapfor="${esc(s.date)}|${esc(s.ministryKey)}">Request swap</button>`
            }</div></div>`,
        )
        .join('')
    : '<span class="mut">Nothing yet.</span>';

  const awayList = away.length
    ? away.map((a) => `<div class="l">${a.from}${a.to !== a.from ? ` to ${a.to}` : ''}${a.note ? ` · ${esc(a.note)}` : ''}</div>`).join('')
    : '<span class="mut">No upcoming away dates. Use the Away tab to flag one.</span>';

  const recent = past
    .slice(-PAST_SHOWN)
    .reverse()
    .map((s) => `<div class="row"><b>${formatDate(s.date)}</b><div>${esc(s.ministry)}${withText(s)}</div></div>`)
    .join('');
  const history = past.length
    ? `<div class="card"><h3>Your service so far</h3><div class="mut">You have served ${past.length} time${past.length === 1 ? '' : 's'} on recorded Sundays. Most recent:</div>${recent}</div>`
    : '';

  return `<div class="card"><h3>${esc(person.name)}</h3><div class="mut">Your upcoming Sundays on the roster.</div>${
    upcoming.length ? '<div class="l noprint"><button id="ics">Download calendar (.ics)</button></div>' : ''
  }</div>${nextCard}<div class="card"><h3>All upcoming Sundays</h3>${list}</div><div class="card"><h3>Your away dates</h3>${awayList}</div>${history}`;
}
