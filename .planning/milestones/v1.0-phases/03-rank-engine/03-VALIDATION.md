---
phase: 3
slug: 03-rank-engine
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5 (node environment, no DOM — matches `src/lib/api.test.ts`) |
| **Config file** | none — vitest zero-config picks up `**/*.test.ts`; `"test": "vitest run`" script in package.json |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx tsc -b && npx vite build` |
| **Live rank matrix** | `node scripts/smoke-rank.mjs` (needs SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF session env) |
| **Live RLS matrix** | `node scripts/smoke-rls.mjs` (same env; extended in 03-02 with the deactivated-staff probe) |
| **Estimated runtime** | ~5 s (vitest) · ~20 s (full incl. build) · ~1-2 min (live smoke incl. logins + cleanup) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run && npx tsc -b && npx vite build`
- **After live-deploy tasks (03-02-02, 03-03-03):** Run the corresponding live smoke matrix
- **Before `/gsd-verify-work`:** Full suite + both live matrices green
- **Max feedback latency:** 30 seconds (local); live matrices exempt (deploy-gated)

---

## Per-task Verification Map

| task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | RNK-03, RNK-04, RNK-05 | T-03-01 | worked-example tests exist and fail (RED) | unit (TDD red) | `npx vitest run src/lib/rankMath.test.ts` | ⬜ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | RNK-03, RNK-04 | T-03-01 | formula exact: 74.25/49.5/0/99 ties, OVR floor 51, strict-6 | unit (TDD green) | `npx vitest run` | ⬜ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | RNK-02 (D-14/D-15) | T-03-03, T-03-04 | 0007 active-check SQL + verify-pin fix; grep gates | SQL review + grep | `Select-String` gates in plan | n/a | ⬜ pending |
| 03-02-02 | 02 | 1 | RNK-02 | T-03-03, T-03-05 | deactivated officer denied live; redeployed verify-pin logs in | live API smoke | `node scripts/smoke-rls.mjs` | ✅ (02-01) | ⬜ pending |
| 03-03-01 | 03 | 2 | RNK-01..05 | T-03-08..T-03-12 | 0008 RPCs authored: definer, role+active gates, advisory lock, EXECUTE hygiene | SQL review + grep | grep matrix in plan | n/a | ⬜ pending |
| 03-03-02 | 03 | 2 | RNK-02, RNK-05 | T-03-09 | rank smoke script with exact-value fixtures + leak probes | script syntax + review | `node --check scripts/smoke-rank.mjs` | ⬜ W0 | ⬜ pending |
| 03-03-03 | 03 | 2 | RNK-01..05 | T-03-08..T-03-11 | live: exact percentiles/OVR, block-at-7, member/anon denials, insufficient-data, cleanup idempotent | live API smoke | `node scripts/smoke-rank.mjs` | ⬜ W0 | ⬜ pending |
| 03-04-01 | 04 | 3 | RNK-01 | T-03-18 | api client functions correct paths/bodies/errors | unit | `npx vitest run src/lib/api.test.ts` | ✅ (02-01) | ⬜ pending |
| 03-04-02 | 04 | 3 | RNK-01, RNK-02 | T-03-16, T-03-17 | page + tab: content re-check, no client rank math, block-at-7 UX | build + grep gate | `npx vitest run && npx tsc -b && npx vite build` | n/a | ⬜ pending |
| 03-04-03 | 04 | 3 | RNK-01 | T-03-16 | officer toggles 6 stats in real browser; member sees no tab | manual (checkpoint) | see plan 03-04 task 3 | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] vitest installed and proven (Phases 1-2: 62+ tests green)
- [x] `"test": "vitest run"` script in package.json
- [x] Live smoke script pattern proven (`scripts/smoke-rls.mjs`, 14-assertion matrix)
- [x] Deploy contract proven (db push + functions deploy + Management API, 01-02/02-01)
- [ ] `scripts/smoke-rank.mjs` — created BY plan 03-03 task 2 (Wave 0 dependency of 03-03-02/03-03-03, satisfied within the same plan)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Key-stat page usability: chips, grouping, counter, preview feel | RNK-01 (D-04/D-05) | visual/interaction quality | owner walks the 5 steps in plan 03-04 task 3 |
| Toggle → instant preview (compute-on-read perceived) | RNK-01 | interaction across live data | checkpoint step 4 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30 s (local gates)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
