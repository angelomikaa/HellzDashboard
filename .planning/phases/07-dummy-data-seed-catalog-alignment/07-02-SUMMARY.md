---
phase: 07-dummy-data-seed-catalog-alignment
plan: 02
subsystem: client-role-vocabulary
tags: [typescript, role-vocabulary, ui-copy, pt-br, label-map]
requires:
  - "migration 0012 (07-01): members.char_function CHECK widened to dps/mdps/suporte"
  - "07-UI-SPEC: locked pt-BR copy Dano Físico / Dano Mágico / Suporte"
provides:
  - "src/lib/groups.ts FUNCTION_LABELS as the single shared role-label source (Record<'dps' | 'mdps' | 'suporte', string>)"
  - "Client vocabulary fully on dps/mdps/suporte — zero 'tank' remnants in src/"
affects:
  - "07-03 (dummy seed must use dps/mdps/suporte values)"
  - "07-04 (live push + smoke battery)"
tech-stack:
  added: []
  patterns:
    - "value-keyed shared label map (label updates propagate to all consumers without code change)"
    - "total cast over an exact option set in the staff select (server CHECK remains the real boundary)"
key-files:
  created: []
  modified:
    - src/lib/groups.ts
    - src/lib/api.ts
    - src/lib/api.test.ts
    - src/features/admin/CharactersPage.tsx
    - src/features/submit/SubmitPage.tsx
    - src/features/dashboard/OvrHero.tsx
decisions:
  - "Three <option> elements rendered from FUNCTION_LABELS (Object.keys map) instead of hand-written JSX — options can never drift from the shared vocabulary"
  - "Select handler uses a total cast (e.target.value as Draft['charFunction']) with an inline comment citing the 0012 CHECK and T-07-05, replacing the old binary ternary"
metrics:
  duration: ~15 min
  completed: 2026-10-14
---

# Phase 7 Plan 2: Role Vocabulary Propagation (Client Half) Summary

The client now speaks exactly the three-role vocabulary `dps`/`mdps`/`suporte` through ONE shared label map (`src/lib/groups.ts`, locked pt-BR copy Dano Físico / Dano Mágico / Suporte) — staff edit form, submit header, dashboard hero and highlights all consume it; zero `'tank'` literals or `'dps' | 'tank'` unions remain in `src/`.

## What Was Built

### Task 1 — Shared label map + api types + test fixture (commit 4e0242f)

- **`src/lib/groups.ts`** — `FUNCTION_LABELS` replaced with `Record<'dps' | 'mdps' | 'suporte', string>` and the UI-SPEC-locked values `dps: 'Dano Físico'`, `mdps: 'Dano Mágico'`, `suporte: 'Suporte'` (accents exact). Leading comment updated to the ROLE-05 / 07-UI-SPEC source note.
- **`src/lib/api.ts`** — all FIVE `char_function` unions widened (lines 37, 198, 229, 275, 342) to `'dps' | 'mdps' | 'suporte'` via a single replaceAll of the exact union string; nothing else touched.
- **`src/lib/api.test.ts`** — `fetchClassTop5` fixture `char_function: 'tank'` → `'suporte'` (line 208). 22/22 tests in the file green.

### Task 2 — Staff form + submit header + OvrHero on the shared map (commit f09edee)

- **`src/features/admin/CharactersPage.tsx`** — local `FUNCTION_LABELS` duplicate deleted; shared import added; `Draft.charFunction` widened to the three-value union; the binary ternary select handler (`e.target.value === 'tank' ? 'tank' : 'dps'`) replaced by a total cast over the exact option set with an inline comment citing the migration-0012 DB CHECK and threat T-07-05 (server CHECK is the boundary, select is UX-only); the two hand-written `<option>`s replaced by THREE options rendered from the shared map. Zero class/style/spacing/typography changes (UI-SPEC Dimension 5) — the field keeps its existing `Função` sr-only label and select classes verbatim.
- **`src/features/submit/SubmitPage.tsx`** — local `FUNCTION_LABELS` duplicate (line 58) deleted; shared import from `'../../lib/groups'` added next to the existing api/session imports.
- **`src/features/dashboard/OvrHero.tsx`** — `charFunction` prop type widened; rendering (`FUNCTION_LABELS[charFunction]`) unchanged, as planned.

Read-only consumers (`ValidacoesPage.tsx`, `KeyStatsPage.tsx`, `PromotionCard.tsx`) already import the shared map — no code change needed, labels update automatically (value-keyed map, D-05 truths).

## Deviations from Plan

**1. [Rule 3 - Blocking] Task-1 commit boundary could not hold `npx tsc -b` green**
- **Found during:** task 1 verify
- **Issue:** widening the shared map's key union (task 1) necessarily broke the not-yet-migrated consumers (CharactersPage/SubmitPage/OvrHero/DashboardPage) at type level — task 1's acceptance criterion "`npx tsc -b` exits 0" is unsatisfiable before task 2 lands, by the plan's own file split
- **Fix:** task 1 verification used its scoped test gate (`npx vitest run src/lib/api.test.ts` → 22/22 passed); full `tsc -b` green was achieved immediately in task 2 (commit f09edee) and is the state both tasks leave behind. No code deviation — purely a commit-sequencing note.
- **Files modified:** none beyond the plan
- **Commit:** 4e0242f / f09edee

No other deviations. No auth gates. No stubs introduced (type-level and copy-level changes only; no placeholder data paths).

## Threat Model Compliance

- **T-07-05 (Tampering, role select values):** mitigated as planned — the cast is total over the exact three-option set (no free-text role input), and the inline comment documents that the migration-0012 server CHECK is the real boundary; the select is UX-only. No new write path (the form still sends only `{display_name, char_class, char_function}` through the existing PATCH projection).
- **T-07-06 (Information Disclosure, labels):** accepted — pt-BR display strings only; no key-stat/config data touched (RNK-02 unaffected).

## Verification

- `npx tsc -b` → exit 0
- `npx vitest run` → **17 test files / 284 tests passed** (same count as the v1.0 baseline — kept green)
- `grep -i "tank" src/` → **zero matches** (vocabulary fully retired from the client)
- `npx oxlint src` → 0 errors (12 pre-existing warnings in unrelated files, out of scope)
- `git diff 4e0242f~1 HEAD --stat -- src/` → exactly the six `files_modified` paths, nothing else
- UI-SPEC copy contract: `Dano Físico` / `Dano Mágico` / `Suporte` render from the single map on every surface; old short forms `DPS`/`Tank` retired

## Next Steps

- **07-03:** dummy seed + purge in `supabase/seeds/dummy/` — use only `dps`/`mdps`/`suporte` values for `char_function`
- **07-04:** live push, key-stat parity re-check, smoke battery, D-12 review gate (smoke scripts ride with the live push per plan note)

## Self-Check: PASSED
