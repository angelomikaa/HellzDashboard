# Roadmap: NeoFoot — Guild Stats Panel

## Overview

NeoFoot delivers the core loop — register → submit → see standing → improve — in six phases. Security and data foundations come first (RLS-ready Supabase schema + per-player PIN auth + OCR feasibility spike), then manual data ingestion works end-to-end even without OCR, then the rank engine computes trustworthy percentiles and OVR in Postgres, then members get their dashboard and improvement screen (the core value), then OCR is layered on as a pre-fill accelerator, and finally officer tools and the promotion page complete the trust-and-celebration loop. Every v1 requirement maps to exactly one phase; the panel is usable and launchable even if OCR accuracy proves insufficient (manual entry is the designed fallback).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation — Secure Access & Data Model** - Supabase schema + RLS, per-player PIN auth, project scaffolding, OCR feasibility spike
- [ ] **Phase 2: Registry, Catalog & Manual Data Ingestion** - Character registry, stat catalog, guided 3-screenshot upload with manual entry + fix-up gate
- [ ] **Phase 3: Rank Engine** - Postgres RPCs: per-stat percentile (top 1% = 99 pts) + OVR from 6 hidden key stats, floor 51
- [ ] **Phase 4: Member Dashboard & Improvement Screen** - Mobile-first stat cards (bronze→platinum), per-stat comparison, aggregates-only privacy
- [ ] **Phase 5: OCR Auto-Read Layer** - Tesseract.js client-side pre-fill bolted onto the working submit wizard, mandatory review retained
- [ ] **Phase 6: Trust & Celebration — Officer Tools & Promotion Page** - Officer validation queue, role management, EAFC-style promotion page

## Phase Details

### Phase 1: Foundation — Secure Access & Data Model
**Goal**: Whitelisted guild members can securely access the panel on an RLS-ready schema, and OCR feasibility is decided with real data before anything is built on it.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):
  1. A whitelisted member can log in with their personal 4-digit PIN (stored hashed), stay logged in across page reloads, and log out
  2. A player not on the guild whitelist cannot access any panel data — blocked at the server (RLS), not just hidden in the UI; crafted API/DevTools requests fail too
  3. Repeated wrong PIN attempts trigger server-side rate limiting/lockout (4-digit PINs are brute-forceable without it)
  4. OCR feasibility spike completed: round-trip test on 10 real guild screenshots with a documented go/no-go accuracy decision (pivot threshold ~70% field accuracy)
**Plans**: 4 plans

Plans:

**Wave 1** *(blocked on nothing — first phase)*
- [x] 01-01-PLAN.md — Project scaffolding (React 19 + Vite + TypeScript + Tailwind v4 + Supabase client, env-driven per D-11) + schema migrations (members, stat_catalog, submissions, submission_stats, class_key_stats, pin_login_attempts — append-only, EAV) + whitelist seed with bcrypt-hashed PINs (D-01–D-05, D-10–D-13)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02-PLAN.md — RLS policies on every table (members own-rows-only, class_key_stats deny-all, append-only submissions) + `verify-pin` Edge Function with custom-claim JWT (7-day, D-06) + server-side lockout 5→15 min (D-07) + end-to-end auth smoke test (the day-one spike)
- [x] 01-04-PLAN.md — OCR feasibility spike — committed Node script on 10 real screenshots from gitignored `.secrets/ocr-samples/` (D-08–D-10), go/no-go decision documented vs ~70% threshold

**Wave 3** *(blocked on Wave 2 — login UI verifies against the deployed verify-pin function)*
- [ ] 01-03-PLAN.md — PIN login UI (Discord handle + 4-digit PIN, D-01) + 7-day localStorage session with silent expiry + logout (D-06), verified in a real browser

Cross-cutting constraints: "PINs stored hashed, never plaintext" (D-03, in 01-01 seed + 01-02 verify-pin); "screenshots/member data never enter git or Supabase Storage" (D-10, in 01-01 gitignore + 01-04); "guards are UX only — enforcement is RLS" (01-02 + 01-03)

### Phase 2: Registry, Catalog & Manual Data Ingestion
**Goal**: Players can register and submit their stat data through a guided flow that works end-to-end even when OCR is unavailable — the ingestion data model and fix-up gate must be correct before OCR is layered on.
**Depends on**: Phase 1
**Requirements**: REG-01, REG-02, REG-03, INPT-01, INPT-03, INPT-04
**Success Criteria** (what must be TRUE):
  1. Admin can register a character with name, class, and function/role (tank vs DPS), and add new classes as Ragnarok Origin adds them
  2. Stat catalog covers all 3 groups (General Stats, Quasi-Stats, Special) with ~50+ stats labeled FLAT or PERCENTUAL
  3. Player can complete a guided 3-screenshot upload (General, Quasi, Special) with example shots shown beside input boxes, manually enter/fix all values, and the submission is rejected until the mandatory review confirms the values
  4. Submissions are stored append-only — a resubmission creates a new record rather than overwriting (source of truth for ranks and future deltas)
**Plans**: TBD
**UI hint**: yes

### Phase 3: Rank Engine
**Goal**: The panel computes trustworthy, admin-tweakable ranks — per-stat percentiles within class+function and an OVR from 6 hidden key stats — entirely in Postgres so key-stat config never reaches members.
**Depends on**: Phase 2 (ranks need real validated submissions to compute against)
**Requirements**: RNK-01, RNK-02, RNK-03, RNK-04, RNK-05
**Success Criteria** (what must be TRUE):
  1. Admin can toggle exactly 6 key stats per class; each class has an independent set
  2. Key-stat configuration never crosses the API boundary to members — network inspection/DevTools does not leak which stats are key (enforced server-side via SECURITY DEFINER RPCs + RLS)
  3. OVR is computed from the 6 key stats of the player's class with a normalization floor of 51 (never below 51); changing key stats via toggle instantly reflects in computed ranks (compute-on-read)
  4. Per-stat percentile within same class+function uses rank-based points `(count_below / (n-1)) × 99` with explicit tie handling, and shows an "insufficient data" state when too few validated players exist per class
**Plans**: TBD

Plans:
- [ ] 03-01: Percentile + OVR formula spec written as pure functions with unit tests (rank-based, tie handling, insufficient-data states) before any UI shows points
- [ ] 03-02: `compute_ranks()` / `compute_overall()` / guild-average Postgres RPCs (compute-on-read, SECURITY DEFINER with internal role checks)

### Phase 4: Member Dashboard & Improvement Screen
**Goal**: Each player sees, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards. (Core value delivered here.)
**Depends on**: Phase 3 (cards are pure presentations of rank RPC outputs)
**Requirements**: CMP-01, CMP-02, CMP-03, SHWC-01
**Success Criteria** (what must be TRUE):
  1. Player sees their own mobile-first responsive dashboard with tiered stat cards (bronze for mediocre, silver for mildly elevated, gold for highly elevated, platinum for top of the class — own visual identity)
  2. Each stat card shows the player's value, guild average for their class, best in guild, and percentile position (e.g. "you're in the bottom 30% of Assassins for CRIT")
  3. Members see aggregates only — no other individual player's values are accessible via UI or API (the promotion page in Phase 6 is the only sanctioned view of top players)
**Plans**: TBD
**UI hint**: yes

### Phase 5: OCR Auto-Read Layer
**Goal**: OCR pre-fills stat values to reduce input friction — bolted onto the already-working submit wizard as an accelerator, never a silent authority; the mandatory review gate remains.
**Depends on**: Phase 2 (submit wizard + fix-up form exist) and Phase 1 (OCR spike go/no-go decision)
**Requirements**: INPT-02
**Success Criteria** (what must be TRUE):
  1. Uploading a screenshot auto-pre-fills stat values via region-based client-side OCR with digit/percent whitelisting and canvas preprocessing (never whole-image recognition)
  2. Player must review and fix pre-filled values before the submission is accepted — OCR misreads cannot slip through silently (fix-up gate applies to OCR output)
  3. OCR works in the production build (worker/core path bundling verified on Vite), is lazy-loaded so it doesn't slow initial page load, and manual entry still works fully when OCR fails
**Plans**: TBD
**UI hint**: yes

### Phase 6: Trust & Celebration — Officer Tools & Promotion Page
**Goal**: Officers keep the ranks trustworthy (validate/remove players and registers) and the guild's best players are celebrated on a promotion page with EAFC-style cards.
**Depends on**: Phase 3 (rank RPCs) and Phase 4 (submission lifecycle must exist for the validation loop)
**Requirements**: AUTH-03, AUTH-04, AUTH-05, SHWC-02
**Success Criteria** (what must be TRUE):
  1. Owner can grant or revoke the officer (admin) role manually
  2. Officer can validate or reject submitted registers before they count toward ranks
  3. Officer can remove players, revoking their panel access — removed players can no longer log in, and players from other guilds remain blocked
  4. A separate promotion page shows the guild's top players as EAFC-style cards featuring their key stats
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Secure Access & Data Model | 3/4 | In Progress | - |
| 2. Registry, Catalog & Manual Data Ingestion | 0/2 | Not started | - |
| 3. Rank Engine | 0/2 | Not started | - |
| 4. Member Dashboard & Improvement Screen | 0/2 | Not started | - |
| 5. OCR Auto-Read Layer | 0/2 | Not started | - |
| 6. Trust & Celebration — Officer Tools & Promotion Page | 0/2 | Not started | - |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 6 | Pending |
| AUTH-04 | Phase 6 | Pending |
| AUTH-05 | Phase 6 | Pending |
| REG-01 | Phase 2 | Pending |
| REG-02 | Phase 2 | Pending |
| REG-03 | Phase 2 | Pending |
| INPT-01 | Phase 2 | Pending |
| INPT-02 | Phase 5 | Pending |
| INPT-03 | Phase 2 | Pending |
| INPT-04 | Phase 2 | Pending |
| RNK-01 | Phase 3 | Pending |
| RNK-02 | Phase 3 | Pending |
| RNK-03 | Phase 3 | Pending |
| RNK-04 | Phase 3 | Pending |
| RNK-05 | Phase 3 | Pending |
| CMP-01 | Phase 4 | Pending |
| CMP-02 | Phase 4 | Pending |
| CMP-03 | Phase 4 | Pending |
| SHWC-01 | Phase 4 | Pending |
| SHWC-02 | Phase 6 | Pending |

**Coverage: 22/22 requirement-to-phase mappings complete (20 unique v1 requirements, no orphans, no duplicates) ✓**

## Key Decisions Logged at Roadmap Time

- **Per-player PIN confirmed**: REQUIREMENTS.md AUTH-01 specifies a personal 4-digit PIN (stored hashed), resolving the shared-PIN vs per-player-PIN conflict flagged by research. Schema uses per-player identity from day one.
- **Manual ingestion before OCR**: Phases 2 and 5 are deliberately split — the fix-up form and data model are identical with or without OCR, so launch is never bet on OCR accuracy.
- **Compute-on-read ranks**: Percentiles and OVR live in Postgres RPCs (not submit-time triggers), so admin key-stat tweaks apply instantly with no invalidation bugs.
- **Rank engine before dashboards**: Cards, badges, and the promotion page are pure presentations of Phase 3 RPC outputs.

---
*Roadmap created: 2026-10-07*
