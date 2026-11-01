import { addDays } from './dates';
import type { IsoDate } from './types';

/** One all-day entry in a calendar file. */
export interface IcsEvent {
  /** Stable identifier, so importing the file again updates the entry instead of duplicating it. */
  uid: string;
  date: IsoDate;
  summary: string;
  description?: string | undefined;
}

/** Escapes text for an iCalendar value (RFC 5545 section 3.3.11). */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a long line at 73 characters, each continuation starting with a space, as the format asks. */
export function icsFold(line: string): string[] {
  if (line.length <= 73) return [line];
  const out = [line.slice(0, 73)];
  for (let i = 73; i < line.length; i += 72) out.push(` ${line.slice(i, i + 72)}`);
  return out;
}

const compactDate = (date: IsoDate): string => date.replace(/-/g, '');

/** Builds an iCalendar (.ics) file of all-day events. Lines end in CRLF, as the format requires. */
export function buildIcs(events: readonly IcsEvent[], stamp: Date): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Walkerville Church Plant//Sunday Roster//EN', 'CALSCALE:GREGORIAN'];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`,
      `SUMMARY:${icsEscape(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.flatMap(icsFold).join('\r\n')}\r\n`;
}
