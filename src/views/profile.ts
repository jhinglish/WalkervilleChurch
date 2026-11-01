import { ROLE_DEFINITIONS, currentUser } from '../auth';
import { esc } from '../dom';
import { allMinistriesNow } from '../selectors';
import { state } from '../state';

/** The Profile tab: the signed-in person's own details and, for logins created in the Admin tab, a password change. */
export function profileTab(): string {
  const user = currentUser();
  if (!user) return '';
  const person = user.personId ? state.people[user.personId] : undefined;
  const role = ROLE_DEFINITIONS[user.role];
  const account = `<div class="mut">Signed in as <b>${esc(user.username)}</b> · ${esc(role.label)}. ${esc(role.description)}</div>`;

  const details = person
    ? `<div class="card"><h3>My details</h3>${account}
  <div class="l"><label>Name <input data-prof="name" data-keep="1" maxlength="60" value="${esc(person.name)}"></label>
  <label>Phone <input data-prof="phone" data-keep="1" maxlength="60" value="${esc(person.phone ?? '')}" placeholder="Optional"></label></div>
  <div class="mut">Changes save when you leave the box. Leaders and admins can see your name; your phone number is stored with your roster details.</div>
  <div class="mut">Ministries you can serve in: ${
    esc(
      allMinistriesNow()
        .filter((m) => !m.gone && person.elig.includes(m.k))
        .map((m) => m.l)
        .join(', '),
    ) || 'none yet. Ask an admin.'
  }</div></div>`
    : `<div class="card"><h3>My details</h3>${account}<p class="mut">Your login is not linked to a person on the roster, so there are no details to edit. An admin links a login to a person.</p></div>`;

  const password =
    user.kind === 'stored'
      ? `<div class="card"><h3>Change password</h3>
  <div class="l"><input type="password" id="pw-cur" data-keep="1" autocomplete="current-password" placeholder="Current password">
  <input type="password" id="pw-new" data-keep="1" autocomplete="new-password" placeholder="New password (8+ characters)">
  <input type="password" id="pw-new2" data-keep="1" autocomplete="new-password" placeholder="Repeat new password">
  <button class="p" id="pwsave">Change password</button></div></div>`
      : '<div class="card"><h3>Password</h3><p class="mut">This is a built-in demo account. Its password is fixed in the code and cannot be changed here.</p></div>';

  return details + password;
}
