// Merged STATS classes (owner request 2026-10-29, Phase 10.3): Menestrel and Cigana
// are the same job line for stats purposes, so they must be ONE cohort called
// "Artista". Everything else is untouched — a class that is not in this map is its
// own group, which is what makes this an exception instead of a global rule.
//
// Two identities live here and must never be confused:
//   - the MEMBER's class (catalog key + pt-BR label, classLabels.ts) — the card,
//     the registry row and the OCR keep printing the real class ("Menestrel" /
//     "Cigana"), exactly as the owner ruled;
//   - the COHORT / group (this module) — the only identity the rank engine, the
//     key-stat config, the Ranking boards and the class filters speak of.
//
// The group name IS the virtual catalog class the migration inserts into
// `classes`: it appears ONCE in /classes (so every class filter lists Artista
// instead of the two classes), while a member can never be registered as one — the
// registration selects filter virtual groups out (isVirtualClassGroup).

export const ARTISTA = 'Artista'

/** class -> its stats group. Only classes the owner explicitly merged appear. */
export const CLASS_GROUP_MERGES: Readonly<Record<string, string>> = {
  Bard: ARTISTA,
  Gypsy: ARTISTA,
}

/** pt-BR label per stats group (the group's own display name). */
export const GROUP_LABELS: Readonly<Record<string, string>> = {
  [ARTISTA]: 'Artista',
}

/** True when the class key is a virtual group (a merged class), not a real class. */
export function isVirtualClassGroup(charClass: string | null | undefined): boolean {
  return charClass != null && charClass in GROUP_LABELS
}

/**
 * The stats group a class key belongs to: the merged group when the class was
 * merged, otherwise the class itself. Mirrors public.cohort_group() server-side
 * (migration 0038) — both sides MUST agree, so this map is the single place the
 * pair lives on the client.
 */
export function cohortGroup(charClass: string | null | undefined): string | null {
  if (charClass == null) return null
  return CLASS_GROUP_MERGES[charClass] ?? charClass
}

/** The pt-BR label for a stats group (never throws: unknown keys pass through). */
export function groupLabel(group: string | null | undefined): string {
  const key = String(group ?? '').trim()
  if (key === '') return '—'
  return GROUP_LABELS[key] ?? key
}

/**
 * The class-selector options for the STATS surfaces (Ranking filter, Stats-Chave):
 * every class appears once — merged classes collapse into their group, so the
 * selector reads "Artista" instead of listing Menestrel and Cigana apart. The
 * input is the raw /classes list; the output keeps the list's own order and is
 * de-duplicated, because /classes carries both the real classes and the virtual
 * group.
 */
export function mergedClassOptions(classNames: readonly string[]): string[] {
  const out: string[] = []
  for (const name of classNames) {
    const group = cohortGroup(name)
    if (group !== null && !out.includes(group)) out.push(group)
  }
  return out
}

/**
 * The class-selector options for the REGISTRATION surfaces (Personagens edit,
 * access request): the real playable classes only — a merged group is never a
 * member's class, so "Artista" must never be offered as a choice (a Bard player
 * still registers as Bard).
 */
export function playableClassOptions(classNames: readonly string[]): string[] {
  return classNames.filter((name) => !isVirtualClassGroup(name))
}

/** Does this class key belong to a merged group (i.e. rank with other classes)? */
export function isMergedClass(charClass: string | null | undefined): boolean {
  return charClass != null && charClass in CLASS_GROUP_MERGES
}
