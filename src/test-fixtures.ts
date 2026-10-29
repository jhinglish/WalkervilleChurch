import type { Config, Ministry, MinistryKey, Person, PersonId, Roster } from './types';

/** Small, realistic ministries used across the tests. */
export const ministries: Ministry[] = [
  { k: 'sec', l: 'Security/Lock Up', n: 1, x: 1 },
  { k: 'wel', l: 'Welcoming', n: 1, x: 0 },
  { k: 'tea', l: 'Tea and Coffee', n: 2, x: 0 },
  { k: 'cre', l: 'Creche', n: 2, x: 1 },
];

export const config: Config = { start: '2027-01-03', ministries };

/** Builds a person whose name is the capitalised id. */
export function person(id: PersonId, elig: MinistryKey[], extra: Partial<Person> = {}): Person {
  return { id, name: id.charAt(0).toUpperCase() + id.slice(1), family: 0, elig, ...extra };
}

export function byId(list: readonly Person[]): Record<PersonId, Person> {
  return Object.fromEntries(list.map((p) => [p.id, p]));
}

export function roster(date: string, s: Roster['s'], extra: Partial<Roster> = {}): Roster {
  return { date, s, ...extra };
}
