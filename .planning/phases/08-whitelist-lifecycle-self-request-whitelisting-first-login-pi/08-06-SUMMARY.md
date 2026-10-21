---
phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi
plan: 06
subsystem: infra
tags: [legacy-conversion, smoke, regression, planning-truth]
requires:
  - phase: 08-05
    provides: staff lifecycle surfaces + identity display
provides:
  - Legacy claim conversion seed (idempotent, owner+dummies excluded, lockout reset)
  - Full regression battery green (build, lint, 520 tests, 7 smoke suites)
  - Planning truth updated (STATE/ROADMAP/REQUIREMENTS)
affects: [phase-9]
tech-stack:
  added: []
  patterns: [idempotent-data-seed, out-of-band-owner-rotation]
key-files:
  created:
    - supabase/seeds/live/legacy-claim-conversion.sql
  modified:
    - scripts/smoke-identity.mjs (residue cleanup only, no new probes)
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
key-decisions:
  - "Legacy conversion excludes role=owner and dummy-% handles; deletes lockout rows for converted handles"
  - "Owner PIN rotated out-of-band (never committed); member-handle/officer-handle re-claimed with the test PIN so prior smokes stay green"
  - "Identity is never backfilled: each member claims their own char ID on first access"
requirements-completed: [WHIT-01, WHIT-02, WHIT-03, WHIT-04, WHIT-05, WHIT-06, WHIT-07, WHIT-08, WHIT-09, WHIT-10, IDEN-01, IDEN-02, IDEN-03]
# Metrics
duration: ~60min
completed: 2026-10-21
---

# Phase 8: Whitelist Lifecycle — Summary (Plan 06)

**Phase 8 closed: legacy roster converted to self-service claims, full regression battery green, planning truth updated; phase left pending /gsd-verify-work.**

## Performance

- **Duration:** ~60 min
- **Tasks:** 4 (seed authoring + apply, E2E smoke, full battery, planning truth)
- **Files modified:** 5
- **Tests:** 520 passing (34 files); smoke-identity 117/117 twice; rls/lifecycle/officer/promotion/rank/card all green

## Accomplishments

- Authored and applied `supabase/seeds/live/legacy-claim-conversion.sql`: 1 officer handle unclaimed, 72 dummy handles + owner intact, lockout rows cleared, idempotent (second apply 0 rows)
- Re-claimed `member-handle`/`officer-handle` with the test PIN so prior-phase smokes stay green
- Ran the full battery: build, lint (0 errors), 520 tests, smoke-rls, smoke-lifecycle, smoke-officer, smoke-promotion, smoke-rank, smoke-card, smoke-identity (117/117 twice, zero residue)
- Updated STATE.md, ROADMAP.md, REQUIREMENTS.md to reflect Phase 8 completion (6/6 plans, pending verification)

## Task Commits

1. **task 1: legacy conversion seed** - `feat(08-06)` (seed authored)
2. **task 2: apply conversion** - applied via apply-seed.mjs (data only, no commit)
3. **task 3: E2E smoke** - smoke-identity 117/117 twice (already in 08-02)
4. **task 4: battery + planning truth** - docs commit

## Decisions Made

- Legacy conversion excludes role=owner and dummy-% handles; deletes lockout rows for converted handles
- Owner PIN rotation is out-of-band (never committed); documented as pending owner action
- Identity is never backfilled: each member claims their own char ID on first access
- member-handle/officer-handle re-claimed with the test PIN to keep prior smokes green (test fixtures, not real members)

## Deviations from Plan

- Owner PIN rotation not applied by the agent (requires the owner's chosen PIN); recorded as pending owner action. The owner must run scripts/hash-pin.mjs locally and apply the one-off update via apply-seed.mjs, then delete the temp file.
- smoke-rls/officer/promotion/rank/card/lifecycle needed no code changes; only member-handle/officer-handle re-claim was required post-conversion.

## Issues Encountered

- Pre-run smoke residue (smoke_idn_cls FK, member_identity_history FK) required manual cleanup before smoke-identity could run.
- Management API transient 500 ("Failed to check user auth status") resolved on retry.

## Next Phase Readiness

- Phase 8 implementation complete; all smokes green; ready for /gsd-verify-work.
- Phase 9 (Fine Ranks) can proceed: identity foundation is live.

---
*Phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi*
*Completed: 2026-10-21*
