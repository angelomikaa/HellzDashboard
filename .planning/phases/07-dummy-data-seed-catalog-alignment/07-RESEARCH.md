# Phase 7: Dummy-Data Seed & Catalog Alignment — Research

**Researched:** 2026-10-13
**Domain:** Live-project class-catalog migration + reversible dummy seed (Supabase Postgres + React 19 SPA, zero new dependencies)
**Confidence:** HIGH — official job tree verified against the live API today (2026-10-13); every schema/tooling claim read directly in shipped source; seed mechanics proven in v1.0 (01-01/02-01).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (NON-NEGOTIABLE)
- **D-01:** Catalog uses transcendent (2nd-advanced, "final-form") names — the currently-released in-game top job; announced-but-unreleased jobs get NO entries. Source of truth: official job tree (verified live, §2 below).
- **D-02:** Derived mapping 15 old → 14 new (Super Novice removed, Summoner + Rebellion added, Bard/Gypsy kept as gender-split entries, Dancer removed). **D-02's own verification directive:** "verify each renamed line's current top job against the live official API during planning; if the in-game current form differs from the site's 2nd-advanced label, the owner's rule (currently-released job) wins." → see §3 for the verification result (one correction: Hunter → **Sniper**).
- **D-03:** Renames must preserve existing class rows and real members' `char_class` (append-only discipline; re-runnable catalog seed + member-row updates in the same migration).
- **D-04:** `char_function` carries exactly ONE of: `dps` (Dano Físico), `mdps` (Dano Mágico), `suporte` (renamed from `tank`).
- **D-05:** Widening + rename ships HERE so dummies carry roles from day one; additive CHECK widening; `FUNCTION_LABELS` pt-BR labels updated; existing real members keep working.
- **D-06:** Seed follows the owner roster: 16 High Priest + 8 Gypsy + 8 Bard (support core = 32), 8 Lord Knight/Paladin, 8 High Wizard/Professor, 8 Biochemist/Mastersmith, 8 Sniper-line + Rebellion shared, 8 Summoner, 1 wildcard = 72–80.
- **D-07:** Role mapping confirmed: High Priest/Gypsy/Bard → `suporte`; High Wizard/Professor → `mdps`; Sniper-line/Rebellion → `dps`; author mixes LK/Paladin (`suporte`/`dps`) and Biochemist/Mastersmith (all three); Summoner 8 split ~3/3/2 (starvation exercised).
- **D-08:** Shared-slot splits are authored (e.g., 4/4), owner corrects at the pre-apply review gate.
- **D-09:** Dummy display names are obvious per-class placeholders ("High Priest 1", …). Handles keep the `dummy-%` sentinel prefix.
- **D-10:** One uniform, known PIN for all dummies (bcrypt via `hash-pin.mjs`); owner logs in as any dummy to calibrate views.
- **D-11:** Seed values derive from the LIVE database's real validated submissions (clone per-stat distributions). Naturalistic shapes; SEED-01's mandated elements (clear leader, ~98.5% runner-up, ties, `submitted_at` spread incl. a never-submitted member) present as they occur naturally.
- **D-12:** Pre-apply review gate — owner reviews value tables BEFORE `apply-seed.mjs` touches live. Corrections loop through a revised seed file.
- **D-13:** Seed applies to the LIVE project; dummies resident for the milestone; purge is a hard pre-release checklist gate (FK-safe, idempotent).
- **D-14:** Wildcard class = author pick (single-sample class exercising n=1 data-insufficient rendering end-to-end).
- **D-15:** Dummy submissions carry validated status + at least one PENDING submission (Validações queue), all 57 stats per submission, both value_types covered per cohort, ≥3 dummies per populated (class, build-role) combo.

### OpenCode's Discretion
- Exact split numbers within roster groups (subject to D-12 review); wildcard class choice; seed file structure inside `supabase/seeds/dummy/`; idempotency mechanics; migration numbering + exact rename/backfill mechanics; uniform dummy PIN value (never committed in plaintext); combat_power spread like other stats; pt-BR micro-copy.

### Deferred Ideas (OUT OF SCOPE)
- power-shift-significance (v2 delta domain), Grand Summoner/Night Watch catalog pivots (future release), realistic dummy persona names (rejected), seed-derived calibration report (Phase 9 prep).
- Phase 9 scope: per-role key stats, `set_key_stat` v2, value-proportional scale, band calibration. Phase 8 scope: `add_member` sentinel rejection.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Class catalog rename/add/remove | Database/Storage (migration 0012 + seed) | — | PK/FK graph lives in Postgres; rename must be atomic with member + key-stat row updates |
| `char_function` CHECK widen + rename | Database/Storage (migration 0012) | Frontend (types/labels) | Server is the boundary; frontend only mirrors the vocabulary |
| Live-DB distribution extraction | API/Backend (Management API read-only query) | — | Same proven `apply-seed.mjs` transport, SELECT-only; Node-only (PowerShell JSON corruption) |
| Dummy seed + purge SQL | Database/Storage (seed files via `apply-seed.mjs`) | — | Service-level SQL bypasses RLS exactly like existing seeds; never migrations, never Auth |
| Seed value realism | Database/Storage (authored SQL from live-derived bases) | — | Hand-authored SQL per STACK.md "What NOT to Add" (no faker) |
| Vocabulary UI (labels + staff form select) | Browser/Client (`groups.ts`, `CharactersPage`) | — | Label map + native select; zero new deps |
| Rank rendering of starvation cases | Database/Storage (existing RPCs, unchanged) | Browser (existing insufficient states) | **This phase touches NO rank RPC** — n≥3 gate + n<3 hidden already shipped in v1.0 |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 7 is purely additive data + catalog work on a LIVE panel. Three mechanisms carry it: (1) **migration 0012** — class-catalog rename/add/remove with lockstep `members.char_class` + `class_key_stats` row updates (OVR continuity), plus the additive `char_function` CHECK widen/rename (`tank`→`suporte`, add `mdps`); (2) **dummy seed + purge** in `supabase/seeds/dummy/` (outside the flat `db.seed` glob), applied via the proven `apply-seed.mjs`, values cloned from live validated submissions; (3) **vocabulary propagation** — one shared label map + five TS files + three smoke fixtures. The official job tree was re-verified live during this research (see §2/§3); all catalog names are confirmed against the API the official site itself renders.

**Primary recommendation:** ONE migration (0012) for schema+catalog, ONE seed file + ONE purge file (each internally transactional, single-file per Medium-3), vocabulary propagated in the same changeset as the push so the smoke battery never goes red mid-phase.

</research_summary>

<standard_stack>
## Standard Stack

### Core (all existing — ZERO new dependencies, verified 2026-10-13)
| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| SQL migration | 0012 (next number) | Catalog rename + CHECK widen | Established live-migration path; append-only corrective pattern |
| `scripts/apply-seed.mjs` | existing | Live seed/purge writes | Legacy Management API `/v1` endpoint (the `/api/v1/*` trap returns HTML and silently "succeeds"); Node-only (PowerShell `ConvertTo-Json` corruption); env-gated `SUPABASE_ACCESS_TOKEN` |
| `scripts/hash-pin.mjs` | existing | Uniform dummy PIN bcrypt hash | Same bcryptjs major as Edge Functions (`npm:bcryptjs@3`) |
| `supabase/seeds/dummy/` | new subfolder | Seed + purge location | `config.toml` `[db.seed] sql_paths = ["./seeds/*.sql"]` is a FLAT non-recursive glob — direct children auto-apply on local `db reset`; a subfolder stays opt-in |
| React 19 / Tailwind v4 / vitest | existing | Vocabulary propagation | Established patterns only |

### What NOT to Add
faker (hand-authored SQL gives controlled spread), new npm packages (none needed), a second seed tool, `seeds/dummy-*.sql` as direct children (auto-seed trap), Supabase Auth writes, rank-RPC edits (this phase touches none).

</standard_stack>

<sections>
## 1. Official job tree — LIVE-VERIFIED 2026-10-13 (D-01/D-02 verification directive executed)

Fetched `GET https://rooc-official-am-api.joymaker.com/api/rooc/job-intro` (the JSON the official site renders; verified live during this research). Full tree:

| Base line | 2nd | 2nd-advanced (transcendent) | 3rd (site-hidden, treated as unreleased) |
|---|---|---|---|
| Merchant | Blacksmith / Alchemist | **Mastersmith / Biochemist** | Mechanic / Genetic |
| Mage | Wizard / Sage | **High Wizard / Professor** | Warlock / Sorcerer |
| Acolyte | Priest / Monk | **High Priest / Champion** | Archbishop / Shura |
| Swordsman | Knight / Crusader | **Lord Knight / Paladin** | Rune Knight / Royal Guard |
| Archer | Hunter / Bard | **Sniper / Minstrel** | Ranger / Maestro |
| Thief | Assassin / Rogue | **Assassin Cross / Stalker** | Guillotine Cross / Shadow Chaser |
| Apprentice (Doram) | To-Be Summoner | **Summoner** | Grand Summoner (TBA — no calendar date) |
| Gunslinger | Sentry | **Rebellion** | Nightwatch (TBA — no calendar date) |

Super Novice and Ninja do not exist in the API at all (confirmed excluded).

**Consistency proof for the released-job rule:** the owner explicitly treats Grand Summoner and Night Watch (3rd jobs) as TBA-unreleased (CONTEXT specifics). By parity, ALL `third_transfer` jobs (Ranger, Mechanic, Warlock, …) are unreleased in this region — the official site showcases only base + 2nd + 2nd-advanced. Therefore the 2nd-advanced names are the current released top jobs, per D-01.

## 2. ⚠ D-02 correction discovered by the mandated verification: Hunter → **Sniper** (not Ranger)

CONTEXT D-02 listed "Hunter → Ranger". The live API shows the Archer line's 2nd-advanced (transcendent) job is **Sniper**; Ranger is a `third_transfer` (3rd) job — site-hidden, hence unreleased by the same rule that excludes Grand Summoner. D-02's own tie-break ("currently-released job wins") resolves: **Hunter line catalog entry = `Sniper`**. Downstream: D-06's "8 Ranger + Rebellion shared" roster group is the **Sniper + Rebellion** line; REQUIREMENTS' roster table ("Hunter + Gunslinger (shared)") already used the pre-transcendent names, consistent with this reading. **This correction ships in the plans and is surfaced to the owner at the D-12 pre-apply review gate for final confirmation.**

## 3. Final catalog (15 classes — same count as today)

**Renames (11):** Assassin→Assassin Cross, Knight→Lord Knight, Wizard→High Wizard, Hunter→**Sniper**, Priest→High Priest, Blacksmith→Mastersmith, Crusader→Paladin, Sage→Professor, Rogue→Stalker, Alchemist→Biochemist, Monk→Champion.
**Kept (2):** Bard, Gypsy (gender-split preserved per owner decision). **Removed (2):** Dancer, Super Novice. **Added (2):** Summoner, Rebellion.

## 4. Rename mechanics — verified against the FK graph (D-03 continuity)

- `classes.class_name` is the PK (0005:17-20); `members.char_class text references classes(class_name)` with **NO ACTION** (0005:25) — the ONLY FK into `classes` in the entire schema.
- `class_key_stats` (0001:34-38) is keyed `(class_name, stat_key)` with FK to `stat_catalog` **only** — renames must UPDATE its rows explicitly or every renamed class loses its 6 key stats and real members' OVR nulls (P-ROLE-1 shape, without the role axis).
- **Order that works:** ① insert new class names (`on conflict do nothing` — also protects against `Summoner` already added via the admin UI); ② update `class_key_stats` old→new (guard against a pre-existing target row: move only rows whose `(new, stat_key)` doesn't already exist, then delete leftovers); ③ update `members.char_class` old→new; ④ delete old class rows (now unreferenced). Removals (Dancer, Super Novice) delete ONLY if no member references them (else the row stays — staff reassigns; append-only discipline).

## 5. `char_function` CHECK widen + rename (D-04/D-05)

- Current: `char_function text not null default 'dps' check (char_function in ('tank','dps'))` (0005:26) — inline constraint, auto-named `members_char_function_check`.
- **Order matters:** ① `alter table members drop constraint members_char_function_check;` ② `update members set char_function = 'suporte' where char_function = 'tank';` ③ `alter table members add constraint members_char_function_check check (char_function in ('dps','mdps','suporte'));` (updating before dropping would violate the old CHECK).
- Blast radius (all verified by grep 2026-10-13): `src/lib/groups.ts:11` (FUNCTION_LABELS), `src/lib/api.ts` (5 type unions at :37/:198/:229/:275/:342), `src/lib/api.test.ts:208` ('tank' literal), `src/features/submit/SubmitPage.tsx:58` (local map), `src/features/admin/CharactersPage.tsx:53/64/469/476` (local map + Draft type + select), `src/features/dashboard/OvrHero.tsx:20` (prop type), `scripts/smoke-officer.mjs:95-96` ('tank' fixtures), `scripts/smoke-promotion.mjs:357` (vocabulary filter), `scripts/smoke-rls.mjs:246/258` ('Assassin' + 'tank' — the ONLY smoke references to a real catalog class). No RPC body hardcodes 'tank' (grep-verified) — rank math is untouched.

## 6. Seed design (SEED-01/ROLE-09, D-06..D-15)

**Concrete roster matrix (OpenCode discretion per D-08, owner-correctable at D-12):**

| Class | n | Roles (split) | Cohort outcome |
|---|---|---|---|
| High Priest | 16 | suporte ×16 | n=16 ✓ (problem 5: only guaranteed class) |
| Gypsy | 8 | suporte ×8 | n=8 ✓ |
| Bard | 8 | suporte ×8 | n=8 ✓ |
| Lord Knight | 4 | dps ×3, suporte ×1 | dps ✓; suporte n=1 starved (problem 2) |
| Paladin | 4 | dps ×3, suporte ×1 | dps ✓; suporte n=1 starved |
| High Wizard | 4 | mdps ×4 | ✓ |
| Professor | 4 | mdps ×4 | ✓ |
| Biochemist | 4 | dps ×2, mdps ×1, suporte ×1 | all starved (problem 2 — documented observation) |
| Mastersmith | 4 | dps ×1, mdps ×2, suporte ×1 | all starved |
| Sniper | 4 | dps ×4 | ✓ |
| Rebellion | 4 | dps ×4 | ✓ |
| Summoner | 8 | dps ×3, mdps ×3, suporte ×2 | 3/3/2 — suporte n=2 starved (problem 3) |
| Stalker (wildcard, D-14) | 1 | dps ×1 | n=1 data-insufficient (problem 1) |
| **Total** | **73** | | within 72–80 |

Every job line has ≥1 sample (wildcard completes the set). Pending submission: one dedicated pending-only dummy (renders never-submitted in ranks AND populates the Validações queue — D-15). `submitted_at` spread: fresh (≤2 days), stale (8–30 days), never-submitted (no submissions row).

**Value generation (D-11):** compact deterministic SQL — a `values` temp table of per-stat live-derived base values (from the distribution report) × a per-member factor profile (leader 1.000, runner-up 0.985, ties at equal factors, mids, low) → all 57 stats per submission automatically, both value_types inherently covered. No faker, hand-reviewable, factor table IS the owner review sheet's core.

**Idempotency + purge (SEED-02, Critical-5):** seed file = `begin;` → delete dummy rows (ordered `pin_login_attempts`/`submission_stats`→`submissions`→`members`; submission_stats cascades with submissions) → inserts → `commit;` (apply-seed.mjs sends one query string, no wrapping transaction unless the SQL provides one). Purge = same ordered deletes + the zero-dummy verification query across `members`, `submissions`, `submission_stats`, `pin_login_attempts`. Sentinel: `dummy-%` handles (define once; Phase 8's `add_member` rejection shares the constant).

**Seed mechanics traps (all pre-verified):** PIN hash via `hash-pin.mjs` (plaintext never committed — print to console for the owner at the checkpoint); `apply-seed.mjs` takes multiple files but **use single-file seed + single-file purge** (partial-application impossibility, Medium-3); token freshness check before the live session (STATE.md standing rotation action).

## 7. Pitfalls (from PITFALLS.md, phase-relevant subset)

- **Critical-1 (seed pollution):** dummies enter every cohort instantly (compute-on-read, D-06 cohort). Owner-ACCEPTED for the milestone window (owner decision 7 — resident by design); purge-before-release gate non-negotiable. Destaques will show dummy cards — expected.
- **Critical-5 / Medium-3 (purge & seed failure modes):** FK order (submissions BEFORE members), idempotent transactional files, single-file discipline, zero-dummy post-purge query, token freshness.
- **P-ROLE-1 shape (OVR continuity on rename):** class_key_stats renamed in lockstep; pre/post key-stat count parity check scripted in the push task.
- **Smoke fixtures hardcode old vocabulary:** three smoke scripts + api.test.ts must move with the push or the battery goes red mid-phase.
- **Local auto-seed trap:** dummy files in `seeds/` direct children would auto-apply on every `db reset` — subfolder is mandatory (verify: after local `db reset`, `dummy-%` count = 0).

</sections>

<interfaces>
## Key Interfaces (extracted, verbatim)

From `src/lib/groups.ts` (the ONE label map — current state):
```typescript
export const FUNCTION_LABELS: Record<'dps' | 'tank', string> = {
  dps: 'DPS',
  tank: 'Tank',
}
```
Target (UI-SPEC 07, copy locked):
```typescript
export const FUNCTION_LABELS: Record<'dps' | 'mdps' | 'suporte', string> = {
  dps: 'Dano Físico',
  mdps: 'Dano Mágico',
  suporte: 'Suporte',
}
```

From `src/lib/api.ts` (5 identical unions to widen): `char_function: 'tank' | 'dps'` → `char_function: 'dps' | 'mdps' | 'suporte'`.

From `scripts/apply-seed.mjs`: `node scripts/apply-seed.mjs <file.sql> [more.sql ...]`, env `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`, legacy `https://api.supabase.com/v1/projects/{ref}/database/query`, exits 1 on first file failure.

From `scripts/hash-pin.mjs`: `node scripts/hash-pin.mjs <4-digit-pin>` → bcrypt hash (cost 10).

Cohort rules the dummies enter (unchanged): latest value per member/stat, `status not in ('rejected','discarded')`, cohort = class + `char_function`, `MIN_COHORT_SIZE = 3` (`rankMath.ts:11`), n<3 classes hidden on Destaques (06-CONTEXT D-13).

</interfaces>

<verification_architecture>
## Validation Architecture (Nyquist Dimension 8)

| Behavior | Test vehicle | When |
|---|---|---|
| Migration applies cleanly | local `supabase db reset` (migrations + flat seeds only) | 07-01 |
| Catalog correctness | post-reset query: 15 rows, no Dancer/Super Novice (unless member-referenced), all renames present | 07-01 |
| Vocabulary types | `npx tsc -b` + `vitest run` (api.test.ts updated) | 07-02 |
| Local seed rehearsal | `db reset` → apply seed → cohort-size query matrix → apply again (idempotent: 0 new rows) → purge → zero-dummy query → re-seed works | 07-03 |
| Live continuity | pre-push key-stat count snapshot vs post-push per renamed class | 07-04 |
| Live smoke battery | smoke-rank, smoke-promotion, smoke-rls, smoke-officer, smoke-lifecycle all green post-push | 07-04 |
| Starvation rendering | scripted cohort-size matrix (n=1 wildcard, 1/2 splits, 3/3/2) + owner visual pass | 07-04 |
| Purge gate | scripted purge + zero-dummy verification recorded as pre-release checklist item | 07-04 |
</verification_architecture>

<common_pitfalls>
## Dont_Hand_Roll / Common Pitfalls
- Do NOT edit rank RPCs, `rankMath.ts`, or key-stat logic — Phase 9 owns all of it; Phase 7 is observation under the CURRENT scale.
- Do NOT put dummy SQL in `seeds/` direct children; do NOT invent a second apply tool; do NOT run SQL through PowerShell.
- Do NOT commit the dummy PIN plaintext; do NOT reuse real handles; keep `whitelist.sql` untouched.
- Do NOT forget the three smoke fixtures when the CHECK renames — the battery must never sit red.
</common_pitfalls>

## Sources

- **Live official API (HIGH, fetched 2026-10-13):** `GET https://rooc-official-am-api.joymaker.com/api/rooc/job-intro` — full tree incl. third_transfer entries (§1); base for the D-02 Sniper correction.
- **Codebase (HIGH, read directly):** `0001_schema.sql` (FK graph, class_key_stats), `0005_registry_catalog.sql` (:17-33 classes + char_function CHECK + grants), `supabase/seeds/classes.sql`, `supabase/seeds/whitelist.sql` (upsert pattern), `supabase/config.toml` (flat `db.seed` glob), `scripts/apply-seed.mjs`, `scripts/hash-pin.mjs`, `src/lib/groups.ts`, `src/lib/api.ts` (:37/:109/:129/:198/:229/:275/:342), `src/lib/api.test.ts:208`, `src/features/admin/CharactersPage.tsx` (:53/:64/:469/:476), `src/features/submit/SubmitPage.tsx:58`, `src/features/dashboard/OvrHero.tsx:20`, `src/features/highlights/PromotionCard.tsx:41`, `src/lib/rankMath.ts:11`, `scripts/smoke-{officer,promotion,rls,rank}.mjs` (fixture vocab).
- **Milestone research (HIGH, cross-referenced):** `.planning/research/STACK.md` §4 + What-NOT-to-Add, `FEATURES.md` Feature 4 + interactions, `PITFALLS.md` Critical-1/Critical-5/Medium-3, `ROLES.md` §1.3/§2/§3.1/P-ROLE-*, `ARCHITECTURE.md` §5.
- **Planning artifacts:** `07-CONTEXT.md` (D-01..D-15), `07-UI-SPEC.md` (copy contract), ROADMAP §Phase 7, REQUIREMENTS Seed Roster.

---
*Research for: NeoFoot v1.1 Phase 7 — Dummy-Data Seed & Catalog Alignment*
