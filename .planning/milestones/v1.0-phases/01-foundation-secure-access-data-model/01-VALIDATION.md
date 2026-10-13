---
phase: 1
slug: foundation-secure-access-data-model
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (ships with Vite react-ts template) |
| **Config file** | `vite.config.ts` (Vitest uses it via `/// <reference types="vitest" />`) — no separate config needed |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx tsc --noEmit && npx vite build` |
| **Estimated runtime** | ~10s quick / ~45s full |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run && npx tsc --noEmit && npx vite build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-task Verification Map

| task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-t1 | 01-01 | 1 | AUTH-02 | T-01-03 | `.env.example` contains no service_role/JWT secret; `.secrets/` gitignored | static | `git check-ignore .secrets && grep -c "SUPABASE_SERVICE_ROLE\|JWT_SECRET" .env.example` | ✅ | ⬜ pending |
| 01-01-t2 | 01-01 | 1 | AUTH-01, AUTH-02 | T-01-04 | Migrations contain all 6 tables, `discord_handle` unique, append-only EAV | static | `grep -c "create table" supabase/migrations/0001_schema.sql` (= 6) | ✅ | ⬜ pending |
| 01-01-t3 | 01-01 | 1 | AUTH-01 | T-01-04 | Tables + seed live in Supabase | live | `supabase db push` + SQL editor seed + project table list | ✅ | ⬜ pending |
| 01-02-t1 | 01-02 | 2 | AUTH-02 | T-01-03, T-01-05 | RLS enabled on all tables; `class_key_stats` has no member policy | static+live | `grep -c "enable row level security" supabase/migrations/0002_rls.sql` (= 6) | ✅ | ⬜ pending |
| 01-02-t2 | 01-02 | 2 | AUTH-01 | T-01-01, T-01-02 | Lockout math pure function unit-tested (5→15 min, reset on success) | unit | `npx vitest run src/features/auth/lockout.test.ts` | ❌ W0-owning-plan | ⬜ pending |
| 01-02-t3 | 01-02 | 2 | AUTH-01, AUTH-02 | T-01-01, T-01-02 | verify-pin returns HS256 JWT; anon blocked; wrong PIN increments counter | live | `curl -X POST .../functions/v1/verify-pin` (3 scenarios) | ✅ | ⬜ pending |
| 01-03-t1 | 01-03 | 3 | AUTH-01 | T-01-01 | Session stored in localStorage; silent expiry; logout clears | build+static | `npx vitest run && npx vite build` | ✅ | ⬜ pending |
| 01-03-t2 | 01-03 | 3 | AUTH-01 | — | Real browser login flow | manual | checkpoint:human-verify | — | ⬜ pending |
| 01-04-t1 | 01-04 | 2 | — (OCR spike, AUTH-independent) | — | Accuracy + go/no-go math pure function unit-tested vs 70% threshold | unit | `npx vitest run scripts/ocr-spike.accuracy.test.mjs` | ❌ W0-owning-plan | ⬜ pending |
| 01-04-t2 | 01-04 | 2 | — (OCR spike) | — | Spike run on 10 real screenshots, decision documented | manual | checkpoint:human-action → `node scripts/ocr-spike.mjs` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements — Vitest installs with the scaffold (Plan 01-01 task 1). Lockout and OCR-accuracy unit tests are created inside their owning plans (01-02, 01-04) as test-first tasks.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login persists across reload; logout clears session; lockout message shows | AUTH-01 | Browser-only behavior (localStorage, UI flow) | Plan 01-03 checkpoint:human-verify — log in, reload (still logged in), logout (back to login), 5 wrong PINs (lockout message) |
| OCR spike run on 10 real guild screenshots with go/no-go decision | — (OCR spike) | User provides the 10 real screenshots (D-09); files live in gitignored `.secrets/ocr-samples/` | Plan 01-04 checkpoint:human-action — user drops screenshots + fills `expected.json`, OpenCode runs `node scripts/ocr-spike.mjs` and documents the decision |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-08
