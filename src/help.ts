import type { TabId } from './types';

/** In-app help shown at the top of each tab: an intro line and a list of points. HTML is allowed. */
export interface HelpText {
  intro: string;
  points: string[];
}

export const HELP: Record<TabId, HelpText> = {
  s: {
    intro: 'Who is serving this coming Sunday. Use this page to check the list, share it (Export PDF) or make last-minute changes.',
    points: [
      'Shows the next Sunday only (a Sunday that is today still counts). It moves on to the following Sunday on the Monday.',
      'Verse: type the verse for the week in the Verse box and press Save verse. It shows at the top of the list and the PDF, and stays with that Sunday permanently.',
      'Export PDF saves a one-page copy of the list, with the verse at the top and that Sunday’s note at the bottom.',
      'To change someone, press Edit. Tap ✕ beside a name to remove them, or choose a name under “Add…” and press Add. Extra people beyond the usual number are fine. To replace someone, remove them and add the new person.',
      'Notes: type in the note box and press Save note. Each Sunday has its own note, so next week starts blank and past notes are kept.',
      'If it says nothing has been generated yet, open the Roster tab and press Generate.',
    ],
  },
  r: {
    intro: 'Plan and adjust the roster for every Sunday. Changes here show up on the Serving tab.',
    points: [
      'Generate fills in the next 3 months of Sundays using the rotation. It never changes a Sunday that already exists.',
      'To move someone: tap their name, then tap the ministry box you want (dragging works too). Tap or drop on “Not serving” to take them off. Adding extra people to a ministry is allowed.',
      'Red names are conflicts: away that day, not marked eligible for that ministry, serving twice, or clashing with an exclusive role (Security/Lock Up and Creche can’t be combined with anything else). “Needs N more” means a slot is short.',
      'Regenerate this Sunday rebuilds that one Sunday from scratch (it asks you to confirm). Your manual changes to that Sunday are lost, but its note is kept.',
      'Show past reveals earlier Sundays. Export CSV downloads the whole roster for Excel.',
    ],
  },
  a: {
    intro: 'Tell the roster when someone is not available, so they are skipped when Sundays are generated.',
    points: [
      'Pick the person, choose the first date and (for several days) the last date. Leave “to” empty for a single day, add an optional note, then press Add.',
      'Sundays that already exist will show the person in red. Go to the Roster tab and use Regenerate this Sunday to refill it, or move people by hand.',
      'Press Remove next to an entry if plans change.',
    ],
  },
  v: {
    intro: 'A record of who has served, on what and when, so you can see who has been serving many Sundays in a row. It is for insight only; nothing here changes the roster.',
    points: [
      'Each row is a person and each column a Sunday. Letters show the ministry served (key above the grid), hatched cells are away, and dimmed columns are planned future Sundays.',
      'Run = consecutive Sundays served up to the upcoming Sunday. Longest = longest run so far. Total = Sundays served. People are sorted by current run.',
      'The optional highlight box marks anyone whose run reaches the number you enter (0 turns it off).',
      'Click a person’s name to open a detailed view below the table. Click the name again to close it.',
      'The “Needs attention” row flags upcoming Sundays with a problem: a ministry short of people, someone away, not eligible, double-booked, or a removed person still assigned. Hover a flag to see the reasons. Click it to open that Sunday below the table, see exactly what is wrong and fix it there by removing or adding people. Past Sundays are not flagged.',
      'The verses and notes section lets you read or edit the verse and note for any Sunday, and lists all of them.',
    ],
  },
  h: {
    intro: 'Manage the people and ministries, and see a log of every change. Use this tab to add, change or remove people and ministries and to set who can serve in what.',
    points: [
      'People: change a name or family number by typing and pressing Enter or clicking away. Tick or untick a ministry to say whether that person can serve in it. New people start with nothing ticked.',
      'Add a person with the form under the people table. Remove takes someone off the lists and out of future automatic rosters. Their past service stays in the Service record, and you can bring them back from “Removed people”. If a removed person is still on a future Sunday, that Sunday shows them in red until you move them.',
      'Ministries: rename one, change how many people it needs (used only when generating automatically) or mark it exclusive (anyone serving in it can’t serve in anything else that day). Remove stops a ministry being used for new Sundays. Sundays that already exist keep showing it, with the people assigned, exactly as generated. Restore brings it back.',
      'Each Sunday keeps a locked copy of the ministry names, headcounts, exclusive settings, people names and eligibility from when it was generated, so changes here never alter existing Sundays. A new ministry only appears on an existing Sunday if you press Regenerate on it. Sundays generated before this feature existed are locked automatically the first time the page is opened by someone who can edit.',
      'Change log (at the bottom): every change, newest first, with who made it.',
    ],
  },
};
