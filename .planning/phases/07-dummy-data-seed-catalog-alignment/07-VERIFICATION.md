---
phase: 07-dummy-data-seed-catalog-alignment
verified: 2026-10-14T00:00:00Z
status: passed
score: 34/34 must-haves verified
overrides_applied: 0
overrides: []
gaps: []
deferred: []
human_verification: []
---

# Phase 7: Dummy-Data Seed & Catalog Alignment — Verification Report

**Phase Goal:** The owner watches v1.0's live displays wrap around realistic dummy cohorts — the rough guild roster seeded FIRST in v1.1, purely additive, zero rank-math changes — with the build-role vocabulary and class catalog aligned beforehand so every dummy carries a correct build role from day one.
**Verified:** 2026-10-14
**Status:** PASSED
**Re-verification:** No — initial verification

**Verification method:** live DB was verified during 07-04 (recorded evidence + git-tracked logs). This verification used static analysis of the committed artifacts + recorded live verification logs. No live writes or live queries were performed.

## Goal Achievement

### Per-Criterion Verdicts (ROADMAP Success Criteria)

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Reversible seed applies the owner roster (~72–80, all 7 groups, ≥1 sample of each job), realistic value shapes, idempotent, via apply-seed.mjs, outside seeds/ direct children | ✓ VERIFIED | `seed-dummies.sql`: 73 `dummy_members` rows (script-verified: 16 HP + 8 Gypsy + 8 Bard + 4 LK + 4 Paladin + 4 HW + 4 PF + 4 BC + 4 MS + 4 Sniper + 4 Rebellion + 8 Summoner + 1 Stalker wildcard = 73, within 72–80); every one of the 13 classes gets ≥1 sample; value shapes present (leader 1.000 / runnerup 0.985 / exact ties 0.920 / mids / low; `age_days` spread verified statically: fresh(<3d)=32, stale(8–30d)=40, gap(3–7d)=0, 1 pending-only dummy `hp-16`); `supabase/config.toml` glob `./seeds/*.sql` is non-recursive so `seeds/dummy/` stays outside it (local rehearsal check "post-flat-seeds dummy count = 0" PASS); applied live via `node scripts/apply-seed.mjs` (07-04 recorded APPLIED); idempotent clean-slate deletes before inserts (rehearsed: counts unchanged 73/73/4104 on re-run) |
| 2 | Dummies carry exactly one build role from day one (CHECK widened, 'tank'→'suporte', labels updated); ≥3 per populated (class, build-role) combo | ✓ VERIFIED | 0012 lines 50–53: drop CHECK → `update members set char_function='suporte' where char_function='tank'` → re-add `check (in ('dps','mdps','suporte'))`; every `dummy_members` row carries exactly one of dps/mdps/suporte; live check `distinct char_function` → dps/mdps/suporte only, no tank; client on the shared map (`groups.ts` FUNCTION_LABELS Dano Físico/Dano Mágico/Suporte; 0 `tank` matches in `src/`); cohort matrix ≥3 in all 11 rank-active combos (HP/sup 15, Gypsy 8, Bard 8, LK/dps 3, Paladin/dps 3, HW 4, PF 4, Sniper 4, Rebellion 4, Summoner/dps 3, Summoner/mdps 3) — exact 21-row matrix matched live; the 10 sub-3 combos (n=1–2, incl. BC/dps 2 and Summoner/suporte 2) are the owner-confirmed intentional starvation cases (D-07/D-08/D-14) |
| 3 | Catalog aligned to the official tree — Super Novice excluded, Summoner/Gunslinger-line added, advanced names reconciled; every roster class resolves | ✓ VERIFIED | 0012: 11 renames in the mandated 5-step lockstep order (insert → key_stats merge-move → merge-delete → members repoint → old-class delete), Sniper per the released-job rule (D-02 correction, owner-confirmed at D-12; string 'Ranger' absent from 0012 — script-verified), guarded Dancer/Super Novice removals, Summoner + Rebellion (Gunslinger line) inserts; `classes.sql` rewritten to exactly the 15 post-migration names, re-runnable `on conflict (class_name) do nothing`; live parity: 11 classes × 6 key-stats pre == post, zero old-name rows; every roster class name (High Priest, Gypsy, Bard, Lord Knight, Paladin, High Wizard, Professor, Biochemist, Mastersmith, Sniper, Rebellion, Summoner, Stalker) resolves in the catalog |
| 4 | v1.0 renders populated cohorts under the CURRENT scale; documented starvation cases render data-insufficient, not errors | ✓ VERIFIED | Live cohort matrix exact 21/21 (07-04 recorded); starvation probed server-side with self-cleaning throwaway members (Stalker/dps → n=2, Biochemist/mdps → n=2): `my_report` → HTTP 200, OVR null, `data_sufficient: false`, all 57 stat points null — never 500; real dummy logins (`dummy-hp-01`, `dummy-wild-01`) covered by the owner observation pass — APPROVED 2026-10-14 (renders, wildcard data-insufficient, Destaques n<3 absent, Validações pending visible, staff form shows three roles); no rank RPC touched (zero `create or replace function` in 0012) |
| 5 | Purge scripted, FK-safe (submissions before members), idempotent, zero dummy rows — hard pre-release gate | ✓ VERIFIED | `purge-dummies.sql`: one transaction; order pin_login_attempts → submission_stats → submissions → members (submissions BEFORE members — members FK is NO ACTION per 0005, verified in code); belt-and-suspenders explicit stats delete; ends with the four-zero verification query; idempotent by construction (rehearsed: purge → four zeros → re-seed → 73); recorded as a HARD pre-release gate in `.planning/STATE.md` Blockers/Concerns with the exact one-command runbook |

**Note on criterion 2's "Biochemist/dps 2":** BC/dps has exactly 2 validated dummies (bc-01, bc-02) — one of the 7 owner-confirmed starved combos (D-08 authored split, confirmed at the D-12 gate and re-confirmed in the 07-03 SUMMARY approval record). The ROLE-09 requirement wording ("≥3 per populated combo") is satisfied under its ROADMAP definition: "populated" = n≥3 rank-active combos; the intentional 1–2 combos are the documented starvation observations this phase exists to observe (SC4). The 07-REVIEW IN-01 nit correctly flags the 07-03 SUMMARY's claim wording as imprecise — the seed data itself is correct per owner decisions.

### Observable Truths (PLAN must_haves, per plan)

**07-01 (9/9 VERIFIED)** — catalog + schema half:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01 transcendent released-top-job names, unreleased excluded | ✓ VERIFIED | 0012 header + classes.sql: 15 names, no Super Novice/Dancer/3rd jobs |
| 2 | D-02 mapping 15→14 verbatim + Sniper correction | ✓ VERIFIED | 11 rename pairs verbatim; 'Ranger' absent from 0012 (script-verified), 'Sniper' present |
| 3 | D-03 lockstep class rows + members.char_class survive | ✓ VERIFIED | 5-step sub-order per pair; live parity 11×6 pre==post, zero old-name rows |
| 4 | D-04 schema half: exactly-one-of dps/mdps/suporte, CHECK-enforced | ✓ VERIFIED | 0012:50–53; live `distinct char_function` has no tank |
| 5 | D-05 schema half: additive widening, tank→suporte, no rank RPC touched | ✓ VERIFIED | 0012:51; zero `create or replace function` in 0012 |
| 6 | Live schema accepts dps/mdps/suporte, rejects tank | ✓ VERIFIED | Local probes (suporte/mdps pass, tank rejected) + live vocabulary check |
| 7 | Renamed classes preserve class_key_stats rows (OVR continuity) | ✓ VERIFIED | Merge-guarded rename SQL + live pre/post parity snapshot (11 classes × 6) |
| 8 | Catalog contains exactly the 15 verified classes | ✓ VERIFIED | classes.sql: exactly 15 entries |
| 9 | Real members' char_class survive the rename | ✓ VERIFIED | 0012 members-update per pair; live push executed; owner pass confirmed real member OVR intact |

**07-02 (5/5 VERIFIED)** — client vocabulary:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Client speaks exactly the three-role vocabulary, no tank remnant | ✓ VERIFIED | `grep -i tank src/` → 0 matches (script-verified this session) |
| 2 | FUNCTION_LABELS pt-BR updated as shared source | ✓ VERIFIED | `groups.ts:13-17` exact locked copy |
| 3 | Shared map = single source for every surface | ✓ VERIFIED | CharactersPage:32, SubmitPage:30, OvrHero:8 all import from lib/groups (7 consumers total per review) |
| 4 | Staff edit form offers exactly the three role options | ✓ VERIFIED | CharactersPage:478-482 renders options from `Object.keys(FUNCTION_LABELS)` — cannot drift from the vocabulary |
| 5 | No 'tank' literal or 'dps'\|'tank' union remains in src/ | ✓ VERIFIED | grep 0; api.ts carries 5 `'dps' \| 'mdps' \| 'suporte'` unions (script-verified) |

**07-03 (13/13 VERIFIED)** — seed authoring + rehearsal:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-06 roster exactly 73 (16 HP + 8+8 + 4×5 + 4 + 4 + 8 + 1) | ✓ VERIFIED | Script-verified 73 `dummy_members` rows; composition matches the matrix |
| 2 | D-07 role mapping (HP/Gypsy/Bard→suporte; HW/PF→mdps; Sniper-line/Rebellion→dps; authored mixes; Summoner 3/3/2) | ✓ VERIFIED | seed rows match the mapping exactly |
| 3 | D-08 shared-slot splits authored + documented + owner-corrected | ✓ VERIFIED | SEED-NOTES §6 splits CONFIRMED by owner (2026-10-14) |
| 4 | D-09 placeholder display names + dummy-% sentinel handles | ✓ VERIFIED | seed insert: `class_name \|\| ' ' \|\| display_no`; handles `dummy-<suffix>` |
| 5 | D-10 uniform PIN, bcrypt hash only, plaintext never committed | ✓ VERIFIED | seed:209 single bcrypt hash; SEED-NOTES contains no 4-digit PIN literal (script-verified) |
| 6 | D-11 values derive from live distributions | ✓ VERIFIED | `value-bases.json` (generated 2026-10-14T06:43:52Z, all 57 stats, n=3) committed; `dummy_stat_base` rebuilt from live medians (53/57 changed; 4 degenerate keep owner samples, flagged in SEED-NOTES) |
| 7 | D-14 Stalker wildcard n=1 | ✓ VERIFIED | `wild-01` Stalker/dps, single row |
| 8 | D-15 all 57 stats per validated submission + pending-only dummy + both value_types + ≥3 per rank-active combo | ✓ VERIFIED | In-seed hard guard (57 = exact stat_catalog coverage, else raise exception); hp-16 pending-only (1 pending, 0 validated); 72×57=4104 stat rows rehearsed; live invariant check 0 violations |
| 9 | Cohort applied and fully purged repeatedly, zero residue | ✓ VERIFIED | Rehearsed: seed → re-seed (counts unchanged) → purge (four zeros) → re-seed (73) |
| 10 | Every validated dummy submission carries all 57 stats | ✓ VERIFIED | Seed DO-block guard + set-based insert joined on stat_catalog; live check 0 violations |
| 11 | Starvation cases exist as authored data | ✓ VERIFIED | LK/sup 1, Paladin/sup 1, BC 2/1/1, MS 1/2/1, Summoner 3/3/2, Stalker 1 — all present in the seed rows |
| 12 | Owner reviewed value tables BEFORE live apply (D-12 gate) | ✓ VERIFIED | SEED-NOTES status APPROVED (owner, 2026-10-14); live apply executed only in 07-04 after the gate |
| 13 | Starvation/invariant spread verified locally (21/21 rehearsal) | ✓ VERIFIED | 07-03 rehearsal log 21/21 GREEN; key spot-checks match the seed statically (e.g., patk leader 2933 = line 154 base × 1.000) |

**07-04 (7/7 VERIFIED)** — live push + apply + gates:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-13: seed live via apply-seed.mjs; dummies resident; purge scripted hard gate | ✓ VERIFIED | STATE.md:29,48,52 + git log (9fae564, 851d43a) |
| 2 | D-12: live apply only after owner approval | ✓ VERIFIED | 07-03 gate CLOSED 2026-10-14 before 07-04 task 2 |
| 3 | 0012 live with provable OVR continuity | ✓ VERIFIED | Live parity log: 11 classes × 6 key-stats pre==post; zero old-name rows; schema_migrations bookkeeping row recorded so a future CLI push never re-runs 0012 |
| 4 | Dummy cohort resident on LIVE; v1.0 renders under CURRENT scale | ✓ VERIFIED | Live verification matrix (73 dummies, matrix exact, real-member guard unchanged) + owner observation APPROVED |
| 5 | Starvation cases render data-insufficient, never errors | ✓ VERIFIED | Server-side probes: HTTP 200, OVR null, data_sufficient false, 57 null points (both probes) |
| 6 | Full smoke battery green on live | ✓ VERIFIED | 5/5 recorded in order (rank, promotion, rls, officer, lifecycle); fixture edits verified in code (smoke-officer:95-96 suporte; smoke-promotion:357 three-role filter; smoke-rls:183/246/258 Assassin Cross/suporte) |
| 7 | Purge recorded as hard pre-release gate (SEED-02) | ✓ VERIFIED | STATE.md:52 in Blockers/Concerns with exact command + four-zero requirement |

**Score:** 34/34 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/0012_catalog_alignment_roles.sql` | Catalog rename/add/remove + CHECK widen, one transaction | ✓ VERIFIED | 158 lines; exact statement order; substantive; applied live (recorded) |
| `supabase/seeds/classes.sql` | Re-runnable 15-class catalog seed | ✓ VERIFIED | 15 entries, `on conflict (class_name) do nothing` preserved |
| `src/lib/groups.ts` | Shared FUNCTION_LABELS three-role map | ✓ VERIFIED | WIRED: 7 consumers import it; zero local duplicates |
| `src/features/admin/CharactersPage.tsx` | Staff role select, shared map, widened Draft | ✓ VERIFIED | WIRED: import + rendered options + widened Draft.charFunction |
| `src/lib/api.ts` | Five widened unions | ✓ VERIFIED | 5 occurrences of the three-value union (script-verified) |
| `src/features/submit/SubmitPage.tsx` | Shared label import, no local duplicate | ✓ VERIFIED | WIRED: import + header usage at :398 |
| `src/features/dashboard/OvrHero.tsx` | Widened prop type | ✓ VERIFIED | WIRED: renders FUNCTION_LABELS[charFunction] |
| `scripts/dummy-value-report.mjs` | Read-only live distribution report | ✓ VERIFIED | Env-gated; exactly one fetch; zero insert/update/delete statements (script-verified); wrote value-bases.json |
| `supabase/seeds/dummy/seed-dummies.sql` | Idempotent transactional 73-member seed | ✓ VERIFIED | begin/commit; ordered deletes; 57-stat guard; applied live (APPLIED recorded) |
| `supabase/seeds/dummy/purge-dummies.sql` | FK-safe purge + four-zero verification | ✓ VERIFIED | begin/commit; correct FK order; verification query present |
| `supabase/seeds/dummy/SEED-NOTES.md` | D-12 owner review sheet | ✓ VERIFIED | APPROVED record, roster matrix, factor table, provenance table, no plaintext PIN |
| `supabase/seeds/dummy/value-bases.json` | Live per-stat distributions | ✓ VERIFIED | generated_at 2026-10-14T06:43:52Z; committed (dba1a80) |
| `scripts/smoke-officer.mjs` / `smoke-promotion.mjs` / `smoke-rls.mjs` | Fixtures on the new vocabulary | ✓ VERIFIED | Edits verified at the exact cited lines; battery 5/5 green (recorded) |
| `.planning/STATE.md` | SEED-02 gate recorded | ✓ VERIFIED | Line 52, Blockers/Concerns section |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| 0012 migration | class_key_stats | lockstep rename before members update | ✓ WIRED | `update class_key_stats` per pair, merge-guarded |
| classes.sql | classes | on conflict (class_name) do nothing | ✓ WIRED | Present, re-runnable |
| CharactersPage.tsx | lib/groups.ts | FUNCTION_LABELS import | ✓ WIRED | Line 32; used at :478-488 |
| SubmitPage.tsx | lib/groups.ts | shared FUNCTION_LABELS | ✓ WIRED | Line 30; used at :398 |
| seed-dummies.sql | stat_catalog | join on stat_key for all 57 stats | ✓ WIRED | Insert join + hard in-seed coverage guard |
| purge-dummies.sql | submissions | deletes submissions BEFORE members | ✓ WIRED | Lines 17-20; members FK is NO ACTION (0005) |
| 0012 migration | live DB | applied (apply-seed.mjs Management API path — plan said `supabase db push`; CLI/Docker unavailable) | ✓ WIRED | Documented Rule-3 adaptation; all gates preserved as live-query equivalents + schema_migrations bookkeeping row; parity + vocabulary + 5/5 battery prove the apply |
| seed-dummies.sql | live DB | node scripts/apply-seed.mjs | ✓ WIRED | APPLIED recorded; verification matrix green |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| seed-dummies.sql | dummy_stat_base values | `value-bases.json` live validated-submission medians (n=3) | Yes (53 live-derived; 4 degenerate owner samples flagged) | ✓ FLOWING |
| FUNCTION_LABELS consumers | role values | DB CHECK (0012) → members.char_function → client union | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript build green | `npx tsc -b` | exit 0 | ✓ PASS |
| Unit suite green | `npx vitest run` | 17 files / 284 tests passed | ✓ PASS |
| No 'Ranger' in 0012 | Select-String 0012 | 0 matches (classes.sql comment mention only — outside the acceptance scope) | ✓ PASS |
| No 'tank' in src/ | Select-String src/ | 0 matches | ✓ PASS |
| Roster count + spread invariants | static parse of seed-dummies.sql | 73 rows, 1 pending-only, fresh 32 / stale 40, gap 0 | ✓ PASS |
| api.ts union count | Select-String | 5 three-value unions | ✓ PASS |
| Live rendering / starvation probes / purge zeros | live DB | Recorded during 07-04 (out of scope for this session per directive) | ? RECORDED (live evidence + owner approval) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ROLE-05 | 07-02 | char_function exactly ONE of three build roles (Suporte nomenclature) | ✓ SATISFIED | 0012 CHECK + client vocabulary + live distinct-check; REQUIREMENTS.md [x] + traceability Complete |
| ROLE-09 | 07-03 | Seed ≥3 dummies per populated (class, build-role) combo per the roster | ✓ SATISFIED | 21-row cohort matrix exact; all 11 rank-active (n≥3) combos have ≥3 dummies; the 10 sub-3 combos (n=1–2) are the owner-confirmed intentional starvation observations (D-07/D-08/D-14); REQUIREMENTS.md [x] + Complete |
| ROLE-12 | 07-01 | Catalog aligned with the official job tree | ✓ SATISFIED | 15-class catalog, Super Novice excluded, Summoner/Rebellion added, advanced names reconciled, live-API verified 2026-10-13; REQUIREMENTS.md [x] + Complete |
| SEED-01 | 07-03, 07-04 | Reversible seed, owner roster, realistic shapes, apply-seed.mjs, outside seeds/ children | ✓ SATISFIED | Seed applied live APPLIED, 73 dummies resident; REQUIREMENTS.md [x] + Complete |
| SEED-02 | 07-03, 07-04 | Purge FK-safe, idempotent, hard pre-release gate | ✓ SATISFIED | purge-dummies.sql verified in code + rehearsed; STATE.md hard gate recorded; REQUIREMENTS.md [x] + Complete |

Orphaned requirements: none — all 5 phase requirement IDs are claimed across the four plans and none is left unclaimed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| seed-dummies.sql | 221-225, 240 | WR-01: pending-only dummy's submission has zero submission_stats rows (stats insert filters `status = 'validated'`) | ⚠️ Warning (advisory) | Validações queue renders that row with an empty stats payload; an officer validating it would create a statless validated submission. Does NOT block any success criterion: SC1 mandates 57 stats per *validated* submission (the pending row is exempt by the criterion's own wording), and the live invariant check (0 validated submissions ≠ 57) passed. Debt: fix the stats generation or document the exemption before the row is ever validated; the pre-release purge removes the row entirely. |
| seed-dummies.sql / purge-dummies.sql | 33-41 / 12-20 + verify query | WR-02: `like 'dummy-%'` uses `_` as a single-char wildcard, so deletes also match e.g. `dummytest`/`dummy1` | ⚠️ Warning (advisory) | No current real handle matches (verified during review); Phase 8 SC5 will reject the dummy- prefix at add time (partial future mitigation — does not widen the purge scope itself). Debt: switch to regex `~ '^dummy-'` in all 8 deletes + verification queries before the live pre-release purge run. |
| scripts/dummy-value-report.mjs | 160 | IN-02: CWD-dependent output path | ℹ️ Info | Cosmetic; run from repo root per SEED-NOTES instructions |
| scripts/smoke-rls.mjs | 243-261 | IN-03: probe 9 permanently PATCHes the placeholder member without restore | ℹ️ Info | Pre-existing pattern, idempotent, out of phase scope |
| 07-03-SUMMARY.md | 150 | IN-01: "every populated combo ≥3" wording contradicts its own matrix | ℹ️ Info | Claim wording only; seed data is correct per owner decisions |

No TODO/FIXME/placeholder markers, no stub returns, no hardcoded tokens or plaintext PINs in any phase artifact (script-verified).

### Review Advisory Disposition (07-REVIEW)

- **0 blockers** — nothing in the review blocks goal achievement.
- **WR-01, WR-02** — accepted as tracked debt (above); neither invalidates a success criterion. Recommended follow-up: fold the WR-02 regex fix into the pre-release purge runbook execution (the gate that will actually run it), and the WR-01 fix into any future seed revision. Neither is covered by a later phase's success criteria, so they are recorded here as debt rather than deferred work.
- **IN-01..03** — informational.

### Human Verification Required

None outstanding. The phase's mandated human gates were completed and recorded during execution:

1. **D-12 owner review gate (07-03 task 3)** — CLOSED: owner approved live-derived value bases, Sniper correction, authored splits, Stalker wildcard, live residency (2026-10-14; SEED-NOTES + STATE.md).
2. **Owner live observation pass (07-04 task 3)** — APPROVED: dummy dashboards, wildcard data-insufficient state, Destaques n<3 handling, Validações pending item, staff form vocabulary, real-member OVR intact (2026-10-14; STATE.md + SUMMARY).

Any future human verification needs (e.g., re-observing the live panel after later phases change rendering) belong to those phases, not this one.

### Gaps Summary

No gaps. All 5 roadmap success criteria, all 34 plan must-have truths, all 14 artifacts, and all 8 key links verified against the committed code and the recorded live verification logs (static analysis cross-checked the live logs precisely: 73 roster rows, 32/40 age spread, 0 spread gaps, 1 pending-only dummy, 15-class catalog, zero 'tank'/'Ranger' remnants, 5/5 smoke fixture edits at the exact cited lines). Two review advisories (WR-01, WR-02) are carried as explicit, non-blocking debt with concrete remediation paths.

**Debt register (non-blocking):**
1. WR-01 — pending-only dummy's 0-stat submission (fix in a future seed revision or document the exemption; moot post-purge).
2. WR-02 — `LIKE 'dummy-%'` breadth in seed/purge deletes (switch to `~ '^dummy-'` before the live pre-release purge run).
3. IN-02 — dummy-value-report.mjs CWD-dependent output path (cosmetic).
4. IN-03 — smoke-rls.mjs probe-9 leaves a live mutation (pre-existing pattern).

---

_Verified: 2026-10-14_
_Verifier: OpenCode (gsd-verifier)_
