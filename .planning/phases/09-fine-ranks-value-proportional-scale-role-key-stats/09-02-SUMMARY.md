# Phase 9 — Plan 09-02 SUMMARY

## api.ts (client data layer)

- **setKeyStat** — signature changed to `setKeyStat(session, className, charFunction, statKey, enabled)`. POSTs to `/rpc/set_key_stat_v2` with body `{ p_class, p_function, p_stat_key, p_enabled }`. Returns `Promise<number>` (class's current key-stat count, order ≤ 6). Doc comment updated to reference `set_key_stat_v2`, the `p_function` param, errors `forbidden`/`unknown_class`/`unknown_function`, and ordered-set semantics (no key_stat_limit; items 7+ are relevants).
- **setRelevantStat** — fully removed (function + doc block). The RPC no longer exists (dropped in migration 0018). No references remain anywhere.
- **fetchKeyStats** — added optional `charFunction?: 'dps'|'mdps'|'suporte'` param. Query now selects `stat_key,selection_order` ordered by `selection_order`, with `&char_function=eq.` when a function is known. Single-arg className overload kept for backward-compat transition.
- **fetchKeyRelevantStats** — added optional `charFunction?` param; same conditional `char_function=eq.` filter.

## api.test.ts (updated to match new API)

- `fetchKeyStats` URL assertion updated to `select=stat_key,selection_order&order=selection_order`
- Added `fetchKeyStats` with `charFunction` filter test
- `setKeyStat` now posts to `/rpc/set_key_stat_v2` with `p_class/p_function/p_stat_key/p_enabled`
- `key_stat_limit` error test replaced with `unknown_function` error test
- Headers test updated to pass `charFunction` arg to `setKeyStat`

## KeyStatsPage.tsx (Stats-Chave admin surface)

- **State:** `selectedFunction: BuildRole | ''` added. `keyStats`/`relevantStats`/`top5` keyed per (class, function).
- **Selector UI:** class selector (existing) + role selector (new, FUNCTION_LABELS options: Dano Físico / Dano Mágico / Suporte). Both required before chips render. Class change resets function to ''.
- **Stat chips (KEYU-01/02):** ONE ordered selection set per (class, role). Chips show selection_order as suffix (keys get `(n)` 1-6, relevants get `Rn` 7th+). Click toggles via `setKeyStat(session, className, selectedFunction, statKey, !selected)`. No block-at-7 chip disabling — chips remain clickable past 6; server handles ordered-set semantics.
- **Chip rendering:** extracted into `renderStatChip` helper function to avoid nested `.map()` JSX brace issues.
- **Deselect-promotion:** server enforces oldest-relevant promotion inside `set_key_stat_v2`; client refreshes after save (`loadClassData`).
- **Coverage indicator:** `keyCount/6` badge ("completa" when 6) + relevant count shown in header.
- **Error copy:** Removed `LIMIT_ERROR`, `ALREADY_KEY_ERROR`, `KEY_SET_INCOMPLETE_ERROR`, `RELEVANT_GATE_HINT`, `KEY_IN_RELEVANT_HINT`, `MAX_KEY_STATS`, `RELEVANT_CHIP`. Kept `SESSION_ERROR` / `NETWORK_ERROR` / `SAVE_ERROR`. `toggleErrorCopy` maps `forbidden`→SESSION_ERROR, `unknown_class`/`unknown_function`→SAVE_ERROR.
- **Removed:** `handleRelevantToggle`, separate "Relevantes" section, block-at-7 chip disabling.
- **Kept:** `top5` preview (reads per-(class, function) cohort server-side via `class_top5`).

## Verification

- `npx tsc --noEmit` exits 0 (green)
- `npm run build` exits 0 (green)
- `npm run test` — all 532 tests pass (34 files)
- `Select-String 'set_key_stat_v2'` found in api.ts; `Select-String 'setRelevantStat'` returns nothing

## Next

Plan 09-03 (rankMath re-baseline ALREADY DONE — 22 tests pass; smoke-rank.mjs + smoke-promotion.mjs re-baseline still needed), then 09-04 (Dashboard UI: remove percentilePhrase), then 09-05 (KeyStatsPage tests), then 09-06 (live smoke verification).
