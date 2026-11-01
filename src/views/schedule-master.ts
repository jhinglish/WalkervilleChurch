import type { PublicUser } from '../auth';
import { formatDate } from '../dates';
import { esc } from '../dom';
import { UPCOMING_SHOWN, pendingSwapsFor, upcomingSundays } from '../schedule';
import { flagsOn, ministriesOn, nameOn, rosterAt, windowDates } from '../selectors';
import { state } from '../state';
import type { MinistryKey } from '../types';
import { plural, swapCueCard } from './schedule-shared';

/** The admin / elder layout: every team side by side for the coming Sundays, with the roster-wide actions. */
export function masterSchedule(user: PublicUser): string {
  const all = upcomingSundays(Number.POSITIVE_INFINITY);
  const dates = all.slice(0, UPCOMING_SHOWN);
  const pending = pendingSwapsFor(user);
  const flagged = all.filter((d) => flagsOn(d).n > 0).length;
  const missing = windowDates().filter((d) => !state.ros[d]).length;

  const header = `<div class="card"><h3>All teams</h3><div class="mut">Master schedule of every team for the coming Sundays.</div>
<div class="l noprint"><button class="p cta" id="gen" data-requires="generateRoster">Generate Roster</button><button class="cta" data-requires="manageMembers" data-goto="h" title="Headcounts, exclusive roles and who is eligible for each ministry">Edit Rotations</button><button class="cta" data-requires="editAllMinistries" data-goto="r" title="Move people between ministries on any Sunday">Override Allocations</button></div>
<div class="l"><span class="badge">${plural(all.length, 'upcoming Sunday')}</span><span class="badge">Needs attention: ${flagged}</span><span class="badge">${plural(pending.length, 'swap request')} waiting</span></div>
<div class="mut">${
    missing
      ? `${plural(missing, 'Sunday')} in the three-month window ${missing === 1 ? 'has' : 'have'} not been generated yet.`
      : 'Every Sunday in the three-month window has been generated.'
  }</div></div>`;

  if (!dates.length) {
    return `${header}<div class="card"><p class="mut">No upcoming Sunday has been generated yet. Press Generate Roster.</p></div>${swapCueCard(pending, 'Swap requests waiting')}`;
  }

  const columns: { k: MinistryKey; l: string }[] = [];
  for (const d of dates) {
    for (const m of ministriesOn(d)) if (!columns.some((c) => c.k === m.k)) columns.push({ k: m.k, l: m.l });
  }

  const rows = dates
    .map((d) => {
      const ministries = ministriesOn(d);
      const issues = flagsOn(d);
      const cells = columns
        .map((c) => {
          const m = ministries.find((x) => x.k === c.k);
          if (!m) return '<td class="mut">-</td>';
          const ids = rosterAt(d).s[c.k] ?? [];
          const names = ids
            .map((id) => {
              const problems = issues.out[id];
              return `<span${problems ? ' class="warn"' : ''} title="${esc((problems ?? []).join('; '))}">${problems ? '⚠ ' : ''}${esc(nameOn(d, id))}</span>`;
            })
            .join(', ');
          const short = m.n - ids.length;
          return `<td class="nm">${names || '<span class="mut">Unfilled</span>'}${short > 0 ? `<div class="warn">needs ${short} more</div>` : ''}</td>`;
        })
        .join('');
      return `<tr><td>${formatDate(d)}</td>${cells}<td>${issues.n ? `<span class="fl">⚑ ${issues.n}</span>` : ''}</td></tr>`;
    })
    .join('');

  const more = all.length > dates.length ? `<div class="mut">Showing the next ${dates.length} of ${all.length} Sundays. The Roster tab lists them all.</div>` : '';
  const grid = `<div class="card"><h3>Master grid</h3><div style="overflow-x:auto"><table class="rec"><tr><th>Sunday</th>${columns
    .map((c) => `<th>${esc(c.l)}</th>`)
    .join('')}<th>Issues</th></tr>${rows}</table></div>${more}</div>`;

  return header + grid + swapCueCard(pending, 'Swap requests waiting');
}
