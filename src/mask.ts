import { canEditAnyMinistry, canEditMinistry, canViewTab, can, currentUser, isPermission, isTabId, ROLE_DEFINITIONS } from './auth';
import { state } from './state';

/**
 * Role-based interface masking. Views mark the elements that need a permission, and `applyRoleMask`
 * removes the ones the signed-in user lacks after every redraw:
 *
 *   data-requires="<permission>"   the element needs this permission (see PERMISSIONS in auth.ts)
 *   data-edit-ministry="<key>"     the element adds or removes people in this ministry
 *
 * An unrecognised permission name removes the element, so a typo hides a control instead of exposing it.
 * Like the rest of auth.ts this only shapes the interface; it is not access control.
 */
export function applyRoleMask(root: ParentNode): void {
  const user = currentUser();

  for (const el of root.querySelectorAll<HTMLElement>('[data-requires]')) {
    const permission = el.dataset['requires'];
    if (!isPermission(permission) || !can(permission, user)) el.remove();
  }

  for (const el of root.querySelectorAll<HTMLElement>('[data-edit-ministry]')) {
    if (!canEditMinistry(el.dataset['editMinistry'] ?? '', user)) el.remove();
  }

  // Names stay visible, but a chip the user may not move cannot be dragged.
  for (const chip of root.querySelectorAll<HTMLElement>('.chip[data-id]')) {
    const key = chip.dataset['k'] ?? '';
    const movable = key ? canEditMinistry(key, user) : canEditAnyMinistry(user);
    if (!movable) {
      chip.draggable = false;
      chip.classList.add('ro');
      chip.setAttribute('aria-disabled', 'true');
    }
  }
}

/** Shows only the tabs the signed-in user may open, and marks the current one. */
export function syncNav(): void {
  const user = currentUser();
  const who = document.getElementById('who');
  if (who && user) who.textContent = `${user.displayName} · ${ROLE_DEFINITIONS[user.role].label}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('nav button[data-t]')) {
    const tab = button.dataset['t'] ?? '';
    button.hidden = !(isTabId(tab) && canViewTab(tab, user));
    button.classList.toggle('on', tab === state.tab);
  }
}
