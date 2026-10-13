# Research Summary — v1.1 Home, Whitelist & Fine Ranks

**Project:** Hellz / NeoFoot — single-guild Ragnarok Origin stats panel (React 19 SPA + Supabase free tier)
**Milestone:** v1.1 — Home, Whitelist & Fine Ranks (4 additive features on a LIVE system)
**Researched:** 2026-10-13
**Confidence:** HIGH overall — every recommendation extends a pattern already proven live in v1.0 (11 migrations, 5 smoke matrices, owner DevTools leak proofs); all integration points verified against the shipped codebase. Design-choice items are marked MEDIUM; game-value realism sourcing is LOW (resolved by deriving seed values from the live DB).

**Scope note:** v1.0 is SHIPPED and owner-validated (2026-10-13; 20/20 requirements validated). This research covers ONLY the four additive v1.1 features — whitelist lifecycle + first-login PIN setup, personalized home landing tab with stale-data CTA, value-proportional 99 scale, and the reversible dummy-data seed workflow. The v1.0 stack, architecture, and pitfall set are validated ground truth, not re-researched. Detailed findings: [.planning/research/STACK.md](STACK.md) · [FEATURES.md](FEATURES.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [PITFALLS.md](PITFALLS.md).

## Executive Summary

v1.1 adds four features to a live, owner-used panel, and the research verdict across all four dimensions is unusually clean: **ZERO new runtime dependencies**. Whitelist = migration 0012 (nullable `pin_hash` + `add_member` SECURITY DEFINER RPC, 0011 pattern, role forced to `'member'`, no new RLS policy). PIN setup = one null-hash branch in `verify-pin` (returning `pin_setup_required`) plus one sibling `setup-pin` Edge Function that clones it byte-for-byte (same pinned imports `npm:bcryptjs@3` / `npm:jose@4`, same secrets, same 7-day JWT) with an atomic conditional claim (`update ... where pin_hash is null`, trust the returned count). Home = `'inicio'` in the existing `Tab` union + ONE additive field (`last_validated_at`) on the closed `my_report` payload — closed-payload discipline and RNK-02 anti-leak invariants hold untouched. Fine ranks = one formula swap (`points = round(own_value / nullif(max_v,0) * 99, 2)`) across three RPCs in ONE migration, compute-on-read so no backfill; OVR inherits the finer scale with zero formula change. Seed = hand-authored idempotent SQL via the existing `apply-seed.mjs`, reversible by a `dummy-%` sentinel prefix — never a migration, never a direct child of `seeds/`.

The two structural hazards both come from landing on live data. First, the **rank contract is a three-way locked tripod** — `src/lib/rankMath.ts` (+ `rankMath.test.ts` locked values 74.25/49.5/99…), `scripts/smoke-rank.mjs` (27/27 exact-value matrix), and the SQL bodies of `my_report`/`class_top5`/`get_promotion` — and the scale change invalidates ALL of it at once, plus `smoke-promotion.mjs` ordering and the D-01/D-02 tier bands. Re-locking every leg must be an in-phase must-have, or red suites become permanent noise and the "SQL agrees to the decimal" guarantee dies. Second, the **dummy seed pollutes real members' ranks by construction** (it must enter the same cohorts the rank math reads), and the new value-proportional formula AMPLIFIES the damage: a seeded leader drags every real member's points down proportionally. The seed window must be a scheduled, announced, tightly-bounded session with a rehearsed purge (submissions BEFORE members — `submissions → members` has no FK cascade) and "zero dummy rows" as a hard release gate.

Third, the auth surface has one discovered breaking constraint and several accepted-and-bounded leaks: **`bcryptjs.compareSync(pin, null)` throws**, so the moment 0012 lands, `verify-pin` will 500 on every pinless member unless the null branch precedes the compare (line 148) — and the branch ordering must keep inactive members at uniform 401 while ACTIVE-unclaimed gets `pin_setup_required`. The pre-existing placeholder-PIN whitelist rows (known hashes from git history, WR-06) must be converted to null IN the same phase or the claim flow silently never applies to them. The `pin_setup_required` enumeration leak and the pre-claim handle-squatting window are accepted design constraints — narrower than what they replace, mitigated operationally (immediate officer notification, small claim window) and mechanically (shared lockout, uniform latency, atomic claim). All owner-decision items are consolidated in the Open Questions table below; phase planning should resolve them explicitly, not by drift.

## Key Findings

### Stack (→ [STACK.md](STACK.md))

The headline decision is disciplined reuse. Phase planners must carry:

- **No new npm package, dev dependency, or runner** — everything is SQL migrations + one new Edge Function + React components in established patterns. Verified current pins (2026-10-13): react 19.3.0 in range, vite 8.3.4, tailwind 4.3.3, supabase-js 2.117.3, react-query 5.104.2, vitest 5.0.4, bcryptjs 3.0.3.
- **`setup-pin` pins the SAME majors as `verify-pin`** (`npm:jose@4`, not current-major 6.2.12) — the two functions must mint token-for-token identical sessions; a joint major bump is dedicated tech debt, not a drive-by.
- **Reuse the existing lockout machinery** (`pin_login_attempts` + `_shared/lockout.ts` + `record_pin_failure`) for PIN setup — never a second rate-limit mechanism.
- **Migration 0012 is mandatory schema change** (`pin_hash` currently NOT NULL, `0001_schema.sql:5-6`) and is the milestone's ONLY one; no direct INSERT policy on `members` — the RPC stays the narrow write surface.
- **Explicit non-recommendations to enforce in review:** no router for one tab, no date-fns/dayjs for one comparison, no supabase-js in the client data layer (foreign-JWT session), no faker for the seed, no client-side points recomputation (AGENTS.md non-negotiable — all rank math in Postgres).
- **Seed placement constraint:** `config.toml` `db.seed sql_paths = ["./seeds/*.sql"]` is a flat non-recursive glob — dummy files MUST live in a `seeds/dummy/` subfolder or every local `db reset` auto-applies them (trivially verified once during implementation).

### Features (→ [FEATURES.md](FEATURES.md))

Four features with MUST-level behaviors, proposed IDs WHIT-/HOME-/SCALE-/SEED- (final IDs owned by REQUIREMENTS.md):

- **Whitelist (WHIT-):** officer/owner handle-only registration via `add_member` (role forced `'member'`, `pin_hash` NULL); player picks own PIN at first login (double-entry client-side, `^\d{4}$` server-side); removal semantics UNCHANGED (`set_member_active`). Should-haves: reject `dummy-%` handles in the RPC; officer-visible unclaimed indicator (derived, staff-only, never the hash). Anti-gaming posture unchanged — weak PINs are accepted by design; the whitelist is the trust boundary.
- **Home (HOME-):** `'inicio'` as DEFAULT tab after login; own OVR via OvrHero verbatim; best-stats strip (top-3 by points, rendered from fields the payload already returns — client sorts, never recomputes); stale CTA when `> 7 days` since last VALIDATED submission (strictly greater — lock the boundary in a test); CTA navigates to Enviar Status. Fresh data renders NO banner — silence is the success state. Never-submitted members get the evergreen variant + existing empty-state guidance.
- **Scale (SCALE-):** leader(s at max) hold exactly 99; everyone below scales by value distance; top-end cuts at 98/97/96/95 emerge naturally. Keep `n ≥ 3` data_sufficient unchanged. Semantic consequences to carry: bottom-end compression (worst no longer gets 0), OVR floor-51 becomes near-unreachable (RNK-03 stays trivially satisfied but D-02 bands need recalibration), tie machinery in 0009 becomes dead code, and the CMP-02 percentile phrase becomes literally false under a value-based scale (owner decision — see Open Questions).
- **Seed (SEED-):** ~5 players per class, both `char_function` values and both `value_type`s per cohort (function-scoped cohorts starve below n≥3 otherwise), owner-reviewed values DERIVED FROM LIVE validated submissions (never invented from training data — LOW confidence otherwise); value shapes must include a clear leader, a near-best runner-up (~98.5–99% of leader), ties, `submitted_at` spread (fresh / 8–30 days / one never-submitted), and one PENDING submission for the officer queue. Sizing note: ~75 dummy members across 15 starter classes.
- **Explicitly out of scope (v2+):** delta badges, history view, officer guild-health dashboard (the `last_validated_at` field is exactly its future primitive — don't let it creep in), catalog self-service, OCR confidence surfacing, PNG export, PIN-change self-service.

### Architecture (→ [ARCHITECTURE.md](ARCHITECTURE.md))

**Zero structural change to v1.0** — all four features slot into existing seams. What phase planners must carry:

- **`add_member` = the ONLY officer write surface on `members`** — no new RLS policy in any direction (the 42P17 recursion minefield is never entered). Staff gate inside the function, role forced, `search_path = public`, EXECUTE hygiene (`revoke from public, anon; grant to authenticated`). Unique-handle violation (23505) must be caught and raised as a named exception (`handle_exists`), with re-add of a removed handle directed to `set_member_active(true)` — two verbs, two intents, no overlapping upsert.
- **`setup-pin` is a deliberate near-verbatim clone of `verify-pin`:** same imports, CORS, validation, WR-05 env fail-fast, WR-03 infra-error discipline; write via the service-role admin client ONLY (`pin_hash` stays column-ungranted, 0005); one-way atomic claim; the only safe cosmetic delta is `setIssuer('nefoot-setup-pin')`. Null-hash branch order in `verify-pin`: lockout → lookup → **active check (inactive → uniform 401)** → **null-hash → `pin_setup_required`** → dummy compare for timing equality → compare.
- **Formula change is five sites across three RPCs** (`my_report` stats + OVR lateral, `class_top5` OVR lateral with a `cmp` CTE gaining `max(b.value) as max_v`, `get_promotion` OVR lateral + highlights) — all in ONE migration (0013), full-copy create-or-replace (0011 style). The RNK-02 anti-leak property survives structurally because the formula stays identical for all 57 stats. Side benefit: points stop encoding cohort-count information, so the T-03-10 accepted leak SHRINKS.
- **Fold `last_validated_at` into the same 0013 `my_report` rewrite** — avoids two full-body rewrites of the same ~120-line function in one milestone. Optionally also `has_pending` (see Open Questions #12). The stale threshold comparison stays client-side (it's a nudge on the caller's own data, not enforcement) — threshold changes are client-only deploys.
- **What does NOT change:** RLS on every table, JWT claims `{role:'authenticated', member_id, member_role}` HS256+kid 7-day, key 6f7657c3 never revoked, append-only submissions, aggregates-only member surface, `pin_hash`/`role` column-ungranted, SECURITY DEFINER gates, closed `my_report`/`get_promotion` payloads (additive scalar only).

### Pitfalls (→ [PITFALLS.md](PITFALLS.md))

The operating regime changed: everything lands on a LIVE system with real members, real sessions in the wild, and a locked rank contract. Critical five:

1. **Seed pollution of real ranks (CRITICAL, amplified by the new scale)** — seeded leaders drag real members' points down proportionally; Destaques shows dummy names. Mitigate: announced tight calibration window, rehearse seed+purge locally first, scripted zero-dummy-rows verification, purge as a release-checklist gate, explicit owner decision on cohort exclusion (Open Questions #5).
2. **Stale rank tripod (CRITICAL)** — `rankMath.test.ts` + `smoke-rank.mjs` + SQL RPC bodies all go red BY DESIGN; re-lock all three legs + both smokes + tier bands IN-PHASE as a must-have, then run the full smoke battery to prove no collateral breakage.
3. **`verify-pin` 500 on pinless members (CRITICAL)** — `compareSync(pin, null)` throws; null branch must precede line 148, with WR-01 timing equalization on the pinless path; new smoke probes: pinless-active → `pin_setup_required`, pinless-inactive → uniform 401, double-setup → `already_set`.
4. **Placeholder-PIN legacy rows (CRITICAL)** — known hashes from git history bypass the claim flow forever unless 0012 (or an owner SQL step in the same phase) nulls them and clears their `pin_login_attempts` rows; after conversion the WR-06 exposure is moot.
5. **Purge failure modes (CRITICAL)** — FK order (submissions before members), forgotten purge, non-idempotent seed re-runs, and no wrapping transaction unless the SQL provides one. Mitigate: begin-with-delete transactional seed file, single-file seed + single-file purge, verify token freshness before the session (STATE.md rotation pending).

High-severity to carry: PIN-claim squatting window (operational teeth needed); `pin_setup_required` enumeration bounds (inactive must NEVER get it); double-set race (conditional UPDATE + trust the count, per CR-01 and the 0011 `not_pending` precedent); lockout on setup must check `isLocked` AND must not let attackers weaponize `record_pin_failure` to lock a fresh handle out of its own claim (decide the failure-counting policy explicitly — Open Questions #4); formula edges (all-equal → all 99, max=0, n-gate retention); tier-band/phrase drift; deploy ordering with old JWTs in the wild.

## Cross-Cutting Risks

Consolidated and deduplicated across the four research files:

| # | Risk | Severity | Converged mitigation | Sources |
|---|------|----------|----------------------|---------|
| R1 | Seed rows pollute real members' ranks/OVR/Destaques; new scale amplifies it | CRITICAL | Announced tight window; rehearse locally; scripted zero-dummy-rows check; purge = release gate; cohort-exclusion decision (#5) | PIT-CL1, FEAT-∩2, ARCH-R7 |
| R2 | Scale migration invalidates all locked contract values; red suites become noise | CRITICAL | Re-lock tripod (rankMath.ts + smoke-rank.mjs + SQL) + smoke-promotion + bands in-phase; full smoke battery after | PIT-CL2, FEAT-∩3, STACK-VC, ARCH-R6 |
| R3 | `verify-pin` 500s on pinless member (`compareSync` throws on null) | CRITICAL | Null branch BEFORE compare (:148); deploy before any pinless row exists; pinless smoke probes | PIT-CL3, STACK-§1, ARCH-R1 |
| R4 | Placeholder-PIN rows: known hashes bypass claim flow; claim flow never applies to legacy members | CRITICAL | Null the hashes in 0012's phase + clear lockout rows; record conversion; moots WR-06 | PIT-CL4, STATE pre-launch |
| R5 | Purge fails on FK order / forgotten purge / partial re-run (no transaction) | CRITICAL | Submissions-then-members order; begin-delete transactional seed; single seed file + single purge file; release-checklist gate | PIT-CL5, STACK-§4, ARCH-§5 |
| R6 | PIN-claim squatting (handle knowledge binds attacker's PIN pre-claim) | HIGH | Accepted constraint + operational teeth: immediate officer DM, prominent unclaimed indicator, small window, uniform post-claim 401s | PIT-H1, STACK-§1, ARCH-§2 |
| R7 | `pin_setup_required` enumeration (exists-and-unclaimed oracle); inactive members must not get it | HIGH (bounded) | Branch order: active check before null-hash; WR-01 dummy-compare on pinless path; document as accepted leak (T-03-10 discipline) | PIT-H2, STACK-§1, ARCH-R9, FEAT-∩6 |
| R8 | Double-set PIN race (TOCTOU) → last writer silently wins | HIGH | Atomic `where pin_hash is null` + trust returned count; 0 rows → `already_set` (uniform shape) | PIT-H3, STACK-§1, ARCH-R3 |
| R9 | Lockout on setup: bypass (no `isLocked` check) or weaponization (attacker burns a fresh handle's attempts) | HIGH | Gate ordering mirrors verify-pin:88-100; decide failure-counting policy (#4); reset counter on success | PIT-H4, ARCH-R4 |
| R10 | Formula edges: all-equal cohorts, max=0, co-leader ties at top, MIN_COHORT_SIZE gate | HIGH | Lock explicit decisions + smoke vectors for each edge (#7, #8); clamp assertion points ≤ 99 | PIT-H5, FEAT-§3, ARCH-§4 |
| R11 | Tier bands + percentile phrase calibrated to the OLD distribution → platinum saturation, phrase lies | HIGH | Sequence migration → tripod re-lock → seed → owner calibrates D-01/D-02 → purge; explicit phrase decision (#1) | PIT-H6, FEAT-§3/∩4/∩5 |
| R12 | Deploy ordering + old JWTs in the wild; `setup-pin` JWT drift | HIGH | Both functions live BEFORE first `add_member`; clone SignJWT block byte-for-byte; smoke: setup-token passes fetchMe → my_report → create_submission → get_promotion; never revoke key 6f7657c3 | PIT-H7, ARCH-R2, STACK-§1 |
| R13 | `add_member` race/error surface: raw 23505 in UI; mangled duplicate handles on re-add | HIGH (UX/security seam) | Catch unique violation → `handle_exists`; client directs to reactivation; role/active forced server-side | PIT-H8, FEAT-§1, ARCH-§1 |
| R14 | Stale-CTA timestamp semantics: rejected counted fresh, pending-while-queued nagging, null-date NaN | MEDIUM | Server-computed `last_validated_at` (+ optionally `has_pending`); three explicit client states; epoch-diff arithmetic on ISO string | PIT-M1, FEAT-§2 |
| R15 | "Cleaner" DELETE removal breaks append-only + FK reality | MEDIUM | `set_member_active` unchanged; surface as "removal" in UI; no new remove RPC, no FK cascade | PIT-M2, FEAT-§1 |
| R16 | `apply-seed.mjs` ops: `/api/v1` HTML trap, rotated-token 401 mid-purge, PowerShell JSON corruption | MEDIUM | Single-file transactional seed+purge; verify token freshness first; run from Node only | PIT-M3, STATE blocker |
| R17 | Stale-scale window: new-scale values served while cached SPA renders old bands | MEDIUM (minutes) | Single release: migration + frontend deploy together; verify promotion payload post-deploy; announce skew for a 15-person guild | PIT-M4 |

## Open Questions (owner / phase-planning decisions — consolidated)

| # | Decision | Options | Research direction | Owner |
|---|----------|---------|--------------------|-------|
| 1 | **Percentile phrase fate** under value-proportional points (CMP-02 copy becomes literally false; touches the core-value sentence) | (a) RPC also returns true rank-position field, (b) reword to value-relative copy, (c) drop the phrase | Must be explicit — do not let the phrase silently lie; if (a), evaluate the `my_report` contract change against RNK-02 leak-probes | Owner |
| 2 | **OVR floor-51 narrative** under bottom-end compression (floor near-unreachable; D-02 bands 65/75/85 will mis-tier) | Confirm 51-floor normalization story; recalibrate bands with sign-off | RNK-03 stays satisfied trivially; bands recalibrated AFTER seed (R11 sequencing) | Owner |
| 3 | **Forgotten-PIN fallback** (player-picked PINs remove the officer-known safety net → permanent lockout) | Documented owner-side SQL runbook vs. small owner-only `set_member_pin_hash` RPC | Minimum = runbook entry this milestone; PIN self-service stays out of scope | Owner / phase |
| 4 | **Lockout policy on setup-pin** (bypass vs. weaponization trap — R9) | Record failures only on genuine abuse signals vs. coarse per-handle rate vs. no failure recording on setup | Decide explicitly; wrong default either way is a live incident | Phase |
| 5 | **Dummy-handle exclusion from cohorts** during the calibration window (R1) | Temporary sentinel filter inside the three RPCs (added then removed) vs. accept polluted ranks | Exclusion = more migration churn, zero member-visible distortion; acceptance = simpler, owner-signed-off. Either is fine — decide, don't drift | Owner |
| 6 | **Seed window policy** — may the dummy seed touch the live project at all? | Live (announced window) vs. local `db reset` + staging only | Either works; if live, never resident overnight | Owner |
| 7 | **max_v = 0 / all-tie rendering** | null points (data-insufficient style) vs. everyone-99 on ties | Slight divergence in research (ARCH suggests case→99 when own=max; PITFALLS suggests null, matching `data_sufficient` pattern) — pick ONE, lock in spec + smoke | Phase |
| 8 | **MIN_COHORT_SIZE = 3 retention** | Keep (recommended) vs. drop | Retain — live contract; dropping makes singleton classes score 99-everything; keep in the re-locked spec | Phase (confirm) |
| 9 | **Re-adding a removed member** | Reactivate via `set_member_active(true)` vs. `add_member` rejects | Research converges: `add_member` = new rows only; reactivation = existing RPC; catch 23505 → `handle_exists` with reactivation guidance | Phase |
| 10 | **Catalog lower-is-better check** — formula assumes higher-is-better for all 57 stats | Verify against live catalog + real values | Cheap check before the scale migration; no evidence of a lower-better stat, but unverified (LOW) | Phase |
| 11 | **Sentinel mechanism** for seed reversibility | `dummy-%` handle prefix + RPC rejection (recommended) vs. `seeded` boolean column in 0012 | Prefix + rejection is simpler, greppable, zero migration; define the prefix constant ONCE (used by add_member guard AND purge scope) | Phase |
| 12 | **Home pending-variant** ("aguardando validação" CTA) | Fold `has_pending` into the `my_report` rewrite (PITFALLS recommends) vs. skip to keep the contract lean (FEATURES NICE) | Only if it stays one closed field; harmless either way — decide with the 0013 rewrite | Phase |

## Implications for Roadmap

Only sequencing hints where the research files CONVERGE — the full phase plan belongs to the roadmapper:

- **The research files converge on one hard deploy invariant (R3/R12):** both Edge Functions (patched `verify-pin`, new `setup-pin`) must be live BEFORE the first pinless row exists. The migration itself is inert until `add_member` is first called, so 0012-before-functions or functions-before-0012 are both safe — the non-negotiable is functions-before-first-`add_member` (ARCHITECTURE.md High-7 states it strictest: functions → 0012 → officer UI enabled). The whitelist phase must also fold in the placeholder-row conversion (R4) and the new pinless smoke probes.
- **The research files converge on the scale→seed→calibrate ordering (R1/R2/R11):** 0013 (formula swap in all three RPCs + `last_validated_at` folded into the same `my_report` rewrite) ships TOGETHER with the tripod re-lock (`rankMath.ts` + tests, `smoke-rank.mjs`, `smoke-promotion.mjs`, provisional D-01/D-02 bands) and the frontend bundle (R17); THEN the seed runs, the owner calibrates final band edges against realistic spreads, and the purge is a hard pre-release gate. The seed must never be a migration and must live in `seeds/dummy/`.
- **The home tab UI is the one genuinely independent workstream** (FEATURES ∩1): `'inicio'` + OvrHero + best-stats strip + CTA can land anytime; it only consumes fields the payload already returns (plus the one additive scalar). Its null-points-rendering behavior post-purge (High-5d) is the only coupling to the scale work.
- **Phase cohesion rule from ARCHITECTURE.md:** never split a migration from its re-locked baselines — "any split between SQL and spec/smoke baselines = red smokes by design."

### Research Flags

- **Likely needs `/gsd-research-phase` or deep phase planning:** the scale phase (five formula sites, tripod re-lock, edge-case vectors — High-5) and the whitelist/PIN phase (branch ordering, lockout policy, atomic claim, JWT cloning — the densest new surface).
- **Standard patterns (skip research-phase):** the home tab (composition of live components + one additive field) and the seed workflow (existing tooling; the pitfalls are operational, not design).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm versions verified 2026-10-13; Edge Function patterns against current official Supabase docs; every recommendation extends a live v1.0 pattern. Only MEDIUM item: `db.seed` glob non-recursion (standard semantics, trivially verified with one `db reset`) |
| Features | HIGH | Every integration point verified in the shipped codebase; MEDIUM on design choices (re-add semantics, lockout policy, seed window); LOW only on game-value realism — resolved by deriving seed values from live DB submissions |
| Architecture | HIGH | Codebase read in full; all five formula sites, RPC patterns, column grants, and FK topology located precisely; aligned with authoritative STACK.md |
| Pitfalls | HIGH | Every pitfall anchored to a specific verified file/line; MEDIUM on operational judgments (squatting-window rituals, bcryptjs null-throw behavior — re-verify with a 2-line runtime check) |

**Overall confidence: HIGH.**

### Gaps to Address

- **Realistic stat value ranges** — training data cannot provide them; derive seed values from the live project's validated submissions (or owner-supplied samples) during seed-phase planning. This also gates the D-01/D-02 band calibration.
- **`max_v = 0` edge divergence** between ARCHITECTURE.md (case→99 when own=max) and PITFALLS.md (null, data-insufficient pattern) — resolve in phase planning and lock in spec + smoke (Open Question #7).
- **`db.seed` glob non-recursion** and **bcryptjs null-throw** — two cheap runtime verifications to do at the start of implementation, not assumed.
- **Percentile-phrase contract impact** — if owner picks option (a) (true rank-position field), the RNK-02 leak-probe suite must be re-run against the changed `my_report` payload.

## Sources

- **Primary (HIGH):** local codebase read in full — `verify-pin/index.ts` (:148 compareSync, WR-01 DUMMY_HASH, lockout gate, SignJWT block), `0001_schema.sql` (pin_hash NOT NULL :6, FK cascade asymmetry), `0009_rank_engine.sql` + `0011_officer_tools_promotion.sql` (five formula sites, RPC templates, EXECUTE hygiene), `0005_registry_catalog.sql` (column-level security), `src/lib/rankMath.ts` + tests (locked values, MIN_COHORT_SIZE), `src/features/dashboard/presentation.ts` + tests (D-01/D-02 bands, percentilePhrase), `src/App.tsx` / `api.ts` / `session.ts`, `scripts/apply-seed.mjs` / `hash-pin.mjs` / `smoke-*.mjs`, `supabase/seeds/*`, `config.toml` (db.seed glob :72, deno_version 2)
- **Primary (HIGH):** npm registry (`npm view`, 2026-10-13) and Supabase official docs via Context7 (Edge Functions, service-role client, deploy/secrets)
- **Primary (HIGH):** `.planning/PROJECT.md` (milestone scope, key decisions), `.planning/STATE.md` (JWT key 6f7657c3, pre-launch rotations, catalog re-seed blocker), `.planning/milestones/v1.0-REQUIREMENTS.md` + `MILESTONES.md` (ID conventions, 20/20 baseline)
- **Secondary (MEDIUM):** bcryptjs null-input throw behavior; glob non-recursion; Brazil DST abolition (only affects a boundary already avoided by epoch-diff arithmetic)
- **Tertiary (LOW):** Ragnarok Origin realistic stat ranges (training-data only — superseded by live-DB derivation)

---
*Research summary for: NeoFoot v1.1 — Home, Whitelist & Fine Ranks*
*Researched: 2026-10-13*
