# Requirements: Hellz — Guild Stats Panel (v1.1 Home, Whitelist & Fine Ranks)

**Defined:** 2026-10-13
**Core Value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.

## v1.1 Requirements

Requirements for the v1.1 milestone. Each maps to roadmap phases.

### Whitelist Lifecycle

- [x] **WHIT-01**: Officer or owner can add a member with handle-only registration (handle + display name; role forced `member`; no PIN set yet; rejects the dummy sentinel prefix)
- [x] **WHIT-02**: Player logging in with an unclaimed handle is routed to a first-login PIN setup flow (choose own 4-digit PIN, double-entry confirmation, server-side `^\d{4}$` validation)
- [x] **WHIT-03**: Successful PIN setup atomically claims the PIN (double-claim → `already_set`) and mints the standard 7-day session, landing the player directly in the panel
- [x] **WHIT-04**: PIN-setup attempts are rate-limited by the existing lockout machinery (`pin_login_attempts` + `record_pin_failure` + `_shared/lockout.ts`) — no second rate-limit mechanism
- [x] **WHIT-05**: Officers can see which whitelist members haven't claimed a PIN (server-derived flag, staff-only surface; never the hash)
- [x] **WHIT-06**: Owner can reset a member's PIN via an owner-only RPC (reuses the hash-pin flow) — resolves the forgotten-PIN lockout gap left by player-picked PINs
- [x] **WHIT-07**: Adding a removed (inactive) handle reactivates the member (history preserved) instead of erroring
- [x] **WHIT-08** (owner feedback 2026-10-20): A player can request access from the public panel through two loops — an existing member re-requests with handle + PIN + one basic screenshot (identity only, no stats), and a prospect completes the full stat wizard; both store a server-side `pending` request that never grants access by itself
- [x] **WHIT-09** (owner feedback 2026-10-20): Officers/owners review requests in Validações with a ranking-style OVR row (identity, type badge, proof behind expansion) and approve or reject; approval creates the member with the request PIN active and the pointed role pre-filled for confirmation, prospect approval creates the first `validated` submission while member-type approval creates none, and every decision purges the proof object
- [x] **WHIT-10** (owner feedback 2026-10-20): A requester can check their own request status; pending/rejected requesters are told they must be whitelisted by an officer and cannot reach any member data

### Character Identity Capture

- [x] **IDEN-01** (owner feedback 2026-10-20): Every submission captures the in-game character ID, nickname and job(s) alongside combat power — OCR pre-fill plus mandatory manual correction, same discipline as the stat fields
- [x] **IDEN-02** (owner feedback 2026-10-20): The captured values are stored PER SUBMISSION (append-only history), so a job swap leaves a trace; the latest validated submission supplies the nickname used on the member/destaques cards
- [x] **IDEN-03** (owner feedback 2026-10-20): Staff can see a member's job/nickname history (who swapped when); members never see other members' identity history

### Personalized Home

- [ ] **HOME-01**: Início is the default landing tab: after login, members see their own OVR card (reused OvrHero) and a top-3 best-stats strip (value + points + tier badge); visitors without a session see the same page with the public showcase and an Entrar CTA
- [ ] **HOME-02**: Members with more than 7 days since their last validated submission see a stale-data CTA navigating to Enviar Status; members who never submitted see an evergreen first-submission variant; fresh data shows no banner
- [ ] **HOME-03**: `my_report` gains only `last_validated_at` — closed-payload discipline holds (zero new per-stat fields, zero key-stat hints)
- [ ] **SHWC-01** (owner feedback 2026-10-20; amended 2026-10-24): Início renders the promo cards as a premium scroll-snap slider (1-up mobile, 3-up desktop, keyboard + swipe reachable, server order preserved). The showcase is PUBLIC — anon-callable `get_promotion_public()` + anon read of active members' card photos (migration 0029); the standalone Destaques tab is removed and Início is the landing page

### Unified Key/Relevant Selection

- [ ] **KEYU-01** (owner feedback 2026-10-20): Stats-Chave uses ONE ordered selection set per (class, build-role): the first 6 selected stats are the keys, the 7th and beyond are relevants — the current key-XOR-relevant gating is replaced
- [ ] **KEYU-02** (owner feedback 2026-10-20): Deselecting a key promotes the oldest still-selected relevant into the key set (deterministic order, server-enforced), so the key set stays at 6 whenever ≥6 stats are selected
- [ ] **KEYU-03** (owner feedback 2026-10-20): Selection order is persisted server-side (single RPC, advisory-lock safe); the member-facing payload still reveals nothing about keys/relevants

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
- [x] **ROLE-09**: Dummy seed covers ≥3 dummies per populated (class, build-role) combo, following the owner-provided roster (see Seed Roster below)
- [ ] **ROLE-10**: Staff audit pass re-assigns existing members' build-roles before any per-role key-stat differentiation is applied
- [ ] **ROLE-11**: Officer-visible per-(class, role) key-stat config coverage indicator (staff-only, never member-visible)
- [x] **ROLE-12**: Class catalog aligned with the official job tree (https://roocamer.gnjoy.game/home#job-intro): unreleased jobs excluded (Super Novice, Ninja), catalog additions needed by the seed roster (e.g., Summoner, Gunslinger), advanced-job naming reconciled (High Wizard/Professor, Biochemist/Smith, Dancer/Gypsy)

### Hidden Raw Defenses

- [x] **DEF-01** (owner feedback 2026-10-22): `stat_catalog` gains `rpdef`/`rmdef` rows in `special` group, flat, `stat_direction='higher'`, `label_short` `RPDEF`/`RMDEF`; catalog count 57 → 59; member-facing surfaces (`my_report`, `my_card`, `get_promotion`, `role_rank`, dashboard, review, key-stat pages) surface them automatically with no RPC rewrite.
- [x] **DEF-02** (owner feedback 2026-10-22): Two tooltip OCR captures (`pdef_tooltip`/`mdef_tooltip`, transient `equip_pdef_raw`/`equip_mdef_raw`) inside the existing Especial step; per-capture failure/filled state so one tooltip read never blanks the other; tooltip grammar reads the "Equipment PDEF/MDEF" line then digit-reads the value; OCR field count 56 → 58.
- [x] **DEF-03** (owner feedback 2026-10-22): Raw defense calculated read-only as `floor(equipment / (1 + pct / 100))`; guards equipment ≥ 0 and denominator > 0; computed before `groupComplete`, `ReviewStep`, `buildStatsPayload`, and prospect gate; changing equipment or `equip_*_pct` unchecks Especial verification (one checkbox covers all 18 special values).
- [x] **DEF-04** (owner feedback 2026-10-22): Migration `0019_raw_defenses.sql` runs AFTER `0018` (untouched); inserts `rpdef`/`rmdef` with labels; remaps every `class_key_stats` row where `stat_key in ('pdef','mdef')` — keys and relevants — to `rpdef`/`rmdef` preserving `selection_order` and `selected_at`, then deletes old rows; OVR nulls for affected classes until a new validated submission supplies both raw values.
- [x] **DEF-05** (owner feedback 2026-10-22): Prospect/min-count gates updated: Edge function `58..59`; `requestFlow` minimum 58; DB floor `>=56` stays (Edge is the exact gate).
- [x] **DEF-06** (owner feedback 2026-10-22): Tests/seeds updated: `stat_catalog.sql` 59 rows; live `card-labels-4-6char.sql` gains `RPDEF`/`RMDEF`; structure tests stay at 56 screen fields + new tooltip grammar tests; wizard/prospect tests 58/59 payload expectations; smoke scripts 57 → 59, 56 → 58 where they assert full catalog.

### Dummy-Data Seed

- [x] **SEED-01**: Reversible dummy seed following the owner-provided guild roster (see below), with validated submissions, realistic value shapes derived from live data or owner-supplied samples — incl. a clear leader, a ~98.5% runner-up, ties, and submitted_at spread — applied via the existing `apply-seed.mjs` tooling, files kept out of `seeds/` direct children. **Ships FIRST in v1.1** (owner decision: see how v1.0 wraps around data while v1.1 is developed)
- [x] **SEED-02**: Purge by sentinel prefix is FK-safe (submissions before members), idempotent, and a hard pre-release checklist gate

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

### Deployment Security Hardening (Phase 08.1)

Added 2026-10-23 when Phase 08.1 gap-closure planning found that three of the phase's four original claims had shipped as theater or been left unproven (device binding never enforced, owner credentials committed, no release gate on a public URL). These are the measurable statements the phase now has to satisfy.

- [ ] **SEC-01**: No live PIN, bcrypt hash or real staff handle is committed to the repository — the whitelist seed is a credential-free, re-runnable template, and a repo gate fails when a hash/PIN/handle reappears
- [ ] **SEC-02**: Placeholder-shaped identities (`*-handle`) can never hold an officer/owner role or a PIN — enforced by a database CHECK constraint evaluated on every write, replacing the rejected `stf-`/`off-` staff-prefix namespace (D-16)
- [ ] **SEC-03**: The production deployment serves hardening headers (nosniff, frame-deny, referrer, permissions, CSP report-only) and a one-command release gate that fails on a bundle-env regression or a leaked secret
- [ ] **SEC-04**: Session device binding is server-enforced: client and server compute the same User-Agent-only fingerprint, it is minted into the JWT at login and first access, and the four privilege-mutating staff RPCs reject a mismatch with `device_mismatch`
- [ ] **SEC-05**: The live smoke harness contains no production credential — credentials come from `SMOKE_*` env vars or per-run throwaway fixtures with a random 4-digit PIN
- [ ] **SEC-06**: Every 08.1 security claim is re-verified against the live deployment in one battery run and recorded in `08.1-VERIFICATION.md`, with an owner walk for the behaviours no script can judge

### Verified Access — Claim Authorization & Discord OAuth (Phase 11)

Added 2026-10-26 after the owner report that a Basic-screen print can never prove account ownership: the print, the nickname and the char ID are all public (cards are posted in Discord daily), so the pre-0032 first-access flow let anyone holding a stolen card claim an unclaimed row before its owner. The stopgap (DSCD-01) shipped immediately; the rest is the Discord OAuth end state decided with the owner the same day (the guild bot has roster/roles ONLY — no Discord↔character mapping — so the mapping itself must be created once per member with human confirmation).

- [x] **DSCD-01** (guarantee shipped 2026-10-26, mechanism evolved same day: 0032 pre-claim stamp → 0033 one-go revert → **0034 manual first access, the current contract**): An unclaimed registry row is claimable ONLY after an officer/owner decision — never on the print alone (0034 removes the print entirely: the player TYPES the identity + PIN, and every first access is a request — `claim` for an unclaimed row, `registration` for an unknown character — that an officer approves in Solicitações; the approval activates the PIN). Enforced server-side: `claim_pin`/`setup-pin` are retired (no auto-claim path exists at all), `create_claim_request` refuses claimed/ambiguous/mismatched rows and handles owned by other active accounts, and `approve_request` is the only writer that activates a first PIN. The 0032 stamp machinery lives in git history if a per-row gate is ever wanted again.
- [ ] **DSCD-02**: Every member row carries an optional, unique Discord identity link (`discord_user_id`, `discord_verified_at`) that is created exactly ONCE per member with officer confirmation — the one-time human-verified Discord↔character mapping (the bot has no such mapping, and OAuth alone proves only control of a Discord account). Link changes/unbinds are staff-only and recorded.
- [ ] **DSCD-03**: Login accepts Discord OAuth through the Supabase Auth Discord provider (scope `identify` only): the Edge Function/server resolves the registry row BY `discord_user_id`, and the guild-membership/role check runs SERVER-side with the guild bot token (never a client-claimed role, never the client's guild list). A member whose Discord account is not linked gets the claim/link flow, not a session.
- [ ] **DSCD-04**: RLS continuity is preserved by construction: a Supabase custom access token hook injects `member_id`/`member_role` into the Auth session JWT so every existing `auth.jwt()->>'member_id'` policy and RPC gate keeps working unchanged. The 0024 device-binding discipline is re-decided explicitly (migrate `assert_device_bound` to the new session shape, or replace it with step-up only) — it must never silently break or silently vanish.
- [ ] **DSCD-05**: The PIN retirement path is decided and staged: once OAuth is mandatory for members, the nickname+PIN login is deprecated in the same phase it stops being the only factor (owner decision at planning time: hard removal vs. recovery-only), outstanding hand-minted JWTs are handled (short expiry or forced re-login), and `NEFOOT_JWT_SECRET` rotation is planned if the custom mint is retired.
- [ ] **DSCD-06**: The OCR print keeps its real job only: reading stats/class/ID to avoid typos and giving officers evidence on the unknown/claim paths. It is never again the identity anchor anywhere in the codebase or copy.

### Rating Unification (Phase 10.1 — URGENT, INSERTED 2026-10-27)

Added 2026-10-27 after the owner reported the card OVRs inconsistent with the Ranking tab and the investigation proved the ratings engine split-brain: migration 0018 swapped the value-proportional formula into only 3 of the 6 OVR-producing RPCs (the other 3 kept the pre-Phase-9 rank-percentile formula), and 0028's `selection_order <= 6` rule missed `role_rank`/`staff_requests`. Live audit: 6/6 OVR-capable members diverged across surfaces, 3 Ranking-tab OVRs were null, every Solicitações applicant OVR null. Evidence: `.planning/phases/10.1-universal-rating-unification/10.1-CONTEXT.md`. Restates the round-8 owner ruling (2026-10-19): "Ratings are an universal measurement, once calculated they must be displayed equally."

- [x] **UNIF-01**: ONE points formula in every OVR-producing RPC (`my_report`, `my_card`, `class_top5`, `get_promotion`, `get_promotion_public`, `role_rank`, `staff_requests`): the Phase 9 value-proportional formula (own/best × 99, stat_direction-aware best, clamped [0,99], n≥3 gate; OVR `51 + mean × 48/99`, floor 51, all-6-or-nothing) — the same member+stat never yields two different points/OVR numbers across surfaces, and the pre-Phase-9 rank-percentile formula exists in no production RPC
- [x] **UNIF-02**: ONE key-set rule in every OVR gate and key-stat list read: `class_key_stats` rows with `selection_order <= 6` AND the member's own (class, build-role) — relevants at positions 7+ never count as keys anywhere (`role_rank` and `staff_requests` join the 0028 owner rule; `staff_requests` also gains the 0018-era missing `char_function` filter that nulled every applicant OVR)
- [x] **UNIF-03**: ONE cohort definition in all six RPCs: latest value per (member, stat) over submissions `status not in ('rejected','discarded')`, over ACTIVE members of the same class+build-role — `my_report` and `class_top5` drop the status-only / active-less reads (latent re-fork: an inactive or discarded-submission member must never shift a live member's rating)
- [x] **UNIF-04**: The parity contract is locked in a runnable gate: the smoke-card UNIFY probes (red since 0018) pass again and extend to `role_rank` (staff OVR ≡ `my_card`) and `my_report` (`ovr.value` ≡ `my_card`); a read-only cross-RPC parity audit shows zero OVR divergence for every OVR-capable member; both run green against live and are recorded in `10.1-VERIFICATION.md` — a future partial rewrite (the 0018 failure mode) goes red the day it ships

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
| ROLE-09 | Phase 7 — Dummy-Data Seed & Catalog Alignment | Complete |
| ROLE-12 | Phase 7 — Dummy-Data Seed & Catalog Alignment | Complete |
| SEED-01 | Phase 7 — Dummy-Data Seed & Catalog Alignment | Complete |
| SEED-02 | Phase 7 — Dummy-Data Seed & Catalog Alignment | Complete |
| WHIT-01 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| WHIT-02 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| WHIT-03 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| WHIT-04 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| WHIT-05 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| WHIT-06 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| WHIT-07 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| WHIT-08 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| WHIT-09 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| WHIT-10 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| IDEN-01 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| IDEN-02 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| IDEN-03 | Phase 8 — Whitelist Lifecycle, Self-Request & Identity | Complete |
| SEC-01 | Phase 08.1 — Security Hardening for Public Deployment | Planned (08.1-06) |
| SEC-02 | Phase 08.1 — Security Hardening for Public Deployment | Planned (08.1-06) |
| SEC-03 | Phase 08.1 — Security Hardening for Public Deployment | Planned (08.1-07) |
| SEC-04 | Phase 08.1 — Security Hardening for Public Deployment | Planned (08.1-08) |
| SEC-05 | Phase 08.1 — Security Hardening for Public Deployment | Planned (08.1-09) |
| SEC-06 | Phase 08.1 — Security Hardening for Public Deployment | Planned (08.1-10) |

## Phase 8 evidence pointers (2026-10-21)

- WHIT-01/07: 08-01 migration 0014 (add_member) + 08-05 CharactersPage add-member flow + smoke-identity 2a-2e
- WHIT-02/03/04: 08-02 verify-pin 409 + setup-pin claim + Edge smoke 16a-16i + lockout reuse
- WHIT-05: 08-05 CharactersPage PIN badges/filter (pin_set) + smoke-identity WHIT-05
- WHIT-06: 08-01 reset_member_pin + 08-05 owner-only reset + smoke-identity 3a-3c
- WHIT-08/09: 08-01 request tables/RPCs + 08-03/04 client flows + 08-05 RequestReview + smoke-identity 5/9/10
- WHIT-10: 08-01 request_status + 08-03 RequestStatusPage + smoke-identity 5b-5c
- IDEN-01/02: 08-01 create_submission(p_identity) + 08-04 SubmitPage identity + smoke-identity 11a-11e
- IDEN-03: 08-01 staff_identity_queue/history + 08-05 IdentityReview + smoke-identity 12a-12d
- Legacy conversion: 08-06 seed (1 officer handle unclaimed; owner + 72 dummies intact); smoke suites all green.
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
| KEYU-01 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| KEYU-02 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| KEYU-03 | Phase 9 — Fine Ranks (Scale & Role-Differentiated Key Stats) | Pending |
| HOME-01 | Phase 10 — Personalized Home Landing Tab | Pending |
| HOME-02 | Phase 10 — Personalized Home Landing Tab | Pending |
| SHWC-01 | Phase 10 — Personalized Home Landing Tab | Pending |
| DEF-01 | Phase 9.1 — Hidden Raw Defenses | Complete |
| DEF-02 | Phase 9.1 — Hidden Raw Defenses | Complete |
| DEF-03 | Phase 9.1 — Hidden Raw Defenses | Complete |
| DEF-04 | Phase 9.1 — Hidden Raw Defenses | Complete |
| DEF-05 | Phase 9.1 — Hidden Raw Defenses | Complete |
| DEF-06 | Phase 9.1 — Hidden Raw Defenses | Complete |
| DSCD-01 | Phase 11 — Verified Access (stopgap) | Complete (0034 manual first access — every claim is an officer-approved request) |
| DSCD-02 | Phase 11 — Verified Access (Discord OAuth) | Planned |
| DSCD-03 | Phase 11 — Verified Access (Discord OAuth) | Planned |
| DSCD-04 | Phase 11 — Verified Access (Discord OAuth) | Planned |
| DSCD-05 | Phase 11 — Verified Access (Discord OAuth) | Planned |
| DSCD-06 | Phase 11 — Verified Access (Discord OAuth) | Planned |
| UNIF-01 | Phase 10.1 — Universal Rating Unification (urgent fix) | Complete (10.1-01) |
| UNIF-02 | Phase 10.1 — Universal Rating Unification (urgent fix) | Complete (10.1-01) |
| UNIF-03 | Phase 10.1 — Universal Rating Unification (urgent fix) | Complete (10.1-01) |
| UNIF-04 | Phase 10.1 — Universal Rating Unification (urgent fix) | Complete (10.1-02) |

**Coverage:**
- v1.1 requirements: 53 total
- Mapped to phases: 53 ✓
- Unmapped: 0 ✓
