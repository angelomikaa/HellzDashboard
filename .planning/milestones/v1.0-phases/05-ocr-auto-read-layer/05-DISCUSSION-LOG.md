# Phase 5: OCR Auto-Read Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-11
**Phase:** 05-ocr-auto-read-layer
**Areas discussed:** Device fragmentation strategy, Capture schema & step realignment, Low-confidence & failure UX, Region map delivery & versioning

---

## Device fragmentation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Resolution-relative scaling (Recommended) | Rects as percentages of reference dimensions, scaled to the uploaded image | ✓ |
| Capture guideline only | Instruct players to crop to a fixed size before upload | |
| Both | Scaling engine + example shots as soft guidance | |

**User's choice:** Resolution-relative scaling
**Notes:** Follow-up domain fact (free text): the game has a fixed scaling window — desktop fixed shape, mobile fullscreen-only — layouts are proportionally identical, so percentage rects are reliable and recalibration only matters when the game UI changes. No in-app calibration page this phase; the spike script remains the recalibration vehicle.

| Option | Description | Selected |
|--------|-------------|----------|
| Anchor check, abort on fail (Recommended) | OCR 1–2 known label regions first; mismatch → abort with clear message | |
| Sanity ranges only | OCR everything; per-field sanity ranges reject absurd reads | ✓ |
| You decide | Researcher/planner decides detection mechanics | |

**User's choice:** Sanity ranges only
**Notes:** The fix-up gate + officer layer catch wrong-screen reads; owner prefers the simpler pipeline.

| Option | Description | Selected |
|--------|-------------|----------|
| Fill what passed (Recommended) | Clean fields pre-filled; failed fields blank for manual entry | ✓ |
| All-or-nothing per group | Any field failure voids the whole group's pre-fill | |

**User's choice:** Fill what passed

| Option | Description | Selected |
|--------|-------------|----------|
| Owner recalibrates via spike (Recommended) | Ship with owner-device maps; recalibrate via the re-runnable spike on new samples | |
| Ship dev calibration page too | Build the Phase-1-deferred in-browser calibration route now | |

**User's choice:** Free text — the fixed game scaling window makes device variance a non-issue; spike handles game-UI-change recalibration.
**Notes:** Interpreted and confirmed in the next question's response.

| Option | Description | Selected |
|--------|-------------|----------|
| In-app crop step (Recommended) | Player crops to the panel before OCR; existing crop-calibrated maps stay valid | |
| Auto panel detection | Detect panel bounds inside full screenshots; needs new spike calibration | |
| Guideline only, no crop UI | Rely on players sending good crops; sanity ranges catch the rest | |

**User's choice (free text):** Optional in-app crop step — only triggered if OCR finds excessive information in the sent image; optimal crops skip cropping completely.
**Notes:** Raised by the owner: spike samples were crops, so full screenshots would break rect targeting. The owner designed the conditional-crop resolution themselves.

---

## Capture schema & step realignment

| Option | Description | Selected |
|--------|-------------|----------|
| Add basic OCR capture (Recommended) | Intro step gains file input; OCR pre-fills combat_power | ✓ |
| Keep combat_power manual | OCR applies only to the 3 stat-group screenshots | |

**User's choice:** Add basic OCR capture

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm: Special mandatory (Recommended) | Phase 3 D-08 realignment lands here; gating includes Especial | ✓ |
| Stay optional for now | Keep the Phase 2 ratified optional behavior | |

**User's choice:** Confirm Special mandatory

| Option | Description | Selected |
|--------|-------------|----------|
| Per-step checkbox (Recommended) | Each capture step ends with its own verification checkbox; final review shrinks | |
| Keep end-of-flow review | 3-checkbox ReviewStep stays the single gate | |
| Both gates | Per-step checkboxes AND final review | |

**User's choice (free text):** Standard flow per capture: screenshot → OCR reads → user checks → manual fill if needed → checkbox. All four captures follow it and together form one validable character input. Submission goes pending and counts as valid until an officer overturns; new submission supersedes the older pending; only one pending per player; overturn = discard latest + recalc from last validated input.
**Notes:** This answer introduced the pending-replacement lifecycle rule, prompting the follow-up placement question.

| Option | Description | Selected |
|--------|-------------|----------|
| Pending-replacement in Phase 5 (Recommended) | create_submission marks previous pending 'discarded' (status mark, append-only preserved); officer UI stays Phase 6 | ✓ |
| Defer all lifecycle to Phase 6 | Multiple pendings coexist until the validation loop arrives | |

**User's choice:** Pending-replacement in Phase 5

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-run on upload (Recommended) | File select immediately starts OCR; re-upload re-runs | ✓ |
| Explicit button | "Ler print" button triggers the read | |

**User's choice (free text):** Auto-run with run confirmation; failed reads pointed in the field itself: "O valor não foi detectado na print - Por favor preencha o campo manualmente"

---

## Low-confidence & failure UX

| Option | Description | Selected |
|--------|-------------|----------|
| Upload optional (Recommended) | File input optional on every step; OCR purely additive | ✓ |
| Upload required | Screenshot attempt required before manual entry unlocks | |

**User's choice (free text):** Upload optional but with a bright CTA "Faça upload dos seus status aqui" + upload icon — highly encouraged, but full manual fill stays available.

| Option | Description | Selected |
|--------|-------------|----------|
| Re-upload overwrites (Recommended) | Fresh read replaces all pre-fillable fields | ✓ |
| Typed values win | OCR only writes into empty fields | |
| Dirty-field tracking | Overwrite except fields manually edited since last read | |

**User's choice:** Re-upload overwrites

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-fill silently (Recommended) | Threshold rejects internally; accepted reads render normally; OCRX-01 stays v2 | ✓ |
| Mark low-confidence fields | Subtle visual hint on shaky reads (pulls OCRX-01 into Phase 5) | |

**User's choice:** Pre-fill silently

| Option | Description | Selected |
|--------|-------------|----------|
| Disabled + skeleton (Recommended) | Inputs disabled with shimmer until the read finishes | ✓ |
| Editable during read | Fields stay editable; typed wins on conflict | |

**User's choice:** Disabled + skeleton

---

## Region map delivery & versioning

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled in app (Recommended) | Maps + ranges as versioned code artifacts; game-UI change = spike recalibration + normal deploy | ✓ |
| Fetched remotely | Maps in Supabase for update-without-deploy; adds RLS/cache complexity | |

**User's choice:** Bundled in app

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded in OCR module (Recommended) | Ranges are OCR-input guards, versioned like maps | ✓ |
| Catalog-driven (admin-tweakable) | Sanity bounds in stat_catalog + admin surface | |

**User's choice (free text):** Hardcoded — officer accept/reject was always intended as the second protection layer against insane stats; OCR sanity alone = "valid until overturned".
**Notes:** Reinforced the two-layer trust model (OCR sanity + officer human validation).

| Option | Description | Selected |
|--------|-------------|----------|
| Single active version (Recommended) | One current map set; post-update players on new UI fill manually until recalibration ships | ✓ |
| Multi-version maps | Keep N map sets with per-screenshot version detection | |

**User's choice:** Single active version

---

## OpenCode's Discretion

- "Excessive information" detection heuristic for the crop trigger
- Crop UI mechanics (drag handles, aspect lock)
- Initial per-stat sanity-range values (seed from spike ground truth + catalog)
- Confidence-threshold (~85) calibration procedure on production data
- OCR module decomposition under `src/features/submit/ocr/` (port of the spike pipeline, pure functions + TDD)
- Lazy-load / dynamic-import + Vite worker bundling verification
- pt-BR micro-copy beyond the two locked strings
- Final ReviewStep fate (removed vs last-chance summary) — per-step checkboxes are the gate either way
- OCR pipeline testing approach (synthetic-image self-test, pure-function unit tests)
- OCR engine-unavailable messaging (graceful manual fallback is mandated by ROADMAP criterion 3)

## Deferred Ideas

- In-app dev-only OCR calibration/test page (Phase 1 carry-over) — not this phase; spike script is the recalibration vehicle
- OCRX-01 low-confidence field flagging — stays v2
- Officer approve/reject queue + overturn recalc UI — Phase 6 (AUTH-05); only `discarded` status + one-pending rule land in Phase 5
