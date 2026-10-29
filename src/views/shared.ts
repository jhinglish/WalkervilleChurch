import { esc } from '../dom';
import { HELP } from '../help';
import { state } from '../state';
import type { IsoDate, TabId } from '../types';

const TEXTAREA_STYLE =
  'width:100%;box-sizing:border-box;font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:6px 10px';

/** The verse box for a Sunday, showing unsaved text if there is any. */
export function verseBox(date: IsoDate): string {
  const verse = state.drafts[`v${date}`] ?? state.ros[date]?.verse ?? '';
  return `<div class="noprint"><textarea data-verse="${date}" rows="2" style="${TEXTAREA_STYLE}" placeholder="Verse for this Sunday, e.g. reference and text…">${esc(verse)}</textarea><div class="l"><button data-vsave="${date}">Save verse</button></div></div>`;
}

/** The notes box for a Sunday, showing unsaved text if there is any. */
export function noteBox(date: IsoDate): string {
  const note = state.drafts[date] ?? state.ros[date]?.note ?? '';
  return `<div class="noprint"><textarea data-note="${date}" rows="3" style="${TEXTAREA_STYLE}" placeholder="Notes for this Sunday…">${esc(note)}</textarea><div class="l"><button data-nsave="${date}">Save note</button></div></div>`;
}

/** The "About this tab" card shown at the top of every tab. */
export function helpBox(tab: TabId): string {
  const help = HELP[tab];
  return `<div class="card noprint"><b>About this tab</b><div class="mut">${help.intro}</div><ul class="mut" style="margin:6px 0 0;padding-left:20px">${help.points.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
}
