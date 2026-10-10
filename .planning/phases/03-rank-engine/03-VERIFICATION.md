---
phase: 03-rank-engine
verified: 2026-10-10T12:00:00Z
status: passed
score: 4/4 success criteria verified (5/5 RNK requirements satisfied)
overrides_applied: 0
gaps: []
deferred: []
human_verification: []
---

# Phase 3: Rank Engine Verification Report

**Phase Goal:** The panel computes trustworthy, admin-tweakable ranks — per-stat percentiles within class+function and an OVR from 6 hidden key stats — entirely in Postgres so key-stat config never reaches members.
**Verified:** 2026-10-10
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can toggle exactly 6 key stats per class; each class has an independent set | ✓ VERIFIED | `0009_rank_engine.sql` L51-98: `set_key_stat` SECURITY DEFINER with internal officer/owner+active gate, `pg_advisory_xact_lock(hashtext('cks:' \|\| p_class))` before the count check, block-at-7 (`key_stat_limit` at `count(*) >= 6`); `class_key_stats` PK is `(class_name, stat_key)` → independent set per class. UI side: `KeyStatsPage.tsx` grouped chips + n/6 counter (L160-174) + client block-at-6 (L247-253, `disabled={busy \|\| blocked}`). Owner UAT approved all 5 browser steps (commit 255e077/6e44974). Live smoke: block-at-7 + member-forbidden probes passed. |
| 2 | Key-stat configuration never crosses the API boundary to members (server-side via SECURITY DEFINER RPCs + RLS) | ✓ VERIFIED | `0009` `my_report()` jsonb_build_object (L158-218) serialises exactly 9 documented per-stat fields — grep for `'is_key'|'key_stats'` JSON markers: **0 matches**. `staff_select_key_stats` policy (L33-37) matches only officer/owner + active; members still deny-all on `class_key_stats`. Leak probes in `scripts/smoke-rank.mjs` L439-440 (raw payload text asserted free of `key_stat`/`is_key`) + member REST probe + anon-denied probe — RANK SMOKE 27/27 passed twice against live (orchestrator-confirmed, migrations 0001-0009 applied). UI: `showKeyStats = tab === 'keystats' && isStaff` content re-check (App.tsx L41, L114-115); member session cannot receive key-stat data (endpoints refuse it server-side). |
| 3 | OVR from the 6 key stats of the player's class, floor 51 (never below), compute-on-read | ✓ VERIFIED | `0009` OVR block L196-216: gate `count(*) = 6 and count(p) = 6` (exactly-6 config + caller has all 6 + each n>=3), value `51 + avg(p) * 48.0/99` — points ∈ [0,99] so OVR ∈ [51,99], structurally never below 51. Compute-on-read: grep for triggers/stored rank inserts in 0009: **0 matches** — no stored ranks, no backfill. Live smoke assertion 12 (disable mdef → OVR null instantly; re-enable → OVR restored) + exact-value OVR fixtures 61/77/87 passed twice. Class-top5 mirrors identical semantics (L301-317). |
| 4 | Per-stat percentile `(count_below/(n-1))×99` with explicit tie handling; "insufficient data" state when too few validated players | ✓ VERIFIED | `0009` per-stat points L174-183: `((countBelow + (ties-1)::numeric/2) / (n-1)) * 99` — ties-include-self formulation exactly matches the others-based 03-01 spec (verified against `rankMath.ts` L34-43 and its 17 worked-example tests, incl. the 74.25 tie-at-top vector reproduced live). n<3 → `data_sufficient=false`, `points` null, but own/avg/best values kept (D-13, L184 + case L175). Insufficient-data live-proven via the `hit` fixture (n=2 → points null) — RANK SMOKE passed twice. ⚠ See WR-02 note below (2-dp serialization rounding on per-stat points; OVR unaffected — computed from unrounded points). |

**Score:** 4/4 success criteria verified

### Required Artifacts (Three-Level: exists / substantive / wired)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/rankMath.ts` | percentilePoints + ovrFromPoints pure spec | ✓ VERIFIED | 64 lines; `48 / 99` rescale L63, `MIN_COHORT_SIZE = 3` L11, strict-6 RangeError L59-61; JSDoc warns against UI import (T-03-02). No production UI import found (KeyStatsPage imports only react/api/session). |
| `src/lib/rankMath.test.ts` | Worked-example spec tests | ✓ VERIFIED | 19 exact-literal matches (74.25/49.5/RangeError); 17 tests pass in the full suite. |
| `src/lib/rankMath` consumed by SQL/smoke | spec ↔ RPC ↔ smoke agreement | ✓ VERIFIED | smoke-rank.mjs (476 lines) contains 74.25 fixtures + leak probes; live smoke reproduced spec values to the decimal twice. |
| `supabase/migrations/0007_staff_active_check.sql` + `0008_staff_active_check_fix.sql` | Staff active-check invariant (D-14) | ✓ VERIFIED | Both exist; 0008 rebuilt the three staff policies on the SECURITY DEFINER `is_active_staff_member()` helper (12 pattern matches) after 0007's inline-subquery 42P17 recursion — corrective, append-only. Live probe (deactivated officer → 0 rows / denied insert) passed in RLS smoke 19/19. |
| `supabase/functions/verify-pin/index.ts` | Fixed handle parsing (CR-02) | ✓ VERIFIED | L58 `body.discord_handle`; zero `discordHandle` references remain; redeployed live, logins proven by every smoke run. |
| `supabase/migrations/0009_rank_engine.sql` | Rank engine: 3 SECURITY DEFINER RPCs + staff policy + grants | ✓ VERIFIED | 6× security definer, 6× member_role, 4× `and m.active`, 1× advisory lock, 3× revoke execute, 2× distinct-on CTEs, 0× is_key/key_stats markers, 0× triggers/stored ranks. Migration grep gates all pass. |
| `scripts/smoke-rank.mjs` | Live rank smoke matrix | ✓ VERIFIED | 476 lines (min 200); syntax OK; literals 74.25/49.5/key_stat_limit/ZZRankSquad + 4-class cleanup + finally guarantee; passed 27/27 twice live (no-residue proof). |
| `src/lib/api.ts` | fetchKeyStats / setKeyStat / fetchClassTop5 | ✓ VERIFIED | L156/167/189; exact `p_class`/`p_stat_key`/`p_enabled` bodies; `encodeURIComponent` on the class filter; ApiError propagation; 8 new tests green. |
| `src/features/admin/KeyStatsPage.tsx` | Key-stat admin page | ✓ VERIFIED | 305 lines (min 120); no rankMath import, no pin_hash mention; n/6 counter, client block-at-6, `key_stat_limit` → enumeration-safe pt-BR copy (L28, L57), Top 5 por OVR preview refreshed after every toggle; wired into App.tsx `showKeyStats` branch. |
| `src/App.tsx` | 'keystats' staff tab with content re-check | ✓ VERIFIED | Tab type extended (L14); staff-only button (L96-102); `showKeyStats = tab === 'keystats' && isStaff` exactly once (L41); renders KeyStatsPage (L114-115). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `0009 my_report()` | `class_key_stats` | internal SECURITY DEFINER read for OVR only | ✓ WIRED | L212-216; identity never serialised (RNK-02) |
| `0009 set_key_stat()` | `class_key_stats` | advisory-lock guarded block-at-7 | ✓ WIRED | L77-91 |
| smoke-rank.mjs fixtures | rankMath.ts worked examples | identical exact values | ✓ WIRED | 74.25/49.5/99/0 + OVR 61/77/87 live-asserted |
| KeyStatsPage.tsx | `/rpc/set_key_stat` | `setKeyStat()` after each toggle; count → counter | ✓ WIRED | api.ts L176-180; KeyStatsPage L136-142 |
| KeyStatsPage.tsx | `/rpc/class_top5` | `fetchClassTop5()` on class change + after every toggle | ✓ WIRED | KeyStatsPage L102-107, L143-147 |
| App.tsx | KeyStatsPage.tsx | `showKeyStats` content-level re-check | ✓ WIRED | App.tsx L41, L114-115 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| KeyStatsPage | `keyStats` (n/6 counter + chip selection) | `fetchKeyStats` → staff RLS read on class_key_stats | Yes (live RPC/RLS) | ✓ FLOWING |
| KeyStatsPage | `top5` (OVR preview) | `fetchClassTop5` → `class_top5` SECURITY DEFINER RPC | Yes (compute-on-read) | ✓ FLOWING |
| KeyStatsPage | counter after toggle | `setKeyStat` RPC count + re-fetch | Yes (server truth) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full local suite (incl. 17 rankMath + 8 api tests) | `npx vitest run` | 7 files, 101/101 passed | ✓ PASS |
| Type safety | `npx tsc -b` | exit 0 | ✓ PASS |
| Production build | `npx vite build` | built in 639ms | ✓ PASS |
| Smoke script validity | `node --check scripts/smoke-rank.mjs` | syntax OK | ✓ PASS |
| Live rank/RLS smoke re-run | `node scripts/smoke-rank.mjs` | Requires owner SUPABASE_ACCESS_TOKEN — already proven live during execution (27/27 twice, RLS 19/19; orchestrator-confirmed migrations 0001-0009 applied) | ? SKIP (covered by execution-time live proof) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RNK-01 | 03-03, 03-04 | Admin selects exactly 6 key stats per class via toggle (independent set) | ✓ SATISFIED | set_key_stat RPC + KeyStatsPage UI + owner UAT approved (all 5 steps) |
| RNK-02 | 03-02, 03-03, 03-04 | Key stats hidden from members server-side (DevTools must not leak) | ✓ SATISFIED | Zero key markers in my_report payload (grep-verified); staff-only policy; live leak probes passed; UI content re-check |
| RNK-03 | 03-01, 03-03 | OVR from 6 key stats of player's class, floor 51 | ✓ SATISFIED | `51 + avg(p)*48.0/99`, structurally ≥51; exact fixtures 61/77/87 live-proven |
| RNK-04 | 03-01, 03-03 | Per-stat percentile `(count_below/(n-1))×99` with tie handling | ✓ SATISFIED | SQL formula matches 03-01 spec to the decimal; 74.25/49.5/99/0 live-proven (⚠ WR-02 2-dp serialization note) |
| RNK-05 | 03-01, 03-03 | "Insufficient data" state when too few validated players | ✓ SATISFIED | n<3 → points null + data_sufficient false, values kept; live-proven via hit fixture |

All five RNK IDs declared across plans are accounted for in REQUIREMENTS.md traceability (RNK-01..05 → Phase 3, marked Complete). No orphaned Phase-3 requirements. Local suite 101/101 green.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/migrations/0009_rank_engine.sql` | 174-183 | `round(..., 2)` on per-stat points diverges from the unrounded 03-01 spec for >2-dp quotients (e.g. 12.375 → 12.38); misleading comment at L195 ("per-stat points stay unrounded here too") | ⚠ Warning (WR-02, advisory) | OVR unaffected (computed from unrounded points at L203-210); does not leak config or break any success criterion. Documented as a deliberate decision in 03-03 SUMMARY. See override suggestion below. |
| `src/features/admin/KeyStatsPage.tsx` | 130-153 / 193-197 | Class `<select>` not disabled while `toggling`; toggle continuation applies captured-class state → class-switch-during-toggle race can show class-B header with class-A data | ⚠ Warning (WR-01, advisory) | UI edge-case only; server state and enforcement unaffected; does not prevent the phase goal |
| `scripts/smoke-rank.mjs` | 497-513 | `RANK SMOKE PASSED` banner prints even when cleanup failed (exit code preserved) | ℹ️ Info (IN-02, advisory) | CI-output clarity only |
| `supabase/migrations/0009_rank_engine.sql` | 62 | Demoted (not deactivated) officer retains staff access until 7-day token expiry — claim-design property (IN-06, advisory) | ℹ️ Info | Systemic to the JWT design, pre-existing; worth an explicit operational rule later |

No TODO/FIXME/placeholder/stub patterns found in any phase file. No blockers.

### Human Verification Required

None outstanding. The two human-gated items were already completed during execution with documented evidence:
- **Owner browser UAT** of the Stats-Chave page — all 5 steps approved against the live project (commits 255e077, 6e44974).
- **Live smoke matrices** — RANK 27/27 twice (exact-value fixtures 74.25/49.5/99/0, OVR 61/77/87, leak probes, compute-on-read toggle) and RLS 19/19 incl. the deactivated-staff probe; migrations 0001-0009 confirmed applied via dry-run.

### Warnings & Override Suggestions

Both code-review warnings (WR-01, WR-02) were independently confirmed in the code during this verification. Neither fails a success criterion — both are advisory quality items:

**WR-02 (2-dp rounding divergence).** This looks intentional (03-03 SUMMARY documents "Per-stat points serialize rounded to 2 decimals; OVR computes from unrounded points" as a decision). To formally accept the deviation, add to VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "Per-stat percentile uses rank-based points (count_below/(n-1)) x 99 with explicit tie handling (exact unrounded serialization)"
    reason: "Formula is exact in the SQL; only the JSON serialization rounds to 2 dp. OVR computes from unrounded points, so the headline rating is unaffected. Phase 4 renders the rounded points; divergence is bounded at 0.005 pts."
    accepted_by: "owner"
    accepted_at: "<timestamp>"
```

Alternatively, remove `round(..., 2)` in a Phase 4 touch and fix the misleading comment at 0009 L195.

**WR-01 (class-switch race).** Recommend folding the review's fix (disable the select while busy + class-ref guard in `handleToggle`) into an early Phase 4 task, since Phase 4 builds directly on KeyStatsPage.

### Gaps Summary

No gaps. All four roadmap success criteria and all five RNK requirements are verified in the actual codebase: the rank engine (0009) computes per-stat percentile points and floor-51 OVR entirely in Postgres via SECURITY DEFINER RPCs with internal role+active gates; key-stat identity is provably absent from member-facing payloads; key-stat config is independently toggleable per class (exactly-6 enforced client- and server-side) with instant compute-on-read reflection; insufficient-data states are explicit and live-proven. Local suite (101/101 vitest, tsc, build) is green, and the live proofs (RANK 27/27 ×2, RLS 19/19, owner UAT) were performed during execution with documented evidence.

---

_Verified: 2026-10-10_
_Verifier: OpenCode (gsd-verifier)_
