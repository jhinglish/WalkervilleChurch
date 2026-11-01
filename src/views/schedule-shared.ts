import { formatDate } from '../dates';
import { esc } from '../dom';
import { hasOpenSwap, slotsFor } from '../schedule';
import { allMinistriesNow, ministriesOn } from '../selectors';
import { state } from '../state';
import type { IsoDate, MinistryKey, PersonId, SwapRequest } from '../types';

/** Pieces shared by the three role layouts of the My schedule tab. */

const MAX_CUES = 5;
const OWN_SHOWN = 3;

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A ministry's current label, or its key when it no longer exists. */
export const teamLabel = (key: MinistryKey): string => allMinistriesNow().find((m) => m.k === key)?.l ?? key;

/** A ministry's label as one Sunday shows it. */
const labelOn = (date: IsoDate, key: MinistryKey): string => ministriesOn(date).find((m) => m.k === key)?.l ?? teamLabel(key);

/** Waiting swap requests, as cues that lead to the Swaps tab where they are approved. Removed for roles that cannot decide swaps. */
export function swapCueCard(pending: readonly SwapRequest[], heading: string): string {
  const rows = pending
    .slice(0, MAX_CUES)
    .map(
      (s) =>
        `<div class="row"><b>${formatDate(s.date)}</b><div>${esc(state.people[s.from]?.name ?? s.from)} asks to be covered in ${esc(labelOn(s.date, s.ministry))}${
          s.note ? ` <span class="mut">· ${esc(s.note)}</span>` : ''
        }</div></div>`,
    )
    .join('');
  const more = pending.length > MAX_CUES ? `<div class="mut">and ${pending.length - MAX_CUES} more</div>` : '';
  const body = pending.length
    ? `${rows}${more}<div class="l noprint"><button class="p" data-goto="w">Review and approve</button></div>`
    : '<p class="mut">No swap requests waiting.</p>';
  return `<div class="card cue" data-requires="decideSwaps"><h3>${esc(heading)}${pending.length ? ` <span class="badge">${pending.length}</span>` : ''}</h3>${body}</div>`;
}

/** A short list of the person's own next Sundays, for team leaders who also serve. Empty when there is nothing to show. */
export function ownSlotsCard(personId: PersonId | null): string {
  const person = personId ? state.people[personId] : undefined;
  if (!personId || !person) return '';
  const { upcoming } = slotsFor(personId);
  if (!upcoming.length) return '';
  const rows = upcoming
    .slice(0, OWN_SHOWN)
    .map(
      (s) =>
        `<div class="row"><b>${formatDate(s.date)}</b><div>${esc(s.ministry)}${s.away ? ' <span class="warn">⚠ marked away</span>' : ''} ${
          hasOpenSwap(personId, s.date, s.ministryKey)
            ? '<span class="mut">· swap requested</span>'
            : `<button class="noprint" data-requires="requestSwap" data-swapfor="${esc(s.date)}|${esc(s.ministryKey)}">Request swap</button>`
        }</div></div>`,
    )
    .join('');
  return `<div class="card"><h3>Your own Sundays</h3>${rows}</div>`;
}
