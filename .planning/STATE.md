---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "02-02 complete and committed (app tab shell + admin Personagens page: REG-01/REG-02 UI). Next: 02-03 (member submit wizard + owner UAT checkpoint). ⚠ Owner actions pending: redeploy verify-pin (BLOCKED on latent bug — see deferred-items.md), rotate seeded credentials, rotate deploy token"
last_updated: "2026-10-09T15:45:00.000Z"
last_activity: "2026-10-09 -- 02-02 executed (tab shell + admin Personagens page)"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 7
  completed_plans: 6
  percent: 86
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-07)

**Core value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.
**Current focus:** Phase 02 — registry-catalog-manual-data-ingestion

## Current Position

Phase: 02 (registry-catalog-manual-data-ingestion) — EXECUTING
Plan: 3 of 3
Status: 02-02 complete (tab shell + admin Personagens page: REG-01/REG-02 UI); next: 02-03 member submit wizard
Last activity: 2026-10-09 -- 02-02 executed (tab shell + admin Personagens page)

Progress: [████████--] 86%

## Performance Metrics

**Velocity:**

- Total plans completed: 10
- Average duration: 33min
- Total execution time: 328min (5h28m)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 P01 | 1 | 19min | 19min |
| 01 P02 | 1 | 47min | 47min |
| 01 P03 | 1 | 38min | 38min |
| 01 P04 | 1 | 2h51min | 2h51min |
| 02 P01 | 1 | 33min | 33min |
| 02 P02 | 1 | 20min | 20min |
| 1 | 4 | - | - |

**Recent Trend:**

- Last 4 plans: 01-04 (2h51min), 01-03 (38min), 02-01 (33min), 02-02 (20min)
- Trend: accelerating (02-02 shipped in 20min — UI-only plans on the proven data layer are fast)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table and ROADMAP.md.
Recent decisions affecting current work:

- [Roadmap]: Per-player hashed PIN confirmed (resolves research's shared-PIN conflict) — per-player identity from day one
- [Roadmap]: Manual ingestion (Phase 2) before OCR (Phase 5) — launch never bet on OCR accuracy
- [Roadmap]: Compute-on-read rank RPCs in Postgres (not submit-time triggers)
- [Roadmap]: Rank engine before dashboards — cards/badges/promotion are pure RPC presentations
- [Phase 01-01]: RLS enabled on all 6 tables in 0001_schema.sql (deny-all) so seeded members are never anon-readable before 01-02 policies arrive
- [Phase 01-01]: Owner approved placeholder whitelist seed (owner/officer/member handles, PIN 1234) to prove pipeline live; real members deferred
- [Phase 01-01]: Supabase Management API: legacy /v1 endpoints are the working ones (api-keys, database/query); /api/v1 serves HTML and fails silently
- [Phase 01-01]: AUTH-01/AUTH-02 left Pending: 01-01 is data foundation only; enforcement completes in 01-02/01-03
- [Phase 01-02]: Custom JWTs are signed HS256 with a registered project signing key (6f7657c3, standby) — the platform no longer exposes the legacy JWT secret anywhere, and SUPABASE_-prefixed function secret names are rejected; function env uses NEFOOT_JWT_SECRET/NEFOOT_JWT_KEY_ID + kid header
- [Phase 01-02]: Day-one auth spike PROVEN live: PostgREST accepts the custom-claim JWT, RLS returns only the caller's own row, class_key_stats deny-all holds
- [Phase 01-02]: /functions/v1 gateway requires BOTH apikey and Authorization: Bearer <anon> headers (supabase-js functions.invoke sends both)
- [Phase 01-02]: 5th wrong PIN returns 401 with attempts_remaining 0; the lock (429) engages on the NEXT attempt — including for the correct PIN
- [Phase 01-04]: OCR verdict: GO — 222/222 fields correct (100.0%) on 11 real guild screenshots vs ~70% pivot threshold; owner eye-validated all candidates; Phase 5 proceeds as planned (manual-entry fallback not triggered) — ROADMAP Phase 1 success criterion 4 decided with real data (D-08/D-09/D-10); caveats for Phase 5: device fragmentation not covered, region maps are UI-versioned, dual-polarity read required, manual fix-up stays mandatory
- [Phase 01-03]: AUTH-01 complete and owner-verified end-to-end — whitelisted member logs in with handle + 4-digit PIN, session persists across reloads, logout clears it; AUTH-02 closed retrospectively (proven live in 01-02: anon → [], no-auth → 401, own-row-only via JWT)
- [Phase 01-03]: UI rebranded to "Hellz" (subtitle "Painel Geral") per owner correction — NeoFoot was an abandoned folder name; internal identifiers (nefoot_session key, NEFOOT_JWT_SECRET, JWT issuer) deliberately kept to avoid breaking live deployed auth; full internal rename, if ever wanted, should be a dedicated maintenance pass
- [Phase 01-REVIEW-FIX]: CR-01 fixed via SECURITY DEFINER atomic RPC `record_pin_failure` (migration 0003_lockout_rpc.sql) — single count-and-lock, D-07 semantics preserved, frontend contract unchanged; verify-pin trusts only the RPC's returned count
- [Phase 01-REVIEW-FIX]: WR-02 fixed via migration 0004_rls_active.sql — RLS policies now check `active`, so deactivation revokes already-minted tokens (early AUTH-04 groundwork)
- [Phase 01-REVIEW-FIX]: CR-02 fixed via `isValidSession()` shape-validation + self-healing `loadSession()` — session API unchanged, 6 new hardening tests (41 total green)
- [Phase 02 planning]: 5 planner-discretion calls await owner ratification (02-RESEARCH §6, re-checked at 02-03 UAT checkpoint): no server-side screenshot storage · char_function limited to tank/dps · General+Quasi required / Special optional in wizard · catalog labels as pt-BR short forms · combat_power as manual intro-step input
- [Phase 02-01]: Deployed verify-pin JWT carries the guild role in the `member_role` claim (`role` = 'authenticated' is the PostgREST role-switch) — ALL role-based RLS policies must read `auth.jwt()->>'member_role'`; 0005's role-claim staff policies silently matched nothing until 0006 fixed them (caught live by the smoke matrix)
- [Phase 02-01]: Registry/catalog migration is 0005 + corrective 0006 (plan drafted 0003, taken by Phase 1 review fixes); 0003/0004/0005/0006 all pushed live 2026-10-09 — column grants + RLS compose: `select=*` on members fails BY DESIGN, clients must use explicit projections
- [Phase 02-02]: Personagens tab = UX-only gate on member_role (officer/owner) with the content render re-checking the role too — App stays mounted across logout/login, so a lingering staff tab can never leak the admin page to a member session; enforcement unchanged (staff RLS from 0005/0006)
- [Phase 02-02]: A character must have a class — the '—' select option is display-only and Salvar disables while it is selected (client-side block before updateCharacter); the edit form sends ONLY {display_name, char_class, char_function} and column grants remain the server-side backstop (T-02-10)

### Pending Todos

None yet.

### Blockers/Concerns

- ~~[Phase 1]: Custom JWT + PostgREST/RLS-claims wiring is MEDIUM confidence~~ PROVEN 01-02 (see Decisions); operational caution: do NOT revoke signing key 6f7657c3 (standby) — revoking it kills every member session instantly
- ~~[Phase 1]: OCR feasibility spike must run on 10 real guild screenshots (Portuguese locale, `1.234.567` separators) → go/no-go pivot threshold ~70% field accuracy~~ RESOLVED 01-04: GO — 222/222 fields, 100.0% vs ~70% threshold (see OCR-SPIKE-RESULTS.md and Decisions)
- [Phase 1]: Owner should rotate the Supabase access token used for deploys, and rotate placeholder whitelist rows/PINs before inviting real members (see 01-USER-SETUP.md) — credentials/hashes remain recoverable from git history (WR-06)
- ~~[Phase 1 → live deploy]: Push migrations 0003 (lockout RPC + handle length constraints) and 0004 (RLS active checks) to the live project~~ CLEARED 02-01 (2026-10-09): 0003/0004 pushed live together with 0005/0006 via `db push`. REMAINING: redeploy verify-pin — ⚠ BLOCKED: local `verify-pin/index.ts` line 58 references undefined `discordHandle` (would 500 every login once deployed — fix first, see 02 deferred-items.md); then confirm CR-01 atomicity live (parallel wrong-PIN requests → monotonic counter, lock at 5) — see 01-REVIEW-FIX.md
- [Phase 2]: Storage policy nuance resolved in planning (02-RESEARCH §3.1): no server-side screenshot storage at all (D-10) — awaiting owner ratification with the other discretion calls
- [Phase 3]: Percentile formula spec (rank-based, tie handling, insufficient-data states) must be written and unit-tested before UI shows points
- [Phase 5]: OCR confidence threshold (~85) and sanity-range rules need production-data calibration — spike delivered GO (100.0% on 11 owner-device samples) but device fragmentation is NOT covered; region maps are game-UI-versioned (re-run spike to recalibrate); dual-polarity read and manual fix-up are mandatory

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-10-09 (Phase 2 execution: 02-02 complete — app tab shell + admin Personagens page, REG-01/REG-02 UI)
Stopped at: 02-02 complete and committed. Next: 02-03-PLAN.md (member submit wizard: INPT-01/INPT-03 + visible append-only history; ends with owner browser UAT checkpoint that also spot-checks the 02-02 Personagens flows). ⚠ Owner actions pending: redeploy verify-pin (BLOCKED on latent bug — see deferred-items.md), rotate seeded credentials, rotate deploy token
Resume file: None

---
*v1 milestone: Phases 1-6 (v2 deferred items: delta badges, history view, officer guild-health dashboard, catalog self-service, OCR confidence surfacing, shareable PNG export)*
