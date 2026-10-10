# Phase 3: Rank Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-09
**Phase:** 3-Rank Engine
**Areas discussed:** Key-stat admin interface, Rank cohort & recency, OVR composition & floor, Insufficient-data threshold, Phase 2 hardening debt

---

## Key-stat admin interface

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal admin UI page | New staff tab beside Personagens; RNK-01 lands fully in Phase 3; live OVR testing | ✓ |
| RPC + SQL seed only | Owner configures via SQL editor (D-05 whitelist pattern); UI deferred to Phase 6 | |
| You decide | OpenCode picks during planning | |

**User's choice:** Minimal admin UI page
**Notes:** Officer Panel is Phase 6, but roadmap success criterion 1 requires admin toggle now.

| Option | Description | Selected |
|--------|-------------|----------|
| Block at 7 | 7th toggle rejected until one removed; <6 allowed mid-config (OVR = insufficient data) | ✓ |
| Pick-to-swap | Selecting a 7th opens swap dialog; always exactly 6 | |
| Enforce at read only | Table permissive; OVR RPC refuses unless exactly 6 | |

**User's choice:** Block at 7

| Option | Description | Selected |
|--------|-------------|----------|
| Officer + owner | Matches existing staff pattern (Personagens, 0005/0006 RLS) | ✓ |
| Owner only | Tighter control, one more policy distinction | |

**User's choice:** Officer + owner

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped catalog chips | 57-stat catalog grouped General/Quasi/Special, toggle chips, n/6 counter | ✓ |
| Searchable flat list | Filter box over all 57 stats | |
| You decide | OpenCode decides layout details | |

**User's choice:** Grouped catalog chips

| Option | Description | Selected |
|--------|-------------|----------|
| Config only | Toggle state + 6/6 completeness; effect verified in Phase 4 | |
| Add OVR preview | Small computed sample so tweaks can be sanity-checked before members see them | ✓ |

**User's choice:** Add OVR preview

| Option | Description | Selected |
|--------|-------------|----------|
| Own OVR only | Officer's own recomputed OVR + 6 percentile points | |
| Class top-5 preview | Top-5-by-OVR mini leaderboard for the class; staff-only RPC now, reusable by Phase 6 promotion page | ✓ |

**User's choice:** Class top-5 preview

---

## Rank cohort & recency

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude rejected only | Cohort = status != 'rejected'; pending counts today; Phase 6 rejection drops rows automatically | ✓ |
| Validated-only from day one | Matches end-state; dashboards dead until Phase 6 | |
| Manual SQL validation | Owner hand-flips statuses until Phase 6 | |

**User's choice:** Exclude rejected only

| Option | Description | Selected |
|--------|-------------|----------|
| Latest per stat | Per stat, player's most recent submission containing it | |
| Latest submission only | Player excluded from a stat's ranking if latest submission omits it | |
| You decide | OpenCode resolves in 03-01 spec | |

**User's choice:** Free-text — "the player cannot submit without all fields validated, he will have to fill it manually if OCR fails. Speaking of OCR - The flow must be more clear: a big block with input and sample input, and then the fields, and then a box to tick confirming that you verified the read stats against the ones in the fields. Do it for each step, add to planning"
**Notes:** Owner confirmed (1) Special group becomes **mandatory**, revising the Phase 2 "Especial optional" ratification — so future submissions are complete and the latest submission represents the player; RPC stays defensive with latest-per-stat fallback for legacy rows; (2) the wizard UX realignment routes to **Phase 5** ("not a priority now, just a realignment") — see Deferred Ideas.

---

## OVR composition & floor

| Option | Description | Selected |
|--------|-------------|----------|
| Linear rescale 51–99 | OVR = 51 + mean × (48/99); worst 51, best 99, full bottom-half differentiation | ✓ |
| Hard clamp at 51 | OVR = greatest(51, mean); bottom half all shows exactly 51 | |
| You decide | Resolved in 03-01 spec with worked examples | |

**User's choice:** Linear rescale 51–99
**Notes:** Composition itself (equal-treatment mean of 6 key-stat percentile scores) carries forward from research + roadmap.

| Option | Description | Selected |
|--------|-------------|----------|
| All 6 or nothing | Missing any key stat → OVR = insufficient data (per-stat cards still show) | ✓ |
| Compute from available | OVR from the key stats present (min 4+); denominator varies per player | |

**User's choice:** All 6 or nothing

---

## Insufficient-data threshold

| Option | Description | Selected |
|--------|-------------|----------|
| n ≥ 3 for both | Per-stat points and OVR both need ≥3 players in class+function cohort | ✓ |
| n ≥ 5 for both | More stable; most cohorts blank for weeks in a 15–40 player guild | |
| ≥3 per-stat / ≥5 OVR | Two-tier honesty, more complex contract | |

**User's choice:** n ≥ 3 for both

| Option | Description | Selected |
|--------|-------------|----------|
| Show values, no points | Own raw value, class average, best-in-guild still returned + data_sufficient flag | ✓ |
| Full placeholder only | Single "not enough players" message, nothing else | |

**User's choice:** Show values, no points

---

## Phase 2 hardening debt

| Option | Description | Selected |
|--------|-------------|----------|
| Fold both into Phase 3 | CR-01 via corrective 0007 migration; CR-02 one-word fix + redeploy + smoke re-run; both tested in same pass | ✓ |
| Fold CR-01 only | Schema-adjacent fix in Phase 3; verify-pin fix separate | |
| Separate maintenance pass | Phase 3 purely rank engine; security gap stays open longer | |

**User's choice:** Fold both into Phase 3

---

## OpenCode's Discretion

- Tie-handling exact mechanics (average-rank standard; confirm in 03-01 spec)
- OVR rounding (integer display, decimal internal)
- RPC signatures / response shapes / RPC count
- Formula spec structure and unit-test cases (03-01)
- Index additions for cohort queries
- Top-5 preview parametrization (hypothetical vs current config)

## Deferred Ideas

- Wizard UX realignment → Phase 5: Special group mandatory in wizard; OCR-first input flow with manual fallback ("so no data is lost"); per-step big-block input + sample image + fields + verification checkbox layout. Owner: "not a priority now, just a realignment."
- (Carried from Phase 1) Dev-only OCR calibration/test page → Phase 5.
