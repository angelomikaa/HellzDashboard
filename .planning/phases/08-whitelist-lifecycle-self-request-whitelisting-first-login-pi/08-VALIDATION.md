---
phase: 8
slug: whitelist-lifecycle-self-request-whitelisting-first-login-pi
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-21
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.x (client units) + Node live-smoke scripts (existing pattern) |
| **Config file** | `package.json` (`test: vitest run`) — no extra config needed |
| **Quick run command** | `npm test -- --run src/features/auth src/features/submit` |
| **Full suite command** | `npm test` then `npm run build` then `npm run lint` |
| **Estimated runtime** | ~60 s local suite; live smoke ~2–4 min per script |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command (focused Vitest or a syntax check)
- **After every plan wave:** Run `npm test` + `npm run build`
- **Before `/gsd-verify-work`:** Full suite + all existing live smokes + `scripts/smoke-identity.mjs` must be green
- **Max feedback latency:** 90 seconds (local), live smokes are wave-boundary gates

---

## Per-task Verification Map

| task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | WHIT-01..07, IDEN-01..03 | T-08-01/02/03 | Migration 0014 adds nullable `pin_hash`, identity/application tables, no client write path | syntax/rehearsal | `node scripts/apply-seed.mjs` on scratch OR SQL parse check | W0 | pending |
| 08-01-02 | 01 | 1 | WHIT-01, WHIT-06, WHIT-07 | T-08-04 | `add_member` / `reset_member_pin` gates + dummy/owner guards | live RPC probe | `node scripts/smoke-identity.mjs --unit-rpc` | W0 | pending |
| 08-01-03 | 01 | 1 | WHIT-02, WHIT-03, IDEN-01/02 | T-08-05 | Atomic claim RPC + identity history + duplicate ID | live RPC probe | `node scripts/smoke-identity.mjs --claim` | W0 | pending |
| 08-01-04 | 01 | 1 | WHIT-08..10 | T-08-06 | Request tables RPC-only; status leaks nothing | live RPC probe | `node scripts/smoke-identity.mjs --requests` | W0 | pending |
| 08-02-01 | 02 | 1 | WHIT-02,03,04 | T-08-07 | verify-pin null branch after active check; timing burn | live edge probe | `node scripts/smoke-identity.mjs --edge` | W0 | pending |
| 08-02-02 | 02 | 1 | WHIT-02,03,04 | T-08-08 | setup-pin atomic + rate-limited + session mint | live edge probe | `node scripts/smoke-identity.mjs --setup` | W0 | pending |
| 08-02-03 | 02 | 1 | WHIT-08,10 | T-08-09 | request-access anon-safe, no session, no data | live edge probe | `node scripts/smoke-identity.mjs --request` | W0 | pending |
| 08-03-01 | 03 | 2 | WHIT-02 | — | PIN boxes: digits only, paste, backspace, labels | unit | `npx vitest run src/features/auth/PinBoxes.test.tsx` | W0 | pending |
| 08-03-02 | 03 | 2 | WHIT-02,03 | — | First-access screen validates + error mapping | unit | `npx vitest run src/features/auth` | W0 | pending |
| 08-03-03 | 03 | 2 | WHIT-08,10 | — | Chooser + status lookup copy/state | unit | `npx vitest run src/features/request` | W0 | pending |
| 08-04-01 | 04 | 2 | IDEN-01 | — | Basic OCR returns id/nickname/job + power | unit (synthetic bands) | `npx vitest run src/features/submit/ocr/structure.test.ts` | W0 | pending |
| 08-04-02 | 04 | 2 | IDEN-01,02 | — | Identity validation + payload builder + role not auto-applied | unit | `npx vitest run src/features/submit` | W0 | pending |
| 08-04-03 | 04 | 2 | WHIT-08, IDEN-02 | — | Prospect wizard reusable without session | unit | `npx vitest run src/features/submit` | W0 | pending |
| 08-05-01 | 05 | 3 | WHIT-05,06,07, IDEN-03 | — | Personagens PIN state/filter/reset/new member/identity history | unit + build | `npm run build` | W0 | pending |
| 08-05-02 | 05 | 3 | WHIT-09, IDEN-03 | — | Solicitations/Identity boards, approve prefill, reject confirm | unit + build | `npm run build` | W0 | pending |
| 08-05-03 | 05 | 3 | IDEN-03 | — | Ranking ID/job/nickname/OVR + inline details | unit | `npx vitest run src/features/rank` | W0 | pending |
| 08-06-01 | 06 | 4 | WHIT-01..10, IDEN-01..03 | T-08-10 | Live migration + functions + legacy conversion + owner rotation | live smoke | `node scripts/smoke-identity.mjs` | W0 | pending |
| 08-06-02 | 06 | 4 | all | — | Zero regression across all prior smokes | live smoke | `node scripts/smoke-lifecycle.mjs && node scripts/smoke-officer.mjs && node scripts/smoke-rls.mjs` | existing | pending |

*Status: pending → green → red → flaky*

---

## Wave 0 Requirements

- [ ] `src/features/auth/PinBoxes.test.tsx` — PIN-box interaction contract (D-02)
- [ ] `src/features/request/requestValidation.test.ts` — request field + stats validation (D-06/D-07/D-12)
- [ ] `src/features/submit/identity.test.ts` — identity validation/payload (IDEN-01)
- [ ] `src/features/submit/ocr/structure.test.ts` — extend existing basic grammar expectations
- [ ] `scripts/smoke-identity.mjs` — new live matrix (auth + requests + identity)
- [ ] `supabase/seeds/live/identity-proofs-storage.sql` — bucket + staff-only policies

*Existing infrastructure otherwise covers the phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First-access OCR on the real basic screenshot | IDEN-01, WHIT-02 | Real Tesseract metrics on a real image cannot be asserted reliably in CI | Open first access, upload `public/examples/basic.png`, confirm ID=32980, nickname=Ahrya, class=Gypsy, Power prefill |
| PIN boxes on mobile keyboard + paste | WHIT-02 (D-02) | Native numeric keyboard/paste behavior is device-specific | On a phone: 4 boxes advance, paste 4 digits fills all, backspace moves back, letters impossible |
| Staff Solicitations/Identidade visual review | WHIT-09, IDEN-03 | Visual board + proof thumbnail + inline stats layout | Seed a pending request + claim, open Validações, approve/reject, confirm/reject proof |
| Owner PIN reset + re-claim | WHIT-06 | Needs a real member + owner session | Reset a member in Personagens, verify login redirects to first access, claim again |
| Proof purge after decision | D-15 (IDEN/WHIT-09) | Storage object deletion is an ops behavior | After approve/reject/confirm, verify the object is gone from the `identity-proofs` bucket |
| Legacy placeholder conversion | WHIT-02, D-24 | Live data migration outcome | Login with a converted placeholder handle → routes to first access; owner login still works |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
