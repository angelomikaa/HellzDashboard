# Dummy Seed — Owner Review Sheet (D-12 gate, plan 07-03)

**Status: APPROVED at the D-12 gate (owner, 2026-10-14) — nothing has been applied to the live project yet.**
The live apply happens in plan 07-04.

- **PIN:** provided out-of-band at the review checkpoint (never committed; bcrypt hash only in the seed).
- **Value bases:** ✅ **LIVE-DERIVED** (D-11 honest) — rebuilt from the live distribution report per the owner's D-12 decision; see "Value bases" below. Only the 4 degenerate all-zero live stats keep owner samples.

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

## 3. Value bases — ✅ LIVE-DERIVED medians (D-11 honest), 4 degenerate stats keep owner samples

**Provenance:** `value-bases.json`, generated **2026-10-14T06:43:52Z** by `scripts/dummy-value-report.mjs` (read-only) against the LIVE project: per-stat min/p25/median/p75/max over live **validated** submissions (n=3; cohorts **Assassin/tank + Priest/tank** — the only real validated submitters).

**Owner decision at the D-12 gate (2026-10-14):** rebuild every base as **median-anchored** from the live report, EXCEPT the degenerate all-zero live stats — **refine_mdef, crit_dmg, fixed_ct, variable_ct** — which keep the owner-supplied samples (live data cannot shape them). **53 of 57 bases changed.**

- **Negative sign ranges are respected, never clamped:** fixed_ct_pct base −49.4 (ladder −49.4 … −30.1), global_cd_pct −10.0 (−10.0 … −6.1), variable_ct_pct −60.0 (−60.0 … −36.6). The ladder multiplies the signed base, so every profile value keeps the live sign.
- **Live-zero stats:** `ignore_pdef_pct`, `ignore_mdef_pct`, `dmg_vs_demi_human` are all-zero in live validated data but were NOT in the owner's degenerate list → base 0.0 taken honestly from the live median (all dummy values 0, matching live reality).
- **Envelope note:** the profile ladder ratio is fixed (low = 0.61 × base), so the generated range is [0.61 × median, median]. With n=3 the live min..max envelope is often much narrower than that span (e.g. combat_power live 288152–288489 vs dummy ladder 175812–288216); the leader value is always exactly the live median. Stats fully inside the live envelope: crit_dmg_res, crit_res, dmg_reduction_vs_medium, equip_matk_pct, global_cd_pct, matk, sp, sp_recover, variable_ct_pct + the three live-zeros.

| Stat | Type | Live min | Live median | Live max | Base | Source |
|---|---|---|---|---|---|---|
| combat_power | flat | 288152 | 288216 | 288489 | 288216 | live |
| flee | flat | 144 | 148 | 154 | 148 | live |
| hit | flat | 264 | 264 | 376 | 264 | live |
| hp | flat | 100358 | 100670 | 107601 | 100670 | live |
| hp_recover | flat | 528 | 530 | 563 | 530 | live |
| matk | flat | 3292 | 5839 | 6200 | 5839 | live |
| mdef | flat | 1564 | 1664 | 1699 | 1664 | live |
| patk | flat | 2932 | 2933 | 6371 | 2933 | live |
| pdef | flat | 4490 | 4605 | 4628 | 4605 | live |
| refine_matk | flat | 622 | 887 | 1014 | 887 | live |
| refine_mdef | flat | 0 | 0 | 0 | 280 | ⚠ owner sample (degenerate) |
| refine_patk | flat | 623 | 623 | 943 | 623 | live |
| refine_pdef | flat | 200 | 200 | 200 | 200 | live |
| sp | flat | 155 | 1008 | 3085 | 1008 | live |
| sp_recover | flat | 16 | 73 | 78 | 73 | live |
| aspd | flat | 109 | 110 | 153 | 110 | live |
| crit | flat | 32 | 40 | 42 | 40 | live |
| crit_res | flat | 60 | 140 | 140 | 140 | live |
| fixed_ct | flat | 0 | 0 | 0 | −90 | ⚠ owner sample (degenerate) |
| healing_done | flat | 28.14 | 32.14 | 35.14 | 32 | live |
| healing_taken | flat | 20.08 | 32.33 | 34.33 | 32 | live |
| ignore_mdef | flat | 180 | 190 | 196 | 190 | live |
| ignore_pdef | flat | 822 | 843 | 843 | 843 | live |
| mdmg | flat | 38.26 | 39.88 | 102.88 | 40 | live |
| mdmg_bonus | flat | 735 | 735 | 735 | 735 | live |
| mspd | flat | 145 | 155 | 155 | 155 | live |
| pdmg | flat | 33.38 | 34.38 | 52.76 | 34 | live |
| pdmg_bonus | flat | 245 | 245 | 245 | 245 | live |
| pve_dmg_bonus | flat | 647 | 673 | 793 | 673 | live |
| pve_dmg_reduction | flat | 1214 | 1219 | 1339 | 1219 | live |
| pvp_dmg_bonus | flat | 1066 | 1300 | 1306 | 1300 | live |
| pvp_dmg_reduction | flat | 1560 | 1730 | 1800 | 1730 | live |
| variable_ct | flat | 0 | 0 | 0 | −35 | ⚠ owner sample (degenerate) |
| crit_dmg | % | 0 | 0 | 0 | 155.0 | ⚠ owner sample (degenerate) |
| crit_dmg_res | % | 0 | 14 | 14 | 14.0 | live |
| fixed_ct_pct | % | −60 | −49.43 | −49.43 | −49.4 | live (negative) |
| ignore_mdef_pct | % | 0 | 0 | 0 | 0.0 | live-zero |
| ignore_pdef_pct | % | 0 | 0 | 0 | 0.0 | live-zero |
| mdmg_r | % | 72.2 | 94.06 | 95.2 | 94.1 | live |
| pdmg_r | % | 147.56 | 154.46 | 154.56 | 154.5 | live |
| variable_ct_pct | % | −60 | −60 | −32.95 | −60.0 | live (negative) |
| dmg_reduction_vs_brute | % | 2 | 2 | 2 | 2.0 | live |
| dmg_reduction_vs_demi_human | % | 4 | 4 | 4 | 4.0 | live |
| dmg_reduction_vs_large | % | 4 | 4 | 4 | 4.0 | live |
| dmg_reduction_vs_medium | % | 6 | 17 | 17 | 17.0 | live |
| dmg_reduction_vs_small | % | 4 | 4 | 15 | 4.0 | live |
| dmg_vs_brute | % | 1 | 1 | 1 | 1.0 | live |
| dmg_vs_demi_human | % | 0 | 0 | 0 | 0.0 | live-zero |
| dmg_vs_large | % | 4 | 4 | 4 | 4.0 | live |
| dmg_vs_medium | % | 4 | 4 | 4 | 4.0 | live |
| dmg_vs_small | % | 2 | 2 | 2 | 2.0 | live |
| equip_matk_pct | % | 19.27 | 69.93 | 94.33 | 69.9 | live |
| equip_mdef_pct | % | 9.4 | 13.4 | 13.4 | 13.4 | live |
| equip_patk_pct | % | 19.43 | 19.43 | 80.77 | 19.4 | live |
| equip_pdef_pct | % | 21.4 | 25.4 | 25.4 | 25.4 | live |
| global_cd_pct | % | −10 | −10 | 0 | −10.0 | live (negative) |
| max_sp_pct | % | 16.2 | 21.2 | 26.2 | 21.2 | live |

⚠ = the only 4 low-confidence stats remaining (owner-supplied samples; live values are all zero, n=3 cannot shape them). To refresh them later, re-run `node scripts/dummy-value-report.mjs` once more real validated submissions exist and re-issue the D-12 correction loop.

## 4. Pending-only dummy (D-15)

`dummy-hp-16` ("High Priest 16") carries **only a pending submission** — no validated rows. It renders as never-submitted in ranks AND populates the Validações queue. Every OTHER dummy has exactly one validated submission with **all 57 stats** (verified 0 exceptions in the local rehearsal).

## 5. Sniper naming correction — ✅ CONFIRMED by owner (D-12, 2026-10-14)

CONTEXT D-02 listed "Hunter → Ranger", but the official job-tree API (fetched live 2026-10-13, per plan 07-01) shows the Hunter line's released top job is **Sniper** — Ranger is a site-hidden, unreleased 3rd job (same rule that keeps Grand Summoner / Night Watch out). The roster's "Hunter + Gunslinger (shared)" group ships as **Sniper ×4 + Rebellion ×4**. **Owner confirmed Sniper at the gate.**

## 6. Shared-slot splits (D-08) — ✅ CONFIRMED as authored

The authored splits were confirmed by the owner at the D-12 gate: LK 3/1 (dps/suporte), Paladin 3/1, Biochemist 2/1/1 (dps/mdps/suporte), Mastersmith 1/2/1, Summoner 3/3/2, Sniper+Rebellion 4+4, HP/suporte 15 validated + 1 pending-only, Gypsy 8, Bard 8, Stalker wildcard ×1.

## 7. Wildcard (D-14) — ✅ CONFIRMED

**Stalker ×1** (Rogue line, dps) — the author-picked single-sample class exercising the n=1 data-insufficient rendering end-to-end. Owner confirmed at the gate.

## 7b. Residency (D-13) — ✅ APPROVED

The seed applies to the LIVE project (plan 07-04); dummies stay visible on the real panel until the purge gate. Owner approved live residency at the D-12 gate.

## 8. Purge summary (SEED-02)

`purge-dummies.sql`: one transaction, deletes scoped to the `dummy-%` sentinel in FK-safe order (`pin_login_attempts` → `submission_stats` → `submissions` → `members`; submissions BEFORE members because that FK is NO ACTION), then the four-zero verification query (members / submissions / submission_stats / pin_login_attempts). Rehearsed locally: purge → four zeros → re-seed → works.

## 9. Apply command for plan 07-04 (LIVE — only after your approval)

```
node scripts/apply-seed.mjs supabase/seeds/dummy/seed-dummies.sql
```

The local rehearsal ran the seed SQL directly against a real local Postgres (no supabase CLI/Docker in this environment — 07-01 fallback pattern); the live apply goes through `apply-seed.mjs` exactly as above.

## 10. Local rehearsal results (all PASS — re-run with live-derived bases)

Full local rehearsal re-run against real Postgres 18.4 (embedded binaries — no supabase CLI/Docker in this environment), **21/21 checks GREEN** after the base rebuild:

- Dummy folder outside the flat seed glob: after schema + flat seeds only, zero `dummy-%` members (glob `./seeds/*.sql` is non-recursive, `supabase/config.toml`).
- Base table: 57 entries; exactly 53 changed from the owner samples, the 4 degenerate stats unchanged.
- Cohort matrix matches the expected values exactly (High Priest/suporte 15 … Stalker/dps 1) — 21/21 combos.
- 57-stats invariant: 0 validated dummy submissions with ≠ 57 stat rows.
- Leader/runner-up/tie: patk leader 2933 (×14) / runner-up 2889 (×10) / exact tie 2698 (×6); combat_power leader = 288216 (live median); pdmg_r max 154.5, tie 142.1.
- Negative stats stay negative across the whole ladder: fixed_ct_pct [−49.4 … −30.1], variable_ct_pct [−60.0 … −36.6], global_cd_pct [−10.0 … −6.1].
- Degenerate stats keep owner samples as the leader value: crit_dmg 155, refine_mdef 280, fixed_ct −90, variable_ct −35.
- Live-zero stats (ignore_pdef_pct / ignore_mdef_pct / dmg_vs_demi_human): all values 0.
- dummy-hp-16 pending-only (1 pending, 0 validated). submitted_at spread fresh 32 / stale 40 = 72.
- Idempotent re-seed: row counts unchanged (73/73/4104). Purge → four zeros. Re-seed → 73. Non-dummy rows untouched (3 whitelist placeholders).
