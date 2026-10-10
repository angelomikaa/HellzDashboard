---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: "03-04 COMPLETE — owner UAT approved; Ahrya cleaned from live DB; owner-only-class todo recorded; RNK-01/RNK-02 marked complete; phase ready for orchestrator verification"
last_updated: "2026-10-10T08:05:00.000Z"
last_activity: 2026-10-10
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-07)

**Core value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.
**Current focus:** Phase 03 — rank-engine

## Current Position

Phase: 03 (rank-engine) — EXECUTING
Plan: 4 of 4
Status: Phase complete — ready for verification
Last activity: 2026-10-10

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 15
- Average duration: 36min
- Total execution time: 535min (8h55m)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 P01 | 1 | 19min | 19min |
| 01 P02 | 1 | 47min | 47min |
| 01 P03 | 1 | 38min | 38min |
| 01 P04 | 1 | 2h51min | 2h51min |
| 02 P01 | 1 | 33min | 33min |
| 02 P02 | 1 | 20min | 20min |
| 02 P03 | 1 | 2h07min | 2h07min |
| 1 | 4 | - | - |
| 02 | 3 | - | - |

**Recent Trend:**

- Last 4 plans: 01-03 (38min), 02-01 (33min), 02-02 (20min), 02-03 (2h07min wall — active execution ~30min; remainder was the owner UAT checkpoint wait)
- Trend: execution remains fast (02-03 active work ≈30min); plan-level wall time inflated only by the deliberate owner-verification checkpoint

| Phase 03 P01 | 8min | 2 tasks | 2 files |
| Phase 03 P02 | 55min | 2 tasks | 4 files |
| Phase 03 P03 | 37min | 3 tasks | 2 files |
| Phase 03 P04 | 1h20min wall (active ~25min; rest was owner UAT wait) | 3 tasks | 4 files |

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
- [Phase 02-03]: Owner UAT APPROVED — steps 1–5 and 8 walked in a real browser; steps 6–7 (DevTools leak-check, direct-abuse select=*) were NOT manually performed (owner didn't know how) and are dispositioned as covered-by-automated-evidence: 02-01 live smoke matrix (select=* fails permission-denied, pin_hash ungranted, no client-visible pin_hash) + 02-03 no-upload grep gate
- [Phase 02-03]: The 5 planner-discretion calls (02-RESEARCH §6) are RATIFIED by the owner's UAT approval: no server-side screenshot storage (D-10), char_function tank/dps only, General+Quasi required / Especial optional, pt-BR short-form catalog labels, combat_power as a manual intro-step input
- [Phase 02-03]: Example shots ship as placeholder SVGs in git (public/examples/*.svg); owner acknowledged and replaces them with real screenshots pre-launch (own call whether the real files enter git)
- [Phase 03-01]: Tie handling CONFIRMED as average-rank semantics (03-CONTEXT discretion resolved) — tied players get the average of their occupied positions' points; locked by worked examples 74.25 (top-tie of 3), 49.5 (mid-tie of 4), 49.5 (all-tied)
- [Phase 03-01]: rankMath.ts is the executable SPEC only — production rank truth stays in Postgres RPCs (03-03), no UI may import it to compute points; RNK-03/04/05 stay Pending until the live RPC smoke matrix passes (AUTH-01/01-01 precedent)
- [Phase 03-02]: 0007's exists-subquery-on-members staff policies hit Postgres 42P17 infinite recursion LIVE (02-REVIEW CR-01's proposed SQL was itself defective) — fixed by 0008 SECURITY DEFINER helper is_active_staff_member(); staff policies rebuilt on it; policy-time caller lookups on the SAME table must ALWAYS go through a definer function
- [Phase 03-02]: CR-01 closed live (deactivated-staff probe: 0 rows + denied insert with a valid 7-day token = D-14 invariant) and CR-02 closed live (fixed verify-pin redeployed, every smoke login proves it = D-15 repo==live); 0007+0008 pushed, RLS SMOKE PASSED 15/15
- [Phase 03-02]: RNK-02 stays Pending by traceability — this plan was D-14/D-15 precondition hardening; RNK-02 completes in 03-03 (server leak-probes) + 03-04 (UI side)
- [Phase 03-03]: Rank engine live (0009 — plan said 0008, taken by 03-02): set_key_stat (advisory-lock block-at-7), my_report, class_top5 all SECURITY DEFINER with member_role+active gates; RANK SMOKE PASSED 27/27 exact-value on first run + second consecutive run (no residue); RLS regression 19/19 green
- [Phase 03-03]: Plan's rank fixture was internally contradictory — 74.25 is the locked tie-at-TOP value; sp fixture corrected to {80,80,50} so a/b tie at top and c's OVR is 87 (mean 74.25), not 95; a's live point vector equals the rankMath.test.ts OVR-61 vector [0,74.25,0,49.5,0,0] exactly; SQL and TS spec now provably agree to the decimal
- [Phase 03-03]: RNK-03/04/05 marked complete (live exact-value proof); RNK-01/RNK-02 stay Pending by traceability — server-side enforcement live-proven, completion in 03-04 (admin toggle UI + UI-side leak-proof), REG-02 precedent
- [Phase 03-04]: KeyStatsPage group headings use the wizard's real labels (Geral/Quasi/Especial) — the plan's parenthetical ("General/Quasi-Stats/Especial") contradicted its own binding instruction to match the wizard's group headings; wizard consistency wins (D-04 mirrors the wizard)
- [Phase 03-04]: api.ts wrappers + Stats-Chave page committed (81c47f3, 0e818c2); awaiting owner browser walk (5 checkpoint steps) before SUMMARY + plan completion
- [Phase 03-04]: Owner UAT APPROVED all 5 Stats-Chave checkpoint steps in a real browser — RNK-01 end-to-end TRUE; RNK-01/RNK-02 marked complete (server side 03-03, UI side 03-04)
- [Phase 03-04]: Stray class "Ahrya" (accidentally created by the owner while exploring the Personagens tab during UAT) removed from the live DB via direct SQL through the Management API database/query endpoint (legacy /v1) — data hygiene, not a feature; no UI delete path added; zero FK dependents and zero orphaned class_key_stats rows verified before/after
- [Phase 03-04]: Owner directive from UAT — adding new classes is a STRUCTURAL change and must be owner-only (officers must never be able to add classes); recorded as pending todo .planning/todos/pending/owner-only-class-management.md for a future phase (server-side policy change + UI gating), NOT implemented in Phase 3

### Pending Todos

- [owner-only-class-management](todos/pending/owner-only-class-management.md) — restrict class creation to the owner handle only (officers must not add classes — structural change); sourced from the 03-04 owner UAT; planner to place in a future phase

### Blockers/Concerns

- ~~[Phase 1]: Custom JWT + PostgREST/RLS-claims wiring is MEDIUM confidence~~ PROVEN 01-02 (see Decisions); operational caution: do NOT revoke signing key 6f7657c3 (standby) — revoking it kills every member session instantly
- ~~[Phase 1]: OCR feasibility spike must run on 10 real guild screenshots (Portuguese locale, `1.234.567` separators) → go/no-go pivot threshold ~70% field accuracy~~ RESOLVED 01-04: GO — 222/222 fields, 100.0% vs ~70% threshold (see OCR-SPIKE-RESULTS.md and Decisions)
- [Phase 1]: Owner should rotate the Supabase access token used for deploys, and rotate placeholder whitelist rows/PINs before inviting real members (see 01-USER-SETUP.md) — credentials/hashes remain recoverable from git history (WR-06)
- ~~[Phase 1 → live deploy]: Push migrations 0003 (lockout RPC + handle length constraints) and 0004 (RLS active checks) to the live project~~ CLEARED 02-01 (2026-10-09): 0003/0004 pushed live together with 0005/0006 via `db push`. ~~REMAINING: redeploy verify-pin — ⚠ BLOCKED: local `verify-pin/index.ts` line 58 references undefined `discordHandle`~~ CLEARED 03-02 (2026-10-10): line-58 fix (`body.discord_handle`) deployed via `functions deploy verify-pin`; logins re-proven live by the smoke matrix (D-15). REMAINING: confirm CR-01 atomicity live (parallel wrong-PIN requests → monotonic counter, lock at 5) — see 01-REVIEW-FIX.md
- ~~[Phase 2]: Storage policy nuance resolved in planning (02-RESEARCH §3.1): no server-side screenshot storage at all (D-10) — awaiting owner ratification with the other discretion calls~~ RATIFIED 02-03 (2026-10-09): owner approved the walked flow with zero upload paths; all 5 discretion calls ratified (see Decisions)
- [Pre-launch]: Owner must replace public/examples/*.svg placeholder example shots with real game screenshots (acknowledged at 02-03 UAT step 8) before inviting real members
- [Phase 5]: OCR confidence threshold (~85) and sanity-range rules need production-data calibration — spike delivered GO (100.0% on 11 owner-device samples) but device fragmentation is NOT covered; region maps are game-UI-versioned (re-run spike to recalibrate); dual-polarity read and manual fix-up are mandatory
- ~~[Phase 3 / 03-02]: Task 2 Step B (deploy 0007 + verify-pin, live smoke) BLOCKED: SUPABASE_ACCESS_TOKEN missing from session env~~ CLEARED 03-02 (2026-10-10): owner supplied the token as a session env var (never on disk/commit/echo) — 0007 pushed, recursion caught and fixed via 0008, verify-pin redeployed, RLS SMOKE PASSED 15/15. Owner should rotate the deploy token now the deploy is done (standing action)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-10-10 (03-04 owner UAT approved + live-DB cleanup + plan closed)
Stopped at: 03-04 COMPLETE — owner approved the Stats-Chave page; "Ahrya" cleaned from live DB; owner-only-class-management recorded as a pending todo; RNK-01/RNK-02 marked complete. Phase 3 ready for /gsd-verify-work (orchestrator owns it).
Resume file: None

---
*v1 milestone: Phases 1-6 (v2 deferred items: delta badges, history view, officer guild-health dashboard, catalog self-service, OCR confidence surfacing, shareable PNG export)*
