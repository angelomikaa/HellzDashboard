# Roadmap: NeoFoot — Guild Stats Panel

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-10-13) — full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Home, Whitelist & Fine Ranks** — Phases 7–9 (in progress)

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
<summary>🚧 v1.1 Home, Whitelist & Fine Ranks (Phases 7–9) — IN PROGRESS</summary>

- [ ] Phase 7: Whitelist Lifecycle & First-Login PIN Setup — handle-only registration, player-picked PIN on first login, owner PIN reset, reactivation (0/0 plans)
- [ ] Phase 8: Fine Ranks — Value-Proportional Scale, Seed & Band Recalibration — 0013 formula swap + tripod re-lock + reversible dummy seed + owner-calibrated tier bands + purge gate (0/0 plans)
- [ ] Phase 9: Personalized Home Landing Tab — Início tab with own OVR, top-3 best-stats strip, stale-data CTA (0/0 plans)

</details>

## Phase Details

### Phase 7: Whitelist Lifecycle & First-Login PIN Setup
**Goal**: Staff control exactly who can access the panel — officers add players by handle only, players choose their own PIN at first login, and a forgotten PIN is resolvable by the owner — with the whitelist as the trust boundary and no second rate-limit mechanism.
**Depends on**: Nothing within v1.1 (independent of Phases 8–9; builds on the shipped v1.0 auth stack)
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

### Phase 8: Fine Ranks — Value-Proportional Scale, Seed & Band Recalibration
**Goal**: Points differentiate the top end by real stat gaps — the leader holds 99 and everyone below scales by value distance — with the entire locked rank tripod re-baselined in the same phase, realistic dummy cohorts to calibrate displays against, and a rehearsed purge that stands as a hard pre-release gate.
**Depends on**: Nothing within v1.1 (independent of Phase 7; builds on the shipped v1.0 rank engine). Phase 9 depends on this phase.
**Requirements**: SCALE-01, SCALE-02, SCALE-03, SEED-01, SEED-02, HOME-03
**Success Criteria** (what must be TRUE):
  1. Per-stat points are value-proportional within class+function: the leader(s) at the max value hold exactly 99, everyone below scales by `own/max × 99` (top-end cuts at 98/97/96/95 emerge naturally), and OVR inherits the finer scale with zero formula change and the floor of 51 preserved — proven by exact-value smoke on live data
  2. The formula ships in ONE migration across all three rank RPCs (`my_report`, `class_top5`, `get_promotion`) and every re-locked baseline is green in the same phase: `rankMath.ts` locked test values, `smoke-rank.mjs` exact-value matrix, and `smoke-promotion.mjs` ordering
  3. The reversible dummy seed applies ~5 players per class across both functions with realistic value shapes (clear leader, ~98.5% runner-up, ties, `submitted_at` spread incl. a never-submitted member), is idempotent on re-run, lives outside `seeds/` direct children — and the purge (submissions before members, FK-safe) is scripted, leaves zero dummy rows, and is a hard pre-release checklist gate
  4. Tier bands (D-01/D-02) are recalibrated by the owner against the seeded realistic cohorts before being locked, and the improvement-screen percentile phrase is gone — stat cards no longer claim percentile position
  5. `my_report` returns only the one new `last_validated_at` scalar (folded into the same migration's rewrite) — zero new per-stat fields, zero key-stat hints, leak probes stay green
**Plans**: TBD

Cross-cutting constraints: the seed is NEVER a migration and never a direct child of `seeds/` (flat `db.seed` glob auto-applies it); the seed window is a scheduled, announced, tightly-bounded session — rehearse seed+purge locally first, dummy rows must never be resident overnight (owner decision #6/#5 governs cohort exclusion); migration + frontend deploy together to avoid stale-band skew (R17); formula edges (all-equal → one locked behavior, max=0, n≥3 gate retention) locked in spec + smoke.
**UI hint**: no

### Phase 9: Personalized Home Landing Tab
**Goal**: Login lands players on a personalized home — their own OVR and best stats at a glance, with a clear nudge when their data is stale — while Destaques keeps the guild-wide EAFC celebration.
**Depends on**: Phase 8 (`my_report` gains `last_validated_at` in migration 0013 — shipped there, consumed here)
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
Phases execute in numeric order: 7 → 8 → 9 (7 and 8 are independent and could interleave; 9 depends on 8)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|------------|
| 1. Foundation — Secure Access & Data Model | v1.0 | 4/4 | Complete | 2026-10-09 |
| 2. Registry, Catalog & Manual Data Ingestion | v1.0 | 3/3 | Complete | 2026-10-09 |
| 3. Rank Engine | v1.0 | 4/4 | Complete | 2026-10-10 |
| 4. Member Dashboard & Improvement Screen | v1.0 | 3/3 | Complete | 2026-10-11 |
| 5. OCR Auto-Read Layer | v1.0 | 5/5 | Complete | 2026-10-12 |
| 6. Trust & Celebration — Officer Tools & Promotion Page | v1.0 | 7/7 | Complete | 2026-10-13 |
| 7. Whitelist Lifecycle & First-Login PIN Setup | v1.1 | 0/0 | Not started | - |
| 8. Fine Ranks — Value-Proportional Scale, Seed & Band Recalibration | v1.1 | 0/0 | Not started | - |
| 9. Personalized Home Landing Tab | v1.1 | 0/0 | Not started | - |

---
*Roadmap created: 2026-10-07 · v1.0 archived 2026-10-13 · v1.1 roadmap created 2026-10-13*
