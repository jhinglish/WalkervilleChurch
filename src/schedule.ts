import { canDecideSwap } from './auth';
import type { PublicUser } from './auth';
import { todayIso } from './dates';
import { awayOn, ministriesOn, nameOn } from './selectors';
import { state } from './state';
import type { IsoDate, MinistryKey, PersonId, SwapRequest } from './types';

/** One Sunday on which a person is serving in one ministry. */
export interface Slot {
  date: IsoDate;
  ministryKey: MinistryKey;
  ministry: string;
  /** Others serving in the same ministry that Sunday. */
  with: string[];
  /** The person flagged themselves away on this date. */
  away: boolean;
}

/** Every Sunday the person is on the roster, split into upcoming (today onwards) and past, each in date order. */
export function slotsFor(personId: PersonId): { upcoming: Slot[]; past: Slot[] } {
  const today = todayIso();
  const upcoming: Slot[] = [];
  const past: Slot[] = [];
  for (const date of Object.keys(state.ros).sort()) {
    const roster = state.ros[date];
    if (!roster) continue;
    for (const m of ministriesOn(date)) {
      const ids = roster.s[m.k] ?? [];
      if (!ids.includes(personId)) continue;
      (date >= today ? upcoming : past).push({
        date,
        ministryKey: m.k,
        ministry: m.l,
        with: ids.filter((i) => i !== personId).map((i) => nameOn(date, i)),
        away: awayOn(personId, date),
      });
    }
  }
  return { upcoming, past };
}

/** How many upcoming Sundays the team and master views show before pointing to the Roster tab. */
export const UPCOMING_SHOWN = 8;

/** Generated Sundays from today onwards, in date order, at most `limit` of them. */
export function upcomingSundays(limit: number = UPCOMING_SHOWN): IsoDate[] {
  const today = todayIso();
  return Object.keys(state.ros)
    .filter((d) => d >= today)
    .sort()
    .slice(0, limit);
}

/** Whether the person already has an open swap request for this ministry on this Sunday. */
export function hasOpenSwap(personId: PersonId, date: IsoDate, ministryKey: MinistryKey): boolean {
  return Object.values(state.swaps).some((s) => s.status === 'open' && s.from === personId && s.date === date && s.ministry === ministryKey);
}

/** Open swap requests this user is allowed to decide, soonest Sunday first. Admins get every request; leaders only their ministries. */
export function pendingSwapsFor(user: PublicUser): SwapRequest[] {
  return Object.values(state.swaps)
    .filter((s) => s.status === 'open' && canDecideSwap(s.ministry, s.from, user))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
    });
}
