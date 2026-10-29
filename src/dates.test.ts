import { describe, expect, it } from 'vitest';
import { addDays, sundaysInWindow, todayIso } from './dates';

describe('addDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('todayIso', () => {
  it('uses the UTC date', () => {
    expect(todayIso(new Date('2026-10-27T23:59:59Z'))).toBe('2026-10-27');
  });
});

describe('sundaysInWindow', () => {
  it('starts at the configured first Sunday and runs three months past it', () => {
    const days = sundaysInWindow('2027-01-03', '2026-10-27');
    expect(days[0]).toBe('2027-01-03');
    expect(days.at(-1)).toBe('2027-03-28');
    expect(days).toHaveLength(13);
  });

  it('keeps past Sundays and extends three months past today once the roster has started', () => {
    const days = sundaysInWindow('2027-01-03', '2027-02-01');
    expect(days[0]).toBe('2027-01-03');
    expect(days.at(-1)).toBe('2027-04-25');
  });

  it('returns only Sundays, seven days apart', () => {
    const days = sundaysInWindow('2027-01-03', '2027-06-15');
    for (const d of days) expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(0);
    days.slice(1).forEach((d, i) => expect(addDays(days[i] as string, 7)).toBe(d));
  });
});
