# Feature Research — v1.1 Home, Whitelist & Fine Ranks

**Domain:** Additive features on a LIVE single-guild Ragnarok Origin stats panel (React 19 SPA + Supabase free tier: Postgres/RLS/Edge Functions)
**Project:** Hellz / NeoFoot
**Researched:** 2026-10-13
**Overall confidence:** HIGH — every feature is an extension of a v1.0 pattern that is live and owner-validated; findings below are grounded in the actual codebase (App.tsx, api.ts, 0001/0009/0011 migrations, seeds, presentation.ts) and cross-referenced with the authoritative `.planning/research/STACK.md`. Design-choice rows are marked MEDIUM; anything derived from training data (game-value realism) is marked LOW.

**Scope note:** v1.0 is SHIPPED and owner-validated (2026-10-13). The validated capability list lives in PROJECT.md → Requirements → Validated (AUTH-01..05, REG-01..03, INPT-01..04, RNK-01..05, CMP-01..03, SHWC-01/02 — 20/20 complete). This file researches ONLY the four new v1.1 features. Stack/version decisions are NOT restated here — see STACK.md (headline: zero new dependencies; migrations 0012+; one new `setup-pin` Edge Function; `'inicio'` in the Tab union; `my_report` extended with `last_validated_at`; compute-on-read RPCs).

**Requirement ID convention:** v1.0 used two-letter domain prefixes (AUTH, REG, INPT, RNK, CMP, SHWC). Suggested v1.1 IDs below follow the same style: **WHIT-** (whitelist lifecycle), **HOME-** (personalized home), **SCALE-** (value-proportional 99), **SEED-** (dummy data). Final IDs are owned by REQUIREMENTS.md — these are research proposals for the roadmap to map.

---

## Feature 1: Whitelist lifecycle + first-login PIN setup

**Today's gap:** members are created with an officer-known placeholder PIN (seeds/whitelist.sql upserts bcrypt hashes by hand). v1.1 makes staff add handle-only rows and the player pick their own PIN at first login. Confidence: **HIGH** (all integration points verified in code).

### Expected behavior

| Level | Behavior | Notes |
|-------|----------|-------|
| MUST | Officer/owner can add a member with handle-only registration: `discord_handle` + `display_name`, `role` forced to `'member'`, `pin_hash` NULL | `add_member` SECURITY DEFINER RPC (0011 pattern: internal role+active gate; no direct INSERT policy on `members`). Migration 0012 makes `pin_hash` nullable (currently NOT NULL — 0001_schema.sql:6) |
| MUST | Player login with an unclaimed handle routes to PIN setup: `verify-pin` returns `pin_setup_required` (branches BEFORE bcrypt — `compareSync(pin, null)` throws today) | STACK.md §1; keeps the WR-01 timing-equalization dummy-compare on the pinless path |
| MUST | `setup-pin` accepts a 4-digit PIN, atomically claims it (`update ... where pin_hash is null` → 0 rows = `already_set`), and mints the standard 7-day session | CR-01 "trust only the returned count" discipline; session lands the player directly in the panel — no second login |
| MUST | PIN-setup attempts are rate-limited by the EXISTING lockout machinery (`pin_login_attempts` + `_shared/lockout.ts` + `record_pin_failure`) | Never a second rate-limit mechanism (STACK.md non-recommendation) |
| MUST | Removal stays exactly as today: `set_member_active` role-differentiated rules (officer→member only, owner→officer+member, never owner rows) | AUTH-04 semantics unchanged — zero research needed, zero changes |
| MUST | Double-entry on the client: PIN field + confirm field, mismatch blocks submit; server validates `^\d{4}$` independently | Client validation is UX-only; the server is the boundary (established pattern) |
| SHOULD | `add_member` rejects handles matching the dummy sentinel prefix (e.g. `dummy-`) | Ties to Feature 4 — a real player must not squat a seed-shaped handle |
| SHOULD | Officers can SEE which members haven't claimed a PIN (derived `pin_set` boolean on the staff projection or in the RPC response — never the hash itself) | New contract surface — keep it server-derived and staff-only; members' projections stay untouched |
| NICE | Adding an already-whitelisted ACTIVE handle returns a distinct, friendly error (unique violation surfaces today as a raw 500) | Wrap the unique violation into a named exception like `handle_taken` (0011 style) |
| NICE | Adding an INACTIVE (removed) handle offers re-activation instead of erroring | **Design decision needed** (MEDIUM): re-add = flip `active` back vs. reject. Reactivating keeps submission history coherent (append-only); rejecting is simpler. Decide in phase planning |

### UX details

- Login page gains a setup mode: same handle field, two PIN fields, pt-BR copy ("Defina seu PIN de acesso — 4 dígitos"). Masked `type="password"` + `inputMode="numeric"` exactly like today (T-01-03: PIN never logged/stored plaintext).
- Officer add-member UI lives in an existing staff page (Personagens or Validações pattern); handle + display_name inline form, consistent with CharactersPage's inline registration (REG-01).
- After `setup-pin` success the client stores the session via the unchanged `session.ts` path — the player lands on the new home tab (Feature 2) immediately.

### Edge cases and states

| State | Behavior | Confidence |
|-------|----------|------------|
| Unknown handle at login | Uniform 401 "Discord ou PIN incorreto" — unchanged enumeration posture | HIGH |
| Unclaimed handle at login | `pin_setup_required` — reveals handle-exists-and-unclaimed. **Accepted, narrower enumeration leak** than v1.0's uniform 401; unavoidable if the player must learn they need to set a PIN (STACK.md §1). Mitigation is operational: officer notifies the player immediately; claim window stays small | HIGH (documented tradeoff) |
| Concurrent double-claim | Two tabs/requests race: exactly one wins the conditional UPDATE; loser gets `already_set` → directed to normal login | HIGH |
| Setup attempt flood on a claimed handle | Lockout counter counts failed setup calls too (each `already_set` counts) — caps handle-claim probing velocity | MEDIUM (design: what counts as a "failed" setup attempt — define in phase planning) |
| Weak PINs (0000, 1234, handle-mirror) | Accept. A blocklist adds surface for near-zero gain; the whitelist itself is the trust boundary (v1.0 posture) | MEDIUM (opinion, consistent with project philosophy) |
| Existing v1.0 members | Unaffected: their `pin_hash` stays set; migration only allows NULL, never nulls existing rows. Placeholder-hash rotation (STATE.md pre-launch item) is superseded in practice — new members self-pick | HIGH |
| Forgotten PIN after setup | **New operational gap:** with player-picked PINs NOBODY knows the PIN — a forgotten PIN is a permanent lockout (v1.0's officer-known placeholder silently covered this). Minimum: document the owner-side SQL fallback. Better: a small owner-only `set_member_pin_hash`-style RPC (reuses hash-pin.mjs flow). NOT currently in milestone scope — **flagged as an open question for the owner** (see Open Questions) | HIGH (gap is real); MEDIUM (solution choice) |
| Player sets PIN then gets removed, later re-added | `pin_hash` survives removal (removal only flips `active`) → on re-add the player logs in with their OLD pin, never sees setup. Acceptable; document | MEDIUM |

---

## Feature 2: Personalized home ("fake home" / `inicio` tab)

**Today's gap:** login lands on Painel (full 57-stat dashboard). v1.1 adds a personal landing tab: own OVR + best stats + stale-data CTA. Destaques keeps the guild-wide EAFC cards. Confidence: **HIGH** (composition of already-live pieces).

### Expected behavior

| Level | Behavior | Notes |
|-------|----------|-------|
| MUST | New `'inicio'` entry in App.tsx's `Tab` union; DEFAULT tab after login changes from `'painel'` to `'inicio'` | Tab-union + conditional render is the established, tested navigation (6 tabs today); no router (STACK.md) |
| MUST | Home shows the player's own OVR card — reuse OvrHero verbatim (tier from rounded value via D-02 bands) | OvrHero is member-visible since Phase 4; the home tab composes, never recomputes |
| MUST | Stale-data CTA when >7 days since the player's last VALIDATED submission | Server provides `last_validated_at` (new field in `my_report` — `max(submitted_at) where status='validated'`); client does ONE `Date` comparison; no date library (STACK.md) |
| MUST | CTA navigates to the Enviar Status tab | DashboardPage already receives `onNavigate` — same prop pattern |
| MUST | Closed-payload discipline holds: `last_validated_at` is additive to `my_report`; ZERO new per-stat fields, zero key-stat hints (RNK-02) | The RPC stays the single member read surface |
| SHOULD | "Best stats" strip: top-N (3) stats by points, each with value (FLAT/PERCENTUAL-labeled), points, tier badge | Mirrors FocusStrip's weakest-3 logic inverted; reuse tier maps from presentation.ts |
| SHOULD | Never-submitted state: members with zero submissions keep the existing empty-state guidance (DashboardPage's EMPTY_TITLE pattern) on home too | `last_validated_at` = null from the RPC |
| NICE | Relative-time copy ("há 8 dias") via native `Intl.RelativeTimeFormat('pt-BR')` | Zero-dep (STACK.md); absolute date fallback fine for v1.1 |
| NICE | "Aguardando validação" variant when the player has a PENDING submission but no recent validated one | Requires the RPC to also expose pending-ness — ONLY if it stays one closed field; skip if it bloats the contract |

### UX details

- Home is deliberately SPARSE: OvrHero + best-stats strip + (conditionally) the stale banner. The full dashboard stays one tap away on Painel — "fake home" is a landing view, not a second dashboard.
- Fresh data (<7 days): render NO banner at all (silence is the success state — same philosophy as the "Salvo." WR-01 lesson: don't add noise).
- Mobile-first: single column, OvrHero first — the guild browses from phones (v1.0 constraint, unchanged).

### Edge cases and states

| State | Behavior | Confidence |
|-------|----------|------------|
| Never submitted (no validated submission ever) | `last_validated_at` null → evergreen CTA variant ("Envie seus primeiros status") + empty-state guidance | HIGH |
| Stale (>7 days since last validated) | Amber/destructive CTA banner: "Seus dados estão desatualizados — envie um novo registro" → Enviar Status | HIGH |
| Fresh (<7 days) | No banner | HIGH |
| Boundary (exactly 7 days) | `> 7 days` strictly — at exactly 7×24h the banner does NOT show. Trivial, but lock it in a test | MEDIUM |
| Pending-but-not-validated recent submission | Counts as stale by definition (only `validated` counts). With the NICE variant, copy distinguishes "aguardando validação" from "envie novamente" | MEDIUM |
| `data_sufficient = false` / null class | OvrHero already handles null OVR + insufficient cohort (Phase 4); home inherits those states for free. Null-class members (just added via Feature 1, before Personagens assignment) see own values but no points/OVR — existing my_report semantics | HIGH |
| Seed interaction | Dummy members with old `submitted_at` deliberately exercise the stale state during calibration; ensure at least one dummy is never-submitted (Feature 4) | HIGH |

---

## Feature 3: Value-proportional 99 scale

**Today's gap:** points are RANK-based — `(countBelow + ties/2)/(n−1) × 99` (0009_rank_engine.sql, rankMath.ts). In a 5-player cohort the 2nd-best gets ~74.25 regardless of how close their value is to the leader. v1.1 switches to VALUE-proportional: leader holds 99, everyone below scales by real value distance, and the top-end cuts at 98/97/96/95 emerge naturally. Confidence: **HIGH** on mechanics (formula + codebase impact verified); **MEDIUM** on design consequences (tier recalibration, phrase semantics — flagged for owner decisions).

### Expected behavior

| Level | Behavior | Notes |
|-------|----------|-------|
| MUST | Per-stat points = `round(own_value / nullif(max_v, 0) * 99, 2)` within class+function cohort; leader(s at max) hold exactly 99 | STACK.md §3: pure Postgres arithmetic, `numeric` discipline, `nullif` division guard. Cohort definition (latest value per member/stat, status ≠ rejected, D-06/D-07) UNCHANGED |
| MUST | OVR inherits the finer scale with ZERO formula change: `51 + mean(6 key-stat points) × 48/99` | Points-agnostic; floor-51 and all-6-or-nothing (D-10/D-11) carry over untouched |
| MUST | ONE migration updates all three rank RPCs — `my_report`, `class_top5`, `get_promotion` (formula lives in 0009 + 0011) | Compute-on-read means no backfill, no triggers; consumers stay consistent by construction (STACK.md) |
| MUST | Re-baseline in the SAME phase: `rankMath.ts` + locked test values (74.25/49.5/99…), `smoke-rank.mjs` exact-value matrix, `smoke-promotion.mjs` (top-6-by-points + top-5-by-OVR ordering can shift) | STACK.md Version Compatibility: smoke matrices go red BY DESIGN until re-locked |
| MUST | Re-baseline tier bands D-01/D-02 in `presentation.ts` (locked in presentation.test.ts: <35 bronze / <60 silver / <85 gold / <85 platinum-OVR) | Value-proportional points REDISTRIBUTE across the 0–99 range (see below) — the old bands will mis-tier |
| SHOULD | Keep the `n ≥ 3` data_sufficient rule unchanged | Cohort-size rule is orthogonal to the scale; changing two things at once muddies calibration |
| SHOULD | Seed data (Feature 4) calibrates the new bands before they're locked | Explicit sequencing dependency |

### Semantic consequences (the important part)

| Consequence | Why | Confidence |
|-------------|-----|------------|
| **Bottom-end compression.** Rank-based worst always got 0 points; value-based worst gets `own/max × 99` — often far above 0 (a worst at 50% of best gets 49.5). The owner gains top-end differentiation at the COST of bottom-end spread | Direct arithmetic consequence | HIGH |
| **OVR floor-51 becomes nearly unreachable.** Under rank-based, the last-place player in all 6 key stats scored 0 points → OVR exactly 51. Under value-based, typical worst-case OVR rises substantially (e.g. mean 49.5 → OVR 75). The floor still holds (never below 51 — RNK-03 satisfied trivially) but the effective OVR range narrows toward the top, and D-02's OVR bands (65/75/85) will need recalibration — platinum may crowd | Arithmetic + presentation.ts bands | HIGH (mechanics) / MEDIUM (how much — depends on real value spreads; exactly what the seed measures) |
| **Ties become trivially fair:** equal values always score equal points with no average-rank logic — the (ties−1)/2 machinery in 0009 becomes dead code in the new formula | Value-based, not position-based | HIGH |
| **Percentile phrase breaks (CMP-02).** "Você está entre os 30% piores em CRIT" is a POSITION claim; points will no longer be position-based. Either the RPC must keep computing a separate rank position for the phrase, or the phrase is reworded/removed. **Open question for the owner** — this is the core-value sentence in PROJECT.md | Direct conflict between the new scale and the v1.0 copy | HIGH (conflict exists) / LOW (resolution — owner call) |
| **Lower-is-better stats would invert.** The formula assumes higher = better for ALL 57 stats. Spot-check the catalog (e.g. Global CD %, Fixed CT) — if any stat reads lower-is-better, value-proportional inverts its meaning. No evidence of a lower-better stat in the 57-stat catalog, but this must be verified against real values during phase planning | Formula assumption | LOW (catalog direction unverified) — cheap to check against the live catalog + one owner confirmation |

### Edge cases and states

| State | Behavior | Confidence |
|-------|----------|------------|
| max_v = 0 or all-equal cohort values | `nullif(max_v, 0)` → null points (insufficient-data-style rendering) OR everyone-99 on ties; pick ONE and lock it in the spec + smoke | MEDIUM (design decision) |
| Negative stat values | Division math still works (own/max both negative → positive ratio) but "relative to best" gets weird if max < 0. Verify no catalog stat goes negative in practice | LOW |
| Single leader at max, rest clustered | The marquee scenario: leader 99, runner-up at 98.9% of best → 98 pts — the top-end cut working as specified. Seed must include this exact shape | HIGH |
| stat with only 2–3 cohort members | data_sufficient=false → null points — unchanged rendering path | HIGH |
| Rounding discipline | SQL and TS spec must agree to the decimal (smoke-proven pattern from v1.0) | HIGH |

---

## Feature 4: Dummy-data seed workflow (reversible)

**Purpose:** mold all displays around realistic cohorts BEFORE real members accumulate — specifically to calibrate the new value-proportional scale's tier bands (Feature 3) and the home tab's states (Feature 2). Confidence: **HIGH** on mechanics (tooling all exists, verified); **MEDIUM** on realism sourcing.

### Expected behavior

| Level | Behavior | Notes |
|-------|----------|-------|
| MUST | ~5 seeded players per class with `status='validated'` submissions + submission_stats, fully removable before release | Hand-authored SQL via the existing `apply-seed.mjs` (STACK.md §4 — no new tooling, no faker dep) |
| MUST | Reversibility by sentinel handle prefix (e.g. `dummy-…`): purge = `where discord_handle like 'dummy-%'` | STACK.md; `add_member` rejects the prefix (Feature 1 SHOULD) so real players can't collide |
| MUST | Purge deletes in FK-safe ORDER: submissions BEFORE members (submission_stats cascades with submissions; `submissions → members` has NO cascade — 0001_schema.sql) | STACK.md discovered constraint — getting the order wrong fails the purge |
| MUST | Seed files live in `supabase/seeds/dummy/` — NEVER as direct children of `seeds/` (config.toml's non-recursive `db.seed` glob would auto-apply them on every local `db reset`) | STACK.md discovered pitfall |
| SHOULD | Seed members carry bcrypt PIN hashes (via `hash-pin.mjs`) so they can actually log in during calibration | Seed members are ordinary members |
| SHOULD | Cover both `char_function` values (tank/dps) per class and both `value_type`s (flat/percentual) — cohorts are class+FUNCTION scoped (D-06) | Without both functions, function-scoped cohorts starve below n≥3 |
| NICE | One dummy PENDING submission → gives the Validações officer queue content during calibration | Queue reads pending rows (0011) |

### Realism requirements (what "realistic" must mean here)

| Requirement | Why | Confidence |
|-------------|-----|------------|
| Value SHAPES sampled from real data — the best source is the live project's actual validated submissions (query them, clone the distributions) | Training data cannot provide trustworthy Ragnarok Origin stat ranges (flat PATK in the thousands? millions? percent ceilings?). Owner-supplied or live-DB-derived values are the only honest source | LOW if invented from training data — **HIGH if derived from live submissions** (do that) |
| A clear leader, a mid pack, a distant worst per stat group | Exercises all four tier bands under the new scale (Feature 3 calibration goal) | HIGH |
| At least one near-best runner-up (~98.5–99% of leader's value) | Proves the 98/97/96 top-end cuts actually fire | HIGH |
| Some ties (equal values across two dummies) | Locks the tie semantics of the new scale | HIGH |
| `submitted_at` spread: some fresh (now), some 8–30 days old, at least one member with NO submissions | Exercises home stale-CTA states (never / stale / fresh) on dummy logins | HIGH |
| ≥3 valid cohort members per class+function | Satisfies n≥3 data_sufficient so points/OVR actually render | HIGH |
| Owner-reviewed values before apply | The seed defines what "good" looks like across the whole panel; wrong shapes mis-calibrate the tier bands it exists to tune | HIGH |

### Edge cases and states

| State | Behavior | Confidence |
|-------|----------|------------|
| Seed applied to the LIVE project while real members exist | Dummies ENTER every cohort (compute-on-read, status-only cohort, active-ness ignored — D-06) and inflate/distort real players' points, OVR, and Destaques cards. See Interactions below | HIGH |
| Purge mid-calibration | Safe anytime — purge is idempotent (0 rows on second run) and prefix-scoped; real rows untouched | HIGH |
| Forget to purge before release | Dummy names appear on Destaques and distort ranks for real members — make purge a RELEASE CHECKLIST gate, not a memory item | HIGH |
| Seed vs. `whitelist.sql` | Keep them separate: whitelist.sql is the real-members seed (re-runnable upserts); the dummy seed must never upsert onto real handles (sentinel guarantees this) | HIGH |

---

## Feature Interactions & Conflicts

| # | Interaction | Handling |
|---|-------------|----------|
| 1 | **Seed ↔ new scale (deliberate coupling).** The seed is the calibration instrument for the value-proportional scale: apply scale migration → apply seed → observe tier distribution → recalibrate D-01/D-02 bands → lock presentation tests → purge is NOT needed for rank math (compute-on-read adapts instantly). **Sequencing:** Feature 3's migration lands before Feature 4's seed; Feature 2's home can land independently | Phase planning should order: scale → seed → band calibration → (home/whitelist anytime) |
| 2 | **Seed polluting real rankings.** While seeded, every real player's points are computed against dummy values, Destaques shows dummy names, and the promotion ordering shifts. **Rules:** never apply the dummy seed to the live project once real members are actively submitting (calibration window only, or local/db-reset + staging-first); purge is a hard pre-release gate; sentinel prefix makes accidental survival greppable | HIGH confidence on the conflict; MEDIUM on window policy (owner call) |
| 3 | **New scale invalidates locked smoke contracts.** 74.25/49.5 exact values, smoke-rank 27/27, smoke-promotion ordering, rankMath.test.ts — all go red BY DESIGN. Migration + all re-baselines must ship in the same phase or CI/smokes stay red | HIGH |
| 4 | **New scale vs. percentile phrase (CMP-02 copy).** Points stop being percentile positions; the "entre os X% melhores/piores" phrase becomes literally false. Resolution options: (a) RPC also returns a true rank-position field for the phrase, (b) reword to value-relative copy, (c) drop the phrase. **Owner decision required** — touches the project's core-value sentence | OPEN QUESTION |
| 5 | **New scale vs. OVR floor-51 semantics.** Floor becomes near-unreachable; D-02 OVR bands likely recalibrate upward-shifted. Requirement RNK-03 ("never below 51") stays satisfied — but the owner should confirm the 51-floor is still the intended normalization story before the migration | OPEN QUESTION |
| 6 | **`pin_setup_required` vs. uniform-401 posture.** v1.0's enumeration-safety rule (T-01-03) relaxes for unclaimed handles — accepted and documented (STACK.md §1); carry to PITFALLS.md so no phase "fixes" it accidentally | HIGH |
| 7 | **Home ↔ closed-payload discipline.** `last_validated_at` is the only contract addition; resist any temptation to add per-stat rank-position fields to `my_report` while resolving conflict #4 — if option (a) is chosen, evaluate the leak surface explicitly (a rank position per stat is aggregate-like, but it changes the contract the RNK-02 leak-probes cover) | MEDIUM |
| 8 | **Whitelist ↔ stale dummies.** `add_member`'s sentinel rejection (Feature 1) and the purge's prefix scope (Feature 4) must use the SAME prefix constant — define it once in phase planning | HIGH |
| 9 | **Forgotten-PIN gap amplified by Feature 1.** Player-picked PINs remove the officer-known-PIN safety net; define the owner fallback (documented SQL or owner RPC) during the whitelist phase, even if shipped as ops-runbook only | MEDIUM |

---

## Anti-Features / Out of Scope for v1.1

From PROJECT.md Future section — explicitly NOT this milestone, with reasons to keep them out:

| Feature | ID | Why Out | What To Do Instead |
|---------|----|---------|--------------------|
| Delta badges (▲ 5,00% since last submission) | DELT-01 | Depends on the submission-diff view the new home intentionally doesn't need; the stale CTA already drives resubmission | Revisit v2 once the home tab proves which numbers players actually check |
| Submission history / progression view | HIST-01 | Append-only data makes it cheap LATER, but it's dashboard complexity now | Immutable submissions keep the door open; no schema work needed |
| Officer guild-health dashboard (participation %, non-submitters, OCR failure rate) | OFCR-01 | Temptingly adjacent to the stale-CTA feature — do NOT let it creep into home/officer pages this milestone | The `last_validated_at` field is the exact primitive OFCR-01 will need later; build the aggregate view in v2 |
| Stat catalog self-service additions | CAT-01 | Catalog is stable at 57 owner-validated stats | Owner requests go through dev as today |
| OCR confidence surfacing | OCRX-01 | Structural reader just passed UAT; confidence plumbing is new surface with no validated need | Mandatory fix-up gate remains the accuracy control |
| Shareable card PNG export | SHAR-01 | Engagement nice-to-have; zero signal yet on demand | Post-v2 if members ask |
| Power-shift significance rule (combat_power flagged only at thousands scale) | (owner observation) | Belongs to DELT-01/HIST-01 domain — no deltas exist yet in v1.1 | Defer with the delta features |
| PIN change / forgot-PIN self-service | — | Not requested; but SEE the forgotten-PIN gap in Feature 1 — an owner-side reset fallback should at least be documented this milestone | Ops-runbook entry or a tiny owner RPC; decide in phase planning |
| Anything beyond the 4 features | — | v1.1 is additive by design: 4 features, zero new deps (STACK.md) | Scope creep goes to Future section |

---

## Open Questions (carry to phase planning / owner)

1. **Percentile phrase fate under the new scale** (conflict #4) — keep via a separate rank-position field, reword, or drop? Owner call; affects `my_report` contract.
2. **OVR floor-51 story after value-proportional compression** (conflict #5) — confirm the normalization narrative survives; recalibrate D-02 bands with owner sign-off.
3. **Forgotten-PIN fallback** — documented SQL procedure vs. owner-only RPC; minimum is a runbook entry.
4. **Re-adding a removed member** — reactivate (keeps history) vs. reject; Feature 1 NICE.
5. **Catalog lower-is-better check** — verify all 57 stats are higher-is-better against real values before the scale migration (Feature 3, LOW-confidence assumption).
6. **Seed window policy** — can the dummy seed touch the live project at all, or local-only? Owner call (conflict #2).
7. **max_v = 0 / all-tie rendering** — null points vs. everyone-99; lock one in the spec + smoke (Feature 3).

---

## Sources

- `.planning/PROJECT.md` — v1.1 milestone scope, validated list, Future/deferred IDs (HIGH, project-authoritative)
- `.planning/STATE.md` — pre-launch advisories (whitelist rotation, JWT key), deferred items (HIGH)
- `.planning/research/STACK.md` (2026-10-13) — authoritative stack decisions cross-referenced, not restated: migration 0012 nullable pin_hash, `setup-pin` + `pin_setup_required`, `'inicio'` Tab union, `last_validated_at`, dummy/ subfolder, FK purge order, zero deps (HIGH)
- `.planning/milestones/v1.0-REQUIREMENTS.md` + `.planning/MILESTONES.md` — requirement-ID conventions, 20/20 validated baseline, shipped summary (HIGH)
- Codebase (integration ground truth): `src/App.tsx` (Tab union, default 'painel', onNavigate), `src/lib/api.ts` (my_report contract, restFetch, closed-payload comments), `src/features/auth/LoginPage.tsx` (login states, uniform-401 copy), `src/lib/rankMath.ts` (74.25/49.5/99/51 spec + MIN_COHORT_SIZE=3), `src/features/dashboard/presentation.ts` + `presentation.test.ts` (D-01/D-02 bands 35/60/85, 65/75/85), `supabase/migrations/0001_schema.sql` (pin_hash NOT NULL, FK cascade asymmetry), `0009_rank_engine.sql` (rank formula in my_report/class_top5, D-06 cohort, ties), `supabase/seeds/whitelist.sql` (placeholder-hash flow), `supabase/seeds/classes.sql` (15 starter classes — seed scale: ~75 dummy members at 5/class is a SIZING note for phase planning), `config.toml` via STACK.md — all **HIGH**
- Ragnarok Origin realistic stat value ranges — **LOW**, training-data only; resolved by deriving seed values from the live DB's validated submissions (recommended) or owner-supplied samples

---

*Feature research for: NeoFoot v1.1 — Home, Whitelist & Fine Ranks*
*Researched: 2026-10-13*
