---
phase: 05-ocr-auto-read-layer
plan: 03
subsystem: submit-wizard
tags: [wizard, d07-especial-required, d08-per-step-verification, tdd, ux-gating, manual-flow]

# Dependency graph
requires:
  - phase: 02-data-model-wizard (plan 02-01)
    provides: parseStatValue — the single locale parser gating every value
  - phase: 02-data-model-wizard (plans 02-01..02-03)
    provides: the 5-step submit wizard baseline (wizard.ts pure gates, SubmitPage step engine, ReviewStep confirmation gate) whose Special-optional P2D-C rule this plan supersedes
provides:
  - REQUIRED_GROUPS = general+quasi+special with combat_power the only optional stat (D-07, pure logic, 15-test-proven)
  - stepVerified per-step verification engine — single central handleChange edit path that force-unchecks the owning step on ANY value write (D-08, T-05-10 mitigation)
  - shrunk ReviewStep: tap-to-fix summary whose Enviar is gated on allStepsVerified (defense in depth; server re-validation unchanged, INPT-03)
affects: [05-ocr-auto-read-layer (05-04 wires OCR reads onto the step engine via the same handleChange path; 05-05 UAT walks the realigned flow)]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-step verification state owned by the page with a single group→step mapping (stepForStat) shared by edit-invalidation and fix-navigation, locked copy strings defined exactly once in a VERIFY_COPY map (04-02 literal-gate discipline)]

key-files:
  created: []
  modified:
    - src/features/submit/wizard.ts
    - src/features/submit/wizard.test.ts
    - src/features/submit/SubmitPage.tsx
    - src/features/submit/ReviewStep.tsx

key-decisions:
  - "stepForStat is the ONE group→step mapping (combat_power→1, general→2, quasi→3, special→4): handleChange uses it to uncheck the owning step and handleFixStat was consolidated onto it — the plan said 'mirror the existing handleFixStat mapping'; unifying kills the mirror instead"
  - "INPT-02 stays Pending by traceability (05-01/04-01 precedent): this plan is the manual-flow realignment only; the requirement completes when 05-04 wires the wizard and 05-05 UAT-verifies end-to-end"
  - "The plan's 'existing cases must keep passing' RED constraint is unsatisfiable for tests that pin the superseded Special-optional rule — those four assertions were updated in the same RED commit (see Deviations)"
  - "ReviewStep keeps WIZARD_GROUPS-ordered tap-to-fix rows byte-identical; only the confirmation machinery (state, copy map, useEffect, checkbox rows, react import) was removed"

requirements-completed: []  # INPT-02 deliberately left Pending — manual realignment only; completes in 05-04/05-05 (traceability precedent)

# Metrics
duration: 14min
completed: 2026-10-11
---

# Phase 5 Plan 3: Wizard Realignment — Especial Mandatory + Per-Step Verification Summary

**Especial became a required capture group (D-07) and every capture step now owns its verification checkbox (D-08) — the review gate moved from end-of-flow to per-step, and Revisão shrank to a tap-to-fix summary whose Enviar requires all four step confirmations currently checked**

## Performance

- **Duration:** ~14 min (active work; first commit 16:37, last 16:47 local)
- **Tasks:** 2 (task 1 TDD RED → GREEN; task 2 UI restructure)
- **Files modified:** 4 (0 created)
- **Commits:** 3 (1 test + 2 feat)

## Accomplishments

- `wizard.ts`: `REQUIRED_GROUPS` widened to `['general', 'quasi', 'special']` (type `ReadonlyArray<WizardGroup>`); `isOptionalEntry` reduced to `stat_key === 'combat_power'` — blank/unparseable Especial values now fail `groupComplete` and reject `buildStatsPayload` with the stat LABELS, exactly like Geral/Quasi; doc comments updated to the D-07 rule
- `wizard.test.ts`: 13 → 15 cases; every D-07 behavior from the plan pinned (REQUIRED_GROUPS membership, special blank → groupComplete false, special all-valid → true, typed `'abc'` → false, blank Especial → `missingRequired: [label]`, all-groups-filled + blank combat_power → ok with combat_power omitted, unparseable combat_power dropped vs unparseable Especial rejected)
- `SubmitPage.tsx`: `stepVerified` state for steps 1–4 (reset in `restartWizard`); the single central `handleChange` edit path unchecks the owning step on ANY value write (manual typing now, OCR pre-fill in 05-04 flows through the same function); `StepVerifyCheckbox` rendered under each step's content (Personagem copy + the three locked group strings moved byte-identical from ReviewStep); Continuar gating — step 1 on `stepVerified[1]`, steps 2–4 on `groupComplete && stepVerified[step]` (the `STEP_GROUP[step] !== 'special'` escape hatch is deleted — Especial is gated like the rest)
- `ReviewStep.tsx`: shrunk per D-08 — `confirmed` state, `CONFIRMATION_COPY`, the `useEffect` reset and the three checkbox rows removed (plus the now-unused react import); tap-to-fix value rows, missingRequired/submitError alerts unchanged; `Enviar` = `disabled={!allStepsVerified || submitting}` + `aria-busy`

## task Commits

Each task was committed atomically:

1. **task 1: wizard.ts realignment — Especial required (RED → GREEN)** - `07d1f2e` (test) → `8883830` (feat)
2. **task 2: per-step verification engine + ReviewStep restructure** - `85ce3ee` (feat)

## TDD Gate Compliance

- RED gate: `07d1f2e` — verified failing before implementation (5 failed / 10 passed; exactly the Especial-required cases: REQUIRED_GROUPS membership, special-blank groupComplete, blank-Especial payload rejection, missingRequired label set, unparseable-Especial rejection — all other cases green)
- GREEN gate: `8883830` — 15/15 wizard tests green after the two planned changes
- Task 2 was not TDD-flagged by the plan (UI restructure; the gating logic itself is the task-1-tested pure functions — house pattern: component-level state wiring has no DOM test harness)

## Verification

- `npx tsc -b` clean; full submit-feature suite 54/54 green (wizard 15 + ocr 39 untouched); whole-repo suite **173/173 green** (171 prior + 2 net-new wizard cases); `npx vite build` green
- Acceptance greps: 0 matches for `group_name === 'special'` in wizard.ts; 0 matches for `!== 'special'` in SubmitPage.tsx; 0 matches for `confirmed|CONFIRMATION_COPY` in ReviewStep.tsx; `allStepsVerified` + `disabled={!allStepsVerified || submitting}` present; all four verification copy strings defined exactly once each (literal-gate discipline)
- Plan-level: the diff touches only the four planned files — zero OCR code referenced (05-04 wires OCR onto this structure)

## Decisions Made

- `stepForStat` is the single group→step mapping; `handleFixStat` was consolidated onto it instead of keeping a mirror — one mapping means edit-invalidation and fix-navigation can never drift apart
- INPT-02 stays Pending by traceability (05-01 precedent): this plan is pure manual-flow realignment; the requirement completes when 05-04 wires OCR and 05-05 UAT-verifies end-to-end
- The shrunk ReviewStep keeps the group-ordered tap-to-fix rows byte-identical — only confirmation machinery was removed; the summary stays a functional last-chance look per the UI-SPEC discretion (kept, not removed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - spec correction] "Existing cases must keep passing" is unsatisfiable for tests pinning the superseded rule**
- **Found during:** task 1 (RED)
- **Issue:** the plan's behavior block says "existing cases must keep passing", but four existing cases assert the Phase 2 Special-optional rule this plan exists to supersede (`REQUIRED_GROUPS` = general+quasi; "special is true even with all blanks"; two payload expectations with blank Especial) — they cannot both keep passing and reflect D-07 (same class of contradiction as the 05-01 clamp example)
- **Fix:** the superseded-rule assertions were updated in the same RED commit to assert the D-07 rule, and the new plan-specified cases were added; all non-Special-related existing cases kept passing verbatim
- **Files modified:** src/features/submit/wizard.test.ts
- **Verification:** RED run = exactly the 5 Especial-required cases failing; post-GREEN 15/15
- **Committed in:** 07d1f2e / 8883830

**2. [Documentation] setInputs grep gate shows three sites, not one**
- **Found during:** task 2 (acceptance check)
- **Issue:** the acceptance criterion "`Select-String SubmitPage.tsx "setInputs"` shows edits only inside that wrapper" literally matches three lines: the useState declaration, the handleChange wrapper, and `restartWizard`'s `setInputs({})`
- **Disposition:** intent preserved — restartWizard's call is a full wizard reset that ALSO resets `stepVerified` (a strictly stronger stale-confirmation guarantee), not a per-stat edit; every actual value edit flows through handleChange alone. Documented rather than contorted around (04-01/05-01 literal-gate precedent)
- **Committed in:** 85ce3ee

---

**Total deviations:** 1 auto-fixed (spec correction) + 1 documented literal-gate nuance
**Impact on plan:** None on scope or behavior — both artifacts match the plan's must-haves exactly.

## Issues Encountered

- PowerShell console codepage renders non-ASCII as mojibake in Select-String output; verified via direct file reads that all committed files are clean UTF-8 (no replacement characters)

## Security Notes (threat model compliance)

- T-05-09 (accept): the per-step checkbox gate is UX-only by design — `create_submission` re-validates the payload server-side regardless (INPT-03), and 0010's one-pending rule keeps the audit trail; no client gating is trusted
- T-05-10 (mitigate — implemented): editing any value force-unchecks the owning step's verification through the single central handleChange path; a checked box always attests to the CURRENT values the player saw. The 05-04 OCR writes must route through the same function to inherit this guarantee
- No threat surface beyond the plan's register was introduced: zero new network calls, zero schema changes, no OCR code

## Known Stubs

None — the manual flow is complete and self-consistent with zero uploads (all values render from real inputs; no placeholder data paths were added).

## User Setup Required

None.

## Next Phase Readiness

- 05-04 can bolt OCR reads onto a step engine that already owns verification state: OCR pre-fill must write through `handleChange` (single edit path) so each read unchecks its own step's checkbox, per the UI-SPEC "read unchecks" rule
- Especial gating means an Especial screenshot (or manual fill) is now required before Revisão can be reached with all gates green
- Standing blocker (unchanged, owned by 05-02): migration 0010 live push + lifecycle smokes still need SUPABASE_ACCESS_TOKEN as a session env var

## Self-Check: PASSED

- Files exist: wizard.ts, wizard.test.ts, SubmitPage.tsx, ReviewStep.tsx, 05-03-SUMMARY.md — all FOUND
- Commits exist: 07d1f2e (test/RED), 8883830 (feat/GREEN), 85ce3ee (feat/task 2) — all FOUND in git log
- Verification re-confirmed at self-check time: 173/173 repo tests, `npx tsc -b` clean, `npx vite build` green

---

*Phase: 05-ocr-auto-read-layer*
*Completed: 2026-10-11*
