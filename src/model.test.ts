import { describe, expect, it } from 'vitest';
import {
  activeMinistries,
  isAway,
  ministriesForSunday,
  personEligibility,
  personName,
  takeSnapshot,
} from './model';
import { byId, config, ministries, person, roster } from './test-fixtures';
import type { Config } from './types';

const ann = person('ann', ['wel', 'tea']);
const bob = person('bob', ['tea']);

describe('isAway', () => {
  const away = [{ person: 'ann', from: '2027-01-10', to: '2027-01-17', note: '' }];
  it('includes both end dates and only that person', () => {
    expect(isAway(away, 'ann', '2027-01-10')).toBe(true);
    expect(isAway(away, 'ann', '2027-01-17')).toBe(true);
    expect(isAway(away, 'ann', '2027-01-24')).toBe(false);
    expect(isAway(away, 'bob', '2027-01-10')).toBe(false);
  });
});

describe('ministriesForSunday', () => {
  it('returns the active ministries when there is no roster', () => {
    const cfg: Config = { ...config, ministries: [...ministries, { k: 'old', l: 'Old', n: 1, x: 0, gone: true }] };
    expect(ministriesForSunday(cfg, undefined).map((m) => m.k)).toEqual(['sec', 'wel', 'tea', 'cre']);
    expect(activeMinistries(cfg)).toHaveLength(4);
  });

  it('uses the snapshot, so renames and headcount changes do not alter the Sunday', () => {
    const snap = takeSnapshot(config, [ann]);
    const r = roster('2027-01-03', { wel: ['ann'] }, { meta: snap });
    const changed: Config = {
      ...config,
      ministries: ministries.map((m) => (m.k === 'wel' ? { ...m, l: 'Greeters', n: 3 } : m)),
    };
    const wel = ministriesForSunday(changed, r).find((m) => m.k === 'wel');
    expect(wel?.l).toBe('Welcoming');
    expect(wel?.n).toBe(1);
  });

  it('keeps a removed ministry visible on a Sunday that has it in its snapshot', () => {
    const snap = takeSnapshot(config, [ann]);
    const r = roster('2027-01-03', { wel: ['ann'] }, { meta: snap });
    const removed: Config = { ...config, ministries: ministries.map((m) => (m.k === 'wel' ? { ...m, gone: true } : m)) };
    expect(ministriesForSunday(removed, r).map((m) => m.k)).toContain('wel');
  });

  it('without a snapshot, keeps a removed ministry only while it still has people', () => {
    const removed: Config = { ...config, ministries: ministries.map((m) => (m.k === 'wel' ? { ...m, gone: true } : m)) };
    const withPeople = roster('2027-01-03', { wel: ['ann'] });
    const empty = roster('2027-01-10', { wel: [] });
    expect(ministriesForSunday(removed, withPeople).map((m) => m.k)).toContain('wel');
    expect(ministriesForSunday(removed, empty).map((m) => m.k)).not.toContain('wel');
  });

  it('shows assignments under an unknown key as an extra row labelled by the key', () => {
    const r = roster('2027-01-03', { ghost: ['ann'] });
    const row = ministriesForSunday(config, r).find((m) => m.k === 'ghost');
    expect(row).toEqual({ k: 'ghost', l: 'ghost', n: 0, x: 0 });
  });
});

describe('takeSnapshot', () => {
  it('captures active ministries and every person with name and eligibility', () => {
    const snap = takeSnapshot(config, [ann, bob]);
    expect(snap.m.map((m) => m.k)).toEqual(['sec', 'wel', 'tea', 'cre']);
    expect(snap.p).toEqual({ ann: { n: 'Ann', e: ['wel', 'tea'] }, bob: { n: 'Bob', e: ['tea'] } });
  });

  it('copies eligibility so later edits to the person do not leak in', () => {
    const live = person('cy', ['tea']);
    const snap = takeSnapshot(config, [live]);
    live.elig.push('wel');
    expect(snap.p['cy']?.e).toEqual(['tea']);
  });

  it('when locking an older Sunday, keeps a removed ministry that still has people', () => {
    const removed: Config = { ...config, ministries: ministries.map((m) => (m.k === 'wel' ? { ...m, gone: true } : m)) };
    const r = roster('2027-01-03', { wel: ['ann'] });
    expect(takeSnapshot(removed, [ann], r).m.map((m) => m.k)).toContain('wel');
  });
});

describe('personName and personEligibility', () => {
  const people = byId([ann]);
  it('prefer the snapshot, then the live person, then the id', () => {
    const r = roster('2027-01-03', {}, { meta: { m: [], p: { ann: { n: 'Annie (old)', e: ['sec'] } } } });
    expect(personName(r, people, 'ann')).toBe('Annie (old)');
    expect(personName(roster('2027-01-03', {}), people, 'ann')).toBe('Ann');
    expect(personName(r, people, 'nobody')).toBe('nobody');
    expect(personEligibility(r, people, 'ann')).toEqual(['sec']);
    expect(personEligibility(roster('2027-01-03', {}), people, 'ann')).toEqual(['wel', 'tea']);
    expect(personEligibility(r, people, 'nobody')).toBeUndefined();
  });
});
