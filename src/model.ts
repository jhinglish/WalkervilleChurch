import type {
  AwayEntry,
  Config,
  IsoDate,
  Ministry,
  MinistryKey,
  MinistrySnapshot,
  Person,
  PersonId,
  Roster,
  RosterMeta,
} from './types';

/** A ministry as one Sunday should show it. */
export type SundayMinistry = MinistrySnapshot & { gone?: boolean };

/** Every configured ministry, including removed ones. */
export function allMinistries(config: Config | null): Ministry[] {
  return config?.ministries ?? [];
}

/** Ministries used for new Sundays (removed ones excluded). */
export function activeMinistries(config: Config | null): Ministry[] {
  return allMinistries(config).filter((m) => !m.gone);
}

/** True when the person has an away entry covering `date` (inclusive). */
export function isAway(away: readonly AwayEntry[], id: PersonId, date: IsoDate): boolean {
  return away.some((a) => a.person === id && a.from <= date && date <= a.to);
}

/**
 * The ministries to show for one Sunday.
 *
 * - Sundays with a snapshot use the snapshot, so later renames, headcount changes
 *   and removals never alter them.
 * - Sundays without one (generated before snapshots existed) use the live
 *   ministries, keeping a removed ministry visible while it still has people.
 * - Assignments under a key found nowhere are shown as an extra row labelled by key.
 * - With no roster, the active ministries are returned.
 */
export function ministriesForSunday(config: Config | null, roster: Roster | undefined): SundayMinistry[] {
  if (!roster) return activeMinistries(config);
  const count = (k: MinistryKey): number => (roster.s[k] ?? []).length;
  const base: SundayMinistry[] = roster.meta?.m
    ? roster.meta.m.map((m) => ({ ...m }))
    : allMinistries(config)
        .filter((m) => !m.gone || count(m.k) > 0)
        .map((m) => ({ ...m }));
  for (const k of Object.keys(roster.s)) {
    if (!base.some((m) => m.k === k) && count(k) > 0) {
      base.push({ k, l: allMinistries(config).find((m) => m.k === k)?.l || k, n: 0, x: 0 });
    }
  }
  return base;
}

/**
 * Builds the snapshot stored with a Sunday. With a `roster` (locking an older
 * Sunday) it captures the ministries that Sunday currently shows; without one
 * (generating) it captures the active ministries.
 */
export function takeSnapshot(config: Config | null, people: readonly Person[], roster?: Roster): RosterMeta {
  const ministries = roster ? ministriesForSunday(config, roster) : activeMinistries(config);
  return {
    m: ministries.map((m) => ({ k: m.k, l: m.l, n: m.n, x: m.x ? 1 : 0 })),
    p: Object.fromEntries(people.map((p) => [p.id, { n: p.name, e: [...(p.elig ?? [])] }])),
  };
}

/** A person's name for a Sunday: the snapshot, then the live name, then the id. */
export function personName(
  roster: Roster | undefined,
  people: Readonly<Record<PersonId, Person>>,
  id: PersonId,
): string {
  return roster?.meta?.p?.[id]?.n ?? people[id]?.name ?? id;
}

/** A person's eligibility for a Sunday: the snapshot, then the live list. `undefined` if unknown. */
export function personEligibility(
  roster: Roster | undefined,
  people: Readonly<Record<PersonId, Person>>,
  id: PersonId,
): readonly MinistryKey[] | undefined {
  return roster?.meta?.p?.[id]?.e ?? people[id]?.elig;
}
