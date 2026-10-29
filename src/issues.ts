import { isAway, ministriesForSunday, personEligibility } from './model';
import type { SundayMinistry } from './model';
import type { AwayEntry, Config, IsoDate, Person, PersonId, Roster, RosterIssues } from './types';

/**
 * Finds every problem on one Sunday: unknown or removed people, people not
 * eligible for the ministry they are in, people marked away, double-booking,
 * exclusive-ministry clashes, and ministries short of people. Names, headcounts
 * and eligibility come from the Sunday's snapshot where it has one.
 */
export function findIssues(
  roster: Roster,
  config: Config | null,
  people: Readonly<Record<PersonId, Person>>,
  away: readonly AwayEntry[],
): RosterIssues {
  const ministries = ministriesForSunday(config, roster);
  const out: Record<PersonId, string[]> = {};
  const sum: string[] = [];
  const placedIn: Record<PersonId, SundayMinistry[]> = {};
  const add = (id: PersonId, text: string): void => {
    (out[id] ??= []).push(text);
  };

  for (const m of ministries) {
    for (const id of roster.s[m.k] ?? []) {
      (placedIn[id] ??= []).push(m);
      const person = people[id];
      const eligible = personEligibility(roster, people, id);
      if (!eligible) add(id, 'Unknown person');
      else if (person?.gone) add(id, 'Removed from the people list');
      else if (!eligible.includes(m.k)) add(id, `Not marked eligible for ${m.l}`);
      if (isAway(away, id, roster.date)) add(id, 'Marked away');
    }
  }

  for (const [id, list] of Object.entries(placedIn)) {
    if (list.length > 1) {
      add(id, `Double-booked: ${list.map((m) => m.l).join(' + ')}`);
      if (list.some((m) => m.x)) add(id, 'Exclusive ministry clash');
    }
  }

  for (const m of ministries) {
    const placed = (roster.s[m.k] ?? []).length;
    if (placed < m.n) sum.push(`${m.l} needs ${m.n - placed} more`);
  }

  return { out, sum };
}

/** How many separate problems a Sunday has (ministry shortfalls plus people with a problem). */
export function flagCount(issues: RosterIssues): number {
  return issues.sum.length + Object.keys(issues.out).length;
}

/** Upcoming Sundays (today or later) that have at least one problem. */
export function flaggedDates(
  dates: readonly IsoDate[],
  today: IsoDate,
  issuesFor: (date: IsoDate) => RosterIssues,
): IsoDate[] {
  return dates.filter((d) => d >= today && flagCount(issuesFor(d)) > 0);
}
