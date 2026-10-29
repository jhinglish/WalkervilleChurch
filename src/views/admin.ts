import { esc } from '../dom';
import { activeMinistriesNow, allMinistriesNow, peopleByName } from '../selectors';
import { state } from '../state';

/** The Admin tab: ministries, then people (including removed people). */
export function adminTab(): string {
  const all = allMinistriesNow();
  const active = activeMinistriesNow();
  const K = esc;
  const people = peopleByName();
  const present = people.filter((p) => !p.gone);
  const removed = people.filter((p) => p.gone);
  return (
    `<div class="card"><h3>Ministries</h3><div style="overflow-x:auto"><table class="rec"><tr><th>Ministry</th><th>People needed</th><th>Exclusive</th><th></th></tr>` +
    all
      .map(
        (m) =>
          `<tr class="${m.gone ? 'fu' : ''}"><td><input data-mf="l" data-mk="${K(m.k)}" value="${K(m.l)}"></td><td><input type="number" min="0" style="width:64px" data-mf="n" data-mk="${K(m.k)}" value="${m.n}"></td><td><input type="checkbox" data-mf="x" data-mk="${K(m.k)}"${m.x ? ' checked' : ''}></td><td>${m.gone ? `<button data-mrs="${K(m.k)}">Restore</button>` : `<button data-mrm="${K(m.k)}">${state.cf === `m:${m.k}` ? 'Confirm remove' : 'Remove'}</button>`}</td></tr>`,
      )
      .join('') +
    `</table></div><div class="l"><input id="mn" placeholder="New ministry name"><input id="mc" type="number" min="0" value="1" style="width:64px" title="People needed"><label><input id="mx" type="checkbox"> Exclusive</label><button class="p" id="madd">Add ministry</button></div></div>
 <div class="card"><h3>People</h3><div style="overflow-x:auto"><table class="rec"><tr><th>Name</th><th>Family</th>${active.map((m) => `<th>${esc(m.l)}</th>`).join('')}<th></th></tr>` +
    present
      .map(
        (p) =>
          `<tr><td><input data-pf="name" data-pid="${K(p.id)}" value="${K(p.name)}"></td><td><input type="number" min="0" style="width:60px" data-pf="fam" data-pid="${K(p.id)}" value="${p.family || 0}"></td>${active.map((m) => `<td><input type="checkbox" data-pe="${K(m.k)}" data-pid="${K(p.id)}"${p.elig.includes(m.k) ? ' checked' : ''}></td>`).join('')}<td><button data-prm="${K(p.id)}">${state.cf === `p:${p.id}` ? 'Confirm remove' : 'Remove'}</button></td></tr>`,
      )
      .join('') +
    `</table></div><div class="l"><input id="pn" placeholder="New person’s name"><input id="pf" type="number" min="0" placeholder="Family" style="width:84px"><button class="p" id="padd">Add person</button></div>${
      removed.length
        ? '<div class="mut">Removed people</div>' +
          removed.map((p) => `<div class="l">${esc(p.name)}<button data-prs="${K(p.id)}">Restore</button></div>`).join('')
        : ''
    }</div>`
  );
}

/** The change log, newest first, shown under the Admin tab. */
export function changeLog(): string {
  return `<div class="card"><h3>Change log</h3>${
    state.log
      .map(
        (h) =>
          `<div class="l"><span class="mut">${new Date(h.ts).toLocaleString('en-ZA')}</span> ${esc(state.names[h.by] || 'Someone')}: ${esc(h.msg)}</div>`,
      )
      .join('') || '<span class="mut">No changes yet.</span>'
  }</div>`;
}
