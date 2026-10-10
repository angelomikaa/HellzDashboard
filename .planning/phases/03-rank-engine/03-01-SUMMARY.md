---
phase: 03-rank-engine
plan: 01
subsystem: rank-math
tags: [rank-math, percentile, ovr, pure-functions, vitest, tdd]
requires: []
provides:
  - "percentilePoints/ovrFromPoints executable spec (test-vector source for 03-03 Postgres RPC + smoke matrix)"
affects: []
tech-stack:
  added: []
  patterns:
  - "TDD RED/GREEN gate for formula spec modules"
key-files:
  created:
  - src/lib/rankMath.ts
  - src/lib/rankMath.test.ts
  modified: []
decisions:
  - "Tie handling CONFIRMED as average-rank semantics, locked by worked examples (74.25 top-tie, 49.5 mid-tie/all-tied)"
  - "OVR computed as 51 + mean * 48 / 99 (multiply-then-divide order keeps all spec values binary-exact for toBe assertions)"
  - "ovrFromPoints is strictly length-6 (RangeError); the D-11 all-6-or-nothing gate belongs to the caller"
metrics:
  duration: 8min
  completed: 2026-10-10
---

# Phase 03 Plan 01: Rank Math Executable Spec Summary

Pure TypeScript rank-math spec — `percentilePoints` (average-rank ties, n≥3 gate) and `ovrFromPoints` (51 + mean × 48/99 linear rescale, strict length-6) — locked by 17 worked-example tests before any SQL or UI exists.

## What Was Built

- **`src/lib/rankMath.ts`** — the executable formula spec:
  - `percentilePoints(ownValue, others)`: rank-based percentile `((countBelow + countTies/2) / (n-1)) * 99`; `n = others.length + 1`; `n < MIN_COHORT_SIZE` → `{ points: null, dataSufficient: false }` (RNK-05/D-12/D-13).
  - `ovrFromPoints(points)`: `51 + mean * 48 / 99` linear rescale (D-10, never below 51), throws `RangeError` unless exactly 6 points (D-09/D-11 strict function gate).
  - `MIN_COHORT_SIZE = 3` exported (D-12 single source of truth).
  - JSDoc on every exported symbol citing decision IDs + the production warning: production rank truth lives in Postgres RPCs; no UI may import this to compute displayed points (T-03-02 mitigation).
- **`src/lib/rankMath.test.ts`** — 17 worked-example tests, the test-vector contract the 03-03 Postgres RPC and `scripts/smoke-rank.mjs` must match exactly: 74.25, 49.5, 99, 0, 51, 75, 95, 61, both RangeError throws, n=1/n=2 insufficient cases.

## Requirement Coverage

- **RNK-03** — OVR formula (floor 51 via linear rescale) specified and proven: six 0s → 51.0 exactly, never below.
- **RNK-04** — Rank-based percentile with tie handling specified: best = 99, worst = 0, ties = equal points (average ranks), all locked by tests.
- **RNK-05** — Insufficient-data state specified: n<3 → `points: null` + explicit `dataSufficient: false` flag (D-12/D-13).

(Full server-side enforcement lands in plan 03-03's Postgres RPCs — this plan is the spec they implement.)

## TDD Gate Compliance

1. **RED** — `test(03-01)` commit `b479447`: test file written first; `npx vitest run src/lib/rankMath.test.ts` failed (module not found) before implementation existed.
2. **GREEN** — `feat(03-01)` commit `43ee84e`: minimal implementation; full suite green on first run, no iteration needed.
3. **REFACTOR** — not needed; implementation is minimal by construction.

## Verification Results

| Check | Result |
|-------|--------|
| `npx vitest run` (full suite) | ✅ 7 files, 93 tests passed (76 existing + 17 new, zero regressions) |
| `npx tsc -b` | ✅ exit 0 |
| `npx vite build` | ✅ exit 0 |
| `48 / 99` rescale present in source | ✅ line 63 (code) + line 48 (JSDoc) |
| `MIN_COHORT_SIZE = 3` present | ✅ line 11 |
| strict-6 guard `length !== 6` present | ✅ line 59 |
| Test file ≥ 80 lines | ✅ 116 lines |
| Every behavior-table worked example is an executable test | ✅ all 9 percentile rows + all 7 OVR rows |

## Deviations from Plan

None — plan executed exactly as written. One implementation detail worth recording: the OVR rescale is evaluated as `mean * 48 / 99` (multiply first, then divide) rather than `mean * (48/99)` — mathematically identical per the plan's formula, but the left-to-right order keeps 75/95/61/99 binary-exact so `toBe` assertions hold without epsilon. Source still literally contains the required `48 / 99` pattern (acceptance criterion satisfied).

## Known Stubs

None — pure functions, fully implemented, no placeholders.

## Threat Flags

None — no new trust-boundary surface. Both threat-register items (T-03-01 mitigated via the RED-first test gate; T-03-02 accepted with JSDoc warning) were handled exactly as the plan's threat model dispositions them.

## Self-Check: PASSED

- Created files exist: `src/lib/rankMath.ts` ✅, `src/lib/rankMath.test.ts` ✅
- Commits exist: `b479447` (test/RED) ✅, `43ee84e` (feat/GREEN) ✅
