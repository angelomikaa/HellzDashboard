# Phase 7: Dummy-Data Seed & Catalog Alignment - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 makes v1.0 observable on realistic data while v1.1 is developed (owner decision 7, REQUIREMENTS.md). It delivers: (a) **class catalog alignment** to the official Ragnarok Origin job tree (ROLE-12) — transcendent (final-form) class names, unreleased jobs excluded, roster classes added; (b) **build-role vocabulary widening** (ROLE-05) — `char_function` becomes exactly-one-of three values with the Suporte nomenclature, so dummy members carry correct build roles from day one; (c) **the reversible dummy seed** (SEED-01) — ~72–80 members following the owner-provided roster, with validated submissions whose values are derived from the live database's real submissions, applied to the LIVE project via the existing `apply-seed.mjs` tooling; (d) **the purge gate** (SEED-02) — scripted, FK-safe, idempotent, a hard pre-release checklist item. Purely additive: no rank-math, RPC, or key-stat changes in this phase; v1.0 renders the seeded cohorts under the CURRENT scale, and the roster's documented starvation cases must render as data-insufficient/hidden — never errors.

**Requirements covered:** ROLE-05, ROLE-09, ROLE-12, SEED-01, SEED-02.

**Not in this phase:** key-stat per-role config and backfill (ROLE-01..04, Phase 9), `set_key_stat` v2 + Stats-Chave role selector (Phase 9), value-proportional scale (Phase 9), whitelist/PIN setup (Phase 8), home tab (Phase 10), member-facing role self-service (Out of Scope — roles are staff-assigned only).

</domain>

<decisions>
## Implementation Decisions

### Class catalog — transcendent names (ROLE-12)
- **D-01:** The catalog uses **transcendent (2nd-advanced, "final-form") class names — the pattern for ALL classes**. Source of truth: the official job tree (https://roocamer.gnjoy.game/home#job-intro, live JSON at the rooc-official-am-api endpoint). Refinement from discussion: the catalog name is the **current in-game top job that is actually released today** — jobs that are announced but unreleased do NOT get catalog entries (future pivots when they launch).
- **D-02:** Derived catalog mapping (15 old → 14 new):
  - Assassin → **Assassin Cross**; Knight → **Lord Knight**; Wizard → **High Wizard**; Hunter → **Ranger**; Priest → **High Priest**; Blacksmith → **Mastersmith**; Crusader → **Paladin**; Sage → **Professor**; Rogue → **Stalker**; Alchemist → **Biochemist**; Monk → **Champion**
  - **Bard kept as-is; Gypsy kept as-is** (gender-split entries preserved per owner decision; roster splits 8+8); **Dancer removed** (base name)
  - **Super Novice removed** (unreleased — owner directive)
  - **Summoner added** (Doram line — current final form; "Grand Summoner" is TBA without a calendar date, pivot later if released)
  - **Rebellion added** (Gunslinger line — current in-game job; "Night Watch" is TBA like Grand Summoner)
  - Downstream agents: verify each renamed line's current top job against the live official API during planning; if the in-game current form differs from the site's 2nd-advanced label, the owner's rule (currently-released job) wins.
- **D-03:** Existing class rows and any real members' `char_class` values referencing renamed classes must survive the rename (append-only discipline; handle via re-runnable catalog seed + member row updates in the same migration — planner designs the exact mechanism).

### Build-role vocabulary (ROLE-05)
- **D-04:** `char_function` carries **exactly ONE of three values**: `dps` (Dano Físico), `mdps` (Dano Mágico), `suporte` (the tank role, **renamed Suporte** per owner nomenclature decision). No character holds more than one role — hard design motto: "trying to do all at once leads to an unoptimal character that fits none of the three roles properly."
- **D-05:** The widening + rename is additive/cheap and ships HERE (not Phase 9) so dummies carry build roles from day one: existing `'tank'` rows → `'suporte'`, CHECK constraint updated, `FUNCTION_LABELS` pt-BR labels updated (`suporte` → "Suporte"). Existing real members keep working (their tank/dps values map cleanly).

### Seed composition (SEED-01, ROLE-09)
- **D-06:** The seed follows the **owner roster** (REQUIREMENTS.md "Seed Roster"): 16 High Priest + 8 Gypsy + 8 Bard (support core, 32), 8 Lord Knight/Paladin, 8 High Wizard/Professor, 8 Biochemist/Mastersmith, 8 Ranger + Rebellion shared, 8 Summoner, 1 wildcard = **72–80 total**.
- **D-07:** Default build-role mapping **confirmed**: High Priest 16 → `suporte`; Bard 8 + Gypsy 8 → `suporte`; High Wizard/Professor → `mdps`; Ranger/Rebellion → `dps`; the seed **author mixes** Lord Knight/Paladin (`suporte`/`dps`) and Biochemist/Mastersmith (all three roles); Summoner's 8 split across all three roles (e.g., 3/3/2 — starvation case intentionally exercised).
- **D-08:** **Shared-slot splits are authored, not owner-fixed**: the seed author distributes (e.g., 4/4 splits), owner corrects at the pre-apply review gate.
- **D-09:** **Dummy display names are obvious per-class placeholders**: "Priest 1", "Priest 2", "Priest 3", … (catalog class name + number). Handles keep the `dummy-%` sentinel prefix. Realistic-looking fake names were explicitly rejected — the owner wants zero confusion with real members.
- **D-10:** **Dummy PINs: one uniform, known PIN** for all dummies (bcrypt-hashed via the existing `hash-pin.mjs` flow) — the owner logs in as any dummy to calibrate views.
- **D-11:** **Seed values derive from the LIVE database's real validated submissions** — query them and clone the distributions per stat. Naturalistic distribution within each (class, role) cohort (real-game clustering/outliers, NOT engineered calibration tiers). SEED-01's mandated elements must still be present as they occur naturally: a clear leader, a ~98.5% runner-up, some ties, `submitted_at` spread including at least one never-submitted member and some 8–30-days-stale members.
- **D-12:** **Pre-apply review gate**: the owner reviews the value tables (summary sheet or the seed SQL) BEFORE `apply-seed.mjs` touches the live project. Corrections loop through a revised seed file.
- **D-13:** **Residency: the seed applies to the LIVE project** — the owner watches v1.0 wrap around the roster on the real panel for the whole milestone. Dummies visible on Destaques/dashboard/queue until purge. Purge (sentinel prefix, FK-safe order: submissions before members, idempotent) is a **hard pre-release checklist gate**.
- **D-14:** The 1 wildcard slot: **author picks** the class (a single-sample class exercising the n=1 data-insufficient rendering end-to-end).
- **D-15:** Dummy submissions carry validated status (plus at least one PENDING submission for the Validações queue — research NICE), all 57 stats per submission, both value_types covered per cohort, ≥3 dummies per populated (class, build-role) combo.

### OpenCode's Discretion
- Exact split numbers within the roster groups (subject to D-12 review)
- Wildcard class choice (D-14)
- Seed file structure (one file vs per-group files) inside `supabase/seeds/dummy/`; idempotency mechanics (`on conflict` / delete-then-insert within a transaction)
- Migration numbering and the exact rename/backfill mechanics for classes/members (D-03/D-05)
- The uniform dummy PIN value (documented in the seed summary, never committed in plaintext)
- Whether the `combat_power` manual field gets a realistic spread from the live DB like other stats
- pt-BR micro-copy for anything user-visible this phase (mostly nothing — this phase is data + catalog)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Official job tree (source of truth for D-01/D-02)
- https://roocamer.gnjoy.game/home#job-intro — official job introductions (client-rendered SPA; fetch the data endpoint below instead)
- https://rooc-official-am-api.joymaker.com/api/rooc/job-intro — the live JSON the official site renders (extracted from the site bundle; authoritative for released jobs and line structure)

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — ROLE-05/09/12, SEED-01/02 definitions; "Seed Roster" table + 6 documented starvation problems; Milestone Decisions 4–8
- `.planning/ROADMAP.md` §Phase 7 — goal, 5 success criteria, cross-cutting constraints
- `.planning/PROJECT.md` — Key Decisions (append-only, compute-on-read, RLS posture), constraints

### Research (ground truth for seed mechanics and role design)
- `.planning/research/ROLES.md` — §2 official job tree table; §3.1 char_function widening (never a "role" column); §5 pitfalls (P-ROLE-2 word collision); catalog-relevance column
- `.planning/research/STACK.md` — §4 dummy-data workflow (seeds/dummy/ subfolder, db.seed flat glob, apply-seed.mjs for live writes, hand-authored SQL, hash-pin.mjs); "What NOT to Add" table
- `.planning/research/FEATURES.md` — Feature 4 (seed realism requirements: leader/runner-up/ties/spread, FK purge order, ≥3 per cohort, owner-reviewed values); Feature 1 (sentinel-prefix rejection is Phase 8's add_member, not here)
- `.planning/research/PITFALLS.md` — seed-pollution pitfalls (Critical), FK purge order, idempotent transactional seed files
- `.planning/research/SUMMARY.md` — consolidated sequencing (seed → scale → bands)

### Schema & tooling ground truth
- `supabase/seeds/classes.sql` — current 15-class re-runnable seed (the rename/add/remove target)
- `supabase/seeds/whitelist.sql` — re-runnable upsert pattern for members (the dummy-member insert model; NOT to be modified — separate files)
- `supabase/seeds/stat_catalog.sql` — the 57-stat catalog (seed submissions must reference exactly these stat keys)
- `scripts/apply-seed.mjs` — the ONLY live-write path (legacy Management API endpoint; Node-only due to PowerShell JSON corruption; SUPABASE_ACCESS_TOKEN env-gated)
- `scripts/hash-pin.mjs` — bcrypt PIN hashing for the uniform dummy PIN (D-10)
- `supabase/config.toml` `[db.seed]` — `sql_paths = ["./seeds/*.sql"]` flat non-recursive glob: dummy files MUST live in `supabase/seeds/dummy/` (subfolder) or local `db reset` auto-applies them
- `supabase/migrations/0001_schema.sql` — members/submissions/submission_stats FK graph (purge order: submissions BEFORE members; submission_stats cascades with submissions)
- `supabase/migrations/0005_registry_catalog.sql` — `members.char_class` FK + `char_function CHECK ('tank','dps')` (the widening target); column grants
- `src/lib/groups.ts` — `FUNCTION_LABELS` map ('dps' | 'tank' → pt-BR) — gains 'mdps'/'suporte' labels (ROLE-05 UI side)
- `.planning/phases/03-rank-engine/03-CONTEXT.md` — D-06 (cohort definition: latest value per member/stat, status≠rejected/discarded — the cohort the dummies enter), D-12 (n≥3 data_sufficient gate)
- `.planning/phases/06-trust-celebration-officer-tools-promotion-page/06-CONTEXT.md` — D-13 (n<3 classes hidden on Destaques — how starvation renders)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/apply-seed.mjs` — proven live-write tool; the seed applies through it, unchanged (accepts multiple .sql files per invocation)
- `scripts/hash-pin.mjs` — bcrypt hashing for the uniform dummy PIN
- `supabase/seeds/whitelist.sql` + `classes.sql` — re-runnable upsert seed patterns to imitate (on conflict do nothing / do update)
- `supabase/seeds/stat_catalog.sql` — canonical stat keys the submission_stats rows must join to
- `src/lib/groups.ts` FUNCTION_LABELS — the single UI label map to extend for the new vocabulary
- Real validated submissions in the live DB — the distribution source (D-11); query via the Management API in a read-only prep step

### Established Patterns
- Migrations are append-only corrective; live tables evolve via `create or replace` / additive ALTERs (next number: 0012)
- Seeds are SQL files applied by script — never migrations, never Supabase Auth, never local-only tooling for live writes
- Compute-on-read: dummy rows enter cohorts instantly; no backfill or triggers anywhere
- pt-BR labels; UX-only guards; RLS deny-all on tables without policies (dummy rows need no new policies — staff/admin surfaces already read members/submissions)
- Sentinel-prefix discipline (`dummy-%`) shared with Phase 8's future `add_member` rejection — define the prefix once

### Integration Points
- `members.char_function` CHECK constraint (0005) — widened/renamed here; Phase 9's key-stat work assumes the new vocabulary
- `classes` table rows — renamed/added/removed via the re-runnable catalog seed + a migration for any member-row updates (D-03)
- Destaques (promotion RPC), Painel (my_report), Validações (queue) — all read cohorts live; seeded dummies appear there immediately; starvation cases must render hidden/insufficient (03-CONTEXT D-12, 06-CONTEXT D-13)
- Phase 8 depends on nothing here except the sentinel prefix constant; Phase 9 depends on the widened vocabulary

</code_context>

<specifics>
## Specific Ideas

- Owner's verbatim framing: "I want to see how v1.0 wraps around data while we develop v1.1" — the seed exists for observation first, calibration second
- Owner's roster: "even the 72 mentioned are already a valid roster according to the game" — the 6 documented problems (starvation, shared slots, catalog mismatch) are features of the calibration, not defects to design away; "note down all the problems… we will take new decisions based on them"
- Role motto (owner verbatim): a character is always exactly one role; "trying to do all at once will lead to an unoptimal character that do not fit any of the three roles properly, so the players are encouraged to pick one and focus their development based on it"
- TBA jobs rule (owner verbatim): Grand Summoner and Night Watch "can be pivoted to when the class releases, but that's a future that is yet to get a calendar date" — current released job wins

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **power-shift-significance** (`.planning/todos/pending/power-shift-significance.md`) — combat_power shifts flagged significant only at thousands scale; keyword-matched this phase (0.6) but belongs to the v2 delta domain (DELT-01/HIST-01); not folded

- **Grand Summoner / Night Watch catalog pivots** — when the jobs release, rename the Summoner/Rebellion catalog entries (owner already framed this as future); revisit at a future milestone
- **Realistic dummy persona names** — rejected for v1.1 (obvious placeholders chosen); revisit only if the owner ever wants screenshot-worthy fake data
- **Seed-derived calibration report** — the roster's 6 documented problems may warrant a written observations doc after the owner reviews the seeded panel; if so it belongs to Phase 9's band-calibration prep, not here

</deferred>

---

*Phase: 07-dummy-data-seed-catalog-alignment*
*Context gathered: 2026-10-13*
