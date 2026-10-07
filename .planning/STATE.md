# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-07)

**Core value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.
**Current focus:** Phase 1 — Foundation (Secure Access & Data Model)

## Current Position

Phase: 1 of 6 (Foundation — Secure Access & Data Model)
Plan: 0 of 3 in current phase
Status: Ready to plan
Last activity: 2026-10-07 — Roadmap created (6 phases, 20 v1 requirements mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Custom JWT + PostgREST/RLS-claims wiring is MEDIUM confidence — day-one spike required before building on top
- [Phase 1]: OCR feasibility spike must run on 10 real guild screenshots (Portuguese locale, `1.234.567` separators) → go/no-go pivot threshold ~70% field accuracy
- [Phase 2]: Storage policy nuance (compressed thumbnail ~30–80 KB WebP latest-only vs full originals) — decide during Phase 2 planning
- [Phase 3]: Percentile formula spec (rank-based, tie handling, insufficient-data states) must be written and unit-tested before UI shows points
- [Phase 5]: OCR confidence threshold (~85) and sanity-range rules need real-data calibration; inherits Phase 1 spike results

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-10-07
Stopped at: Roadmap created — Phase 1 ready to plan
Resume file: None

---
*v1 milestone: Phases 1-6 (v2 deferred items: delta badges, history view, officer guild-health dashboard, catalog self-service, OCR confidence surfacing, shareable PNG export)*
