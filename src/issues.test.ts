import { describe, expect, it } from 'vitest';
import { findIssues, flagCount, flaggedDates } from './issues';
import { takeSnapshot } from './model';
import { byId, config, person, roster } from './test-fixtures';
import type { AwayEntry, Config } from './types';

const ann = person('ann', ['wel', 'tea']);
const bob = person('bob', ['tea', 'sec']);
const cy = person('cy', ['tea', 'cre']);
const dee = person('dee', ['cre', 'tea']);
const people = byId([ann, bob, cy, dee]);
const none: AwayEntry[] = [];

const full = (date: string) =>
  roster(date, { sec: ['bob'], wel: ['ann'], tea: ['cy', 'dee'], cre: [] });

describe('findIssues', () => {
  it('reports a short ministry and nothing else on an otherwise clean Sunday', () => {
    const issues = findIssues(full('2027-01-03'), config, people, none);
    expect(issues.out).toEqual({});
    expect(issues.sum).toEqual(['Creche needs 2 more']);
  });

  it('flags people who are not eligible, unknown, removed or away', () => {
    const r = roster('2027-01-03', { sec: ['bob'], wel: ['cy'], tea: ['ghost', 'old'], cre: ['dee', 'cy'] });
    const old = person('old', ['tea'], { gone: true });
    const away: AwayEntry[] = [{ person: 'dee', from: '2027-01-03', to: '2027-01-03', note: '' }];
    const issues = findIssues(r, config, byId([ann, bob, cy, dee, old]), away);
    expect(issues.out['cy']).toContain('Not marked eligible for Welcoming');
    expect(issues.out['ghost']).toEqual(['Unknown person']);
    expect(issues.out['old']).toEqual(['Removed from the people list']);
    expect(issues.out['dee']).toEqual(['Marked away']);
  });

  it('flags double-booking, and an exclusive clash when one of the ministries is exclusive', () => {
    const r = roster('2027-01-03', { sec: ['bob'], wel: [], tea: ['bob', 'cy'], cre: ['dee', 'cy'] });
    const issues = findIssues(r, config, people, none);
    expect(issues.out['bob']).toContain('Double-booked: Security/Lock Up + Tea and Coffee');
    expect(issues.out['bob']).toContain('Exclusive ministry clash');
    expect(issues.out['cy']).toContain('Double-booked: Tea and Coffee + Creche');
  });

  it('uses the snapshot, so later eligibility and headcount changes do not alter the result', () => {
    const r = roster('2027-01-03', { wel: ['ann'] }, { meta: takeSnapshot(config, [ann]) });
    const liveAnn = person('ann', ['tea']);
    const stricter: Config = {
      ...config,
      ministries: config.ministries.map((m) => (m.k === 'wel' ? { ...m, n: 3 } : m)),
    };
    const issues = findIssues(r, stricter, byId([liveAnn]), none);
    expect(issues.out['ann']).toBeUndefined();
    expect(issues.sum).not.toContain('Welcoming needs 2 more');
  });

  it('still flags a person marked away after the Sunday was generated', () => {
    const r = roster('2027-01-03', { wel: ['ann'] }, { meta: takeSnapshot(config, [ann]) });
    const away: AwayEntry[] = [{ person: 'ann', from: '2027-01-03', to: '2027-01-03', note: '' }];
    expect(findIssues(r, config, people, away).out['ann']).toEqual(['Marked away']);
  });
});

describe('flagCount and flaggedDates', () => {
  it('counts shortfalls plus people with a problem', () => {
    expect(flagCount({ out: { a: ['x'], b: ['y', 'z'] }, sum: ['short'] })).toBe(3);
    expect(flagCount({ out: {}, sum: [] })).toBe(0);
  });

  it('lists only upcoming Sundays that have a problem', () => {
    const issuesFor = (d: string) =>
      d === '2027-01-10' || d === '2027-01-24' ? { out: {}, sum: ['short'] } : { out: {}, sum: [] };
    const dates = ['2027-01-03', '2027-01-10', '2027-01-17', '2027-01-24'];
    expect(flaggedDates(dates, '2027-01-17', issuesFor)).toEqual(['2027-01-24']);
    expect(flaggedDates(dates, '2027-01-03', issuesFor)).toEqual(['2027-01-10', '2027-01-24']);
  });
});
