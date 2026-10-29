import { isAway } from './model';
import type { Assignments, AwayEntry, IsoDate, Ministry, Person, PersonId, Roster } from './types';

export interface GenerateInput {
  date: IsoDate;
  /** Ministries to fill: the active ones. */
  ministries: readonly Ministry[];
  /** Everyone; removed people are skipped here. */
  people: readonly Person[];
  away: readonly AwayEntry[];
  /** Earlier Sundays in date order, used for rotation. */
  prior: readonly Roster[];
}

/**
 * Chooses who serves where on one Sunday.
 *
 * Ministries are filled exclusive first, then smallest eligible pool first. For
 * each slot the candidates are eligible, not away, not already in that ministry
 * and not already in an exclusive ministry that day. People not yet used that
 * Sunday are preferred (required for exclusive ministries). Candidates are scored,
 * lowest wins: how recently they last served that ministry (never ranks best),
 * minus 1.5 if a family member is already placed, plus 0.01 per past service,
 * then alphabetical. A slot nobody qualifies for stays unfilled.
 *
 * Behaviour matches the original JavaScript exactly, including treating family 0
 * as a real family (see README, known issues).
 */
export function generateAssignments(input: GenerateInput): Assignments {
  const { date, ministries, away, prior } = input;
  const candidates = input.people.filter((p) => !p.gone);

  const lastIndex = new Map<string, number>();
  const timesServed = new Map<PersonId, number>();
  prior.forEach((roster, i) => {
    for (const m of ministries) {
      for (const id of roster.s[m.k] ?? []) {
        lastIndex.set(m.k + id, i);
        timesServed.set(id, (timesServed.get(id) ?? 0) + 1);
      }
    }
  });

  const poolSize = (m: Ministry): number => candidates.filter((p) => p.elig.includes(m.k)).length;
  const order = [...ministries].sort((a, b) => (b.x ? 1 : 0) - (a.x ? 1 : 0) || poolSize(a) - poolSize(b));

  const assignments: Assignments = {};
  const used = new Set<PersonId>();
  const inExclusive = new Set<PersonId>();

  for (const m of order) {
    const slot: PersonId[] = [];
    assignments[m.k] = slot;
    for (let n = 0; n < m.n; n++) {
      let pool = candidates.filter(
        (p) => p.elig.includes(m.k) && !isAway(away, p.id, date) && !slot.includes(p.id) && !inExclusive.has(p.id),
      );
      const fresh = pool.filter((p) => !used.has(p.id));
      pool = m.x ? fresh : fresh.length ? fresh : pool;
      if (pool.length === 0) break;

      const score = (p: Person): number =>
        (lastIndex.get(m.k + p.id) ?? -99) -
        (candidates.some((q) => q.family === p.family && used.has(q.id)) ? 1.5 : 0) +
        (timesServed.get(p.id) ?? 0) * 0.01;
      pool.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));

      const chosen = pool[0];
      if (!chosen) break;
      slot.push(chosen.id);
      used.add(chosen.id);
      if (m.x) inExclusive.add(chosen.id);
    }
  }
  return assignments;
}
