const M = [
  { k: 'sec', l: 'Security/Lock Up', n: 1, x: 1 }, { k: 'wel', l: 'Welcoming', n: 1, x: 0 },
  { k: 'tea', l: 'Tea and Coffee', n: 2, x: 0 }, { k: 'cre', l: 'Creche', n: 2, x: 1 },
  { k: 'com', l: 'Communion Prep', n: 1, x: 0, gone: true },
];
const P = (name, family, elig, extra = {}) => ({ name, family, elig, ...extra });
const people = {
  ann: P('Ann', 1, ['wel', 'tea']), bob: P('Bob', 2, ['sec', 'tea']), cy: P('Cy', 1, ['tea', 'cre']),
  dee: P('Dee', 3, ['cre', 'wel']), eli: P('Eli', 3, ['tea', 'wel']), fay: P('Fay', 4, ['cre', 'tea', 'sec']),
  gus: P('Gus', 5, ['wel']), hal: P('Hal', 0, ['tea']), ivy: P('Ivy', 0, ['cre']), jon: P('Jon', 2, ['sec', 'wel']),
  ken: P('Ken', 0, ['tea'], { gone: true }),
};
function base() {
  const s = { 'config/main': { start: '2027-01-03', ministries: M } };
  for (const [id, p] of Object.entries(people)) s['people/' + id] = p;
  s['away/x1'] = { person: 'ann', from: '2027-01-10', to: '2027-01-17', note: 'holiday' };
  return s;
}
exports.fresh = base;
exports.legacyRosters = () => {
  const s = base();
  s['rosters/2027-01-03'] = { date: '2027-01-03', s: { sec: ['bob'], wel: ['ann'], tea: ['cy', 'eli'], cre: ['dee', 'fay'], com: ['gus'] }, gen: true, manual: false, verse: 'John 3:16', note: 'Welcome new family' };
  s['rosters/2027-01-10'] = { date: '2027-01-10', s: { sec: ['jon'], wel: ['ann'], tea: ['hal'], cre: ['ivy', 'ghost'] }, gen: true, manual: true };
  return s;
};
