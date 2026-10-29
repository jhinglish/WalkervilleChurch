/**
 * Checks that the typed modules in src/ behave exactly like the original
 * JavaScript in the root index.html, on thousands of random scenarios.
 *
 * It extracts the original functions from index.html, runs them in a sandbox,
 * and compares their output with the TypeScript versions. Run it with
 * `npm run check:equivalence`. Delete it, together with the root index.html,
 * once the TypeScript build replaces the legacy file.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { addDays, sundaysInWindow } from '../src/dates';
import { generateAssignments } from '../src/generate';
import { findIssues, flaggedDates } from '../src/issues';
import {
  activeMinistries,
  isAway,
  ministriesForSunday,
  personEligibility,
  personName,
  takeSnapshot,
} from '../src/model';
import type { AwayEntry, Config, Ministry, Person, Roster } from '../src/types';

const SCENARIOS = 1500;
const lines = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').split('\n');

function line(prefix: string): string {
  const found = lines.find((l) => l.startsWith(prefix));
  if (!found) throw new Error(`index.html no longer contains "${prefix}"; update scripts/equivalence.ts`);
  return found;
}

/** A function whose body continues on lines that start with a space. */
function block(prefix: string): string {
  const start = lines.findIndex((l) => l.startsWith(prefix));
  if (start < 0) throw new Error(`index.html no longer contains "${prefix}"; update scripts/equivalence.ts`);
  let end = start + 1;
  while (end < lines.length && lines[end]?.startsWith(' ')) end++;
  return lines.slice(start, end).join('\n');
}

interface Legacy {
  set(cfg: Config, people: Record<string, Person>, ros: Record<string, Roster>, away: Record<string, AwayEntry>, today: string): void;
  gen(date: string, prior: Roster[]): unknown;
  snap(date: string, roster?: Roster): unknown;
  Ms(date: string): unknown;
  Pn(date: string, id: string): string;
  Pe(date: string, id: string): string[] | undefined;
  isAway(id: string, date: string): boolean;
  issues(date: string): { sum: string[]; out: Record<string, string[]> };
  sundays(): string[];
}

const legacy = vm.runInNewContext(
  [
    'let cfg=null,people={},ros={},away={};const BOX={v:""};const today=()=>BOX.v;',
    line('const Mall='),
    block('function Ms('),
    block('function snap('),
    line('const Pn='),
    line('const addD='),
    line('const isAway='),
    block('function sundays('),
    block('function issues('),
    block('function gen('),
    '({set(c,p,r,a,t){cfg=c;people=p;ros=r;away=a;BOX.v=t},Ms,snap,Pn,Pe,issues,gen,sundays,isAway})',
  ].join('\n'),
) as Legacy;

/** Arrays and objects from the sandbox have a different prototype, so compare as JSON. */
const plain = (x: unknown): unknown => JSON.parse(JSON.stringify(x ?? null));

let seed = 12345;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const ri = (n: number): number => Math.floor(rnd() * n);
const pick = <T>(list: T[]): T => list[ri(list.length)] as T;

let comparisons = 0;
const same = (a: unknown, b: unknown, what: string): void => {
  assert.deepEqual(plain(a), plain(b), `${what} differs`);
  comparisons++;
};

for (let scenario = 0; scenario < SCENARIOS; scenario++) {
  const ministries: Ministry[] = Array.from({ length: 2 + ri(5) }, (_, i) => ({
    k: `m${i}`,
    l: `Min ${i}${ri(3) ? '' : ' X'}`,
    n: ri(4),
    x: ri(3) === 0 ? 1 : 0,
    ...(ri(6) === 0 ? { gone: true } : {}),
  }));
  const config: Config = { start: '2027-01-03', ministries };
  const peopleList: Person[] = Array.from({ length: 3 + ri(12) }, (_, i) => ({
    id: `p${i}`,
    name: pick(['Ann', 'bob', 'Cleo', 'dave', 'Eve', 'Åsa', 'Zed']) + i,
    family: ri(4),
    elig: ministries.filter(() => ri(3) > 0).map((m) => m.k),
    ...(ri(8) === 0 ? { gone: true } : {}),
  }));
  const people = Object.fromEntries(peopleList.map((p) => [p.id, p]));
  const awayList: AwayEntry[] = Array.from({ length: ri(5) }, () => {
    const from = addDays('2027-01-03', 7 * ri(10));
    return { person: pick(peopleList).id, from, to: addDays(from, ri(3) * 7), note: '' };
  });
  const awayById = Object.fromEntries(awayList.map((a, i) => [`a${i}`, a]));
  const today = addDays('2027-01-03', ri(120) - 20);
  legacy.set(config, people, {}, awayById, today);

  // Generate a chain of Sundays with both implementations.
  const chain: Roster[] = [];
  for (let week = 0; week < 1 + ri(7); week++) {
    const date = addDays('2027-01-03', 7 * week);
    const assignments = generateAssignments({
      date,
      ministries: activeMinistries(config),
      people: peopleList,
      away: awayList,
      prior: chain,
    });
    same(legacy.gen(date, chain), assignments, 'generated Sunday');
    const roster: Roster = { date, s: assignments, gen: true, manual: false };
    if (ri(2)) roster.meta = takeSnapshot(config, peopleList);
    chain.push(roster);
  }

  // Hand edits, orphaned ministries and unknown people.
  for (const roster of chain) {
    if (ri(2)) {
      const k = pick(ministries).k;
      roster.s[k] = [...(roster.s[k] ?? []), pick(peopleList).id];
    }
    if (ri(4) === 0) roster.s['zz'] = ['p0', 'ghost'];
    if (ri(5) === 0) roster.s['m0'] = [...(roster.s['m0'] ?? []), 'ghost'];
  }
  const rosters = Object.fromEntries(chain.map((r) => [r.date, r]));
  legacy.set(config, people, rosters, awayById, today);

  same(legacy.snap('x'), takeSnapshot(config, peopleList), 'new snapshot');
  for (const roster of chain) {
    same(legacy.snap(roster.date, roster), takeSnapshot(config, peopleList, roster), 'snapshot of an existing Sunday');
    same(legacy.Ms(roster.date), ministriesForSunday(config, roster), "a Sunday's ministries");
    same(legacy.issues(roster.date), findIssues(roster, config, people, awayList), "a Sunday's issues");
    for (const id of ['p0', 'p1', 'ghost']) {
      assert.equal(legacy.Pn(roster.date, id), personName(roster, people, id), 'person name');
      same(legacy.Pe(roster.date, id), personEligibility(roster, people, id), 'person eligibility');
      assert.equal(legacy.isAway(id, roster.date), isAway(awayList, id, roster.date), 'away check');
      comparisons += 2;
    }
  }
  same(legacy.sundays(), sundaysInWindow(config.start, today), 'Sundays in window');

  const flagged = flaggedDates(Object.keys(rosters).sort(), today, (d) => findIssues(rosters[d] as Roster, config, people, awayList));
  const legacyFlagged = Object.keys(rosters)
    .sort()
    .filter((d) => d >= today && (() => { const x = legacy.issues(d); return x.sum.length + Object.keys(x.out).length > 0; })());
  same(legacyFlagged, flagged, 'flagged Sundays');
}

console.log(`Equivalent: ${comparisons} comparisons over ${SCENARIOS} random scenarios.`);
