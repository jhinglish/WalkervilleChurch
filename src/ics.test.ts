import { describe, expect, it } from 'vitest';
import { buildIcs, icsEscape, icsFold } from './ics';
import { parseLogin, parsePerson, parseSwap } from './parse';

const STAMP = new Date('2026-10-28T08:00:00.000Z');

describe('buildIcs', () => {
  const ics = buildIcs(
    [
      { uid: '2027-01-03-tea-ann@walkerville-roster', date: '2027-01-03', summary: 'Serving: Tea and Coffee', description: 'With Cy, Eli' },
      { uid: '2027-12-26-wel-ann@walkerville-roster', date: '2027-12-26', summary: 'Serving: Welcoming' },
    ],
    STAMP,
  );
  const lines = ics.split('\r\n');

  it('is a calendar wrapped in BEGIN and END, with CRLF line endings and a trailing break', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines[lines.length - 2]).toBe('END:VCALENDAR');
    expect(lines[lines.length - 1]).toBe('');
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('has one all-day event per entry that ends the next day, including across a year end', () => {
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines).toContain('DTSTART;VALUE=DATE:20270103');
    expect(lines).toContain('DTEND;VALUE=DATE:20270104');
    expect(lines).toContain('DTSTART;VALUE=DATE:20271226');
    expect(lines).toContain('DTEND;VALUE=DATE:20271227');
  });

  it('stamps the time of creation, keeps a stable UID, and escapes the description', () => {
    expect(lines).toContain('DTSTAMP:20261028T080000Z');
    expect(lines).toContain('UID:2027-01-03-tea-ann@walkerville-roster');
    expect(lines).toContain('SUMMARY:Serving: Tea and Coffee');
    expect(lines).toContain('DESCRIPTION:With Cy\\, Eli');
  });

  it('omits the description when there is none', () => {
    expect(lines.filter((l) => l.startsWith('DESCRIPTION'))).toHaveLength(1);
  });

  it('is still a valid, empty calendar with no events', () => {
    expect(buildIcs([], STAMP).split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Walkerville Church Plant//Sunday Roster//EN',
      'CALSCALE:GREGORIAN',
      'END:VCALENDAR',
      '',
    ]);
  });
});

describe('icsEscape and icsFold', () => {
  it('escape backslashes, semicolons, commas and newlines', () => {
    expect(icsEscape('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('fold long lines with a leading space and lose nothing', () => {
    const long = `SUMMARY:${'x'.repeat(200)}`;
    const folded = icsFold(long);
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.every((l) => l.length <= 73)).toBe(true);
    expect(folded.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(long);
    expect(icsFold('short')).toEqual(['short']);
  });
});

describe('parseSwap', () => {
  it('reads a request', () => {
    expect(
      parseSwap('abc', { date: '2027-01-03', ministry: 'tea', from: 'ann', note: 'away', status: 'approved', cover: 'hal', by: 'leader', ts: 't' }),
    ).toEqual({ id: 'abc', date: '2027-01-03', ministry: 'tea', from: 'ann', note: 'away', status: 'approved', cover: 'hal', by: 'leader', ts: 't' });
  });

  it('treats an unknown status as cancelled, so a damaged document grants nothing', () => {
    expect(parseSwap('abc', { status: 'granted' }).status).toBe('cancelled');
    expect(parseSwap('abc', {}).status).toBe('cancelled');
  });
});

describe('parseLogin', () => {
  it('reads a complete login', () => {
    expect(parseLogin({ personId: 'ann', salt: 's', hash: 'h' })).toEqual({ personId: 'ann', salt: 's', hash: 'h' });
  });

  it('rejects a login that is missing anything', () => {
    expect(parseLogin(undefined)).toBeNull();
    expect(parseLogin({ personId: 'ann', salt: 's' })).toBeNull();
    expect(parseLogin({ salt: 's', hash: 'h' })).toBeNull();
  });
});

describe('parsePerson access and contact fields', () => {
  it('keeps a valid role, ministries and phone, and ignores invalid ones', () => {
    expect(parsePerson('ann', { name: 'Ann', role: 'leader', leads: ['tea'], phone: '082 000 0000' })).toMatchObject({
      role: 'leader',
      leads: ['tea'],
      phone: '082 000 0000',
    });
    const odd = parsePerson('ann', { name: 'Ann', role: 'superuser', phone: 5 });
    expect(odd.role).toBeUndefined();
    expect(odd.phone).toBeUndefined();
  });
});
