# Roadmap: NeoFoot — Guild Stats Panel

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-10-13) — full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Home, Whitelist & Fine Ranks** — Phases 7–10 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–6) — SHIPPED 2026-10-13</summary>

- [x] Phase 1: Foundation — Secure Access & Data Model (4/4 plans) — completed 2026-10-09
- [x] Phase 2: Registry, Catalog & Manual Data Ingestion (3/3 plans) — completed 2026-10-09
- [x] Phase 3: Rank Engine (4/4 plans) — completed 2026-10-10
- [x] Phase 4: Member Dashboard & Improvement Screen (3/3 plans) — completed 2026-10-11
- [x] Phase 5: OCR Auto-Read Layer (5/5 plans) — completed 2026-10-12
- [x] Phase 6: Trust & Celebration — Officer Tools & Promotion Page (7/7 plans) — completed 2026-10-13

</details>

<details open>
<summary>🚧 v1.1 Home, Whitelist & Fine Ranks (Phases 7–10) — IN PROGRESS</summary>

- [ ] Phase 7: Dummy-Data Seed & Catalog Alignment — owner-roster seed ships FIRST (owner decision 7: see how v1.0 wraps around data while v1.1 is developed), build-role vocabulary (ROLE-05) + official job-tree catalog (ROLE-12) aligned so dummies carry correct roles from day one (0/0 plans)
- [ ] Phase 8: Whitelist Lifecycle & First-Login PIN Setup — handle-only registration, player-picked PIN on first login, owner PIN reset, reactivation (0/0 plans)
- [ ] Phase 9: Fine Ranks — Value-Proportional Scale & Role-Differentiated Key Stats — ONE migration (0013): formula swap + `class_key_stats` PK rebuild + backfill + `set_key_stat` v2 + role-scoped OVR/cohorts + `last_validated_at`; ONE tripod re-lock; owner-calibrated bands; percentile phrase dropped (0/0 plans)
- [ ] Phase 10: Personalized Home Landing Tab — Início tab with own OVR, top-3 best-stats strip, stale-data CTA (0/0 plans)

</details>

## Phase Details

### Phase 7: Dummy-Data Seed & Catalog Alignment
**Goal**: The owner watches v1.0's live displays wrap around realistic dummy cohorts — the rough guild roster seeded FIRST in v1.1, purely additive, zero rank-math changes — with the build-role vocabulary and class catalog aligned beforehand so every dummy carries a correct build role from day one.
**Depends on**: Nothing within v1.1 (first phase of the milestone; builds on the shipped v1.0 schema and rank engine)
**Requirements**: ROLE-05, ROLE-09, ROLE-12, SEED-01, SEED-02
**Success Criteria** (what must be TRUE):
  1. The reversible dummy seed applies the owner-provided roster (~72–80 members: 32 support core, 8 each for Swordsman/Mage/Merchant/Ranged/Apprentice trees, 1 wildcard — at least one sample of each job) with realistic value shapes (clear leader, ~98.5% runner-up, ties, `submitted_at` spread incl. a never-submitted member and a pending submission), is idempotent on re-run, applies via the existing `apply-seed.mjs` tooling, and lives outside `seeds/` direct children
  2. Dummy characters carry build roles from day one: `members.char_function` carries exactly ONE of Dano Físico / Dano Mágico / Suporte (additive CHECK widening, existing `'tank'` rows renamed to `'suporte'` — no rank-math changes), the staff edit form and labels speak the new vocabulary, and the seed covers ≥3 dummies per populated (class, build-role) combo per the roster
  3. The class catalog matches the official job tree: Super Novice excluded (unreleased), Summoner and Gunslinger added, advanced-job naming reconciled (High Wizard/Professor, Biochemist/Smith, Dancer/Gypsy) — every roster class name resolves in the catalog
  4. v1.0 renders the populated cohorts under the CURRENT scale without error — and the documented starvation cases (n=1 wildcard classes, shared-slot splits like Knight/Crusader, thin Summoner role splits like 3/3/2) render the data-insufficient state rather than erroring
  5. The purge is scripted, FK-safe (submissions before members), idempotent, leaves zero dummy rows, and stands as a hard pre-release checklist gate
**Plans**: TBD

Cross-cutting constraints: catalog work (ROLE-12) precedes seeding — roster uses advanced job names that don't exist in the current 15-class catalog (documented problem 4); the seed is NEVER a migration and never a direct child of `seeds/` (flat `db.seed` glob auto-applies it); dummy rows stay resident for the milestone duration BY OWNER DECISION 7 (observing v1.0 on realistic cohorts — no overnight-window ritual anymore), but rank pollution of real members during the window is owner-accepted and the purge-before-release gate is non-negotiable; this phase touches NO rank RPC — the seed purpose here is observation, band calibration moves to Phase 9.
**UI hint**: yes

### Phase 8: Whitelist Lifecycle & First-Login PIN Setup
**Goal**: Staff control exactly who can access the panel — officers add players by handle only, players choose their own PIN at first login, and a forgotten PIN is resolvable by the owner — with the whitelist as the trust boundary and no second rate-limit mechanism.
**Depends on**: Nothing within v1.1 (independent of Phases 7, 9, 10; builds on the shipped v1.0 auth stack)
**Requirements**: WHIT-01, WHIT-02, WHIT-03, WHIT-04, WHIT-05, WHIT-06, WHIT-07
**Success Criteria** (what must be TRUE):
  1. An officer or owner can add a player with handle-only registration (handle + display name, role forced `member`, no PIN set), and that player — logging in for the first time — is routed to a first-login flow to choose their own 4-digit PIN (double-entry confirmation) and lands directly in the panel with a standard 7-day session
  2. A second PIN-setup attempt on an already-claimed handle fails with an `already_set` response (atomic claim, no silent last-writer-wins), and setup attempts are rate-limited by the existing lockout machinery — no parallel rate-limit mechanism exists
  3. Officers can see which whitelisted members haven't claimed a PIN yet (server-derived flag on a staff-only surface, never the hash), and a removed (inactive) player re-added by staff rejoins with their submission history intact instead of erroring
  4. The owner can reset a member's PIN via an owner-only RPC, and the member can then log in with the new PIN
  5. Trust-boundary hygiene holds: handles with the dummy sentinel prefix are rejected at add time, and legacy placeholder-PIN whitelist rows are converted to the claim flow (their next login routes to first-login PIN setup, and their lockout rows are cleared)
**Plans**: TBD

Cross-cutting constraints: deploy order invariant — migration 0012 (nullable `pin_hash`) → patched `verify-pin` + new `setup-pin` Edge Functions live → first `add_member` use (the null-hash branch must precede the bcrypt compare or pinless members 500); `add_member` stays the ONLY write surface on `members` (no new RLS policy, no direct INSERT); inactive members must NEVER receive `pin_setup_required` (uniform 401 — branch ordering is a smoke-probed must-have).
**UI hint**: yes

### Phase 9: Fine Ranks — Value-Proportional Scale & Role-Differentiated Key Stats
**Goal**: Points differentiate the top end by real stat gaps within class+build-role cohorts — the leader holds 99 and everyone below scales by value distance — while key-stat configuration becomes per (class, build-role) with zero deploy-day OVR change, all landing in ONE migration and re-locked with ONE tripod pass.
**Depends on**: Phase 7 (build-role vocabulary exists, catalog aligned, realistic seeded cohorts resident for band calibration)
**Requirements**: SCALE-01, SCALE-02, SCALE-03, ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-06, ROLE-07, ROLE-08, ROLE-10, ROLE-11, HOME-03
**Success Criteria** (what must be TRUE):
  1. Per-stat points are value-proportional within class+build-role cohorts: the leader(s) at the max value hold exactly 99, everyone below scales by `own/max × 99` (top-end cuts at 98/97/96/95 emerge naturally), and OVR inherits the finer scale with zero formula change and the floor of 51 preserved — proven by exact-value smoke on live data
  2. ONE migration (0013) swaps the formula across all three rank RPCs (`my_report`, `class_top5`, `get_promotion`), rebuilds `class_key_stats` to key per (class, build-role) with block-at-7 per combo, backfills every existing class config into all build-role values (pre/post-migration OVR parity smoke: zero OVR change or null on deploy day), ships `set_key_stat` v2 with the old signature dropped, and folds in the single additive `last_validated_at` scalar on `my_report` — zero new per-stat fields
  3. OVR in all three RPCs reads the member's own (class, build-role) config, per-stat cohorts become class+build-role, and a member with no configured combo gets OVR = null via the existing data-insufficient rendering — never a silent class-defaults fallback
  4. Every re-locked baseline is green in the same phase: `rankMath.ts` locked test values, `smoke-rank.mjs` exact-value matrix, and `smoke-promotion.mjs` ordering (fixtures carry build roles and per-combo 6-row key-stat inserts); tier bands (D-01/D-02) are recalibrated by the owner against the resident seeded cohorts before being locked, and the improvement-screen percentile phrase is gone — stat cards no longer claim percentile position
  5. The admin surface works and the governance holds: Stats-Chave gains the role selector (class → role → stat chips, per-combo count display, block-at-7 copy), build-role assignment stays staff-only (Personagens path), the staff audit pass re-assigns existing members' build roles before any per-role differentiation applies, officers see the per-(class, role) config coverage indicator (staff-only) — and RNK-02 closed-payload discipline holds (leak probes stay green, no member-visible sign that role configs differ)
**Plans**: TBD

Cross-cutting constraints: ONE migration, ONE tripod re-lock — both features rewrite the same three RPC bodies, so they land together (owner decision 8; ROLES.md §3.6: never rewrite the same three RPC bodies twice in one milestone); the backfill is the live-data continuity trick — without it every member's OVR nulls on migration day (P-ROLE-1, pre/post parity smoke is the detection); advisory-lock hash gains the role component and the old `set_key_stat` signature is dropped in the same migration (P-ROLE-6); promotion top-5 stays class-wide across roles (OVR is the cross-role comparable currency); staff audit pass (ROLE-10) gates BEFORE per-role differentiation lands (P-ROLE-3: silent wrong-cohort scoring); migration + frontend deploy together to avoid stale-band skew (R17); formula edges (all-equal → one locked behavior, max=0, n≥3 gate retention) locked in spec + smoke; no new npm dependencies.
**UI hint**: yes

### Phase 10: Personalized Home Landing Tab
**Goal**: Login lands players on a personalized home — their own OVR and best stats at a glance, with a clear nudge when their data is stale — while Destaques keeps the guild-wide EAFC celebration.
**Depends on**: Phase 9 (`my_report` gains `last_validated_at` in migration 0013 — shipped there, consumed here)
**Requirements**: HOME-01, HOME-02
**Success Criteria** (what must be TRUE):
  1. After login, members land on a new Início tab showing their own OVR card (reused OvrHero) and a top-3 best-stats strip (value + points + tier badge), sorted client-side from fields the payload already returns
  2. A member more than 7 days since their last validated submission sees a stale-data CTA navigating to Enviar Status; a member who never submitted sees the evergreen first-submission variant; a member with fresh data sees no banner — the strictly-greater-than-7-days boundary is locked in a test
  3. The home tab shows only the player's own data — Destaques keeps the guild-wide EAFC cards and the aggregates-only discipline is unchanged
**Plans**: TBD

Cross-cutting constraints: no router library — `'inicio'` joins the existing `App.tsx` Tab union pattern; no date library — epoch-diff arithmetic on the ISO string; no client-side points recomputation (AGENTS.md non-negotiable).
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 7 → 8 → 9 → 10 (8 is independent and could interleave with 7; 9 depends on 7's vocabulary/catalog/seed; 10 depends on 9's `last_validated_at`)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|------------|
| 1. Foundation — Secure Access & Data Model | v1.0 | 4/4 | Complete | 2026-10-09 |
| 2. Registry, Catalog & Manual Data Ingestion | v1.0 | 3/3 | Complete | 2026-10-09 |
| 3. Rank Engine | v1.0 | 4/4 | Complete | 2026-10-10 |
| 4. Member Dashboard & Improvement Screen | v1.0 | 3/3 | Complete | 2026-10-11 |
| 5. OCR Auto-Read Layer | v1.0 | 5/5 | Complete | 2026-10-12 |
| 6. Trust & Celebration — Officer Tools & Promotion Page | v1.0 | 7/7 | Complete | 2026-10-13 |
| 7. Dummy-Data Seed & Catalog Alignment | v1.1 | 0/0 | Not started | - |
| 8. Whitelist Lifecycle & First-Login PIN Setup | v1.1 | 0/0 | Not started | - |
| 9. Fine Ranks — Value-Proportional Scale & Role-Differentiated Key Stats | v1.1 | 0/0 | Not started | - |
| 10. Personalized Home Landing Tab | v1.1 | 0/0 | Not started | - |

---
*Roadmap created: 2026-10-07 · v1.0 archived 2026-10-13 · v1.1 roadmap created 2026-10-13 · revised 2026-10-13 (seed-first, role-differentiated key stats — 4 phases, 27 requirements)*
