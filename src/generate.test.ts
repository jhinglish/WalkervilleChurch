import { describe, expect, it } from 'vitest';
import { generateAssignments } from './generate';
import { ministries, person, roster } from './test-fixtures';
import type { Ministry } from './types';

const plain = (k: string, n: number, x: 0 | 1 = 0): Ministry => ({ k, l: k, n, x });
const run = (over: Partial<Parameters<typeof generateAssignments>[0]>) =>
  generateAssignments({ date: '2027-01-03', ministries, people: [], away: [], prior: [], ...over });

describe('generateAssignments', () => {
  const people = [
    person('ann', ['wel', 'tea']),
    person('bob', ['sec', 'tea']),
    person('cy', ['tea', 'cre']),
    person('dee', ['cre', 'wel']),
    person('eli', ['tea', 'wel']),
    person('fay', ['cre', 'tea']),
  ];

  it('fills each ministry to its headcount when enough people are eligible', () => {
    const a = run({ people });
    expect(a['sec']).toHaveLength(1);
    expect(a['wel']).toHaveLength(1);
    expect(a['tea']).toHaveLength(2);
    expect(a['cre']).toHaveLength(2);
  });

  it('only places eligible people and never double-books when there are enough people', () => {
    const a = run({ people });
    for (const m of ministries) {
      for (const id of a[m.k] ?? []) expect(people.find((p) => p.id === id)?.elig).toContain(m.k);
    }
    const all = Object.values(a).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('skips people who are away or removed', () => {
    const a = run({
      people: [person('ann', ['wel']), person('bea', ['wel']), person('cat', ['wel'], { gone: true })],
      ministries: [plain('wel', 1)],
      away: [{ person: 'ann', from: '2027-01-03', to: '2027-01-03', note: '' }],
    });
    expect(a['wel']).toEqual(['bea']);
  });

  it('puts a person in an exclusive ministry only if they are not placed elsewhere that Sunday', () => {
    const a = run({
      people: [person('ann', ['sec', 'wel']), person('bob', ['wel'])],
      ministries: [plain('sec', 1, 1), plain('wel', 1)],
    });
    expect(a['sec']).toEqual(['ann']);
    expect(a['wel']).toEqual(['bob']);
  });

  it('rotates: someone who served the ministry most recently ranks after someone who never has', () => {
    const prior = [roster('2026-12-27', { wel: ['ann'] })];
    const a = run({
      people: [person('ann', ['wel']), person('bea', ['wel'])],
      ministries: [plain('wel', 1)],
      prior,
    });
    expect(a['wel']).toEqual(['bea']);
  });

  it('keeps family members together where it can', () => {
    const a = run({
      people: [
        person('ann', ['wel'], { family: 1 }),
        person('bob', ['tea'], { family: 2 }),
        person('cy', ['tea'], { family: 1 }),
      ],
      ministries: [plain('wel', 1), plain('tea', 1)],
    });
    expect(a['wel']).toEqual(['ann']);
    expect(a['tea']).toEqual(['cy']);
  });

  it('leaves a slot unfilled when nobody qualifies', () => {
    const a = run({ people: [person('ann', ['tea'])], ministries: [plain('tea', 2)] });
    expect(a['tea']).toEqual(['ann']);
  });

  it('gives the same answer for the same input', () => {
    expect(run({ people })).toEqual(run({ people }));
  });
});
