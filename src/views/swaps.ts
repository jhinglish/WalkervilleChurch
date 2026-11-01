import { can, canDecideSwap, currentUser } from '../auth';
import { formatDate } from '../dates';
import { esc } from '../dom';
import { awayOn, ministriesOn, peopleByName } from '../selectors';
import { slotsFor } from '../schedule';
import { state } from '../state';
import type { SwapRequest } from '../types';

const STATUS_TEXT = { open: 'waiting for a team leader', approved: 'approved', declined: 'declined', cancelled: 'cancelled' } as const;

const personName = (id: string): string => state.people[id]?.name ?? id;
const ministryName = (s: SwapRequest): string => ministriesOn(s.date).find((m) => m.k === s.ministry)?.l ?? s.ministry;
const newestFirst = (a: SwapRequest, b: SwapRequest): number => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);

/** People who could cover a request: eligible for the ministry, not removed, and not already on that team that Sunday. */
function coverOptions(s: SwapRequest): string {
  const onTeam = state.ros[s.date]?.s[s.ministry] ?? [];
  return peopleByName()
    .filter((p) => !p.gone && p.id !== s.from && p.elig.includes(s.ministry) && !onTeam.includes(p.id))
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${awayOn(p.id, s.date) ? ' (away that day)' : ''}</option>`)
    .join('');
}

function requestCard(me: string | null): string {
  if (!me || !state.people[me]) {
    return '<div class="card"><h3>Ask for cover</h3><p class="mut">Your login is not linked to a person on the roster, so you cannot request a swap. An admin links a login to a person.</p></div>';
  }
  const open = new Set(
    Object.values(state.swaps)
      .filter((s) => s.status === 'open' && s.from === me)
      .map((s) => `${s.date}|${s.ministry}`),
  );
  const slots = slotsFor(me).upcoming.filter((s) => !open.has(`${s.date}|${s.ministryKey}`));
  if (!slots.length) {
    return '<div class="card"><h3>Ask for cover</h3><p class="mut">You have no upcoming Sundays without an open request.</p></div>';
  }
  const options = slots
    .map((s) => {
      const value = `${s.date}|${s.ministryKey}`;
      return `<option value="${esc(value)}"${value === state.swapDraft ? ' selected' : ''}>${formatDate(s.date)}: ${esc(s.ministry)}</option>`;
    })
    .join('');
  return `<div class="card"><h3>Ask for cover</h3><div class="mut">Pick a Sunday you cannot serve. A team leader of that ministry will choose who covers it.</div>
  <div class="l"><select id="swslot" data-keep="1">${options}</select><input id="swnote" data-keep="1" maxlength="300" placeholder="Reason (optional)"><button class="p" id="swreq">Request swap</button></div></div>`;
}

function mineCard(me: string | null): string {
  const mine = Object.values(state.swaps)
    .filter((s) => me !== null && s.from === me)
    .sort(newestFirst)
    .slice(0, 20);
  const rows = mine
    .map(
      (s) =>
        `<div class="l">${formatDate(s.date)}: ${esc(ministryName(s))} · ${STATUS_TEXT[s.status]}${
          s.status === 'approved' ? ` (${esc(personName(s.cover))} covers)` : ''
        }${s.note ? ` · ${esc(s.note)}` : ''}${s.status === 'open' ? `<button data-swcancel="${esc(s.id)}">Cancel</button>` : ''}</div>`,
    )
    .join('');
  return `<div class="card"><h3>My requests</h3>${rows || '<span class="mut">No requests yet.</span>'}</div>`;
}

function decideCard(): string {
  const user = currentUser();
  const pending = Object.values(state.swaps)
    .filter((s) => s.status === 'open' && canDecideSwap(s.ministry, s.from, user))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rows = pending
    .map((s) => {
      const options = coverOptions(s);
      return `<div class="card" style="margin:8px 0"><b>${esc(personName(s.from))}</b> asks to be covered<div class="mut">${formatDate(s.date)}: ${esc(ministryName(s))}${
        s.note ? ` · ${esc(s.note)}` : ''
      }</div>${
        options
          ? `<div class="l"><select id="swc-${esc(s.id)}" data-keep="1">${options}</select><button class="p" data-swok="${esc(s.id)}">Approve</button><button data-swno="${esc(s.id)}">Decline</button></div>`
          : `<div class="warn">Nobody eligible is free to cover. Make someone eligible in the Admin tab, or decline.</div><div class="l"><button data-swno="${esc(s.id)}">Decline</button></div>`
      }</div>`;
    })
    .join('');
  return `<div class="card" data-requires="decideSwaps"><h3>Requests to decide</h3><div class="mut">Requests for the ministries you manage. Approving moves the cover onto the roster and takes the requester off it.</div>${
    rows || '<p class="mut">Nothing waiting.</p>'
  }</div>`;
}

/** The Swaps tab: ask for cover, see your own requests, and (for team leaders and admins) decide requests. */
export function swapsTab(): string {
  const user = currentUser();
  const me = user?.personId ?? null;
  return requestCard(me) + mineCard(me) + (can('decideSwaps', user) ? decideCard() : '');
}
