# Roadmap: NeoFoot — Guild Stats Panel

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-10-13) — full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Home, Whitelist & Fine Ranks** — Phases 7–11 (in progress; Phase 11 Verified Access inserted 2026-10-26)

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
<summary>🚧 v1.1 Home, Whitelist & Fine Ranks (Phases 7–11) — IN PROGRESS</summary>

- [x] Phase 7: Dummy-Data Seed & Catalog Alignment — owner-roster seed ships FIRST (owner decision 7: see how v1.0 wraps around data while v1.1 is developed), build-role vocabulary (ROLE-05) + official job-tree catalog (ROLE-12) aligned so dummies carry correct roles from day one (4/4 plans) — completed 2026-10-14
- [ ] Phase 8: Whitelist Lifecycle, Self-Request & Character Identity — handle-only registration, player-picked PIN on first login, owner PIN reset, reactivation, two self-request loops, per-submission identity (6 plans created)
- [x] Phase 08.10: pt-BR OCR Identity — HOTFIX: the identity band reads the live pt-BR client ("Classe Criador"), localized class names map to the English catalog, and an unreadable field is named in the retry copy (1/1 plan) — completed 2026-10-22
- [x] Phase 9: Fine Ranks — Value-Proportional Scale & Role-Differentiated Key Stats — ONE migration (0018; renumbered: Phase 7 took 0012, Phase 07.2 takes 0013, Phase 8 takes 0014, Phase 8 gap closure consumed 0015, Phase 08.1 took 0016, Phase 08.1 step-up consumed 0017): formula swap + `class_key_stats` PK rebuild + backfill + `set_key_stat` v2 + role-scoped OVR/cohorts + `last_validated_at`; ONE tripod re-lock; owner-calibrated bands; percentile phrase dropped (5/5 plans, 09-06 env-gated) — completed 2026-10-22
- [ ] Phase 9.1: Hidden Raw Defenses (RPDEF/RMDEF) — two tooltip OCR captures inside the Especial step; raw defense computed read-only from Equipment DEF / (1 + DEF%); transient equipment values; `rpdef`/`rmdef` remap all `pdef`/`mdef` key positions preserving order; migration 0019 after 0018 (2 plans)
- [ ] Phase 10: Personalized Home Landing Tab — Início tab with own OVR, top-3 best-stats strip, stale-data CTA (3/3 plans)
- [x] Phase 10.1: Universal Rating Unification — URGENT FIX (INSERTED 2026-10-27, owner report "OVR from the cards is inconsistent with the Ranking tab"): migration 0036 rebases role_rank/my_card/staff_requests onto the Phase 9 value-proportional formula, adds the selection_order<=6 key filter everywhere (Ranking-tab OVR nulls gone), unifies the cohort definition (active + non-discarded), and locks the six-RPC parity contract behind a runnable smoke gate (2/2 plans) — completed 2026-10-27
- [ ] Phase 10.2: Meta vs Non-Viable Cohorts (INSERTED 2026-10-28) — the 39 keyed (class, function) combos split into 23 playable (meta) and 16 non-viable, persisted in `class_cohorts` (migration 0037); Início shows one carousel per meta build (client half 2026-10-29) — completed 2026-10-29
- [x] Phase 10.3: Artista Merged Cohort (INSERTED 2026-10-29) — Menestrel and Cigana are one cohort for stats (exception only; every other tab unchanged), ONE shared 6-key config per owner, members keep their own class on card/registry; migration 0038 APPLIED LIVE 2026-10-29 (22 meta / 14 non-viable, OVR parity 0 divergences). Ships with the card.svg tier-color re-export (no border, stats contrast plate) and third primers for the ten meta cohorts with zero real members
- [ ] Phase 10.4: Battlefield Lineups & Roster Sync (INSERTED 2026-10-30) — Lineup tab for **Vigrid Field (Raid 1)** and **Ruinscape (Raid 2)** (8 parties `G1`–`G8` × 5 slots, slot 1 = Party Leader, editable party assignment labels, `N/5` counters, smoke-excluded); members view & download JPG, officers/owner edit lineups at will; pre-registers all new real nicknames from the owner's Raid 1/2 lineups into `Personagens` without guessing ambiguous classes; generates Hellz dark/neon JPG per battlefield (3 plans)
- [x] Phase 10.5: Anti-Cheat Guardrails (INSERTED 2026-10-30) — server-side defense spike flags (≥1.5× the class+role cohort average for RPDEF/RMDEF/Equip. PDEF%/MDEF%), per-field OCR provenance (source + printed value + final value), and ≥8-point OVR-swing warnings when class/role are unchanged; flagged submissions stay pending for officer review; migration 0046 + client wizard warning + Validações anti-cheat panel
- [x] Phase 10.6: Cross-Cohort Stat Inspector (INSERTED 2026-10-30) — new "Stat entre todos" mode in the staff Ranking tab: pick any stat, see every active real member's latest validated value side by side (independent of class/cohort) with the self-excluded class+role average, the guild average, and heuristic cohort/guild outlier badges; migration 0047
- [x] Phase 10.7: Statistical Buff Detection (INSERTED 2026-10-30) — data-driven anti-cheat beyond the fixed 1.5× margin: per-cohort robust curve (`base = flat / (1+pct/100)`, median/MAD), Impositio Manus undo test (+35%/+35 p.p. on PATK/MATK), defense σ ≥ 3.5 alongside the 1.5× ratio, and inspector sigma badges for any stat; migration 0049
- [x] Phase 10.8: MATK/PATK Regression Dashboard (INSERTED 2026-10-30) — read-only regression dashboard inside Ranking → Stat entre todos: real MATK/PATK records, OLS + Theil–Sen with 95% CI, MATK% / PATK% / ratio-control scatters + residual histogram, and NORMAL / POSSIBLE_BUFF / INCONCLUSIVE classification for the +35 p.p. MATK% hypothesis; Equipment/Base flat MATK/PATK are reported missing, not invented; migration 0051
- [ ] Phase 11: Verified Access — Claim Authorization & Discord OAuth — first access is manual-fill and officer-validated since 0034 (DSCD-01 holds via claim/registration request approvals, no print anywhere); Phase 11 replaces the manual trust with the real anchor: one-time officer-confirmed Discord↔character link, server-side bot-token role check, custom access token hook keeping every RLS policy intact, device-binding re-decision, PIN retirement path (INSERTED 2026-10-26)

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
**Plans**: 4/4 plans complete (see `.planning/phases/07-dummy-data-seed-catalog-alignment/`)
Plans:
- [x] 07-01-PLAN.md — Catalog alignment migration 0012 (official job tree, OVR continuity) — Wave 1
- [x] 07-02-PLAN.md — Build-role vocabulary propagation (labels, types, staff form) — Wave 1
- [x] 07-03-PLAN.md — Dummy seed + purge authoring, local rehearsal, D-12 owner gate — Wave 2
- [x] 07-04-PLAN.md — Live push + seed apply + starvation verification + release gate — Wave 3

Cross-cutting constraints: catalog work (ROLE-12) precedes seeding — roster uses advanced job names that don't exist in the current 15-class catalog (documented problem 4); the seed is NEVER a migration and never a direct child of `seeds/` (flat `db.seed` glob auto-applies it); dummy rows stay resident for the milestone duration BY OWNER DECISION 7 (observing v1.0 on realistic cohorts — no overnight-window ritual anymore), but rank pollution of real members during the window is owner-accepted and the purge-before-release gate is non-negotiable; this phase touches NO rank RPC — the seed purpose here is observation, band calibration moves to Phase 9.
**UI hint**: yes

### Phase 07.1: Visual ID implementation (INSERTED)
**Goal**: The Hellz mark (sharp, red neon, dark, sci-fi) becomes the product's visual system: full red accent swap (gold retired from UI chrome, survives only as tier-gold), logo-anchored near-black surfaces with red-tinted hairlines, moderate static neon on key moments, the mark as favicon + login hero + compact header mark, and one self-hosted display font for hero elements — all inside the existing Tailwind v4 `@theme` token architecture, zero functional changes.
**Depends on**: Phase 7 (shipped — seeded cohorts resident, so the visual pass happens on realistic data)
**Requirements**: VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, VIS-06, VIS-07
**Success Criteria** (what must be TRUE):
  1. The logo red family is THE interactive accent everywhere (focus rings, active tab, buttons, checkbox, links); no gold remains on UI chrome (`#E3B341` absent from src) — gold survives only as the `--color-tier-gold` token (D-01/D-02)
  2. Surfaces are logo-anchored near-black (#141414/#1E1E1E) with red-tinted hairlines; the 60/30/10 surface discipline and text contrast (AA) hold (D-03)
  3. Neon is moderate and STATIC: glows only on active tab, OVR hero number, Destaques tier accents, login hero, focus rings; grid/gradient backdrop only on login + Destaques; zero animations; `prefers-reduced-motion` respected (D-04/D-05)
  4. The mark appears as favicon (replacing the Vite icon), login hero lockup ("Hellz — Painel Geral"), and compact header mark left of "Olá, {name}" — nowhere else (D-06)
  5. One display font (Orbitron, OFL) serves wordmark/lockup, page h1s, and OVR/points hero numbers via a self-hosted subset woff2 with pt-BR diacritics, system fallback, and preload; body text stays on the system stack (D-07)
  6. Tier tokens stay semantically distinct from each other and from the brand red; `presentation.ts` band logic untouched; all existing tests green; no API/RPC/behavior change (VIS-07)
**Plans:** 2/2 plans complete

Plans:
- [x] 07.1-01-PLAN.md — Neon token system rewrite + display font infrastructure (Wave 1)
- [x] 07.1-02-PLAN.md — Logo placement + neon moments + owner visual gate (Wave 2)

### Phase 07.2: Premium Showcase & Game-Grounding (INSERTED)
**Goal**: Turn the panel's celebration surfaces into a premium EAFC-style showcase grounded in the game: stat cards display only the 6 class+function key stats in Ultimate Team form (short 3-letter labels, downloadable/shareable as JPEG), Destaques becomes a bolder avant-garde showcase for Impecável players only, game assets (class icons/job imagery) come from the official ROO media (roocamer.gnjoy.game), mobile-first elements get a desktop layout pass, and officials gain a full-stat OVR-based rank view — all on the 07.1 token/typography foundation.
**Depends on**: Phase 07.1 (shipped — token layer, Orbitron, mark placement, Impecável tier live)
**Requirements**: CARD-01, CARD-02, CARD-03, DSTQ-01, ASST-01, LAYT-01, RANK-02, RELV-01
**Success Criteria** (what must be TRUE):
  1. Member stat cards show ONLY the 6 key stats of the character's class+function, via a leak-safe server design — key-stat CONFIG (weights/toggles) never exposed to members; RNK-02 no-skewing rationale preserved; must be reconciled with Phase 9's role-differentiated key stats at planning time (CARD-01)
  2. Cards use EAFC Ultimate Team styling with abbreviated stat labels (e.g. shooting → SHO) and can be downloaded as a shareable JPEG (CARD-02, CARD-03)
  3. Destaques is redesigned bolder/avant-garde (premium showcase register, distinct from the minimal-functional rest of the site) while remaining Impecável-only (DSTQ-01)
  4. Class/job icons and placeholder imagery from roocamer.gnjoy.game are integrated where they ground the UI in the game (ASST-01)
  5. Desktop widths no longer squish/misalign mobile-first elements — a deliberate desktop layout pass across cards and dense screens (LAYT-01)
  6. Officials and above see a full-stat OVR-based rank view in its own tab (all 57 stats; members never see it) (RANK-02)
  7. A secondary "relevant" stat tier exists (unlimited count, never displayed on cards) whose sole purpose is guiding the "foco de melhoria" section (RELV-01)
**Plans:** 6/6 plans complete

Plans:
- [x] 07.2-01-PLAN.md — Server foundation: migration 0013 (relevant tier, my_card, role_rank, get_promotion key highlights, label_short) live + smoke matrix + D-11 owner review (Wave 1)
- [x] 07.2-02-PLAN.md — Client data layer: closed api.ts wrappers + D-07 foco pure function, TDD (Wave 2)
- [x] 07.2-05-PLAN.md — ROO assets + canvas JPEG export + Destaques full-bleed showcase rework (Wave 3)
- [x] 07.2-03-PLAN.md — Painel EAFC key-stat strip + member own-card download + foco rewiring + Stats-Chave relevant section (Wave 4)
- [x] 07.2-04-PLAN.md — Officials rank view: role-primary boards + 57-stat detail + staff tab (Wave 4)
- [x] 07.2-06-PLAN.md — Desktop layout pass, one breakpoint system + staff-view class icons + owner walk (Wave 5)

### Phase 8: Whitelist Lifecycle, Self-Request Whitelisting, First-Login PIN Setup & Character Identity Capture
**Goal**: Staff control exactly who can access the panel — players may REQUEST access, officers manually whitelist them, players choose their own PIN at first login, and every submission records the in-game identity (ID, nickname, jobs) — with the whitelist as the trust boundary and no second rate-limit mechanism.
**Depends on**: Nothing within v1.1 (independent of Phases 7, 9, 10; builds on the shipped v1.0 auth stack)
**Requirements**: WHIT-01, WHIT-02, WHIT-03, WHIT-04, WHIT-05, WHIT-06, WHIT-07, WHIT-08, WHIT-09, WHIT-10, IDEN-01, IDEN-02, IDEN-03
**Success Criteria** (what must be TRUE):
  1. An officer or owner can add a player with handle-only registration (handle + display name, role forced `member`, no PIN set), and that player — logging in for the first time — is routed to a first-login flow to choose their own 4-digit PIN (double-entry confirmation) and lands directly in the panel with a standard 7-day session
  2. A second PIN-setup attempt on an already-claimed handle fails with an `already_set` response (atomic claim, no silent last-writer-wins), and setup attempts are rate-limited by the existing lockout machinery — no parallel rate-limit mechanism exists
  3. Officers can see which whitelisted members haven't claimed a PIN yet (server-derived flag on a staff-only surface, never the hash), and a removed (inactive) player re-added by staff rejoins with their submission history intact instead of erroring
  4. The owner can reset a member's PIN via an owner-only RPC, and the member can then log in with the new PIN
  5. Trust-boundary hygiene holds: handles with the dummy sentinel prefix are rejected at add time, and legacy placeholder-PIN whitelist rows are converted to the claim flow (their next login routes to first-login PIN setup, and their lockout rows are cleared)
  6. (Owner feedback 2026-10-20) A player can submit a membership request without staff help; officers approve/reject it in Validações; approval reuses the handle-only `add_member` path and a pending request grants zero data access — a requester can check their own status
  7. (Owner feedback 2026-10-20) Each submission captures the in-game ID, nickname and job(s) with OCR pre-fill + manual correction, stored PER SUBMISSION (append-only history) so job swaps are traceable; the latest validated submission supplies the card nickname, and staff can view the identity history (members cannot)
**Plans**: 9 plans - 08-01..08-06 executed (6/6); 08-07..08-09 gap closure for UAT tests 3/4/7 EXECUTED (08-07 not_member guard + live satturne purge, 08-08 my_identity self-read + title adoption, 08-09 empty-default function selector + member-choice promotion + phase battery); full battery green; pending owner UAT re-test.

Cross-cutting constraints: deploy order invariant — migration 0014 (nullable `pin_hash` + the identity-capture columns/table; renumbered: Phase 7's catalog migration took 0012, Phase 07.2 takes 0013) → patched `verify-pin` + new `setup-pin` Edge Functions live → first `add_member` use (the null-hash branch must precede the bcrypt compare or pinless members 500); `add_member` stays the ONLY write surface on `members` (no new RLS policy, no direct INSERT); inactive members must NEVER receive `pin_setup_required` (uniform 401 — branch ordering is a smoke-probed must-have); membership requests are a separate table with RPC-only writes (insert = anon-safe request; approve/reject = staff-gated SECURITY DEFINER) — a pending request is never a member row.
**UI hint**: yes

### Phase 08.1: Security hardening for public deployment

**Goal:** The live panel at https://hellz-dashboard.vercel.app/ is secured for public deployment: login connection error fixed (urgent ops), dummy data purged and stays purged, generic placeholder handles rotated to real owner/officer/member handles with fresh PIN hashes, and the identification system hardened (staff handle prefix namespace separate from members; session JWT bound to device fingerprint; step-up re-PIN for role changes/hierarchy only, owner-only hierarchy power). Nothing from Phase 08.1 is deferred; Phase 9 items (Fine Ranks) are out of scope.

**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06 (added 2026-10-23 — the original 08.1 items had no requirement IDs and three of the four claims shipped unproven; see REQUIREMENTS.md "Deployment Security Hardening")

**Depends on:** Phase 8
**Plans:** 8/10 plans executed

Plans:
- [x] 08.1-01-PLAN.md — Dummy purge: purge-dummies.sql via apply-seed.mjs, zero-dummy verification (four zeros), smoke matrix re-run — Wave 1 — executed (73 dummies + 17 `smoke-idn-*` rows purged)
- [x] 08.1-02-PLAN.md — Generic handle rotation: real owner handle + fresh hash applied out-of-band via apply-seed.mjs (hash never committed) — Wave 2 — executed (rotation itself superseded by 08.1-06)
- [x] 08.1-03-PLAN.md — Device fingerprint binding: verify-pin mints `device_fp`, client sends `X-Device-Fingerprint` — Wave 2 — executed BUT never enforced (closed by 08.1-08)
- [x] 08.1-04-PLAN.md — Step-up re-PIN: re-PIN for role changes/hierarchy only, owner-only hierarchy power, single-use device-bound token — Wave 3 — executed
- [x] 08.1-05-PLAN.md — Step-up plan duplicate — superseded (no-op; delivered by 08.1-04 + 0017)
- [ ] 08.1-06-PLAN.md — Credential retirement + sentinel guard: migration 0023 (neutralize `*-handle` rows + `members_sentinel_not_privileged` CHECK), credential-free whitelist seed, `scripts/set-member-pin.mjs`, owner PIN rotation — Wave 2 — SEC-01, SEC-02
- [x] 08.1-07-PLAN.md — Hosting hardening + release gate: `vercel.json` security headers (CSP report-only) and `scripts/check-deployment.mjs` (bundle env, secret scan, header scan, function reachability) — Wave 1 — SEC-03
- [x] 08.1-08-PLAN.md — Server-enforced device binding: UA-only fingerprint on both sides, migration 0024 (`assert_device_bound()` on the four staff RPCs), client `device_mismatch` handling — Wave 3 — SEC-04
- [x] 08.1-09-PLAN.md — Smoke-harness credential hygiene: `scripts/smoke-config.mjs` (env creds + per-run fixture PIN), all seven smoke scripts migrated, `scripts/check-credentials.mjs` repo gate — Wave 1 — SEC-05
- [ ] 08.1-10-PLAN.md — Live verification battery + owner walk: `scripts/verify-phase-08.1.mjs` (local gates, release gate, live SQL invariants, behaviour probes, smoke matrix) and `08.1-VERIFICATION.md` — Wave 4 — SEC-06

### Phase 08.10: pt-BR OCR Identity (HOTFIX, INSERTED)

**Goal:** First access works on the LIVE pt-BR client: the identity band reads nickname + ID + class from "Classe Criador" prints (not just the English "Job Gypsy" fixture), the localized class maps to its official English catalog name, and a failed read names exactly what is missing.

**Why:** Owner UAT 2026-10-22 — every first-access claim on the live client was blocked with "Não conseguimos ler o ID, o nick e a classe" because `JOB_PATTERN` only knew `Job`, `matchClassName` only knew English class names, and `setup-pin` validates against the English `classes` catalog.

**Requirements**: IDEN-01, IDEN-02, WHIT-02 (repair, no new IDs)
**Depends on:** Phase 8
**Plans:** 1/1 — `08.10-01-PLAN.md` (see `.planning/phases/08.10-pt-br-ocr-identity/`)

### Phase 9: Fine Ranks — Value-Proportional Scale & Role-Differentiated Key Stats
**Goal**: Points differentiate the top end by real stat gaps within class+build-role cohorts — the leader holds 99 and everyone below scales by value distance — while key-stat configuration becomes per (class, build-role) with zero deploy-day OVR change, all landing in ONE migration and re-locked with ONE tripod pass.
**Depends on**: Phase 7 (build-role vocabulary exists, catalog aligned, realistic seeded cohorts resident for band calibration)
**Requirements**: SCALE-01, SCALE-02, SCALE-03, ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-06, ROLE-07, ROLE-08, ROLE-10, ROLE-11, HOME-03, KEYU-01, KEYU-02, KEYU-03
**Success Criteria** (what must be TRUE):
  1. Per-stat points are value-proportional within class+build-role cohorts: the leader(s) at the max value hold exactly 99, everyone below scales by `own/max × 99` (top-end cuts at 98/97/96/95 emerge naturally), and OVR inherits the finer scale with zero formula change and the floor of 51 preserved — proven by exact-value smoke on live data
     2. ONE migration (0017; renumbered: Phase 7 took 0012, Phase 07.2 takes 0013, Phase 8 takes 0014, Phase 8 gap closure consumed 0015, Phase 08.1 took 0016) swaps the formula across all three rank RPCs (`my_report`, `class_top5`, `get_promotion`), rebuilds `class_key_stats` to key per (class, build-role) with advisory-lock per (class, function), backfills every existing class config into all build-role values (pre/post-migration OVR parity smoke: zero OVR change where cohort unchanged, null where no role/n<3), ships `set_key_stat` v2 (old signature dropped; `set_relevant_stat` eliminated; KEYU ordered selection set: first 6 = keys, 7th+ = relevants; deselect promotes oldest relevant), and folds in the single additive `last_validated_at` scalar on `my_report` — zero new per-stat fields
  3. OVR in all three RPCs reads the member's own (class, build-role) config, per-stat cohorts become class+build-role, and a member with no configured combo gets OVR = null via the existing data-insufficient rendering — never a silent class-defaults fallback
  4. Every re-locked baseline is green in the same phase: `rankMath.ts` locked test values, `smoke-rank.mjs` exact-value matrix, and `smoke-promotion.mjs` ordering (fixtures carry build roles and per-combo 6-row key-stat inserts); tier bands (D-01/D-02) are recalibrated by the owner against the resident seeded cohorts before being locked, and the improvement-screen percentile phrase is gone — stat cards no longer claim percentile position
  5. The admin surface works and the governance holds: Stats-Chave gains the role selector (class → role → stat chips, per-combo count display, KEYU ordered-set copy), build-role assignment stays staff-only (Personagens path), the staff audit pass re-assigns existing members' build roles before any per-role differentiation applies, officers see the per-(class, role) config coverage indicator (staff-only) — and RNK-02 closed-payload discipline holds (leak probes stay green, no member-visible sign that role configs differ)
  6. (Owner feedback 2026-10-20) Key and relevant are ONE ordered selection set per (class, build-role): first 6 = keys, 7th+ = relevants; deselecting a key promotes the oldest remaining relevant so the key set stays at 6 whenever ≥6 are selected — implemented inside `set_key_stat` v2 (single RPC, persisted order, advisory-lock safe), replacing the key-XOR-relevant gating
**Plans**: 5/5 plans complete (see `.planning/phases/09-fine-ranks-value-proportional-scale-role-key-stats/`)
Plans:
- [x] 09-01-PLAN.md — Migration 0018: stat_direction, class_key_stats re-key + backfill, set_key_stat v2, my_report/class_top5/get_promotion rewrites, last_validated_at — Wave 1 — committed (9df6209)
- [x] 09-02-PLAN.md — Client API + Stats-Chave: set_key_stat_v2 wrapper, setRelevantStat removed, role selector + KEYU ordered set + coverage indicator — Wave 2 — committed (9df6209)
- [x] 09-03-PLAN.md — Tripod re-lock: rankMath.ts value-proportional spec + tests, smoke-rank.mjs + smoke-promotion.mjs re-baselined — Wave 3 — committed (9df6209)
- [x] 09-04-PLAN.md — Dashboard UI: percentilePhrase dropped, stat cards show raw points + tier badge — Wave 4 — committed (9df6209)
- [x] 09-05-PLAN.md — KeyStatsPage tests — Wave 5 — committed (9df6209)
- [~] 09-06-PLAN.md — Live smoke verification against deployed Supabase — env-gated (requires SUPABASE_ACCESS_TOKEN/PROJECT_REF) — deferred

Cross-cutting constraints: ONE migration, ONE tripod re-lock — both features rewrite the same three RPC bodies, so they land together (owner decision 8; ROLES.md §3.6: never rewrite the same three RPC bodies twice in one milestone); the backfill is the live-data continuity trick — without it every member's OVR nulls on migration day (P-ROLE-1, pre/post parity smoke is the detection); advisory-lock hash gains the role component and the old `set_key_stat` signature is dropped in the same migration (P-ROLE-6); the unified key/relevant selection (owner feedback 2026-10-20) ships INSIDE that same `set_key_stat` v2 rewrite — never as a separate migration; promotion top-5 stays class-wide across roles (OVR is the cross-role comparable currency); staff audit pass (ROLE-10) gates BEFORE per-role differentiation lands (P-ROLE-3: silent wrong-cohort scoring); migration + frontend deploy together to avoid stale-band skew (R17); formula edges (all-equal → one locked behavior, max=0, n≥3 gate retention) locked in spec + smoke; no new npm dependencies.
**UI hint**: yes

### Phase 9.1: Hidden Raw Defenses (RPDEF/RMDEF)
**Goal**: Add hidden raw physical/magical defense stats (`RPDEF`/`RMDEF`) computed as `Equipment DEF / (1 + Equipment DEF%)` from two OCR tooltip captures inside the Especial step. Raw defenses register as independent catalog stats (`special` group, flat, higher-is-better, `label_short` `RPDEF`/`RMDEF`), take every `class_key_stats` position previously occupied by `PDEF`/`MDEF` preserving `selection_order`, and stay read-only with transient equipment inputs that are never stored or submitted. Visible to members like any other stat.
**Depends on**: Phase 9 (migration 0018 applied live; `class_key_stats` re-keyed to `(class_name, char_function, stat_key)` with `selection_order`)
**Requirements**: DEF-01, DEF-02, DEF-03, DEF-04, DEF-05, DEF-06
**Success Criteria** (what must be TRUE):
  1. `stat_catalog` gains `rpdef`/`rmdef` rows in `special` (flat, `stat_direction='higher'`, `label_short` `RPDEF`/`RMDEF`); catalog count 57 → 59; all member-facing surfaces (`my_report`, `my_card`, `get_promotion`, `role_rank`, dashboard, review, officer key-stat pages) surface them automatically with no RPC rewrite.
  2. Two tooltip OCR captures (`pdef_tooltip`/`mdef_tooltip`, transient `equip_pdef_raw`/`equip_mdef_raw`) inside the Especial step; per-capture failure/filled state so one tooltip read never blanks the other; new tooltip grammar reads the "Equipment PDEF/MDEF" line and digit-reads the value; OCR field count 56 → 58.
  3. Raw defense calculated read-only: `floor(equipment / (1 + pct / 100))`; guards equipment ≥ 0 and denominator > 0; computed before `groupComplete`, `ReviewStep`, `buildStatsPayload`, and prospect gate; changing equipment or `equip_*_pct` unchecks Especial verification (one checkbox covers all 18 special values).
  4. `0019_raw_defenses.sql` runs AFTER `0018` (untouched); inserts `rpdef`/`rmdef` with labels; remaps every `class_key_stats` row where `stat_key in ('pdef','mdef')` — keys and relevants — to `rpdef`/`rmdef` preserving `selection_order` and `selected_at`, then deletes old rows; OVR nulls for affected classes until a new validated submission supplies both raw values.
  5. Prospect/min-count gates: Edge function `58..59`; `requestFlow` minimum 58; DB floor `>=56` stays (Edge is exact gate).
  6. Tests/seeds: `stat_catalog.sql` 59 rows; live `card-labels-4-6char.sql` gains `RPDEF`/`RMDEF`; structure tests unchanged at 56 screen fields + new tooltip grammar tests; wizard/prospect tests 58/59 payload expectations; smoke scripts 57 → 59, 56 → 58 where they assert full catalog.
**Plans**: 1/2 plans complete (09.1-01 done: migration 0019 + seeds committed in 4e818ce; DEF-01/DEF-04 complete)
Plans:
- [x] 09.1-01-PLAN.md — Catalog insert + migration 0019 + class_key_stats remap — Wave 1 — committed (4e818ce): DEF-01/DEF-04 complete
- [~] 09.1-02-PLAN.md — OCR tooltip grammar/reader + Especial sub-section UI + effective-input gating + tests — Wave 2 — in progress (uncommitted changes to structure.ts, recognize.ts, etc.)
**Cross-cutting constraints**: `0018` must not be modified; `0019` follows `0018`; equipment values never enter `stat_catalog`/`buildStatsPayload`/`create_submission` payload; raw values merged into effective inputs only; the Special sub-section renders only when catalog contains both raw stats so old cached clients keep working; no new wizard step or catalog group.
**UI hint**: yes

### Phase 10: Personalized Home Landing Tab
**Goal**: Início is the guild LANDING page — a visitor who is not logged in sees the Impecáveis showcase and can Entrar/Solicitar acesso; after login the same page adds the member's own OVR and best stats with a stale-data nudge. One page, two audiences (owner correction 2026-10-24).
**Depends on**: Phase 9 (`my_report` gains `last_validated_at` in migration 0014 — shipped there, consumed here)
**Requirements**: HOME-01, HOME-02, SHWC-01
**Success Criteria** (what must be TRUE):
  1. After login, members land on Início showing their own OVR card (reused OvrHero) and a top-3 best-stats strip (value + points + tier badge), sorted client-side from fields the payload already returns
  2. A member more than 7 days since their last validated submission sees a stale-data CTA navigating to Enviar Status; a member who never submitted sees the evergreen first-submission variant; a member with fresh data sees no banner — the strictly-greater-than-7-days boundary is locked in a test
  3. The personal blocks show only the player's own data; the showcase below them keeps the guild-wide EAFC cards and the aggregates-only discipline is unchanged
  4. Início promo cards render in a premium scroll-snap slider (1-up mobile, 3-up desktop, keyboard + swipe reachable, server order preserved). Início is PUBLIC: a visitor without a session sees the same showcase via the anon-callable `get_promotion_public()` (migration 0029) plus an Entrar CTA; the standalone Destaques tab is removed (owner correction 2026-10-24, reversing the 2026-10-20 deferral)
**Plans**: 3/3 plans + owner-correction rework (see `.planning/phases/10-first-access-by-print/`)
Plans:
- [ ] 10-01-PLAN.md — Início tab shell + MyReport last_validated_at + InicioPage skeleton — Wave 1
- [ ] 10-02-PLAN.md — Stale-data CTA + top-3 best-stats strip + boundary tests — Wave 2
- [ ] 10-03-PLAN.md — Destaques scroll-snap slider + keyboard + swipe (SHWC-01) — Wave 1
- [ ] 10-04-REWORK (owner correction 2026-10-24) — Início absorbs Destaques; public landing via 0029 (`get_promotion_public` + anon card-photos read); default tab Início; photo_path restored (0026 regression)

Cross-cutting constraints: no router library — `'inicio'` joins the existing `App.tsx` Tab union pattern; no date library — epoch-diff arithmetic on the ISO string; no client-side points recomputation (AGENTS.md non-negotiable); the slider is CSS scroll-snap only (no new npm dependency, no autoplay — 07.1 D-05 static-only rule); the public showcase is server-enforced (anon grant on one closed-field RPC + one storage predicate) — never UI-only gating.
**UI hint**: yes

### Phase 10.1: Universal Rating Unification (URGENT FIX, INSERTED 2026-10-27)

**Goal**: One rating everywhere — for the same member, the OVR on the Painel card, the Painel OVR hero, the Início/Destaques showcase cards and the Ranking tab is ONE number (round-8 owner ruling: "Ratings are an universal measurement, once calculated they must be displayed equally"), computed by the locked Phase 9 value-proportional formula, gated by exactly the 6 ordered keys, inside one cohort definition.

**Why**: Owner report 2026-10-27 — the card OVRs disagree with the Ranking tab. Investigation (read-only live audit + migration archaeology) proved the ratings engine is split-brain: migration 0018 (Phase 9) swapped the formula in only 3 of the 6 OVR-producing RPCs, hotfixes 0023/0024 preserved the old formula in the other 3, and 0028's key filter missed `role_rank`/`staff_requests`. Live result: **6/6 OVR-capable members show different OVRs across surfaces; 3 (High Priest/suporte) show NULL on the Ranking tab while their cards show a number; every Solicitações applicant OVR has been null since 0018**. Full evidence: `.planning/phases/10.1-universal-rating-unification/10.1-CONTEXT.md`.

**Depends on**: Phase 9 (0018's value-proportional formula is the canonical target), 0028/0029 bodies (the byte-faithful source shapes); executes BEFORE Phase 11 per owner call (urgent fix; no dependency on Phase 11)
**Requirements**: UNIF-01, UNIF-02, UNIF-03, UNIF-04 (see REQUIREMENTS.md "Rating Unification (Phase 10.1)")
**Success Criteria** (what must be TRUE):
  1. `role_rank`, `my_card` and `staff_requests` compute per-stat points and OVR with the Phase 9 value-proportional formula (stat_direction-aware best, clamped [0,99], n≥3 gate, floor-51 OVR) — the pre-Phase-9 rank-percentile formula no longer exists in any production RPC (UNIF-01)
  2. Every OVR gate and key-stat list read filters `selection_order <= 6`; `staff_requests` also reads the key set by (class, build-role) — the Ranking tab shows a non-null OVR for the High Priest/suporte members and the Solicitações board shows applicant OVRs again (UNIF-02)
  3. All six OVR-producing RPCs share ONE cohort definition — latest value per (member, stat) over non-rejected AND non-discarded submissions, over ACTIVE members of the same class+build-role (UNIF-03)
  4. A runnable parity gate locks the contract: the smoke-card UNIFY probes (red since 0018) pass again and extend to `role_rank` and `my_report`; a read-only parity audit shows zero cross-surface OVR divergence for every OVR-capable member; both run green against live and are recorded in `10.1-VERIFICATION.md` (UNIF-04)
  5. Zero payload-shape changes — the client renders server values verbatim and ships no change; `get_promotion`/`get_promotion_public` bodies are byte-untouched (already canonical)

**Plans:** 2/2 plans complete
Plans:
- [x] 10.1-01-PLAN.md — Migration 0036: role_rank/my_card/staff_requests value-proportional rebases + selection_order<=6 everywhere + my_report/class_top5 cohort alignment + bookkeeping + pgrst reload notify — Wave 1 — UNIF-01/02/03
- [x] 10.1-02-PLAN.md — Parity re-lock + live apply + verification: rpc-ovr-parity-audit.mjs, smoke-card UNIFY 10d/10e, apply-seed.mjs live apply, 10.1-VERIFICATION.md — Wave 2 — UNIF-04

Cross-cutting constraints: append-only (0001–0035 never edited, `create or replace` exact signatures only, zero `drop function`); the value-proportional expression is copied verbatim from the 0028 shapes — never re-derived; the permanent anti-refork guard is the parity smoke, not a helper refactor (considered and deferred, D-10.1-05); migration + bookkeeping row + `notify pgrst, 'reload schema'` land together (0035 lesson); live apply via apply-seed.mjs only (no `supabase db push` in this environment); the two sanctioned smoke-fixture members stay until second order (D-10.1-08) — the pre-release purge gate is unchanged; no new npm dependencies.
**UI hint**: no (server-side values only; owners will SEE corrected numbers on existing surfaces)

### Phase 10.4: Battlefield Lineups & Roster Sync (INSERTED 2026-10-30)

**Goal**: Officers manage and members view the guild's 8×5 party lineups for **Vigrid Field (Raid 1)** and **Ruinscape (Raid 2)**, with all 80 real players from the owner's current lineups pre-registered in `Personagens` (without forcing ambiguous classes) and a 1-click **JPG export** for each battlefield styled in the Hellz dark/neon visual system with class icons and class color accents.

**Depends on**: Phase 8/10 (`members` registry, `member_identity_history`, `ClassCrest` ROOCDB icons, Canvas 2D export pattern)
**Requirements**: LNUP-01, LNUP-02, LNUP-03, LNUP-04, LNUP-05
**Success Criteria** (what must be TRUE):
  1. Two battlefields (`vigrid_field` = "Vigrid Field — Raid 1", `ruinscape` = "Ruinscape — Raid 2") each hold 8 parties (`G1`–`G8`) of up to 5 slots (`1`–`5`, slot 1 = Party Leader) with an officer-editable party role label (seeded with `MOBS CIMA/BAIXO` on Raid 1 G5 & Raid 2 G3, and `MOBS DIREITA/ESQUERDA` on Raid 1 G6 & Raid 2 G4) and a live `N/5` counter per party (LNUP-01)
  2. Every active logged-in member sees the `Lineup` tab in read-only mode (highlighting their own party/slot if assigned) and can download the battlefield JPGs; only active officers and the owner can assign/clear slots or edit party labels, enforced server-side in SECURITY DEFINER RPCs with `assert_device_bound()` (LNUP-02)
  3. Smoke/dummy rows (`discord_handle like 'smoke%'` or `'dummy-%'`) and inactive rows are excluded from the assignable roster and rejected server-side; assigning a member already in another slot atomically moves them so a player can never occupy two slots at once (LNUP-03)
  4. All new real nicknames from the owner's Raid 1 and Raid 2 reference images are pre-registered into `members` (`active = true`, `pin_hash = null`, `char_class = null` — no guessed classes) and linked into the default seeded lineups alongside existing active members (reactivating `XAVENTAL`), so `Personagens` immediately lists the full 80-player guild roster (LNUP-04)
  5. Clicking "Baixar JPG (Vigrid Field)", "Baixar JPG (Ruinscape)", or "Baixar ambas (JPG)" renders a crisp 1920×1080 landscape `image/jpeg` via Canvas 2D in the Hellz dark/neon theme (`#141414`/`#1E1E1E`, red neon accents, Orbitron/Bebas Neue, Hellz mark, `G1`–`G8` columns, party assignment badges, leader crown/bold on slot 1, class icon + class color bar per slot, `N/5` footer) with zero canvas taint and zero new npm dependencies (LNUP-05)

**Plans**: 3 plans created (see `.planning/phases/10.4-battlefield-lineups/`)
Plans:
- [x] 10.4-01-PLAN.md — Migration 0040: `lineup_parties` & `lineup_slots` schema + RLS + `get_lineups` / `set_lineup_slot` / `set_lineup_party_label` RPCs + 80-player roster pre-registration & default Raid 1/2 seed — Wave 1 — LNUP-01/02/03/04
- [x] 10.4-02-PLAN.md — Client API + `LineupPage` UI: `App.tsx` tab wiring, Battlefield switcher, 8-party grid, member read-only view with "Minha PT" highlight, officer slot combobox/swap + editable party labels — Wave 2 — LNUP-01/02/03
- [x] 10.4-03-PLAN.md — Canvas 2D JPG generator (`lineupExport.ts`): Hellz dark/neon 1920×1080 board, class color/icon rendering, single & dual battlefield JPG download + unit/render tests — Wave 3 — LNUP-05

Cross-cutting constraints: append-only migration (`0040_battlefield_lineups.sql`), applied live via `scripts/apply-seed.mjs` with `schema_migrations` bookkeeping + `notify pgrst, 'reload schema'`; `get_lineups` returns ONLY `{member_id, display_name, char_class, char_function}` per occupant (never stats/OVR/key-stat config — RNK-02 / CMP-03 discipline); smoke fixtures (`smoke%`, `dummy-%`) never enter lineups; zero new npm dependencies.
**UI hint**: yes

### Phase 10.5: Anti-Cheat Guardrails (INSERTED 2026-10-30)

**Goal**: A buffed submission can no longer silently inflate the ranking. The server flags defense values at or above 1.5× the same class+build-role cohort average (RPDEF/RMDEF from the Equipment PDEF/MDEF tooltips, plus Equipment PDEF%/MDEF% — the four values Angelus and Assumptio inflate by ~95%), records every field the player altered after the OCR read (printed value → final value), and warns officers about an 8+ point OVR swing when class and build-role are unchanged. Nothing is auto-rejected: the submission is saved pending and the officer decides.

**Depends on**: Phase 9.1 (`rpdef`/`rmdef`), Phase 10.1 (canonical value-proportional OVR), Phase 8 (submission identity)
**Requirements**: CHEAT-01, CHEAT-02, CHEAT-03, CHEAT-04, CHEAT-05
**Success Criteria** (what must be TRUE):
  1. `rpdef`, `rmdef`, `equip_pdef_pct` and `equip_mdef_pct` at ≥ 1.5× the class+role cohort average (latest validated per active member, submitting member excluded, n ≥ 3) appear in `officer_queue().anti_cheat.defense_spikes` and set `flagged` (CHEAT-01)
  2. The player is warned before sending on the Especial step and above Enviar; the submission is still allowed and saved pending with the warning visible to officers (CHEAT-02)
  3. Every input the OCR read filled is stored as `ocr` or `ocr_edited` with the printed value and the final value; catalog final values are re-derived server-side, never trusted from the client; equipment tooltip inputs are included because RPDEF/RMDEF derive from them (CHEAT-03)
  4. A pending submission that would move OVR by ≥ 8 points with unchanged class/build-role shows previous→projected and sets `flagged`; a class/role change suppresses that specific warning (CHEAT-04)
  5. Server-side enforcement, one rating formula, no member read path to the audit table, no key-stat config in any anti-cheat payload, no new npm dependencies (CHEAT-05)

**Plans**: 1 plan
Plans:
- [x] 10.5-01-PLAN.md — Migration 0046 + server flags + client provenance/warning + Validações panel + tests — Wave 1

**Cross-cutting constraints**: append-only (`0046` adds one table; `create_submission` keeps every 0014 validation; `officer_queue` payload is additive only); the OVR projection copies the 0036 value-proportional expression verbatim (never re-derived, never client-side); `submission_provenance` is RLS-on with no policies (definer surfaces only); deploy order = migration then client (an old cached client works against the new RPC; the reverse would fail `p_provenance` resolution). Migration 0046 applied live 2026-10-30 and verified with rollback-wrapped synthetic submissions; the client bundle is the remaining deploy.

### Phase 10.6: Cross-Cohort Stat Inspector (INSERTED 2026-10-30)

**Goal**: Officers can inspect ONE stat across the entire real roster, independent of class and build-role cohort — the lens cheat investigation needs. The staff Ranking tab gains a "Stat entre todos" mode backed by `stat_overview(p_stat_key)`: latest validated value per active real member, self-excluded class+role average, guild average, and direction-aware 1.5×/0.5× review hints. Fixtures (`smoke%` / `dummy-%`) never appear; members without a value are listed last with `—`. Nothing is auto-rejected and no key-stat config is exposed.

**Depends on**: Phase 10.5 (cohort baseline rule), Phase 07.2 (staff Ranking tab), Phase 10.1 (no rating formula change)
**Requirements**: XSTAT-01, XSTAT-02, XSTAT-03
**Success Criteria** (what must be TRUE):
  1. Selecting any catalog stat returns every active real member's latest VALIDATED value with `submitted_at`; members without a value return `value: null` and sort last (XSTAT-01)
  2. Each row carries the self-excluded class+build-role average (displayed at n ≥ 3, same gate as 0046) and the guild average/median/max/min; both `cohort_ratio` and `guild_ratio` are serialised (XSTAT-02)
  3. The Ranking tab renders the new mode with a stat selector, guild summary, value ordering toggle and two badges: red **Acima da coorte** (≥ 1.5× cohort, the canonical anti-cheat rule) and gold **Fora do padrão** (≥ 1.5× guild, indicative). Lower-is-better stats flag at ≤ 0.5× (XSTAT-02)
  4. The RPC is staff-only (member JWT → `forbidden`, anon no EXECUTE), validated-only, fixture-free, and does not change any OVR/points surface (XSTAT-03)
  5. No new npm dependencies; append-only migration 0047 with bookkeeping + pgrst reload.

**Plans**: 1 plan
- [x] 10.6-01-PLAN.md — Migration 0047 + `stat_overview` + Ranking stat mode + ordering/tests — Wave 1 — applied live 2026-10-30

**Cross-cutting constraints**: raw value order is desc/null-last from the server (buffs inflate upward); the client may only reverse the array for the ascending view (view aid, no rank math); `class_average` is suppressed below n=3 and excludes the member; the guild badge is deliberately sensitive on zero-heavy stats (`crit_dmg`) and is labeled as a hint, never a verdict. **0048 corrective migration** aligns every 0046/0047 cohort scope with the 0038 `cohort_group()` (Artista = Bard + Gypsy; the shared key config drives `ovr_projection`) — live-proven by exact `ovr_projection`/`my_report` parity for a Gypsy/suporte member and a merged n=5 inspector baseline. Deploy order: migration first, then the client bundle.

### Phase 10.7: Statistical Buff Detection (INSERTED 2026-10-30)

**Goal**: Catch buffed submissions from the data itself instead of relying only on the fixed 1.5× margin. For every stats cohort, the normalized base `flat / (1 + pct/100)` is modeled with a robust median/MAD curve; a pending submission is flagged when its base is ≥ 3.5σ off the curve or the actual flat is ≥ 30% away from the curve's expected value. The Impositio Manus signature (+35% PATK/MATK, +35 p.p. Equipment ATK%) is tested by undoing the buff (`flat/1.35`, `pct-35`) and checking whether the de-buffed base returns to the cohort curve. Defense spikes use the same σ signal (the fixed 1.5× ratio was removed by the 10.7-02 curve-only refinement), and the cross-cohort inspector shows median/σ for every stat.

**Depends on**: Phase 10.5 (anti-cheat panel), Phase 10.6 (stat inspector), Phase 10.1 (no OVR formula change)
**Requirements**: CURVE-01, CURVE-02, CURVE-03, CURVE-04, CURVE-05
**Success Criteria** (what must be TRUE):
  1. `curve_deviation()` computes the proportional curve per stats cohort (latest validated, self excluded, `n ≥ 5`) with median/MAD, expected flat, sigma and curve deviation; small cohorts return `available:false` (CURVE-01/CURVE-04)
  2. A synthetic Impositio submission is flagged `reason='impositio'` on both ATK and MATK; a normal clone and a legitimate high-% build are not; a flat-only inflation is flagged `reason='curve'` (CURVE-01/CURVE-02)
  3. Defense spikes flag only on `σ ≥ 3.5 vs median` and carry median/MAD/z; a 1.21×/3.70σ value is flagged as `sigma` (CURVE-03/CURVE-05)
  4. `stat_overview` returns `class_median`, `class_mad`, `class_z` and a direction-aware `class_sigma_outlier` for every stat; the Ranking inspector shows only the σ badge — the 1.5× badges/columns were removed (CURVE-03/CURVE-05)
  5. No auto-rejection, no key-stat leak, no client-executable internal helper, no new dependencies (CURVE-04)

**Plans**: 2 plans
- [x] 10.7-01-PLAN.md — Migration 0049 (`curve_deviation` + sigma defense + inspector sigma) + client panel/table + tests — Wave 1 — applied live 2026-10-30
- [x] 10.7-02-PLAN.md — Curve-only refinement (owner: discard the fixed standard, use only the curve): migration 0050, median/MAD player baselines, defense sigma-only flags, inspector without ratio badges/columns, tests — applied live 2026-10-30

**Cross-cutting constraints**: review aids only — officers keep the Validar/Rejeitar decision; **curve-only reference (10.7-02)** — no fixed 1.5× margin and no guild-wide "Fora do padrão" badge; the flags come from the robust cohort median/MAD sigma and the ATK/MATK proportional curve. Cohorts below n=5 get no curve/sigma verdict at all (the 1.5× fallback was deliberately removed); the robust median/MAD resists one contaminated value; Impositio constants are the owner-stated +35% / +35 p.p. The same-session 0049 cast correction (`percentile_cont` → numeric before `round`) was re-applied before use. Deploy order: migration first, then the client bundle.

### Phase 10.8: MATK/PATK Regression Dashboard (INSERTED 2026-10-30)

**Goal**: An interactive, read-only regression dashboard in Ranking → Stat entre todos that lets officers investigate whether a submission's MATK% looks displaced by +35 p.p. Use only the real validated records (total MATK/PATK + Equipment percentages); report the missing Equipment/Base flat fields instead of inventing them. Fit OLS and Theil–Sen curves with confidence bands, expose residuals, and classify each member as NORMAL / POSSIBLE_BUFF / INCONCLUSIVE. Scores are anomaly signals, never cheat probabilities.

**Depends on**: Phase 10.6 (Stat entre todos tab), Phase 10.7 (statistical approach), live validated data
**Requirements**: MREG-01, MREG-02, MREG-03, MREG-04
**Success Criteria** (what must be TRUE):
  1. `stat_regression_dataset()` is read-only and staff-only, returns one latest-validated row per active real member (four attack fields + history count), coverage counts, and an explicit `fields` map marking Equipment/Base flat MATK/PATK as unavailable (MREG-01)
  2. The dashboard renders MATK×MATK%, PATK×PATK%, MATK/PATK×Δ% and MATK×PATK scatters with OLS + Theil–Sen lines, 95% CI, n, R², and a robust residual histogram; points are clickable with a member detail card (MREG-02)
  3. Classification returns NORMAL / POSSIBLE_BUFF / INCONCLUSIVE with member, declared/inferred MATK%, observed/expected MATK, residual, standardized residual and score; the +35 hypothesis is `x−35` against the empirically fitted curve, never a fixed 1.35× MATK multiplier (MREG-03)
  4. The owner reference pair is recognized as POSSIBLE_BUFF on MATK×MATK% (illustrative; no PATK/Equipment flat), and the current dataset is not forced into a second population (MREG-03)
  5. No fabricated samples, no writes to source data, no key-stat leak, no new npm dependencies (MREG-04)

**Plans**: 1 plan
- [x] 10.8-01-PLAN.md — Migration 0051 + regression core + SVG dashboard + classification/tests — Wave 1 — applied live 2026-10-30

**Cross-cutting constraints**: read-only RPC (no table writes except the bookkeeping row); latest validated per member to avoid pseudo-replication (13 repeated submitters; 61 validated submissions); Theil–Sen + MAD for robustness; OLS only for R²/CI; MATK and PATK are not interchangeable — the ratio model uses PATK as a measured physical control (R² 0,922). Equipment/Base flat MATK/PATK are **not captured** by the form; this is the main limitation and is surfaced in the UI. Deploy order: migration first, then the client bundle.

### Phase 11: Verified Access — Claim Authorization & Discord OAuth (INSERTED)

**Goal**: Access is bound to something the attacker cannot steal from a Discord post. The 0032 stopgap (officer-authorized claims) shipped 2026-10-26 and was reverted the same day by 0033 at the owner's call — registration is one-go again (immediate PIN setter; registration requests carry the PIN so the approval activates it) with manual validation staying on (officer approval + the post-claim D-05 identity review) — so Phase 11 carries the full identity load: a one-time, officer-confirmed Discord↔character link per member, Discord OAuth as the login, a server-side guild-role check with the guild bot token, and session continuity that keeps every existing RLS policy working unchanged.

**Why now**: Owner report 2026-10-26 — a Basic-screen print (and the nickname/char ID on it) is public data, so the pre-0032 first-access flow let anyone holding a stolen card claim an unclaimed row before its owner and take over the account. The guild bot has roster/roles ONLY (owner-confirmed), so OAuth alone cannot resolve which character a Discord user plays: the Discord↔character link must be created once per member with human confirmation, after which it becomes the unspoofable anchor.

**Depends on**: Phase 8/08.1 (whitelist + identity machinery shipped); 0034 (the manual-fill, officer-validated first access Phase 11 builds on — same-day evolution through 0032 → 0033 → 0034)
**Requirements**: DSCD-01..DSCD-06 (see REQUIREMENTS.md "Verified Access — Claim Authorization & Discord OAuth")
**Success Criteria** (what must be TRUE):
  1. No unclaimed registry row is claimable without an officer decision — TRUE since 0034 (manual first access: the print is gone, every claim is an officer-approved request) — but the check is FULLY MANUAL (typed identity + officer judgment against the roster/Discord), so Phase 11 must replace the manual trust with a real ownership anchor: the Discord↔character link. Phase 11 automates what the officers are doing by hand today.
  2. A member row carries a unique `discord_user_id` link created once with officer confirmation (link request → officer verifies against the registry handle in Discord → link set); link changes/unbinds are staff-only and audited; a pending link request grants zero data access
  3. Discord OAuth login (Supabase Auth Discord provider, `identify` scope only) resolves the member BY `discord_user_id` and the guild-role check runs server-side with the bot token; an unlinked/roleless Discord account never mints a session
  4. All `auth.jwt()->>'member_id'` RLS policies and RPC gates keep working through a custom access token hook that injects `member_id`/`member_role` — zero policy rewrites; the 0024 `assert_device_bound` discipline is explicitly migrated or superseded (never silently broken); `members.discord_handle` remains the staff-facing contact field
  5. The OCR print is evidence/typo-prevention only (stats/class/ID read + officer review queue); no code path or copy treats the print as proof of ownership
  6. The PIN retirement path is staged and decided at planning time (hard removal vs. recovery-only), with outstanding hand-minted JWTs handled (short expiry/forced re-login) and `NEFOOT_JWT_SECRET` rotation planned if the custom mint retires
**Plans:** 3/3 plans complete
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 7 → 8 → 9 → 9.1 → 10 → 10.1 → 10.5 → 10.6 → 10.7 → 10.8 → 11 (8 is independent and could interleave with 7; 9 depends on 7's vocabulary/catalog/seed; 9.1 depends on 9's migration 0018 applied live; 10 depends on 9's `last_validated_at`; **10.1 is the URGENT rating-unification fix inserted 2026-10-27 — it lands BEFORE Phase 11 per owner call and can run as soon as Phase 10's deploy window allows**; 11 builds on 8/08.1 + 0034)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|------------|
| 1. Foundation — Secure Access & Data Model | v1.0 | 4/4 | Complete | 2026-10-09 |
| 2. Registry, Catalog & Manual Data Ingestion | v1.0 | 3/3 | Complete | 2026-10-09 |
| 3. Rank Engine | v1.0 | 4/4 | Complete | 2026-10-10 |
| 4. Member Dashboard & Improvement Screen | v1.0 | 3/3 | Complete | 2026-10-11 |
| 5. OCR Auto-Read Layer | v1.0 | 5/5 | Complete | 2026-10-12 |
| 6. Trust & Celebration — Officer Tools & Promotion Page | v1.0 | 7/7 | Complete | 2026-10-13 |
| 7. Dummy-Data Seed & Catalog Alignment | v1.1 | 4/4 | Complete | 2026-10-15 |
| 8. Whitelist Lifecycle, Self-Request & Character Identity | v1.1 | 3/6 | In Progress|  |
| 08.10. pt-BR OCR Identity (hotfix) | v1.1 | 1/1 | Complete | 2026-10-22 |
| 9. Fine Ranks — Value-Proportional Scale & Role-Differentiated Key Stats | v1.1 | 5/5 | Complete | 2026-10-22 |
| 9.1. Hidden Raw Defenses (RPDEF/RMDEF) | v1.1 | 2/2 | Complete    | 2026-10-24 |
| 10. Personalized Home Landing Tab | v1.1 | 3/3 | Planned | - |
| 10.1 Universal Rating Unification (urgent fix, inserted) | v1.1 | 2/2 | Complete    | 2026-10-27 |
| 10.2 Meta vs Non-Viable Cohorts (inserted) | v1.1 | - | Complete | 2026-10-29 |
| 10.3 Artista Merged Cohort (inserted) | v1.1 | - | Complete | 2026-10-29 |
| 10.4 Battlefield Lineups & Roster Sync (inserted) | v1.1 | 3/3 | Complete    | 2026-10-30 |
| 10.5 Anti-Cheat Guardrails (inserted) | v1.1 | 1/1 | Complete (0046 live) | 2026-10-30 |
| 10.6 Cross-Cohort Stat Inspector (inserted) | v1.1 | 1/1 | Complete (0047 live) | 2026-10-30 |
| 10.7 Statistical Buff Detection (inserted) | v1.1 | 2/2 | Complete (0049/0050 live) | 2026-10-30 |
| 10.8 MATK/PATK Regression Dashboard (inserted) | v1.1 | 1/1 | Complete (0051 live) | 2026-10-30 |
| 11. Verified Access — Claim Authorization & Discord OAuth | v1.1 | 0/? | Planned | - |

---
*Roadmap created: 2026-10-07 · v1.0 archived 2026-10-13 · v1.1 roadmap created 2026-10-13 · revised 2026-10-22 (added Phase 9.1 Hidden Raw Defenses — 5 phases, DEF-01..DEF-06 requirements) · revised 2026-10-27 (inserted Phase 10.1 Universal Rating Unification as an URGENT fix before Phase 11 — owner report of cross-surface OVR inconsistency; investigation in `.planning/phases/10.1-universal-rating-unification/10.1-CONTEXT.md`; UNIF-01..04 requirements) · revised 2026-10-29 (recorded Phase 10.2 meta/non-viable split and inserted Phase 10.3 Artista merged cohort — owner ruling that Menestrel and Cigana are one class for stats; 0038 rehearsed, not live)*

