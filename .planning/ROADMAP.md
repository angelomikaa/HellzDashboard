# Roadmap: NeoFoot — Guild Stats Panel

## Overview

NeoFoot delivers the core loop — register → submit → see standing → improve — in six phases. Security and data foundations come first (RLS-ready Supabase schema + per-player PIN auth + OCR feasibility spike), then manual data ingestion works end-to-end even without OCR, then the rank engine computes trustworthy percentiles and OVR in Postgres, then members get their dashboard and improvement screen (the core value), then OCR is layered on as a pre-fill accelerator, and finally officer tools and the promotion page complete the trust-and-celebration loop. Every v1 requirement maps to exactly one phase; the panel is usable and launchable even if OCR accuracy proves insufficient (manual entry is the designed fallback).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation — Secure Access & Data Model** - Supabase schema + RLS, per-player PIN auth, project scaffolding, OCR feasibility spike (completed 2026-10-09)
- [x] **Phase 2: Registry, Catalog & Manual Data Ingestion** - Character registry, stat catalog, guided 3-screenshot upload with manual entry + fix-up gate (completed 2026-10-09)
- [x] **Phase 3: Rank Engine** - Postgres RPCs: per-stat percentile (top 1% = 99 pts) + OVR from 6 hidden key stats, floor 51 (completed 2026-10-10)
- [x] **Phase 4: Member Dashboard & Improvement Screen** - Mobile-first stat cards (bronze→platinum), per-stat comparison, aggregates-only privacy (completed 2026-10-11)
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
- [x] 01-03-PLAN.md — PIN login UI (Discord handle + 4-digit PIN, D-01) + 7-day localStorage session with silent expiry + logout (D-06), verified in a real browser

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
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Migration 0003: classes table + members char columns + column-level security (pin_hash unreachable, closes Phase 1 gap) + staff RLS + atomic append-only `create_submission` RPC; 57-stat catalog seed (REG-03) + classes seed; live deploy + RLS smoke matrix; shared data layer (pt-BR parse/format + REST client, REG-02/INPT-04 foundation) *(executed as 0005 + corrective 0006 — 0003/0004 taken by Phase 1 review fixes; completed 2026-10-09)*
- [x] 02-02-PLAN.md — App tab shell + admin Personagens page: inline character registration (name/class/function, REG-01) + add-class UI (REG-02) *(completed 2026-10-09)*
- [x] 02-03-PLAN.md — Member submit wizard: guided 5-step flow with example shots beside inputs (INPT-01), mandatory review gate (INPT-03), visible append-only history (INPT-04); ends with owner browser UAT checkpoint *(completed 2026-10-09 — owner UAT approved; steps 6–7 covered by 02-01 automated smoke evidence)*

Cross-cutting constraints honored: screenshots never leave the player's device (D-10 — no uploads, no Storage bucket; STATE.md storage blocker resolved in 02-RESEARCH §3.1); class_key_stats untouched (deny-all until Phase 3, RNK-02); submissions start `pending` — no update path added (Phase 6 validates).

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
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md — Rank math executable spec: percentilePoints + ovrFromPoints pure functions with worked-example unit tests, TDD (RNK-03/04/05 formula; tie handling via average ranks confirmed, D-09/D-10/D-11/D-12)
- [x] 03-02-PLAN.md — Hardening debt folded in by owner decision: 0007 staff active-check migration (D-14/CR-01) + verify-pin line-58 fix + redeploy + live smoke reconcile with deactivated-staff probe (D-15/CR-02)
- [x] 03-03-PLAN.md — Migration 0008: set_key_stat (block-at-7, advisory lock), my_report, class_top5 SECURITY DEFINER RPCs + staff read policy on class_key_stats + live deploy + exact-value rank smoke matrix (RNK-01…05 server enforcement)
- [x] 03-04-PLAN.md — Key-stat admin page: Stats-Chave staff tab, class selector, grouped 57-stat chips, n/6 counter, top-5-by-OVR preview (RNK-01/02 UI) — ends with owner browser checkpoint

### Phase 4: Member Dashboard & Improvement Screen
**Goal**: Each player sees, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards. (Core value delivered here.)
**Depends on**: Phase 3 (cards are pure presentations of rank RPC outputs)
**Requirements**: CMP-01, CMP-02, CMP-03, SHWC-01
**Success Criteria** (what must be TRUE):
  1. Player sees their own mobile-first responsive dashboard with tiered stat cards (bronze for mediocre, silver for mildly elevated, gold for highly elevated, platinum for top of the class — own visual identity)
  2. Each stat card shows the player's value, guild average for their class, best in guild, and percentile position (e.g. "you're in the bottom 30% of Assassins for CRIT")
  3. Members see aggregates only — no other individual player's values are accessible via UI or API (the promotion page in Phase 6 is the only sanctioned view of top players)
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md — Data contract + presentation logic: shared group labels (groups.ts), fetchMyReport RPC wrapper + MyReport types, tier bands / 10%-step percentile phrase / focus-strip selection as TDD pure functions (D-01/D-02/D-09..D-12/D-16)
- [x] 04-02-PLAN.md — Leaf components to the approved UI-SPEC: StatCard (all 3 variants), OvrHero (insufficient + no-class), TierLegend, CollapsibleGroup, FocusStrip (D-03..D-08, D-14, D-15)
- [x] 04-03-PLAN.md — DashboardPage composition (fetch-on-mount state machine, empty state CTA, focus-jump) + App Painel wiring + owner browser UAT incl. DevTools single-call/key-stat leak proof (CMP-01..03 end-to-end)
**UI hint**: yes

### Phase 5: OCR Auto-Read Layer
**Goal**: OCR pre-fills stat values to reduce input friction — bolted onto the already-working submit wizard as an accelerator, never a silent authority; the mandatory review gate remains.
**Depends on**: Phase 2 (submit wizard + fix-up form exist) and Phase 1 (OCR spike go/no-go decision)
**Requirements**: INPT-02
**Success Criteria** (what must be TRUE):
  1. Uploading a screenshot auto-pre-fills stat values via region-based client-side OCR with digit/percent whitelisting and canvas preprocessing (never whole-image recognition)
  2. Player must review and fix pre-filled values before the submission is accepted — OCR misreads cannot slip through silently (fix-up gate applies to OCR output)
  3. OCR works in the production build (worker/core path bundling verified on Vite), is lazy-loaded so it doesn't slow initial page load, and manual entry still works fully when OCR fails
**Plans**: 3/5 plans executed

Plans:

**Wave 1** *(blocked on nothing — three parallel slices)*
- [x] 05-01-PLAN.md — Client OCR module (TDD port of the validated spike pipeline): percentage region maps generated from the committed calibration (D-01/D-19/D-21), hardcoded sanity ranges + confidence gate 85 (D-03/D-16/D-20), dual-polarity preprocessing pure functions, worker lifecycle with self-hosted worker/core assets, lazy-import chunk (criterion 3 build half)
- [x] 05-02-PLAN.md — Migration 0010 (append-only corrective): `discarded` status, one-pending-per-player rule in create_submission (D-11), rank cohort filters exclude discarded in my_report/class_top5 (D-12), pending→discarded-own-rows RLS policy, live push + lifecycle smoke (server-side half; officer queue stays Phase 6 per D-13)
- [x] 05-03-PLAN.md — Wizard realignment, manual-only: Especial required like Geral/Quasi (D-07, routed from Phase 3), combat_power still the only optional stat, per-step verification checkboxes on all four capture steps (D-08), edits uncheck stale confirmations, ReviewStep shrinks to tap-to-fix summary

**Wave 2** *(blocked on Wave 1 — 05-01 engine + 05-03 step engine)*
- [x] 05-04-PLAN.md — OCR capture UI + integration: upload CTA with locked string (D-09/D-10), skeleton/disabled running state (D-17), silent pre-fill + per-field failure message (D-04/D-14/D-16), re-upload replaces the step (D-15), optional aspect-locked crop with decline-cancels-read (D-05), graceful degradation (D-18), production-build lazy-chunk + self-hosted asset proof

**Wave 3** *(blocked on Wave 2 + 05-02 live)*
- [ ] 05-05-PLAN.md — Consolidated automated gate re-run + owner browser UAT with real screenshots (all 4 captures, crop trigger, failure message, DevTools: no image egress + lazy load only on first upload, manual-only path, Descartado lifecycle) — INPT-02 criteria closed owner-witnessed

Cross-cutting constraints: "screenshots never leave the player's device (D-10 — no FormData/upload anywhere; OCR entirely client-side)" (05-01, 05-04, 05-05); "OCR is never a silent authority — per-step human verification + server re-validation via create_submission (INPT-03)" (05-03, 05-04, 05-05); "submissions stay append-only — discard is a status mark only, rows never deleted or overwritten (INPT-04)" (05-02, 05-05).
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
**Plans**: 7 plans

Plans:

**Wave 1** *(blocked on nothing — server surfaces + client contracts in parallel)*
- [ ] 06-01-PLAN.md — Migration 0011 (append-only corrective): officer_queue + set_submission_status (AUTH-05), set_member_role owner-only (AUTH-03), set_member_active role-differentiated (AUTH-04), get_promotion member-invocable (SHWC-02), my_report/class_top5 v3 with active-member cohort filter (D-07), owner-only staff_insert_classes (folded todo); [BLOCKING] live push + rank smoke regression
- [ ] 06-03-PLAN.md — Contract-first data layer: 5 typed RPC wrappers + queue/promotion types + MemberRow.active in api.ts

**Wave 2** *(blocked on 06-01 push — smokes need the live schema)*
- [ ] 06-02-PLAN.md — Live smoke matrices: smoke-officer.mjs (queue/transitions/roles/removal/cohort), smoke-promotion.mjs (member boundary + key-stat leak diff + D-13 hiding), smoke-rls check-7 flip (owner-only classes); full matrix green twice consecutively

**Wave 3** *(blocked on 06-03 — UI slice)*
- [ ] 06-04-PLAN.md — Validações staff tab: shared ConfirmDialog + App.tsx two-tab wiring + ValidacoesPage (57-value read-only review, Validar/Rejeitar with confirm modal, stale-row recovery) (AUTH-05)

**Wave 4** *(blocked on 06-03 + 06-04 — HighlightsPage placeholder handoff + ConfirmDialog reuse)*
- [ ] 06-05-PLAN.md — Destaques promotion page: PromotionCard (EAFC card, tier palette, 6 facets) + HighlightsPage (per-class top-5 sections) (SHWC-02)
- [ ] 06-06-PLAN.md — Personagens owner controls: role grant/revoke + removal/reactivation via RPCs (role-differentiated per D-08: officers remove member rows, owner removes officers + grants roles), owner-only add-class gate (folded todo) (AUTH-03/AUTH-04)

**Wave 5** *(blocked on all — owner gate)*
- [ ] 06-07-PLAN.md — Consolidated automated gate re-run + owner browser UAT (Validações walk, Destaques walk + DevTools key-stat leak proof, Personagens owner controls, D-06 "Rejeitado" wording ratification)

Cross-cutting constraints: "key-stat identity never crosses the member API boundary — get_promotion serializes top-6-by-points stats only, never the key set (RNK-02, D-01/D-14; leak-diff smoke + DevTools UAT)" (06-01, 06-02, 06-05, 06-07); "append-only preserved — validate/reject/remove are status and active-flag marks, rows never deleted or overwritten (D-04/D-05/D-07)" (06-01, 06-02, 06-06); "all role/active gates read auth.jwt()->>'member_role' + active flag INSIDE SECURITY DEFINER RPCs — UI gating is UX-only (0006/0008 pattern)" (06-01, 06-02, 06-06); "role/active changes flow only through RPCs — role and pin_hash columns stay ungranted (0005 column security)" (06-01, 06-03, 06-06).
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Secure Access & Data Model | 4/4 | Complete    | 2026-10-09 |
| 2. Registry, Catalog & Manual Data Ingestion | 3/3 | Complete    | 2026-10-09 |
| 3. Rank Engine | 4/4 | Complete   | 2026-10-10 |
| 4. Member Dashboard & Improvement Screen | 3/3 | Complete   | 2026-10-11 |
| 5. OCR Auto-Read Layer | 3/5 | In Progress |  |
| 6. Trust & Celebration — Officer Tools & Promotion Page | 0/7 | Not started | - |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete (hardened via 01-REVIEW-FIX) |
| AUTH-02 | Phase 1 | Complete (hardened via 01-REVIEW-FIX) |
| AUTH-03 | Phase 6 | Pending |
| AUTH-04 | Phase 6 | Pending |
| AUTH-05 | Phase 6 | Pending |
| REG-01 | Phase 2 | Complete (02-02: Personagens inline registration UI on the safe projection; officer char PATCH live-proven by 02-01 smoke, owner browser sign-off at 02-03 UAT) |
| REG-02 | Phase 2 | Complete (02-01 live staff-only insert + 02-02 add-class UI with immediate dropdown refresh; owner browser sign-off at 02-03 UAT) |
| REG-03 | Phase 2 | Complete (02-01: 57 stats live, all 3 groups, FLAT/PERCENTUAL labeled) |
| INPT-01 | Phase 2 | Complete (02-03: guided 5-step wizard, example shots beside inputs, zero OCR required — owner browser-verified) |
| INPT-02 | Phase 5 | Pending |
| INPT-03 | Phase 2 | Complete (02-03: 3-checkbox review gate, Enviar disabled until confirmed, server re-validates via create_submission RPC — owner browser-verified) |
| INPT-04 | Phase 2 | Complete (02-01: append-only storage + atomic create_submission RPC live-proven; 02-03: owner browser-verified two-row history, both Aguarda validação) |
| RNK-01 | Phase 3 | Complete (03-03: server-side RPC/RLS enforcement, live smoke; 03-04: admin toggle UI, owner browser-approved) |
| RNK-02 | Phase 3 | Complete (03-03: live leak-probes; 03-04: UX gate + content re-check on the UI side) |
| RNK-03 | Phase 3 | Complete (03-01 formula spec + 03-03 live exact-value proof) |
| RNK-04 | Phase 3 | Complete (03-01 formula spec + 03-03 live exact-value proof) |
| RNK-05 | Phase 3 | Complete (03-01 formula spec + 03-03 live exact-value proof) |
| CMP-01 | Phase 4 | Complete (04-03: DashboardPage mobile-first composition wired into Painel; owner browser-verified, UAT steps 1–5) |
| CMP-02 | Phase 4 | Complete (04-01 tested phrase + 04-02 StatCard + 04-03; owner browser-verified, UAT step 4) |
| CMP-03 | Phase 4 | Complete (04-03: owner DevTools-verified single /rpc/my_report request, aggregates only, UAT step 6; import gates since 04-01) |
| SHWC-01 | Phase 4 | Complete (04-01 tier bands + 04-02 StatCard/TierLegend + 04-03; owner browser-verified, UAT steps 1/4) |
| SHWC-02 | Phase 6 | Pending |

**Coverage: 22/22 requirement-to-phase mappings complete (20 unique v1 requirements, no orphans, no duplicates) ✓**

## Key Decisions Logged at Roadmap Time

- **Per-player PIN confirmed**: REQUIREMENTS.md AUTH-01 specifies a personal 4-digit PIN (stored hashed), resolving the shared-PIN vs per-player-PIN conflict flagged by research. Schema uses per-player identity from day one.
- **Manual ingestion before OCR**: Phases 2 and 5 are deliberately split — the fix-up form and data model are identical with or without OCR, so launch is never bet on OCR accuracy.
- **Compute-on-read ranks**: Percentiles and OVR live in Postgres RPCs (not submit-time triggers), so admin key-stat tweaks apply instantly with no invalidation bugs.
- **Rank engine before dashboards**: Cards, badges, and the promotion page are pure presentations of Phase 3 RPC outputs.

---
*Roadmap created: 2026-10-07*
