import { currentUser } from '../auth';
import { masterSchedule } from './schedule-master';
import { memberSchedule } from './schedule-member';
import { teamSchedule } from './schedule-team';

/**
 * The My schedule tab, the landing page for every role. The layout follows the signed-in user's role, read
 * on every redraw, so a role change or a new sign-in changes it without a page refresh:
 * members see their own Sundays, team leaders their teams, admins every team at once.
 */
export function mineTab(): string {
  const user = currentUser();
  if (!user) return '';
  let html: string;
  switch (user.role) {
    case 'admin':
      html = masterSchedule(user);
      break;
    case 'leader':
      html = teamSchedule(user);
      break;
    case 'member':
      html = memberSchedule(user);
      break;
  }
  return `<div data-landing="${user.role}">${html}</div>`;
}
