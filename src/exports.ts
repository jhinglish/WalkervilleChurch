import { formatDate } from './dates';
import { allMinistriesNow, byDate, ministriesOn, nameOn, rosterAt } from './selectors';
import { state } from './state';
import type { IsoDate } from './types';

/** Saves a one-page PDF of who is serving on a Sunday, with the verse at the top and the note at the bottom. */
export async function exportPdf(date: IsoDate): Promise<void> {
  const JsPdf = window.jspdf?.jsPDF;
  const downloads = state.downloads;
  if (!JsPdf || !downloads) return;
  const pdf = new JsPdf();
  const roster = rosterAt(date);
  let y = 24;
  if (roster.verse) {
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'italic');
    const lines = pdf.splitTextToSize(roster.verse, 170);
    pdf.text(lines, 20, y);
    y += lines.length * 6 + 8;
    pdf.setFont(undefined, 'normal');
  }
  pdf.setFontSize(18);
  pdf.text('Walkerville Church Plant', 20, y);
  y += 9;
  pdf.setFontSize(13);
  pdf.text(`Serving: ${formatDate(date)}`, 20, y);
  y += 14;
  for (const m of ministriesOn(date)) {
    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(12);
    pdf.text(m.l, 20, y);
    pdf.setFont(undefined, 'normal');
    pdf.text((roster.s[m.k] ?? []).map((id) => nameOn(date, id)).join(', ') || '-', 85, y);
    y += 10;
  }
  if (roster.note) {
    y += 4;
    pdf.setFont(undefined, 'bold');
    pdf.text('Notes', 20, y);
    pdf.setFont(undefined, 'normal');
    y += 8;
    pdf.text(pdf.splitTextToSize(roster.note, 170), 20, y);
  }
  await downloads.save({ filename: `serving-${date}.pdf`, data: pdf.output('blob') });
}

/** Saves every Sunday as a CSV, including ministries that have since been removed. */
export function exportCsv(): void {
  const rosters = Object.values(state.ros);
  const ministries = allMinistriesNow().filter((m) => !m.gone || rosters.some((r) => (r.s[m.k] ?? []).length));
  const rows = [
    ['Date', ...ministries.map((m) => m.l)],
    ...rosters.sort(byDate).map((r) => [
      r.date,
      ...ministries.map((m) =>
        (r.s[m.k] ?? []).map((id) => nameOn(r.date, id)).join(' & '),
      ),
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  state.downloads?.save({ filename: 'sunday-roster.csv', data: csv }).catch(() => {});
}
