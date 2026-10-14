# Dummy Seed — Owner Review Sheet (D-12 gate, plan 07-03)

**Status: PENDING OWNER REVIEW — nothing has been applied to the live project.**
The live apply happens in plan 07-04, only after you approve this sheet.

- **PIN:** provided out-of-band at the review checkpoint (never committed; bcrypt hash only in the seed).
- **Value bases:** ⚠ ALL 57 stats currently use **owner-supplied samples** (SEED-01 fallback) — see "Value bases" below. This is the single most important thing to review.

## 1. Roster matrix (D-06 — 73 members, exact)

| Class | n | Roles (split) | Profile ladder | Cohort outcome |
|---|---|---|---|---|
| High Priest | 16 | suporte ×16 | leader, runnerup, tie_a, tie_b, mid1 ×3, mid2 ×3, mid3 ×3, low ×2, **+ hp-16 pending-only** | n=15 validated ✓ (problem 5: only guaranteed class) |
| Gypsy | 8 | suporte ×8 | leader, runnerup, tie_a, tie_b, mid1, mid2, mid3, low | n=8 ✓ |
| Bard | 8 | suporte ×8 | same 8-step ladder | n=8 ✓ |
| Lord Knight | 4 | dps ×3, suporte ×1 | dps: leader, runnerup, mid1 · suporte: mid1 | dps ✓; suporte n=1 starved (problem 2) |
| Paladin | 4 | dps ×3, suporte ×1 | dps: leader, runnerup, mid1 · suporte: mid1 | dps ✓; suporte n=1 starved |
| High Wizard | 4 | mdps ×4 | leader, runnerup, mid1, mid2 | n=4 ✓ |
| Professor | 4 | mdps ×4 | leader, runnerup, mid1, mid2 | n=4 ✓ |
| Biochemist | 4 | dps ×2, mdps ×1, suporte ×1 | dps: leader, runnerup · mdps: mid1 · suporte: mid1 | all combos starved (problem 2 — documented observation) |
| Mastersmith | 4 | dps ×1, mdps ×2, suporte ×1 | dps: leader · mdps: mid1, mid2 · suporte: mid1 | all combos starved |
| Sniper | 4 | dps ×4 | leader, runnerup, mid1, low | n=4 ✓ |
| Rebellion | 4 | dps ×4 | leader, runnerup, mid1, low | n=4 ✓ |
| Summoner | 8 | dps ×3, mdps ×3, suporte ×2 | dps/mdps: leader, mid1, low · suporte: leader, low | 3/3/2 — suporte n=2 starved (problem 3) |
| Stalker (wildcard, D-14) | 1 | dps ×1 | mid1 | n=1 data-insufficient (problem 1) |
| **Total** | **73** | | | within 72–80 |

## 2. Profile → factor table (value realism, D-11)

| Profile | Factor | Meaning |
|---|---|---|
| leader | 1.000 | cohort top (max = base × 1.000) |
| runnerup | 0.985 | the ~98.5% runner-up |
| tie_a / tie_b | 0.920 | two members share the EXACT tie value |
| mid1 | 0.880 | mid |
| mid2 | 0.800 | mid |
| mid3 | 0.740 | mid |
| low | 0.610 | bottom of ladder |

Every validated dummy value = `base(stat) × factor(member)`, percentual rounded to 1 decimal, flat to integer. Deterministic — no faker, fully hand-reviewable in `seed-dummies.sql`.

`submitted_at` spread (D-11): fresh 0–2 days for ~half, stale 8–30 days for the rest, mixed across classes; hp-16 (pending-only) renders never-submitted in ranks.

## 3. Value bases — ⚠ owner-supplied samples (SEED-01 fallback), ALL 57 flagged low-confidence

**Why:** the live-distribution report (`scripts/dummy-value-report.mjs`) could not run in the authoring session — `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` were absent from the environment (auth-gated, per plan). SEED-01 explicitly allows "live data **or owner-supplied samples**", so the bases below are realistic game-scale samples, each **flagged low-confidence until refreshed or approved**.

**How to refresh (recommended before live apply):** with your env vars set in the shell, run:

```
node scripts/dummy-value-report.mjs
```

It is strictly read-only (one SELECT-only query via the same Management API endpoint `apply-seed.mjs` uses), prints per-stat min/p25/median/p75/max over live validated submissions plus cohort sizes, and writes `supabase/seeds/dummy/value-bases.json`. If the live medians differ materially from the samples below, reply at the checkpoint with the correction (or attach `value-bases.json`) and the seed file gets a revised `dummy_stat_base` table (D-12 corrections loop) before 07-04 touches live.

| Stat (group) | Base sample | | Stat (group) | Base sample |
|---|---|---|---|---|
| hp | 285000 | | crit_dmg % | 155.0 |
| sp | 12000 | | crit_dmg_res % | 45.0 |
| patk | 15800 | | pdmg | 12500 |
| pdef | 9200 | | pdmg_r % | 42.0 |
| matk | 16400 | | mdmg | 12800 |
| mdef | 8800 | | mdmg_r % | 42.0 |
| refine_patk | 320 | | ignore_pdef | 210 |
| refine_pdef | 260 | | ignore_pdef_pct % | 22.0 |
| refine_matk | 340 | | ignore_mdef | 210 |
| refine_mdef | 280 | | ignore_mdef_pct % | 22.0 |
| hp_recover | 2400 | | pdmg_bonus | 850 |
| sp_recover | 900 | | mdmg_bonus | 850 |
| hit | 640 | | pve_dmg_reduction | 620 |
| flee | 610 | | pve_dmg_bonus | 900 |
| combat_power | 265000 | | pvp_dmg_reduction | 380 |
| aspd | 482 | | pvp_dmg_bonus | 450 |
| mspd | 148 | | max_sp_pct % | 25.0 |
| variable_ct | -35 | | equip_patk_pct % | 38.0 |
| variable_ct_pct % | -18.0 | | equip_matk_pct % | 38.0 |
| fixed_ct | -90 | | equip_pdef_pct % | 30.0 |
| fixed_ct_pct % | -12.0 | | equip_mdef_pct % | 30.0 |
| healing_done | 5200 | | global_cd_pct % | -8.0 |
| healing_taken | 3100 | | dmg_vs_small/medium/large % | 30.0 / 35.0 / 28.0 |
| crit | 420 | | dmg_vs_brute/demi_human % | 32.0 / 40.0 |
| crit_res | 260 | | dmg_reduction_vs_* % | 18 / 20 / 16 / 15 / 22 |

(Anchors used: `combat_power` 265000 sits near the owner's real sample read of **288927** from UAT D-05-UAT-7; CT/CD negatives follow the in-game reduction display per 05-RESEARCH §3.4 sanity ranges.)

## 4. Pending-only dummy (D-15)

`dummy-hp-16` ("High Priest 16") carries **only a pending submission** — no validated rows. It renders as never-submitted in ranks AND populates the Validações queue. Every OTHER dummy has exactly one validated submission with **all 57 stats** (verified 0 exceptions in the local rehearsal).

## 5. Sniper naming correction — confirmation requested (D-02)

CONTEXT D-02 listed "Hunter → Ranger", but the official job-tree API (fetched live 2026-10-13, per plan 07-01) shows the Hunter line's released top job is **Sniper** — Ranger is a site-hidden, unreleased 3rd job (same rule that keeps Grand Summoner / Night Watch out). The roster's "Hunter + Gunslinger (shared)" group therefore ships as **Sniper ×4 + Rebellion ×4**. **Reply "approved" to keep Sniper, or name the class you want for that line.**

## 6. Shared-slot splits (D-08) — authored, correctable

The 4/4-style splits inside each shared group are the author's choice per D-08: LK 3/1 (dps/suporte), Paladin 3/1, Biochemist 2/1/1 (dps/mdps/suporte), Mastersmith 1/2/1, Summoner 3/3/2, Sniper+Rebellion 4+4. Correct any of them at this gate and the seed file is revised before apply.

## 7. Wildcard (D-14)

**Stalker ×1** (Rogue line, dps) — the author-picked single-sample class exercising the n=1 data-insufficient rendering end-to-end. Swap it for any other catalog class if you prefer.

## 8. Purge summary (SEED-02)

`purge-dummies.sql`: one transaction, deletes scoped to the `dummy-%` sentinel in FK-safe order (`pin_login_attempts` → `submission_stats` → `submissions` → `members`; submissions BEFORE members because that FK is NO ACTION), then the four-zero verification query (members / submissions / submission_stats / pin_login_attempts). Rehearsed locally: purge → four zeros → re-seed → works.

## 9. Apply command for plan 07-04 (LIVE — only after your approval)

```
node scripts/apply-seed.mjs supabase/seeds/dummy/seed-dummies.sql
```

The local rehearsal ran the seed SQL directly against a real local Postgres (no supabase CLI/Docker in this environment — 07-01 fallback pattern); the live apply goes through `apply-seed.mjs` exactly as above.

## 10. Local rehearsal results (all PASS)

- Dummy folder outside the flat seed glob: after schema + flat seeds only, zero `dummy-%` members (glob `./seeds/*.sql` is non-recursive, `supabase/config.toml`).
- Cohort matrix matches the expected values exactly (High Priest/suporte 15 … Stalker/dps 1).
- 57-stats invariant: 0 validated dummy submissions with ≠ 57 stat rows.
- Leader/runner-up/tie spot checks on a flat stat: max = base × 1.000, second distinct = 0.985 × base, exact tie pair present.
- Idempotent re-seed: row counts unchanged. Purge → four zeros. Re-seed → works.
