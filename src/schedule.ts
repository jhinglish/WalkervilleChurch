import { todayIso } from './dates';
import { awayOn, ministriesOn, nameOn } from './selectors';
import { state } from './state';
import type { IsoDate, MinistryKey, PersonId } from './types';

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
