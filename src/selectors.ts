import { todayIso, sundaysInWindow } from './dates';
import { generateAssignments } from './generate';
import { findIssues, flagCount } from './issues';
import {
  activeMinistries,
  allMinistries,
  isAway,
  ministriesForSunday,
  personName,
  takeSnapshot,
} from './model';
import type { SundayMinistry } from './model';
import { state } from './state';
import type { AwayEntry, IsoDate, Ministry, Person, PersonId, Roster, RosterIssues, RosterMeta } from './types';

/** Thin wrappers that apply the pure logic in the other modules to the page's current state. */

export const peopleList = (): Person[] => Object.values(state.people);
export const awayList = (): AwayEntry[] => Object.values(state.away);

/** People sorted by name, as the pickers and the Admin tab show them. */
export const peopleByName = (): Person[] => peopleList().sort((a, b) => a.name.localeCompare(b.name));

export const allMinistriesNow = (): Ministry[] => allMinistries(state.cfg);
export const activeMinistriesNow = (): Ministry[] => activeMinistries(state.cfg);

/** The roster for a date. Callers only pass dates that exist; an empty roster is returned otherwise. */
export const rosterAt = (date: IsoDate): Roster => state.ros[date] ?? { date, s: {} };

export const ministriesOn = (date: IsoDate): SundayMinistry[] => ministriesForSunday(state.cfg, state.ros[date]);
export const nameOn = (date: IsoDate, id: PersonId): string => personName(state.ros[date], state.people, id);
export const awayOn = (id: PersonId, date: IsoDate): boolean => isAway(awayList(), id, date);

export function issuesOn(date: IsoDate): RosterIssues {
  const roster = state.ros[date];
  return roster ? findIssues(roster, state.cfg, state.people, awayList()) : { out: {}, sum: [] };
}

/** Problems on a Sunday plus how many separate problems there are. */
export function flagsOn(date: IsoDate): RosterIssues & { n: number } {
  const issues = issuesOn(date);
  return { ...issues, n: flagCount(issues) };
}

/** Snapshot of the current ministries and people; with a roster, locks that Sunday as it now shows. */
export const snapshotNow = (roster?: Roster): RosterMeta => takeSnapshot(state.cfg, peopleList(), roster);

export const windowDates = (): IsoDate[] => (state.cfg ? sundaysInWindow(state.cfg.start, todayIso()) : []);

export const generateOn = (date: IsoDate, prior: readonly Roster[]) =>
  generateAssignments({
    date,
    ministries: activeMinistries(state.cfg),
    people: peopleList(),
    away: awayList(),
    prior,
  });

/** Sorts rosters by date, oldest first. */
export const byDate = (a: Roster, b: Roster): number => (a.date < b.date ? -1 : 1);
