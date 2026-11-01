import type { PublicUser } from '../auth';
import { formatDate } from '../dates';
import { esc } from '../dom';
import { pendingSwapsFor, upcomingSundays } from '../schedule';
import { awayOn, issuesOn, ministriesOn, nameOn, rosterAt } from '../selectors';
import type { IsoDate, MinistryKey } from '../types';
import { ownSlotsCard, plural, swapCueCard, teamLabel } from './schedule-shared';

interface TeamStats {
  scheduled: number;
  short: number;
  away: number;
  swaps: number;
}

/** Staffing figures for one team across the Sundays shown. */
function teamStats(key: MinistryKey, dates: readonly IsoDate[], swaps: number): TeamStats {
  const stats: TeamStats = { scheduled: 0, short: 0, away: 0, swaps };
  for (const d of dates) {
    const m = ministriesOn(d).find((x) => x.k === key);
    if (!m) continue;
    const ids = rosterAt(d).s[key] ?? [];
    stats.scheduled++;
    if (ids.length < m.n) stats.short++;
    stats.away += ids.filter((id) => awayOn(id, d)).length;
  }
  return stats;
}

/** One team's full schedule: every shown Sunday with who is on it and whether it is short. */
function teamCard(key: MinistryKey, dates: readonly IsoDate[]): string {
  const rows = dates
    .map((d) => {
      const m = ministriesOn(d).find((x) => x.k === key);
      if (!m) return `<div class="row"><b>${formatDate(d)}</b><div class="mut">Not scheduled</div></div>`;
      const ids = rosterAt(d).s[key] ?? [];
      const { out } = issuesOn(d);
      const names = ids
        .map((id) => {
          const problems = out[id];
          return `<span${problems ? ' class="warn"' : ''} title="${esc((problems ?? []).join('; '))}">${problems ? '⚠ ' : ''}${esc(nameOn(d, id))}</span>`;
        })
        .join(', ');
      const short = m.n - ids.length;
      return `<div class="row"><b>${formatDate(d)}</b><div>${names || '<span class="mut">Unfilled</span>'}${
        short > 0 ? ` <span class="warn">needs ${short} more</span>` : ''
      }</div></div>`;
    })
    .join('');
  return `<div class="card"><h3>${esc(teamLabel(key))}</h3>${rows}</div>`;
}

/** The team leader layout: the full schedule of each team they lead, an oversight table and swap approval cues. */
export function teamSchedule(user: PublicUser): string {
  const keys = user.managedMinistries;
  const dates = upcomingSundays();
  const pending = pendingSwapsFor(user);

  const header = `<div class="card"><h3>Team schedule</h3><div class="mut">${
    keys.length ? `Leading ${keys.map((k) => esc(teamLabel(k))).join(', ')}. Next ${plural(dates.length, 'Sunday')}.` : 'You are not leading a team yet.'
  }</div><div class="l noprint"><button class="${pending.length ? 'p ' : ''}cta" data-requires="decideSwaps" data-goto="w">Swap requests (${pending.length})</button><button class="cta" data-requires="editRoster" data-goto="r">Edit team on Roster</button></div></div>`;

  let teams: string;
  if (!keys.length) {
    teams =
      '<div class="card"><p class="mut">No team is assigned to you, so there is no team schedule to show. An admin assigns teams on the Admin tab under Access and team leaders.</p></div>';
  } else if (!dates.length) {
    teams = '<div class="card"><p class="mut">No upcoming Sunday has been generated yet. An admin can generate the roster.</p></div>';
  } else {
    const rows = keys
      .map((k) => {
        const s = teamStats(k, dates, pending.filter((p) => p.ministry === k).length);
        return `<tr><td>${esc(teamLabel(k))}</td><td>${s.scheduled}</td><td${s.short ? ' class="fl"' : ''}>${s.short}</td><td${s.away ? ' class="fl"' : ''}>${s.away}</td><td>${s.swaps}</td></tr>`;
      })
      .join('');
    teams =
      `<div class="card"><h3>Team oversight</h3><div style="overflow-x:auto"><table class="rec"><tr><th>Team</th><th>Sundays</th><th>Short-staffed</th><th>Away clashes</th><th>Swap requests</th></tr>${rows}</table></div></div>` +
      keys.map((k) => teamCard(k, dates)).join('');
  }

  return header + swapCueCard(pending, 'Swap requests to approve') + teams + ownSlotsCard(user.personId);
}
