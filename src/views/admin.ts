import { MOCK_USERS, ROLES, ROLE_DEFINITIONS } from '../auth';
import { esc } from '../dom';
import { activeMinistriesNow, allMinistriesNow, peopleByName } from '../selectors';
import { state } from '../state';
import type { Person } from '../types';

/** The Admin tab: ministries, then people (including removed people). */
export function adminTab(): string {
  const all = allMinistriesNow();
  const active = activeMinistriesNow();
  const K = esc;
  const people = peopleByName();
  const present = people.filter((p) => !p.gone);
  const removed = people.filter((p) => p.gone);
  const leadersOf = (key: string): string =>
    present
      .filter((p) => p.role === 'leader' && (p.leads ?? []).includes(key))
      .map((p) => esc(p.name))
      .join(', ') || '-';
  return (
    `<div class="card"><h3>Ministries</h3><div style="overflow-x:auto"><table class="rec"><tr><th>Ministry</th><th>People needed</th><th>Exclusive</th><th>Team leaders</th><th></th></tr>` +
    all
      .map(
        (m) =>
          `<tr class="${m.gone ? 'fu' : ''}"><td><input data-mf="l" data-mk="${K(m.k)}" value="${K(m.l)}"></td><td><input type="number" min="0" style="width:64px" data-mf="n" data-mk="${K(m.k)}" value="${m.n}"></td><td><input type="checkbox" data-mf="x" data-mk="${K(m.k)}"${m.x ? ' checked' : ''}></td><td>${leadersOf(m.k)}</td><td>${m.gone ? `<button data-mrs="${K(m.k)}">Restore</button>` : `<button data-mrm="${K(m.k)}">${state.cf === `m:${m.k}` ? 'Confirm remove' : 'Remove'}</button>`}</td></tr>`,
      )
      .join('') +
    `</table></div><div class="l"><input id="mn" placeholder="New ministry name"><input id="mc" type="number" min="0" value="1" style="width:64px" title="People needed"><label><input id="mx" type="checkbox"> Exclusive</label><select id="ml" title="Team leader"><option value="">Team leader (optional)</option>${present.map((p) => `<option value="${K(p.id)}">${K(p.name)}</option>`).join('')}</select><button class="p" id="madd">Add ministry</button></div></div>
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
    }</div>` +
    `<div class="card"><h3>Access and team leaders</h3><div class="mut">Set what each person may do. A role only takes effect for a person who has a login linked to them (see the Login column). Tick the ministries a team leader manages.</div><div style="overflow-x:auto"><table class="rec"><tr><th>Name</th><th>Login</th><th>Role</th>${active.map((m) => `<th>Leads ${esc(m.l)}</th>`).join('')}</tr>` +
    present
      .map((p) => {
        const role = p.role ?? 'member';
        const login = MOCK_USERS.find((u) => u.personId === p.id)?.username;
        return `<tr><td>${K(p.name)}</td><td>${login ? K(login) : '-'}</td><td><select data-prole="1" data-pid="${K(p.id)}">${ROLES.map((r) => `<option value="${r}"${r === role ? ' selected' : ''}>${esc(ROLE_DEFINITIONS[r].label)}</option>`).join('')}</select></td>${active.map((m) => `<td><input type="checkbox" data-plead="${K(m.k)}" data-pid="${K(p.id)}"${(p.leads ?? []).includes(m.k) ? ' checked' : ''}${role === 'leader' ? '' : ' disabled'}></td>`).join('')}</tr>`;
      })
      .join('') +
    '</table></div></div>' +
    loginsCard(present)
  );
}

/** Logins: the built-in demo accounts, the ones created here, and a form to create more. */
function loginsCard(present: Person[]): string {
  const K = esc;
  const usernames = Object.keys(state.logins).sort();
  const withLogin = new Set(Object.values(state.logins).map((l) => l.personId));
  const roleOf = (personId: string | null): string => {
    const person = personId ? state.people[personId] : undefined;
    return ROLE_DEFINITIONS[person?.role ?? 'member'].label;
  };
  const demo = MOCK_USERS.map(
    (u) =>
      `<tr><td>${K(u.username)}</td><td>${u.personId ? K(state.people[u.personId]?.name ?? u.personId) : '-'}</td><td>${K(
        u.personId && state.people[u.personId]?.role ? roleOf(u.personId) : ROLE_DEFINITIONS[u.role].label,
      )}</td><td class="mut">Built in (password fixed in code)</td></tr>`,
  ).join('');
  const stored = usernames
    .map((username) => {
      const login = state.logins[username];
      if (!login) return '';
      const confirming = state.cf === `l:${username}`;
      return `<tr><td>${K(username)}</td><td>${K(state.people[login.personId]?.name ?? login.personId)}</td><td>${K(roleOf(login.personId))}</td><td><input type="password" id="lp-${K(username)}" data-keep="1" autocomplete="new-password" placeholder="New password"><button data-lreset="${K(username)}">Reset password</button><button data-lrm="${K(username)}">${confirming ? 'Confirm remove' : 'Remove'}</button></td></tr>`;
    })
    .join('');
  const free = present.filter((p) => !withLogin.has(p.id));
  return `<div class="card"><h3>Logins</h3><div class="mut">A login signs in as the person it is linked to, with that person's role. Give people their password in person; they can change it on their Profile tab. Usernames are 3 to 32 letters, digits, dots, dashes or underscores. Passwords need 8 or more characters.</div><div style="overflow-x:auto"><table class="rec"><tr><th>Username</th><th>Person</th><th>Role</th><th></th></tr>${demo}${stored}</table></div>${
    free.length
      ? `<div class="l"><select id="lperson" data-keep="1">${free.map((p) => `<option value="${K(p.id)}">${K(p.name)}</option>`).join('')}</select><input id="lname" data-keep="1" autocomplete="off" autocapitalize="none" placeholder="Username"><input id="lpass" type="password" data-keep="1" autocomplete="new-password" placeholder="Password"><button class="p" id="ladd">Create login</button></div>`
      : '<div class="mut">Everyone on the roster already has a login.</div>'
  }</div>`;
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
