# Requirements: Hellz — Guild Stats Panel (v1.1 Home, Whitelist & Fine Ranks)

**Defined:** 2026-10-13
**Core Value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.

## v1.1 Requirements

Requirements for the v1.1 milestone. Each maps to roadmap phases.

### Whitelist Lifecycle

- [ ] **WHIT-01**: Officer or owner can add a member with handle-only registration (handle + display name; role forced `member`; no PIN set yet; rejects the dummy sentinel prefix)
- [ ] **WHIT-02**: Player logging in with an unclaimed handle is routed to a first-login PIN setup flow (choose own 4-digit PIN, double-entry confirmation, server-side `^\d{4}$` validation)
- [ ] **WHIT-03**: Successful PIN setup atomically claims the PIN (double-claim → `already_set`) and mints the standard 7-day session, landing the player directly in the panel
- [ ] **WHIT-04**: PIN-setup attempts are rate-limited by the existing lockout machinery (`pin_login_attempts` + `record_pin_failure` + `_shared/lockout.ts`) — no second rate-limit mechanism
- [ ] **WHIT-05**: Officers can see which whitelist members haven't claimed a PIN (server-derived flag, staff-only surface; never the hash)
- [ ] **WHIT-06**: Owner can reset a member's PIN via an owner-only RPC (reuses the hash-pin flow) — resolves the forgotten-PIN lockout gap left by player-picked PINs
- [ ] **WHIT-07**: Adding a removed (inactive) handle reactivates the member (history preserved) instead of erroring

### Personalized Home

- [ ] **HOME-01**: After login, members land on a new Início tab showing their own OVR card (reused OvrHero) and a top-3 best-stats strip (value + points + tier badge)
- [ ] **HOME-02**: Members with more than 7 days since their last validated submission see a stale-data CTA navigating to Enviar Status; members who never submitted see an evergreen first-submission variant; fresh data shows no banner
- [ ] **HOME-03**: `my_report` gains only `last_validated_at` — closed-payload discipline holds (zero new per-stat fields, zero key-stat hints)

### Fine Ranks

- [ ] **SCALE-01**: Per-stat points are value-proportional within class+function cohort: leader(s at max) hold 99, everyone below scales by `own/max × 99`; OVR inherits the finer scale with zero formula change (floor 51 preserved)
- [ ] **SCALE-02**: Formula updated in ONE migration across all three rank RPCs (`my_report`, `class_top5`, `get_promotion`), with `rankMath.ts` + locked test values + `smoke-rank.mjs` + `smoke-promotion.mjs` re-baselined in the same phase
- [ ] **SCALE-03**: Tier bands (D-01/D-02 in `presentation.ts`) recalibrated against realistic seeded cohorts before being locked; the improvement-screen percentile phrase ("entre os X% piores/melhores") is dropped — owner decision 2026-10-13 (points are no longer percentile positions)

### Role-Differentiated Key Stats

- [ ] **ROLE-01**: Key-stat config is keyed per (class, build-role); each combo holds an independent set of exactly 6 key stats (block-at-7 per combo, advisory-lock race-proof)
- [ ] **ROLE-02**: `set_key_stat` v2 accepts the build-role param (validated server-side, error vocabulary unchanged, old signature dropped in the same migration)
- [ ] **ROLE-03**: OVR in `my_report`, `class_top5`, `get_promotion` reads the member's own (class, build-role) config, and per-stat percentile cohorts become class+build-role (D-06/D-07 superseded)
- [ ] **ROLE-04**: Migration backfills every existing class config into all build-role values → zero OVR change or null on deploy day
- [x] **ROLE-05**: `members.char_function` carries exactly ONE of three build roles — Dano Físico (physical DPS), Dano Mágico (magical DPS), or Suporte (the tank role, renamed per owner nomenclature decision); no character holds more than one role (hard design motto: a focused character fills one role properly)
- [ ] **ROLE-06**: Members with no configured (class, build-role) combo get OVR = null via the existing data-insufficient rendering — never a silent class-defaults fallback
- [ ] **ROLE-07**: Build-role assignment stays staff-only (Personagens path); RNK-02 closed-payload discipline verbatim (zero new key-stat-derived fields)
- [ ] **ROLE-08**: Stats-Chave admin page gains a role selector (class → role → stat chips) with per-combo count display and block-at-7 copy
- [ ] **ROLE-09**: Dummy seed covers ≥3 dummies per populated (class, build-role) combo, following the owner-provided roster (see Seed Roster below)
- [ ] **ROLE-10**: Staff audit pass re-assigns existing members' build-roles before any per-role key-stat differentiation is applied
- [ ] **ROLE-11**: Officer-visible per-(class, role) key-stat config coverage indicator (staff-only, never member-visible)
- [ ] **ROLE-12**: Class catalog aligned with the official job tree (https://roocamer.gnjoy.game/home#job-intro): unreleased jobs excluded (Super Novice, Ninja), catalog additions needed by the seed roster (e.g., Summoner, Gunslinger), advanced-job naming reconciled (High Wizard/Professor, Biochemist/Smith, Dancer/Gypsy)

### Dummy-Data Seed

- [ ] **SEED-01**: Reversible dummy seed following the owner-provided guild roster (see below), with validated submissions, realistic value shapes derived from live data or owner-supplied samples — incl. a clear leader, a ~98.5% runner-up, ties, and submitted_at spread — applied via the existing `apply-seed.mjs` tooling, files kept out of `seeds/` direct children. **Ships FIRST in v1.1** (owner decision: see how v1.0 wraps around data while v1.1 is developed)
- [ ] **SEED-02**: Purge by sentinel prefix is FK-safe (submissions before members), idempotent, and a hard pre-release checklist gate

#### Seed Roster (owner, 2026-10-13 — rough guild shape, ~80 members)

| Group | Slots | Classes |
|-------|-------|---------|
| Support core | 32 | 16 Priest, 8 Gypsy, 8 Bard |
| Swordsman tree | 8 | Knight or Crusader (shared) |
| Mage tree | 8 | High Wizard or Professor (shared) |
| Merchant tree | 8 | Biochemist or Smith (shared) |
| Ranged | 8 | Hunter + Gunslinger (shared) |
| Apprentice tree | 8 | Summoner only (3 build roles) |
| Wildcard | 1 | any other class — at least one sample of each job |
| **Total** | **72–80** | (owner: "even the 72 are already a valid roster") |

**Known problems to observe during calibration (owner directive — decisions follow observations):**
1. Wildcard/1-slot classes → cohort n=1 < 3 → data-insufficient: no points, no OVR (expected, documented)
2. Shared-slot groups (Knight/Crusader, High Wizard/Professor, Biochemist/Smith, Hunter/Gunslinger) — per-class cohorts starve depending on the split
3. Summoner's 8 slots split across up to 3 build roles → per-role cohorts may fall under n≥3 (e.g., 3/3/2)
4. Catalog mismatch: roster uses advanced job names (High Wizard, Professor, Biochemist, Smith, Gunslinger, Summoner) that don't exist in the current 15-class catalog — catalog work (ROLE-12) must precede seeding
5. Priest (16, single Suporte role) is the only class guaranteed to satisfy n≥3 under role-scoped cohorts
6. Key-stat config workload is now per populated (class, build-role) combo — lazy configuration expected

## v2 Requirements

Deferred to a future release. Tracked but not in the v1.1 roadmap.

### Progression

- **DELT-01**: Delta badges — track changes since the player's last submission (e.g. ▲ 5,00%)
- **HIST-01**: Submission history / progression view — OVR and key stats over time
- (owner observation) Power-shift significance rule — combat_power shifts flagged significant only at thousands scale between submissions

### Officer Tools

- **OFCR-01**: Officer guild-health dashboard — participation %, who hasn't submitted, OCR failure rate

### Platform

- **CAT-01**: Stat catalog self-service additions by admins
- **OCRX-01**: OCR confidence surfacing — auto-flag low-confidence fields for review
- **SHAR-01**: Shareable card image export — render stat card to PNG for Discord/WhatsApp

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-guild support | Single guild, one panel — deploy a second instance instead |
| Chat/announcements/events | Core loop is stats + ranks only |
| Real-time game sync | No RO Origin API; scraping violates ToS — screenshots are the source |
| PIN change / forgot-PIN self-service for members | Not requested; owner-side reset (WHIT-06) covers the lockout gap |
| Weak-PIN blocklist (0000, 1234, handle-mirror) | Adds surface for near-zero gain; the whitelist itself is the trust boundary |
| Router library for navigation | App.tsx Tab union is the established, tested pattern |
| New npm dependencies | All four features met by SQL + existing Edge Function imports + React patterns (STACK.md) |
| Second rate-limit mechanism for PIN setup | Duplicates the proven v1.0 lockout |
| Faker library for seed data | Hand-authored SQL gives full control of cohort shapes |
| Client-side points recomputation | Rank math stays in Postgres (AGENTS.md non-negotiable) |

## Milestone Decisions (2026-10-13, owner)

1. **Percentile phrase dropped** under the value-proportional scale (SCALE-03) — the improvement screen no longer claims percentile position.
2. **Forgotten PIN → owner RPC** (WHIT-06) shipped this milestone, not just an ops runbook.
3. **Removed-member re-add → reactivate** (WHIT-07) — add_member on an inactive handle flips `active` back on, preserving submission history.
4. **Build-role vocabulary → 3 values, "Suporte" nomenclature** — the tank role is referred to as Suporte from now on (same role, new name); roles: Dano Físico / Dano Mágico / Suporte. A character is always exactly one role — "trying to do all at once leads to an unoptimal character that fits none of the three roles properly."
5. **Cohorts split by class+build-role** (percentile comparison is only meaningful against same-build peers).
6. **Key-stat backfill at migration** — every (class, role) combo starts with the class's current 6 stats; zero deploy-day OVR change; staff differentiates at leisure.
7. **Seed ships FIRST in v1.1** — owner wants to see how v1.0 wraps around realistic data while developing the rest of the milestone; seed follows the rough roster above and calibration observations drive follow-up decisions.
8. **Role-differentiated key stats fold into the SAME migration as the value-proportional scale** — both rewrite the same three RPCs; one tripod re-lock instead of two (research recommendation, ROLES.md §3.6).

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROLE-05 | Phase 7 — Dummy-Data Seed & Catalog Alignment | Complete |
| ROLE-09 | Phase 7 — Dummy-Data Seed & Catalog Alignment | Pending |
| ROLE-12 | Phase 7 — Dummy-Data Seed & Catalog Alignment | Pending |
| SEED-01 | Phase 7 — Dummy-Data Seed & Catalog Alignment | Pending |
| SEED-02 | Phase 7 — Dummy-Data Seed & Catalog Alignment | Pending |
| WHIT-01 | Phase 8 — Whitelist Lifecycle & First-Login PIN Setup | Pending |
| WHIT-02 | Phase 8 — Whitelist Lifecycle & First-Login PIN Setup | Pending |
| WHIT-03 | Phase 8 — Whitelist Lifecycle & First-Login PIN Setup | Pending |
| WHIT-04 | Phase 8 — Whitelist Lifecycle & First-Login PIN Setup | Pending |
| WHIT-05 | Phase 8 — Whitelist Lifecycle & First-Login PIN Setup | Pending |
| WHIT-06 | Phase 8 — Whitelist Lifecycle & First-Login PIN Setup | Pending |
| WHIT-07 | Phase 8 — Whitelist Lifecycle & First-Login PIN Setup | Pending |
| SCALE-01 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| SCALE-02 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| SCALE-03 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| ROLE-01 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| ROLE-02 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| ROLE-03 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| ROLE-04 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| ROLE-06 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| ROLE-07 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| ROLE-08 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| ROLE-10 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| ROLE-11 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| HOME-03 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| HOME-01 | Phase 10 — Personalized Home Landing Tab | Pending |
| HOME-02 | Phase 10 — Personalized Home Landing Tab | Pending |

**Coverage:**
- v1.1 requirements: 27 total
- Mapped to phases: 27 ✓
- Unmapped: 0 ✓
