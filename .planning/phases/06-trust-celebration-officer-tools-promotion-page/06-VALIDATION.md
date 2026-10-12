---
phase: 6
slug: trust-celebration-officer-tools-promotion-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-12
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (unit, `npm test`) + live smoke scripts (Node, `scripts/smoke-*.mjs`) |
| **Config file** | vitest in package.json (`"test": "vitest run"`) — no separate config needed |
| **Quick run command** | `npm test && npx tsc -b` |
| **Full suite command** | `npm test` + `node scripts/smoke-rls.mjs` + `node scripts/smoke-rank.mjs` + `node scripts/smoke-officer.mjs` (new) |
| **Estimated runtime** | ~30s unit + ~60s smokes (live) |

SQL/RLS behavior is proven by live smoke scripts (established convention — no DB test harness exists; 02-01/03-03/05-02 precedent).

---

## Sampling Rate

- **After every task commit:** Run `npm test && npx tsc -b`
- **After every plan wave:** Run full smoke matrix (officer/promotion + smoke-rls + smoke-rank), twice consecutively with no residue (WR-06/05-02 discipline)
- **Before `/gsd-verify-work`:** Full suite must be green + owner browser UAT (Validações walk, Destaques walk, Personagens owner controls)
- **Max feedback latency:** 60 seconds

---

## Per-task Verification Map

| task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | AUTH-05 | T-06-01 | Queue RPC returns all pending rows w/ 57 values for staff; member/anon denied | live smoke | `node scripts/smoke-officer.mjs` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | AUTH-05 | T-06-02 | pending→validated raises my_report points; pending→rejected removes from cohort (compute-on-read) | live smoke | `node scripts/smoke-officer.mjs` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | AUTH-05 | T-06-02 | member CANNOT set statuses; non-pending row → `not_pending`; own-discard policy still one-transition | live smoke | `node scripts/smoke-officer.mjs` + `node scripts/smoke-lifecycle.mjs` | ❌/✅ | ⬜ pending |
| 06-0X-XX | XX | X | AUTH-03 | T-06-03 | owner RPC grants/revokes officer; officer call → forbidden; role effective at next login | live smoke | `node scripts/smoke-officer.mjs` | ❌ W0 | ⬜ pending |
| 06-0X-XX | XX | X | AUTH-04 | T-06-04 | deactivation → token denied everywhere; reactivation → access restored; rows leave/return to cohort | live smoke | `node scripts/smoke-officer.mjs` | ❌ W0 | ⬜ pending |
| 06-0X-XX | XX | X | AUTH-04 | T-06-05 | owner rows untouchable; officer cannot touch officer targets | live smoke | `node scripts/smoke-officer.mjs` | ❌ W0 | ⬜ pending |
| 06-0X-XX | XX | X | SHWC-02 | T-06-06 | member `get_promotion()` returns top-5-by-OVR cards; anon denied; class_top5 staff-only unchanged | live smoke | `node scripts/smoke-promotion.mjs` | ❌ W0 | ⬜ pending |
| 06-0X-XX | XX | X | SHWC-02 | T-06-07 | key-stat leak probe: member promotion response contains ZERO class key-stat stat_keys, no is_key-like fields | live smoke | `node scripts/smoke-promotion.mjs` | ❌ W0 | ⬜ pending |
| 06-0X-XX | XX | X | SHWC-02 | — | D-13: class with insufficient data → section omitted | live smoke | `node scripts/smoke-promotion.mjs` (fixture class) | ❌ W0 | ⬜ pending |
| 06-0X-XX | XX | X | (folded todo) | T-06-08 | owner-only classes: officer POST /classes denied; owner allowed; smoke-rls check 7 flipped | live smoke | `node scripts/smoke-rls.mjs` (extended) | ✅ extend | ⬜ pending |
| — | — | — | (regression) | — | my_report/class_top5 v3: no rank regression | live smoke | `node scripts/smoke-rank.mjs` (27/27 exact-value) | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*(task IDs filled by planner — every task must appear here or carry its own automated verify)*

---

## Wave 0 Requirements

- [ ] `scripts/smoke-officer.mjs` — queue/transition/role/removal probes (fixture discipline per smoke-lifecycle: throwaway members via Management API seed or direct insert, bcrypt PIN 1234, try/finally cleanup, twice-consecutive-pass)
- [ ] `scripts/smoke-promotion.mjs` — member-boundary + key-stat leak probes
- [ ] smoke-rls.mjs check 7 flip (owner-only classes) + officer-still-blocked-after-role-rpc probes
- [ ] Env gate: SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF as session env vars (deploy + smoke both need them)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Validações queue walk: officer reviews 57-value read-only view, validates/rejects, sees empty state | AUTH-05 | Visual/UX judgment | `npm run preview` → officer login → Validações tab → walk queue → validate one, reject one → verify member history shows "Rejeitada" and ranks auto-revert |
| Promotion page (Destaques) walk: per-class top-5 EAFC cards, tier styling, insufficient-data classes hidden | SHWC-02 | Visual/UX judgment | Member login → Destaques tab → verify card contents (OVR, 6 stats, tier palette), no key-stat labels |
| Personagens owner controls: grant/revoke officer, remove/reactivate member, owner-only add-class | AUTH-03/04 | Visual/UX judgment + cross-session effects | Owner login → Personagens → role controls visible only for owner; officer login sees them absent; add-class blocked for officer (UI + server) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
