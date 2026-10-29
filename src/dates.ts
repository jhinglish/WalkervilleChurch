import type { IsoDate } from './types';

const DAY_MS = 86_400_000;

/** Adds (or subtracts) whole days to a `YYYY-MM-DD` date, in UTC. */
export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Today's date in UTC. Pass `now` in tests. */
export function todayIso(now: Date = new Date()): IsoDate {
  return now.toISOString().slice(0, 10);
}

/**
 * Every Sunday the roster covers: from the configured first Sunday up to three
 * calendar months after the later of `start` and `today`. Past Sundays are
 * included so history stays visible.
 */
export function sundaysInWindow(start: IsoDate, today: IsoDate): IsoDate[] {
  const from = today > start ? today : start;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 3);
  const last = end.toISOString().slice(0, 10);
  const sundays: IsoDate[] = [];
  for (let d = start; d <= last; d = addDays(d, 7)) sundays.push(d);
  return sundays;
}

/** For example "Sun, 3 Jan 2027". */
export function formatDate(date: IsoDate): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** For example "3 Jan". */
export function formatShortDate(date: IsoDate): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
