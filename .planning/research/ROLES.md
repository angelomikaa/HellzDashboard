# Research — Role-Differentiated Key Stats (v1.1 extension)

**Domain:** Per-role key-stat configuration on a LIVE single-guild Ragnarok Origin stats panel (React 19 SPA + Supabase free tier: Postgres/RLS/SECURITY DEFINER RPCs)
**Project:** Hellz / NeoFoot
**Researched:** 2026-10-13
**Overall confidence:** MEDIUM — the codebase audit is HIGH (every integration point read directly in the shipped source), the official job-tree taxonomy is HIGH (extracted from the official site's live data API), but the playstyle-role mapping per class is LOW (training-data + owner's verbatim examples; the official site publishes NO explicit role labels — its job copy is flavor text only). Design recommendations are MEDIUM (design choices for the owner).

**Scope note:** This extends the v1.1 milestone scope. The four researched features (whitelist lifecycle/PIN setup → WHIT-, personalized home → HOME-, value-proportional 99 scale → SCALE-, dummy seed → SEED-) are documented in [FEATURES.md](FEATURES.md), [STACK.md](STACK.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SUMMARY.md](SUMMARY.md) — none of that is re-derived here. This file adds the owner's new requirement: key stats differing per ROLE within a class (Summoner as physical DPS / magical DPS / tank; Biochemist similar). Suggested REQ-ID prefix: **ROLE-** (two-letter-style domain prefix per the FEATURES.md convention; final IDs owned by REQUIREMENTS.md).

---

## 1. Current implementation audit (codebase ground truth — HIGH)

### 1.1 How key stats are stored and configured today

| Artifact | Location | Behavior |
|----------|----------|----------|
| `class_key_stats` table | `0001_schema.sql:34-38` | Columns `(class_name, stat_key)`, PK `(class_name, stat_key)`, FK to `stat_catalog`. **No role dimension exists.** Comment: "exactly-6-per-class enforced in Phase 3 logic" |
| RLS posture | `0002_rls.sql:44-45` | NO policies on `class_key_stats` → deny-all for clients (RNK-02 foundation); `0009:22-37` adds `staff_select_key_stats` (staff-only read, exists-subquery on a helper — the 42P17-safe pattern) |
| `set_key_stat(p_class, p_stat_key, p_enabled)` | `0009:51-98` | SECURITY DEFINER; internal gate FIRST (`member_role in ('officer','owner')` + live `active` check); `unknown_class` guard; **per-class advisory lock** `pg_advisory_xact_lock(hashtext('cks:' \|\| p_class))` (:77); block-at-7 — insert rejected with `key_stat_limit` when the class already has 6 (:82-84); returns the class's current key-stat count |
| Class catalog | `supabase/seeds/classes.sql` | 15 starter classes bootstrap: Assassin, Knight, Wizard, Hunter, Priest, Blacksmith, Crusader, Sage, Rogue, Alchemist, Bard, Dancer, Gypsy, Monk, **Super Novice**. Owner-extendable via admin UI (`staff_insert_classes`, 0008) |
| Admin UX | `src/features/admin/KeyStatsPage.tsx` | Class selector + stat chips + `MAX_KEY_STATS = 6` client gate (:34-36) + `class_top5` preview; enumeration-safe pt-BR copy; `LIMIT_ERROR` mentions "Máximo de 6 stats por classe" (:29) |
| Client API | `src/lib/api.ts:170-190` | `fetchKeyStats` = REST GET `class_key_stats?class_name=eq.<X>&select=stat_key` (staff policy filters); `setKeyStat` = RPC wrapper |

### 1.2 Where "6 keys per class" is hardwired (the full touch surface for any role change)

1. **`class_key_stats` schema + PK** (`0001:34-38`) — no role column.
2. **`set_key_stat`** (`0009:51-98`) — class-only signature; count gate and advisory lock keyed by class only.
3. **`my_report` OVR lateral** (`0009:192-217`, current body `0011:650`): `from class_key_stats ks ... where ks.class_name = v_class`, with the strict `count(*) = 6 and count(p) = 6` all-6-or-nothing gate (D-10/D-11).
4. **`class_top5` OVR lateral** (`0009:313-315`, current body `0011:360-362`): `where ks.class_name = cm.char_class`.
5. **`get_promotion` OVR lateral** (`0011:555-567`): same class-only read for promotion cards.
6. **`rankMath.ts`** (`src/lib/rankMath.ts:58-63`): `ovrFromPoints` throws RangeError unless given exactly 6 points — role-agnostic as written (it never sees the key set), so **unchanged** by this feature.
7. **Stats-Chave admin page** (above) + its tests.
8. **Smoke fixtures:** `smoke-rank.mjs:177/229-262` and `smoke-promotion.mjs:216/241-247` delete/insert `class_key_stats` rows with NO role column → both go red when the schema gains one (same by-design redness as the SCALE- migration).

### 1.3 How a member's class and function are assigned

- `members.char_class text references classes(class_name)` + `members.char_function text not null default 'dps' check (char_function in ('tank','dps'))` — both added by `0005_registry_catalog.sql:24-26`.
- **Staff-set, not member-set.** Column grants `update (display_name, char_class, char_function)` exist (`0005:33`), but the RLS gate is `staff_update_characters` (staff-only, `0006/0007/0008` rebuilds) — a member JWT has NO own-row UPDATE policy. Assignment happens on **Personagens (CharactersPage)**: staff edit form sends exactly `{display_name, char_class, char_function}` (CharactersPage.tsx:8-9, 206-239, T-02-10).
- `char_function ∈ {'tank','dps'}` is the **only** per-member role-ish field. It drives the D-06/D-07 percentile cohort (`my_report` cohort CTE joins `m.char_class = v_class and m.char_function = v_function`, `0009:144-152`) and is serialized as the caller's own `char_function` in `my_report`/`class_top5`/`get_promotion` payloads.
- UI label map: `FUNCTION_LABELS` in `src/lib/groups.ts:11` (`'dps' | 'tank'` → pt-BR labels).

**Audit verdict:** the current design conflates two concepts in one column. `char_function` (tank/dps) simultaneously scopes percentile cohorts (D-06) and nothing else — key stats ignore it entirely. The owner's requirement introduces a second axis (build style: physical vs magical vs tank) that today's two values cannot express, and that must ALSO scope key stats. The cheapest correct move (see §3) is to extend `char_function` into the build-role axis rather than introduce a parallel column.

---

## 2. Role taxonomy — official job tree (site data HIGH; playstyle roles LOW)

**Source of truth result:** `https://roocamer.gnjoy.game/home#job-intro` is a fully client-rendered SPA (Cloudflare Worker + React bundle; webfetch of the page returns an empty shell). I extracted the bundle's API config and fetched the underlying data endpoint directly: **`GET https://rooc-official-am-api.joymaker.com/api/rooc/job-intro`** — the exact JSON the official site renders (HIGH confidence, official Gravity/Joymaker infrastructure). The bundle's own rendering logic (`sortJob`/`filterJob`) shows the site displays only base + 2nd + 2nd-advanced jobs, sorted `1,2,5,4,3,6,7` — **Gunslinger (id 8) exists in the API but is not showcased**, and **Super Novice and Ninja do not exist anywhere in the API** (confirmed excluded per assignment).

The site provides **no explicit role labels** (no tank/DPS tags, pt-BR or en) — only flavor descriptions. Every "playstyle role" cell below is therefore training-data + owner-statement derived: **LOW confidence, flagged**; only names/structure are HIGH.

### 2.1 Official released job tree (names + structure — HIGH)

| Base line (API id) | Branch A: 2nd → 2nd-advanced (3rd exists, site-hidden) | Branch B: 2nd → 2nd-advanced | Guild-catalog relevance |
|---|---|---|---|
| Swordsman (4) | Knight → Lord Knight → Rune Knight | Crusader → Paladin → Royal Guard | Knight, Crusader both in catalog |
| Mage (2) | Wizard → High Wizard → Warlock | Sage → Professor → Sorcerer | Wizard, Sage in catalog |
| Archer (5) | Hunter → Sniper → Ranger | Bard → Minstrel → Maestro | Hunter, Bard in catalog; **Dancer/Gypsy are the female counterparts of Bard/Minstrel** (site merges by gender avatar; panel catalogs them separately) |
| Thief (6) | Assassin → Assassin Cross → Guillotine Cross | Rogue → Stalker → Shadow Chaser | Assassin, Rogue in catalog |
| Acolyte (3) | Priest → High Priest → Archbishop | Monk → Champion → Shura | Priest, Monk in catalog |
| Merchant (1) | Blacksmith → Mastersmith → Mechanic | Alchemist → **Biochemist** → Genetic | Blacksmith, Alchemist in catalog (Biochemist = this line's advanced stage) |
| Apprentice/Doram (7) | To-Be Summoner → **Summoner** → Grand Summoner (single line, **"three distinct builds: Land, Sea, and Life"** per official copy) | — | **NOT in catalog yet** (owner can add via admin UI); owner's motivating example |
| Gunslinger (8) | Sentry → Rebellion → Nightwatch | — | Not in catalog; exists in API but hidden from the site's showcase |

Not released / absent from the official data: Super Novice, Ninja, all expanded 3rd-job showcases (site filters them), Gunslinger showcase. The panel's seed class **Super Novice is an unreleased class that should not receive role configs** (flag for cleanup — see ROLE-12 NICE).

### 2.2 Playstyle-role mapping for guild-relevant classes (ALL ROWS LOW — training data + owner statements; the site publishes no role labels)

| Class (panel catalog) | Viable playstyle roles | Multi-role? | Basis |
|---|---|---|---|
| Summoner (Doram) | Physical DPS / Magical DPS / Tank | **Yes — 3 roles** | **Owner verbatim** + official "Land, Sea, Life" builds copy (HIGH that the game advertises 3 builds; LOW on exact stat emphasis) |
| Biochemist (Alchemist line) | Physical DPS / Magical-flavored DPS (demo/acid) / Tank | **Yes — owner: "suffers from the same circumstances"** | Owner verbatim; LOW on details |
| Knight | Physical DPS / Tank | Likely yes | LOW (training data) |
| Crusader | Tank / Physical DPS (spear) | Likely yes | LOW |
| Sage | Magical DPS (single-target) / Support-dispel | Plausibly | LOW |
| Priest | Support-healer / Battle magical DPS | Plausibly (needs a "support" role the panel doesn't have) | LOW |
| Bard / Dancer / Gypsy | Support (songs/ensembles) / Physical DPS | Plausibly | LOW |
| Assassin, Rogue, Monk, Hunter, Wizard, Blacksmith | Physical DPS; Wizard = magical AoE DPS | Predominantly single-role | LOW |
| Gunslinger line (if ever added) | Physical ranged DPS | Single-role | LOW |

**Sizing takeaway:** 2 classes are confirmed multi-role by the owner; ~4-6 more are plausibly multi-role (LOW). Design for "up to 3 roles per class, configured lazily" — not for "every class × 3 roles."

---

## 3. Design space (recommendations — MEDIUM unless noted)

### 3.1 Naming first: avoid the "role" collision (HIGH-severity observation)

`members.role` already means the staff role (member/officer/owner) throughout this codebase (JWT claim `member_role`, `set_member_role`, gates everywhere). Introducing a column literally named `role` would poison every future grep and review. **Recommendation: do NOT add a new "role" concept — extend `char_function`'s value set from `('tank','dps')` to `('tank','dps','mdps')`** (pt-BR labels: Tanque / Dano Físico / Dano Mágico — exact wording owner call). This one additive CHECK widening (no existing row rewrites) makes the build-role axis flow through ALL existing machinery for free: D-06/D-07 cohorts, my_report's own `char_function` echo, the Personagens edit form, FUNCTION_LABELS. A separate parallel `build_role` column would instead double every cohort join and every admin screen.

### 3.2 Schema: key per (class, role) — not per-class + overrides

**Recommendation:** `class_key_stats` gains `char_function text not null` (same CHECK), PK becomes `(class_name, char_function, stat_key)`. Per-(class, role) exactly-6 invariant; block-at-7 per combo.

- Alternatives rejected: (a) per-role *override* table layered on class defaults — more joins, more leak surface, zero payoff at ≤15 classes × ≤3 roles; (b) JSONB config column — loses the FK to `stat_catalog`, breaks the staff-read RLS row model, no.
- Migration shape: small-table PK rebuild (drop constraint, add column, backfill, add new PK) — `class_key_stats` holds ≤ 15×6 = 90 rows today, trivially safe on live data.
- `set_key_stat` gains `p_char_function` param: validate against the CHECK vocabulary, advisory lock becomes `hashtext('cks:' || p_class || ':' || p_function)`, count gate filters `where class_name = p_class and char_function = p_function`. Same `forbidden`/`key_stat_limit` error vocabulary.
- **Backfill (the live-data continuity trick):** at migration, duplicate every existing class's 6 rows into each role value in the new vocabulary. Result: every (class, role) combo starts with exactly the class's current set → `count(*) = 6` holds everywhere → **zero OVR nulls and zero OVR changes on deploy day**. Staff then differentiates per-role sets at leisure; each divergence is a deliberate, owner-visible config act.

### 3.3 Membership semantics: staff-set, instant re-scoring, explicit null fallback

- **Who assigns:** staff, via the unchanged Personagens path (`staff_update_characters`). Keep it staff-set: key stats are SECRET (RNK-02), so members cannot rationally self-select anyway, and member self-service would let players hop into the weakest cohort — a trust hole with no upside. Confidence HIGH (matches REG-01 and the existing RLS reality).
- **When it can change:** any time staff edits the character. **Compute-on-read means history re-scores instantly** — the member's OVR/points are recomputed from the new (class, role) cohort on the next `my_report` call. This is philosophically identical to today's admin key-stat tweaks (set_key_stat already re-scores whole classes retroactively) — acceptable, but it should be announced as OVR discontinuity, not treated as a bug. No submission history is touched (append-only intact).
- **No-config fallback for a (class, role) combo:** with the §3.2 backfill, initially moot. For any FUTURE combo a staff member assigns before configuring: **OVR = null with the existing data-insufficient rendering** (consistent with D-11 all-6-or-nothing and the null-class handling). **Do NOT fall back to class defaults silently** — that scores a member under stats not tuned for their build, which is precisely the dishonesty the feature exists to remove.

### 3.4 Cohort semantics: class + build-role (accept and engineer for starvation)

**Recommendation: percentile cohorts become class + build-role** — which happens automatically under §3.1 (cohort joins already filter on `char_function`). Comparing a magical-DPS Summoner's STR/SPA points against physical-DPS Summoners is apples-to-oranges; the owner's core value ("where do I stand vs same class AND function") extends naturally to role.

- **Starvation math (quantified):** `MIN_COHORT_SIZE = 3` (rankMath.ts:11, D-12). Seed sizing note: ~75 dummies / 15 classes ≈ 5 per class. Split a 5-member class across 3 roles → 2-2-1 → **every role cohort data_insufficient → null points/OVR for the whole class**. Mitigations, in order: (1) seed ≥3 dummies per *configured* role only — single-role classes need 3-6, the 2 confirmed multi-role classes need 3×3=9 → realistic budget ~6-9/class ≈ **100-135 dummies** (vs 75) — owner sign-off needed; (2) configure per-role sets lazily — only where the guild actually fields multiple builds; (3) fallback option if real-guild distribution proves too thin: keep per-stat percentile cohorts at class+function (2 buckets) while ONLY key stats/OVR are role-scoped — hybrid, one extra `and cm.char_function = v_function` retained in cohort CTEs. Owner call (Open Question 4), but role-scoped cohorts are the honest default.
- Promotion (`get_promotion`) top-5-by-OVR stays **class-wide across roles** — OVR is the cross-role comparable currency (that's its purpose). Cards already print `char_function` (PromotionCard.tsx:41), so mixed-role cards are self-explanatory.

### 3.5 Admin UX: role selector on Stats-Chave

- KeyStatsPage gains a role tab/selector *inside* the existing class selector (class → role → chips). `fetchKeyStats` query gains `&char_function=eq.<role>`; `MAX_KEY_STATS = 6` applies per selected (class, role); `LIMIT_ERROR` copy updated to mention the role.
- **Config workload:** worst case 15 classes × 3 roles × 6 stats = 270 decisions — but the lazy-config principle caps real work at ~(2 confirmed + ~4 plausible) classes × 1-2 differentiated roles. The duplicated backfill defaults mean "no decision yet" is a valid steady state, not debt.
- Optional coverage indicator (NICE): show which (class, role) combos still run the duplicated default set.

### 3.6 Interaction with SCALE-01..03 (value-proportional 99) and closed payloads

- **Scale interaction is clean:** the SCALE formula (`points = round(own_value / nullif(max_v,0) * 99, 2)`) is cohort-relative and key-stat-agnostic; it composes with role-scoped cohorts without modification. The only coupling is that both features rewrite the same three RPC bodies. **Sequencing recommendation:** fold both into ONE migration phase (0013: formula swap + role column + role-filtered OVR laterals + `set_key_stat` v2), re-lock the rank tripod (rankMath.test.ts, smoke-rank.mjs, smoke-promotion.mjs, D-01/D-02 bands) ONCE — two sequential rewrites would re-baseline the same locked values twice and double the red-suite window (FEATURES ∩3 discipline).
- **Closed-payload discipline (RNK-02) holds structurally:** key stats still only influence OVR internally; no `is_key`/`char_function_config` field is added anywhere. The caller's own `char_function` in `my_report` is already serialized today — an own-field echo, not a leak. New leak-probe surface: assert no payload ever distinguishes "this class has differentiated role configs" (e.g., never serialize per-role config counts to members). Leak-probe suites (smoke-rank RNK-02 markers, smoke-promotion 4c) extend unchanged — grep for `key_stat`/`is_key`/`contributes_to_ovr` still suffices; add `class_key_stats` never appears (it can't — ungranted).
- The T-03-10 accepted offline-brute-force leak keeps its shape under role-scoped cohorts (smaller cohorts actually make aggregates *noisier*, not leakier).

---

## 4. Draft requirements (ROLE- prefix — proposals for the roadmap to map)

| Level | ID | Requirement | Notes |
|-------|----|-------------|-------|
| MUST | ROLE-01 | Key-stat config is keyed per (class, build-role); each combo holds an independent set of exactly 6 (block-at-7 per combo, advisory-lock race-proof) | PK `(class_name, char_function, stat_key)`; lock hash gains the role component |
| MUST | ROLE-02 | `set_key_stat` v2 accepts the build-role param; gate vocabulary unchanged (`forbidden`, `key_stat_limit`, `unknown_class`); role validated server-side | One RPC, no per-role duplicates |
| MUST | ROLE-03 | OVR in `my_report`, `class_top5`, `get_promotion` reads the member's own (class, build-role) config; per-stat points/aggregates follow the role-scoped cohort (D-06/D-07 supersession) | Three OVR laterals + cohort CTEs gain the role dimension — same migration as SCALE per §3.6 |
| MUST | ROLE-04 | Migration backfills every existing class config into all build-role values → zero OVR change or null on deploy day | The live-data continuity trick (§3.2) |
| MUST | ROLE-05 | `members.char_function` CHECK widened additively (new build-role value); no existing row rewritten | Existing members stay valid; re-assignment is staff work, not migration work |
| MUST | ROLE-06 | Members with no configured (class, build-role) combo get OVR = null via the existing data-insufficient rendering — never a silent class-defaults fallback | Consistent with D-11 |
| MUST | ROLE-07 | Build-role assignment stays staff-only (Personagens); no member self-service; RNK-02 closed-payload discipline verbatim (zero new key-stat-derived fields; own `char_function` echo only) | Existing RLS/RPC gates unchanged |
| SHOULD | ROLE-08 | Stats-Chave gains a role selector; per-(class, role) count display and block-at-7 copy; `fetchKeyStats` filtered by role | Client gate stays UX-only; server is the boundary |
| SHOULD | ROLE-09 | Dummy seed expanded: ≥3 dummies per configured (class, role) combo, both value_types | Budget grows ~75 → ~100-135 (owner sign-off, SEED- coupling) |
| SHOULD | ROLE-10 | Staff audit pass: re-assign existing members' build-roles before any per-role config is differentiated | Prevents mag-build members scoring under phys key sets |
| NICE | ROLE-11 | Officer-visible per-(class, role) config coverage indicator | Staff-only projection; never member-visible |
| NICE | ROLE-12 | Class catalog cleanup: flag Super Novice as unreleased (no role configs, or remove from selectors); align Dancer/Gypsy naming with the official merged Bard line | Owner call; official tree merges by gender |

---

## 5. Pitfalls specific to this feature

### Critical

**P-ROLE-1: Deploy-day OVR discontinuity is avoidable — and must be avoided.** Adding the role dimension naively (empty configs for new roles) nulls every member's OVR on migration day. The §3.2 backfill (duplicate current class config into all roles) is the difference between an invisible migration and a guild-wide "everyone's OVR vanished" incident on a LIVE panel. Detection: smoke asserting every active member has OVR pre/post migration parity.

**P-ROLE-2: The role word-collision.** A column named `role` (staff role already exists on `members.role` + `member_role` JWT claim + RPC gates) will be confused in review, in RLS, and in the leak-probe suite. Prevention: extend `char_function`, never introduce `role`.

**P-ROLE-3: Wrong-cohort mislabeling of existing members.** After widening the vocabulary, existing mag-build members still carry `'dps'` (physical bucket) and score under physical key sets/cohorts until staff re-assigns (ROLE-10). This is silent — no error, just wrong peers. Prevention: audit pass gated BEFORE any per-role differentiation lands; owner announces the re-mapping window.

**P-ROLE-4: Smoke fixtures hardcode the old schema.** `smoke-rank.mjs` (delete/insert `class_key_stats` without role, :177/:229) and `smoke-promotion.mjs` (:216/:241) go red BY DESIGN when the column appears; every fixture member needs a build-role and per-combo 6-row inserts. Same in-phase re-lock discipline as SCALE (∩3) — fold both features' smoke updates into one re-baseline.

### Moderate

**P-ROLE-5: Cohort starvation nulls whole classes.** 3-role splits of small classes fall under n≥3 → data_sufficient=false everywhere (§3.4 math). Prevention: lazy role configuration + seed coverage per configured role; explicitly test one starved combo renders the insufficient state rather than erroring.

**P-ROLE-6: Advisory-lock hash namespace change.** `set_key_stat` v2 locks on `cks:class:function`; a stray client calling the OLD signature post-deploy gets a function-signature error (PostgREST keeps both overloads if the migration doesn't drop the old one). Prevention: `create or replace` with the new signature in one migration + `drop function` for the old signature; smoke probes the member-forbidden path again.

**P-ROLE-7: Leak-probe drift.** If anyone "helpfully" adds a member-facing indicator of role-scoped configs (e.g., "your build has custom key stats"), it leaks that role configs differ. Prevention: ROLE-07 verbatim in the RPC comment; payload-wide marker grep extended in the smoke battery.

---

## 6. Open questions for the owner

1. **Build-role vocabulary and pt-BR labels** — extend to 3 values (Tanque / Dano Físico / Dano Mágico)? Is a fourth "Suporte" needed for Priest/Bard/Dancer builds (today's tank/dps pair already strains to classify healers)?
2. **Which classes actually get differentiated sets** — only Summoner + Biochemist-line (owner-confirmed), or also Knight/Crusader/Sage/Bard-line (LOW-confidence plausibles)? Drives config workload and seed budget.
3. **Cohort semantics confirmation** — class+build-role cohorts (recommended) vs. the hybrid (percentile stays class+function, only OVR role-scoped) if real-guild role distribution is too thin for n≥3.
4. **Seed budget** — accept growth from ~75 to ~100-135 dummies to satisfy n≥3 per configured role (SEED- coupling)?
5. **Backfill confirmation** — duplicate current class configs into all roles at migration (recommended) vs. start differentiated-but-incomplete (null OVR until staff configures)?
6. **Existing-member role audit** — who maps current members to the new build roles, and when (before differentiation lands)?
7. **Re-assignment change management** — any notification to the player when staff changes their build role (their OVR re-scores instantly)?
8. **Catalog cleanup** — remove/flag Super Novice (unreleased); align Dancer/Gypsy with the official merged Bard/Dancer line?
9. **Summoner in the catalog** — add the Doram line as a class via the existing admin UI before or with this feature?

---

## Sources

- **Codebase (HIGH, read directly):** `supabase/migrations/0001_schema.sql` (:34-38 class_key_stats), `0005_registry_catalog.sql` (:24-33 char_class/char_function + column grants), `0006/0007/0008` (staff_update_characters evolution, 42P17 lesson), `0009_rank_engine.sql` (:51-98 set_key_stat + advisory lock; :108-221 my_report OVR lateral; :313-315 class_top5), `0010`/`0011` (current RPC bodies; OVR laterals at 0011:360-362/555-567/650), `src/lib/rankMath.ts` (:11 MIN_COHORT_SIZE, :58-63 exactly-6 gate), `src/features/admin/KeyStatsPage.tsx` (:29-36), `src/features/admin/CharactersPage.tsx` (:206-239 staff edit path), `src/lib/api.ts` (:170-190), `src/lib/groups.ts` (:11 FUNCTION_LABELS), `scripts/smoke-rank.mjs` / `smoke-promotion.mjs` (fixtures), `supabase/seeds/classes.sql` (15 classes incl. Super Novice)
- **Official site data (HIGH):** `GET https://rooc-official-am-api.joymaker.com/api/rooc/job-intro` — the live JSON behind `https://roocamer.gnjoy.game/home#job-intro` (endpoint + render/filter logic extracted from the site's own JS bundle `main-BVKl7piB.js`; site shows base + 2nd + 2nd-advanced only, hides Gunslinger and all 3rd jobs; Super Novice/Ninja absent). Job names/structure HIGH; the site provides NO role labels
- **Playstyle-role mapping (LOW):** training-data game knowledge + the owner's verbatim requirement (Summoner, Biochemist); every such cell flagged LOW in §2.2 — validate against owner/in-game reality during phase planning
- **Cross-referenced (HIGH):** `.planning/research/FEATURES.md`, `STACK.md`, `ARCHITECTURE.md`, `SUMMARY.md` (v1.1 conventions, SCALE-01..03 formulas, closed-payload discipline, smoke-tripod discipline); `.planning/PROJECT.md` (RNK-01/02, validated list)

---

*Research for: NeoFoot v1.1 — Role-Differentiated Key Stats*
*Researched: 2026-10-13*
