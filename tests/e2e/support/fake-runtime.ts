/**
 * An in-memory stand-in for the claude.ai runtime (`claude.use('db' | 'user' | 'downloads')`),
 * injected into the page before the app runs. It also pins the clock to 2026-10-28 so the
 * tests do not depend on the day they are run.
 *
 * `installFakeRuntime` is serialised by Playwright and executed in the browser, so it must
 * not reference anything outside its own body (types are fine; they are erased).
 */

export type Seed = Record<string, Record<string, unknown>>;

export interface FakeInit {
  seed: Seed;
  /** What `user.can('data.write')` answers. */
  canWrite: boolean;
}

/** What the tests can reach through `window.__fake`. */
export interface FakeControls {
  dump(): Seed;
  /** Makes `acquire` fail for a document, as if someone else held its lease. */
  hold(path: string, on: boolean): void;
  /** Stops (or resumes) delivering snapshots, so the page keeps showing stale data. */
  mute(on: boolean): void;
  /** Simulates another person's write: merges into a document and notifies subscribers. */
  write(path: string, data: Record<string, unknown>): void;
  saves: { filename: string; data: string }[];
  writes: [string, string][];
  /** Every lease asked for, as [document path, requested lifetime in ms]. */
  leases: [string, number | undefined][];
}

export function installFakeRuntime({ seed, canWrite }: FakeInit): void {
  type Doc = Record<string, unknown>;
  type Query = { order?: [string, 'asc' | 'desc']; lim?: number };
  const w = window as unknown as Record<string, unknown>;

  // A fixed clock: new Date() and Date.now() always return the same instant.
  const FIXED = Date.parse('2026-10-28T08:00:00Z');
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      super(...((args.length ? args : [FIXED]) as [number]));
    }
    static override now(): number {
      return FIXED;
    }
  }
  w['Date'] = FixedDate;

  // Lease retries wait 250-550 ms; make them quick so the tests are too.
  const realSetTimeout = window.setTimeout.bind(window);
  w['setTimeout'] = (f: () => void, d?: number) => realSetTimeout(f, d !== undefined && d >= 250 && d <= 600 ? 5 : d);

  const docs = new Map<string, Doc>();
  const order = new Map<string, number>();
  const held = new Set<string>();
  const subs: { fire: () => void }[] = [];
  let seq = 0;
  let auto = 0;
  let muted = false;
  let pending = false;
  const saves: FakeControls['saves'] = [];
  const writes: FakeControls['writes'] = [];
  const leases: FakeControls['leases'] = [];

  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const isObject = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v);
  function merge(target: Doc, patch: Doc): void {
    for (const [k, v] of Object.entries(patch)) {
      const cur = target[k];
      if (isObject(v) && isObject(cur)) merge(cur, v);
      else target[k] = clone(v);
    }
  }
  const put = (path: string, data: Doc): void => {
    docs.set(path, clone(data));
    order.set(path, ++seq);
  };
  for (const [p, d] of Object.entries(seed)) put(p, d);

  const snapDoc = (path: string) => ({
    id: path.split('/').pop() as string,
    exists: docs.has(path),
    data: () => (docs.has(path) ? clone(docs.get(path) as Doc) : undefined),
  });
  const inCollection = (col: string): string[] =>
    [...docs.keys()].filter((p) => p.startsWith(`${col}/`) && p.split('/').length === col.split('/').length + 1);
  function collectionSnapshot(col: string, q: Query) {
    let paths = inCollection(col).sort();
    if (q.order) {
      const [field, dir] = q.order;
      paths = paths.sort((a, b) => {
        const x = String((docs.get(a) as Doc)[field]);
        const y = String((docs.get(b) as Doc)[field]);
        const byValue = x < y ? -1 : x > y ? 1 : 0;
        const bySeq = (order.get(a) as number) - (order.get(b) as number);
        const asc = byValue || bySeq;
        return dir === 'desc' ? -asc : asc;
      });
    }
    if (q.lim) paths = paths.slice(0, q.lim);
    const list = paths.map(snapDoc);
    return { docs: list, size: list.length, empty: list.length === 0 };
  }
  function notify(): void {
    if (pending) return;
    pending = true;
    realSetTimeout(() => {
      pending = false;
      if (!muted) subs.slice().forEach((s) => s.fire());
    }, 0);
  }

  function docRef(path: string) {
    return {
      id: path.split('/').pop() as string,
      path,
      get: async () => snapDoc(path),
      set: async (data: Doc) => {
        writes.push(['set', path]);
        put(path, data);
        notify();
      },
      update: async (data: Doc) => {
        writes.push(['update', path]);
        const cur = docs.get(path);
        if (!cur) throw { code: 'invalid_argument', message: 'no such document' };
        merge(cur, data);
        order.set(path, ++seq);
        notify();
      },
      delete: async () => {
        writes.push(['delete', path]);
        docs.delete(path);
        notify();
      },
      acquire: async ({ holder, ttlMs }: { holder: string; ttlMs?: number }) => {
        leases.push([path, ttlMs]);
        return held.has(path) ? { acquired: false, holder: 'someone-else' } : { acquired: true, holder };
      },
      onSnapshot(next: (s: ReturnType<typeof snapDoc>) => void) {
        const sub = { fire: () => next(snapDoc(path)) };
        subs.push(sub);
        realSetTimeout(sub.fire, 0);
        return () => {};
      },
    };
  }
  function query(col: string, q: Query) {
    return {
      orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => query(col, { ...q, order: [field, dir] }),
      limit: (n: number) => query(col, { ...q, lim: n }),
      get: async () => collectionSnapshot(col, q),
      onSnapshot(next: (s: ReturnType<typeof collectionSnapshot>) => void) {
        const sub = { fire: () => next(collectionSnapshot(col, q)) };
        subs.push(sub);
        realSetTimeout(sub.fire, 0);
        return () => {};
      },
    };
  }
  const collectionRef = (col: string) => ({
    ...query(col, {}),
    path: col,
    doc: (id?: string) => docRef(`${col}/${id ?? `a${++auto}`}`),
    add: async (data: Doc) => {
      const path = `${col}/a${String(++auto).padStart(4, '0')}`;
      writes.push(['add', col]);
      put(path, data);
      notify();
      return docRef(path);
    },
  });

  const capabilities: Record<string, unknown> = {
    db: { doc: docRef, collection: collectionRef },
    user: {
      id: async () => 'u1',
      can: async () => canWrite,
      profiles: async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, { id, name: 'Tester', avatarUrl: '', color: '', email: null, isMe: true, guest: false }])),
    },
    downloads: {
      save: async (r: { filename: string; data: unknown }) => {
        saves.push({ filename: r.filename, data: typeof r.data === 'string' ? r.data : '[binary]' });
        return { status: 'saved' };
      },
    },
  };
  w['claude'] = { use: async (name: string) => capabilities[name] ?? null };

  const controls: FakeControls = {
    dump: () => Object.fromEntries([...docs.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, clone(v)])),
    hold: (path, on) => void (on ? held.add(path) : held.delete(path)),
    mute: (on) => {
      muted = on;
      if (!on) notify();
    },
    write: (path, data) => {
      const cur = docs.get(path);
      if (cur) merge(cur, data);
      else put(path, data);
      notify();
    },
    saves,
    writes,
    leases,
  };
  w['__fake'] = controls;
}

/** A stand-in for jsPDF that records what the app asks it to draw in `window.__pdfOps`. */
export function installPdfStub(): void {
  const ops: unknown[][] = [];
  (window as unknown as Record<string, unknown>)['__pdfOps'] = ops;
  class StubPdf {
    setFont(...a: unknown[]): this {
      ops.push(['font', ...a]);
      return this;
    }
    setFontSize(n: number): this {
      ops.push(['size', n]);
      return this;
    }
    text(t: unknown, x: number, y: number): this {
      ops.push(['text', t, x, y]);
      return this;
    }
    splitTextToSize(t: string): string[] {
      return String(t).match(/.{1,30}/g) ?? [];
    }
    output(): Blob {
      return new Blob(['pdf']);
    }
  }
  (window as unknown as Record<string, unknown>)['jspdf'] = { jsPDF: StubPdf };
}
