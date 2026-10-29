// Injected before the page runs: a deterministic clock and an in-memory stand-in for the claude.ai runtime.
(() => {
  const FIXED = Date.parse('2026-10-28T08:00:00Z');
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
    static now() { return FIXED; }
  }
  window.Date = FixedDate;
  const st = window.setTimeout.bind(window);
  window.setTimeout = (f, d, ...a) => st(f, d >= 250 && d <= 600 ? 5 : d, ...a);

  const seed = window.__SEED__;
  const docs = new Map();
  const seqOf = new Map();
  let seq = 0, auto = 0;
  const leases = new Map();
  const held = new Set(); // paths whose lease is held by someone else
  const subs = [];
  window.__saves = [];
  window.__writes = [];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function merge(a, b) {
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], v);
      else a[k] = clone(v);
    }
    return a;
  }
  const put = (path, data) => { docs.set(path, clone(data)); seqOf.set(path, ++seq); };
  for (const [p, d] of Object.entries(seed)) put(p, d);

  const snapDoc = (path) => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => (docs.has(path) ? clone(docs.get(path)) : undefined) });
  const inCol = (col) => [...docs.keys()].filter((p) => p.startsWith(col + '/') && p.split('/').length === col.split('/').length + 1);
  function colSnap(col, q) {
    let paths = inCol(col).sort();
    if (q && q.order) {
      const [f, dir] = q.order;
      paths = paths.sort((a, b) => {
        const x = docs.get(a)[f], y = docs.get(b)[f];
        const c = x < y ? -1 : x > y ? 1 : seqOf.get(a) - seqOf.get(b);
        return dir === 'desc' ? (x === y ? seqOf.get(b) - seqOf.get(a) : -c) : c;
      });
    }
    if (q && q.lim) paths = paths.slice(0, q.lim);
    const d = paths.map(snapDoc);
    return { docs: d, size: d.length, empty: d.length === 0 };
  }
  let pending = false;
  function notify() {
    if (pending) return; pending = true;
    st(() => { pending = false; subs.slice().forEach((s) => s.fire()); }, 0);
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      get: async () => snapDoc(path),
      set: async (data) => { window.__writes.push(['set', path]); put(path, data); notify(); },
      update: async (data) => {
        window.__writes.push(['update', path]);
        if (!docs.has(path)) throw { code: 'invalid_argument', message: 'no such document' };
        merge(docs.get(path), data); seqOf.set(path, ++seq); notify();
      },
      delete: async () => { window.__writes.push(['delete', path]); docs.delete(path); notify(); },
      acquire: async ({ holder }) => {
        if (held.has(path)) return { acquired: false, holder: 'other' };
        leases.set(path, holder); return { acquired: true, holder };
      },
      onSnapshot(next) { const s = { fire: () => next(snapDoc(path)) }; subs.push(s); st(s.fire, 0); return () => {}; },
    };
  }
  function query(col, q) {
    return {
      orderBy: (f, dir = 'asc') => query(col, { ...q, order: [f, dir] }),
      limit: (n) => query(col, { ...q, lim: n }),
      get: async () => colSnap(col, q),
      onSnapshot(next) { const s = { fire: () => next(colSnap(col, q)) }; subs.push(s); st(s.fire, 0); return () => {}; },
    };
  }
  const colRef = (col) => ({
    ...query(col, {}), path: col, doc: (id) => docRef(col + '/' + (id ?? 'a' + ++auto)),
    add: async (data) => { const p = col + '/a' + String(++auto).padStart(4, '0'); window.__writes.push(['add', col]); put(p, data); notify(); return docRef(p); },
  });
  const db = { doc: docRef, collection: colRef };
  const user = {
    id: async () => 'u1', can: async () => (window.__canWrite === false ? false : true),
    profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { id: i, name: 'Tester', avatarUrl: '', color: '', email: null, isMe: true, guest: false }])),
  };
  const downloads = { save: async (r) => { window.__saves.push({ filename: r.filename, data: typeof r.data === 'string' ? r.data : '[blob]' }); return { status: 'saved' }; } };
  window.claude = { use: async (n) => ({ db, user, downloads })[n] ?? null };
  window.__dump = () => Object.fromEntries([...docs.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  window.__hold = (p, on) => (on ? held.add(p) : held.delete(p));
})();
