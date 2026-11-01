import type { PublicUser } from '../auth';
import { formatDate, todayIso } from '../dates';
import { esc } from '../dom';
import { hasOpenSwap, slotsFor } from '../schedule';
import type { Slot } from '../schedule';
import { state } from '../state';

/** How many past Sundays to list. */
const PAST_SHOWN = 5;

const withText = (s: Slot): string => (s.with.length ? ` <span class="mut">with ${esc(s.with.join(', '))}</span>` : '');

/** The member layout: only this person's own Sundays, with the two actions a member needs most. */
export function memberSchedule(user: PublicUser): string {
  const personId = user.personId;
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

  const actions = `<div class="l noprint"><button class="p cta" data-requires="manageOwnAway" data-goto="a">Mark Unavailability</button><button class="p cta" data-requires="requestSwap" data-goto="w">Request a Swap</button>${
    upcoming.length ? '<button id="ics">Download calendar (.ics)</button>' : ''
  }</div>`;

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
              hasOpenSwap(personId, s.date, s.ministryKey)
                ? '<span class="mut">· swap requested</span>'
                : `<button class="noprint" data-requires="requestSwap" data-swapfor="${esc(s.date)}|${esc(s.ministryKey)}">Request swap</button>`
            }</div></div>`,
        )
        .join('')
    : '<span class="mut">Nothing yet.</span>';

  const awayList = away.length
    ? away.map((a) => `<div class="l">${a.from}${a.to !== a.from ? ` to ${a.to}` : ''}${a.note ? ` · ${esc(a.note)}` : ''}</div>`).join('')
    : '<span class="mut">No upcoming away dates. Use Mark Unavailability above to flag one.</span>';

  const recent = past
    .slice(-PAST_SHOWN)
    .reverse()
    .map((s) => `<div class="row"><b>${formatDate(s.date)}</b><div>${esc(s.ministry)}${withText(s)}</div></div>`)
    .join('');
  const history = past.length
    ? `<div class="card"><h3>Your service so far</h3><div class="mut">You have served ${past.length} time${past.length === 1 ? '' : 's'} on recorded Sundays. Most recent:</div>${recent}</div>`
    : '';

  return `<div class="card"><h3>${esc(person.name)}</h3><div class="mut">Your upcoming Sundays on the roster.</div>${actions}</div>${nextCard}<div class="card"><h3>All upcoming Sundays</h3>${list}</div><div class="card"><h3>Your away dates</h3>${awayList}</div>${history}`;
}
