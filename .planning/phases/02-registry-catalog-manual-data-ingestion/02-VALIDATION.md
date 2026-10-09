---
phase: 2
slug: 02-registry-catalog-manual-data-ingestion
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5 (node environment, no DOM — matches `src/features/auth/session.test.ts`) |
| **Config file** | none — vitest zero-config picks up `**/*.test.ts`; `"test": "vitest run"` script added to package.json in plan 02-01 task 3 |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx tsc -b && npx vite build` |
| **Estimated runtime** | ~5 s (vitest) · ~20 s (full incl. build) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run && npx tsc -b && npx vite build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-task Verification Map

| task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | REG-03 | — | catalog seed valid (57 rows, group/value_type constraints) | SQL review + seed apply | `Test-Path supabase/migrations/0003_registry_catalog.sql` + push exit 0 | ⬜ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | REG-02, INPT-04 | T-02-01…T-02-06 | RLS matrix: pin_hash unreachable; append-only intact; RPC derives member_id | live API smoke (Node) | `node scripts/smoke-rls.mjs` exit 0 | ⬜ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | INPT-04 | T-02-04 | parse spike-identical; payload validated before RPC | unit | `npx vitest run` | ⬜ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | REG-01 | T-02-02, T-02-03 | officer-gated UI; PATCH limited to granted columns | unit (pure) + build | `npx vitest run && npx tsc -b` | ⬜ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | REG-02 | T-02-03 | class insert officer-only (server-enforced) | build + grep gate | `npx tsc -b` | ⬜ W0 | ⬜ pending |
| 02-03-01 | 03 | 3 | INPT-01 | — | wizard renders 3 groups from live catalog | build | `npx tsc -b && npx vite build` | ⬜ W0 | ⬜ pending |
| 02-03-02 | 03 | 3 | INPT-03, INPT-04 | T-02-04, T-02-05 | submit disabled until review confirmed; resubmit = new row | unit + build | `npx vitest run` | ⬜ W0 | ⬜ pending |
| 02-03-03 | 03 | 3 | INPT-01, INPT-03, INPT-04 | all | full E2E incl. DevTools leak-check | manual (checkpoint) | see plan 02-03 task 3 | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] vitest installed and proven (Phase 1: `session.test.ts`)
- [x] `"test": "vitest run"` script — added by plan 02-01 task 3
- [x] `scripts/smoke-rls.mjs` — created by plan 02-01 task 2 (live RLS matrix)

*Existing infrastructure otherwise covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Guided flow feel: example shots beside inputs, review gate UX | INPT-01, INPT-03 | visual/interaction quality | owner walks wizard at `localhost:5173` per plan 02-03 task 3 |
| Append-only resubmission visible to the player | INPT-04 | cross-screen flow + DevTools inspection | resubmit; history shows 2 rows; DevTools network check per plan 02-03 task 3 |
| Character registration as officer blocks member abuse | REG-01 | requires two roles in a real browser | officer edits a character; member session has no Personagens tab and direct PATCH fails |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
