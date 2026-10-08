---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: 01-04 task 2 checkpoint (human-action) — awaiting 10 real screenshots in .secrets/ocr-samples/ + expected.json
last_updated: "2026-10-08T20:15:00Z"
last_activity: 2026-10-08
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 4
  completed_plans: 2
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-07)

**Core value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.
**Current focus:** Phase 01 — foundation-secure-access-data-model

## Current Position

Phase: 01 (foundation-secure-access-data-model) — EXECUTING
Plan: 3 of 4
Status: Ready to execute 01-03 (LoginPage — consumes verify-pin contract)
Last activity: 2026-10-08

Progress: [█████░░░░] 50%

## Performance Metrics

**Velocity:**

- Total plans completed: 2
- Average duration: 33min
- Total execution time: 66min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 P01 | 1 | 19min | 19min |
| 01 P02 | 1 | 47min | 47min |

**Recent Trend:**

- Last 5 plans: 01-01 (19min), 01-02 (47min)
- Trend: —

*Updated after each plan completion*

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

### Pending Todos

None yet.

### Blockers/Concerns

- ~~[Phase 1]: Custom JWT + PostgREST/RLS-claims wiring is MEDIUM confidence~~ PROVEN 01-02 (see Decisions); operational caution: do NOT revoke signing key 6f7657c3 (standby) — revoking it kills every member session instantly
- [Phase 1]: OCR feasibility spike must run on 10 real guild screenshots (Portuguese locale, `1.234.567` separators) → go/no-go pivot threshold ~70% field accuracy
- [Phase 1]: Owner should rotate the Supabase access token used for deploys, and rotate placeholder whitelist rows/PINs before inviting real members (see 01-USER-SETUP.md)
- [Phase 2]: Storage policy nuance (compressed thumbnail ~30–80 KB WebP latest-only vs full originals) — decide during Phase 2 planning
- [Phase 3]: Percentile formula spec (rank-based, tie handling, insufficient-data states) must be written and unit-tested before UI shows points
- [Phase 5]: OCR confidence threshold (~85) and sanity-range rules need real-data calibration; inherits Phase 1 spike results

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-10-08T20:15:00Z
Stopped at: 01-04 task 2 checkpoint (human-action) — spike script built+self-tested (commits 38a0710, 42c269a); awaiting the 10 real screenshots in .secrets/ocr-samples/, one screenshot's resolution, and expected.json (template: scripts/ocr-samples-expected.example.json)
Resume file: scripts/ocr-spike.mjs (run `node scripts/ocr-spike.mjs --info` once samples are placed; then calibrate scripts/ocr-regions.json, run the spike, write OCR-SPIKE-RESULTS.md)

---
*v1 milestone: Phases 1-6 (v2 deferred items: delta badges, history view, officer guild-health dashboard, catalog self-service, OCR confidence surfacing, shareable PNG export)*
