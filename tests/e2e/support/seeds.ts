import type { Seed } from './fake-runtime';

/** Sample data for the tests. Dates are in 2027, after the pinned clock (2026-10-28), so every Sunday is "upcoming". */

const ministries = [
  { k: 'sec', l: 'Security/Lock Up', n: 1, x: 1 },
  { k: 'wel', l: 'Welcoming', n: 1, x: 0 },
  { k: 'tea', l: 'Tea and Coffee', n: 2, x: 0 },
  { k: 'cre', l: 'Creche', n: 2, x: 1 },
  { k: 'com', l: 'Communion Prep', n: 1, x: 0, gone: true },
];

const person = (name: string, family: number, elig: string[], gone = false) => ({ name, family, elig, ...(gone ? { gone: true } : {}) });

const people: Record<string, ReturnType<typeof person>> = {
  ann: person('Ann', 1, ['wel', 'tea']),
  bob: person('Bob', 2, ['sec', 'tea']),
  cy: person('Cy', 1, ['tea', 'cre']),
  dee: person('Dee', 3, ['cre', 'wel']),
  eli: person('Eli', 3, ['tea', 'wel']),
  fay: person('Fay', 4, ['cre', 'tea', 'sec']),
  gus: person('Gus', 5, ['wel']),
  hal: person('Hal', 0, ['tea']),
  ivy: person('Ivy', 0, ['cre']),
  jon: person('Jon', 2, ['sec', 'wel']),
  ken: person('Ken', 0, ['tea'], true),
};

/** Ministries, people and one away entry; no Sundays generated yet. */
export function freshSeed(): Seed {
  const seed: Seed = { 'config/main': { start: '2027-01-03', ministries } };
  for (const [id, p] of Object.entries(people)) seed[`people/${id}`] = p;
  seed['away/x1'] = { person: 'ann', from: '2027-01-10', to: '2027-01-17', note: 'holiday' };
  return seed;
}

/**
 * Two Sundays generated before snapshots existed (no `meta`). The first has a verse and a note and uses
 * the removed ministry "Communion Prep"; the second was edited by hand.
 */
export function olderSundaysSeed(): Seed {
  const seed = freshSeed();
  seed['rosters/2027-01-03'] = {
    date: '2027-01-03',
    s: { sec: ['bob'], wel: ['ann'], tea: ['cy', 'eli'], cre: ['dee', 'fay'], com: ['gus'] },
    gen: true,
    manual: false,
    verse: 'John 3:16',
    note: 'Welcome new family',
  };
  seed['rosters/2027-01-10'] = {
    date: '2027-01-10',
    s: { sec: ['jon'], wel: ['ann'], tea: ['hal'], cre: ['ivy', 'ghost'] },
    gen: true,
    manual: true,
  };
  return seed;
}

/**
 * Creche needs two people but one Sunday has only Ann, and Eve is free to add.
 * A second Sunday in the past has the same problem, which must not be flagged.
 */
export function shortCrecheSeed(): Seed {
  return {
    'config/main': {
      start: '2027-01-03',
      ministries: [
        { k: 'tea', l: 'Tea and Coffee', n: 1, x: 0 },
        { k: 'cre', l: 'Creche', n: 2, x: 1 },
      ],
    },
    'people/ann': person('Ann', 0, ['tea', 'cre']),
    'people/bob': person('Bob', 0, ['tea']),
    'people/eve': person('Eve', 0, ['cre']),
    'rosters/2026-10-04': { date: '2026-10-04', s: { tea: ['bob'], cre: ['ann'] }, gen: true, manual: false },
    'rosters/2027-01-03': { date: '2027-01-03', s: { tea: ['bob'], cre: ['ann'] }, gen: true, manual: false },
  };
}
