# Phase 7: Dummy-Data Seed & Catalog Alignment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-13
**Phase:** 7-dummy-data-seed-catalog-alignment
**Areas discussed:** Class catalog naming, Seed value sourcing, Roster split detail, Dummy identity & residency

---

## Class catalog naming

| Option | Description | Selected |
|--------|-------------|----------|
| Add advanced names alongside base | Keep both naming generations in the catalog | |
| Rename to transcendent names | Final-form names for ALL classes, replacing base entries | ✓ |
| Map roster onto base classes | Keep Wizard/Sage/etc., treat roster names as colloquial | |

**User's choice:** Use transcendent (2nd) class names — "for the merchant, they're Mastersmith and Biochemist. Follow the same pattern for all classes; another example is Mage final form being High Wizard or Professor."
**Notes:** Four naming edges resolved by follow-up questions:

| Option | Description | Selected |
|--------|-------------|----------|
| Doram: Grand Summoner | Official tree's final form | |
| Doram: Summoner | Current in-game top job | ✓ |
| Bard/Gypsy: merge → Maestro | Official tree merges gender paths | |
| Bard/Gypsy: keep both entries | Roster 8+8 split preserved; Dancer dropped | ✓ |
| Swordsman: Lord Knight + Paladin | Final-form pattern applied | ✓ |
| Swordsman: keep Knight + Crusader | 2nd-class names only | |
| Gunslinger: Night Watch | Announced final form | |
| Gunslinger: Rebellion | Current in-game job | ✓ |

**Notes:** Owner rule established — catalog entries are the **currently released** top job; announced-but-unreleased jobs (Grand Summoner, Night Watch) get pivoted in "when the class releases, but that's a future that is yet to get a calendar date". Super Novice removed (unreleased, owner directive from milestone definition).

---

## Seed value sourcing

| Option | Description | Selected |
|--------|-------------|----------|
| Live DB derived | Query live validated submissions, clone distributions per stat | ✓ |
| Owner-supplied samples | Reference screenshots/sheets for archetype builds | |
| Hand-authored, iterate | Training-data values, correct after seeing panel | |

| Option | Description | Selected |
|--------|-------------|----------|
| Calibration shapes | Engineered leader/runner-up/mid/worst tiers | |
| Naturalistic distribution | Real-game clustering and outliers | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-apply review | Owner reviews value tables before apply-seed runs | ✓ |
| Apply then iterate | Apply first, correct via panel + revised seed | |

**Notes:** Naturalistic chosen over engineered tiers — but SEED-01's mandated elements (clear leader, ~98.5% runner-up, ties, submitted_at spread incl. never-submitted) still must be present as they occur naturally.

---

## Roster split detail

| Option | Description | Selected |
|--------|-------------|----------|
| Author proposes | Seed author distributes shared slots, owner corrects at review | ✓ |
| Fix splits now | Owner specifies exact per-class/per-role numbers | |

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm defaults | High Priest→Suporte; Bard/Gypsy→Suporte; HW/Professor→mdps; Ranger/Rebellion→dps; author mixes LK/Paladin and Bio/Mastersmith | ✓ |
| Adjust mappings | Owner overrides default role mappings | |

---

## Dummy identity & residency

| Option | Description | Selected |
|--------|-------------|----------|
| Realistic names | Plausible pt-BR player names | |
| Obvious placeholders | "Priest 1", "Priest 2", … per class | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Uniform known PIN | One hashed PIN, owner logs in as any dummy | ✓ |
| Pinless (setup flow) | Dummies exercise the first-login setup path | |
| Unique PINs | Per-dummy random PINs, documented | |

| Option | Description | Selected |
|--------|-------------|----------|
| Live project | Seed on the real panel; visible until purge | ✓ |
| Local only | Zero live exposure | |

| Option | Description | Selected |
|--------|-------------|----------|
| Author picks wildcard class | Single-sample n=1 class | ✓ |
| Owner chooses | Owner names the class now | |

**User's choice (names):** "Obvious per class — Priest 1, Priest 2, Priest 3… and so on."

---

## OpenCode's Discretion

- Exact split numbers within roster groups (subject to pre-apply review)
- Wildcard class choice
- Seed file structure inside `supabase/seeds/dummy/`; idempotency mechanics
- Migration numbering and rename/backfill mechanics for classes/members
- Uniform dummy PIN value (documented in seed summary, never committed plaintext)
- combat_power spread treatment
- pt-BR micro-copy

## Deferred Ideas

- **power-shift-significance todo** — reviewed, NOT folded (v2 delta domain, DELT-01/HIST-01)
- **Grand Summoner / Night Watch catalog pivots** — when the jobs get release dates
- **Realistic dummy persona names** — rejected for v1.1
- **Seed-derived calibration observations doc** — if needed, belongs to Phase 9 band-calibration prep
