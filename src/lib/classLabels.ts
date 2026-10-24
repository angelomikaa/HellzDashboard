// pt-BR display labels for the 15 catalog classes (owner decision 2026-10-23).
//
// The catalog KEYS (classes.class_name, char_class everywhere in payloads)
// stay English — they are canonical identifiers for RPCs, RLS, OCR matching,
// asset lookups and the admin UI's catalog extension. This map is DISPLAY-
// ONLY: every member/staff-facing surface renders the label the player sees
// in-game, mirroring the FUNCTION_LABELS pattern (Phase 07: one shared
// vocabulary map, options can never drift from it).
//
// Vocabulary verified 2026-10-23 against the ROOC Americas official API
// answering LANG=pt (captured through the official site in Portuguese), the
// ROOCDB game-extracted data and bROWiki; the live-client OCR samples
// ("Classe Criador", "Classe Sumo Sacerdote") match this source. Owner calls:
// Bard = "Menestrel" (the client print at the ranked Trans-2ª stage — the
// catalog key keeps the base-tier name) and Rebellion = "Insurgente" (the
// official web API leaves the Gunslinger line untranslated, but the game
// client prints Insurgente). FAN translations circulating for this game are
// WRONG and must not be used: Campeão (Champion is "Mestre"), Alto Mago
// (High Wizard is "Arquimago"), Perseguidor (Stalker is "Desordeiro"),
// Bioquímico (Biochemist is "Criador").
//
// `classLabel` never throws: unknown keys (a class the owner adds through
// the admin UI before this map is extended) fall back to the raw key so the
// panel keeps rendering something truthful; null/empty renders the em-dash
// used across the roster surfaces.
export const CLASS_LABELS: Readonly<Record<string, string>> = {
  'Assassin Cross': 'Algoz',
  'Lord Knight': 'Lorde',
  'High Wizard': 'Arquimago',
  Sniper: 'Atirador de Elite',
  'High Priest': 'Sumo Sacerdote',
  Mastersmith: 'Mestre-Ferreiro',
  Paladin: 'Paladino',
  Professor: 'Professor',
  Stalker: 'Desordeiro',
  Biochemist: 'Criador',
  Champion: 'Mestre',
  Bard: 'Menestrel',
  Gypsy: 'Cigana',
  Summoner: 'Invocador',
  Rebellion: 'Insurgente',
}

/** The pt-BR display name for a catalog class key. Unknown keys fall back
 *  to the key itself; null/empty renders '—' (the roster's empty state). */
export function classLabel(charClass: string | null | undefined): string {
  const key = String(charClass ?? '').trim()
  if (key === '') return '—'
  return CLASS_LABELS[key] ?? key
}
