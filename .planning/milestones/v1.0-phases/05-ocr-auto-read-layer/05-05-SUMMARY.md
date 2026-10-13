---
phase: 05-ocr-auto-read-layer
plan: 05
subsystem: uat-verification
tags: [uat, ocr, structural-reader, tesseract, crop-ux, harness, tdd, debug-cycle, owner-approval]

# Dependency graph
requires:
  - phase: 05-ocr-auto-read-layer (plan 05-01)
    provides: the lazy OCR engine (readScreenshot contract, sanity gates, dual-polarity preprocessing, self-hosted assets)
  - phase: 05-ocr-auto-read-layer (plan 05-04)
    provides: the wired wizard — OcrCapture/CropOverlay, needsCrop trigger, D-15 replace-all-displayed pre-fill
  - phase: 05-ocr-auto-read-layer (plan 05-02)
    provides: the live discard lifecycle (migration 0010, LIFECYCLE SMOKE 11/11) proved by UAT step 9
provides:
  - the APPROVED owner UAT record (05-UAT.md): all 11 steps PASS, verdict 2026-10-12 — INPT-02's runtime criteria closed owner-witnessed
  - the permanent browser-port exact-value harness (grids A/B/G/H/E/F) re-proving the engine through the ACTUAL readScreenshot on real samples (never in git: .secrets runtime-read only)
  - the STRUCTURAL READER in production (scale/margin-invariant; D-19 recalibration model amended to visual-grammar recalibration)
  - round-4 fixes: decode fallback chain (crop always reachable), validation parity for OCR pre-fills, 6 flat damage stats reclassified, combat_power tolerance matching
affects: [phase-5-verification (/gsd-verify-work → INPT-02 via traceability), 06-trust-celebration (validation queue consumes the submission lifecycle walked here)]

# Tech tracking
tech-stack:
  added: []
  patterns: [offline exact-value harness skip-guarded on .secrets presence, structural reading (value-pill color signatures / label anchors / fixed row order — no pixel maps), decode fallback chain (from-image → bare createImageBitmap → <img> decode), one shared field-validation rule consumed by typed + OCR-filled paths]

key-files:
  created:
    - scripts/ocr-browserport-harness.test.mjs
    - scripts/ocr-spike-structural.mjs
    - src/features/submit/ocr/structure.ts
    - src/features/submit/ocr/locate.ts
    - src/features/submit/fieldValidation.ts
    - .planning/phases/05-ocr-auto-read-layer/05-UAT.md
  modified:
    - src/features/submit/ocr/recognize.ts
    - src/features/submit/ocr/sanity.ts
    - src/features/submit/OcrCapture.tsx
    - src/features/submit/CropOverlay.tsx
    - src/features/submit/SubmitPage.tsx
    - src/features/submit/StatGroupStep.tsx
    - supabase/seeds/stat_catalog.sql

key-decisions:
  - "ARCHITECTURE PIVOT (owner directive, round 3, verbatim in 05-UAT.md): the pixel-fraction region-map reading model is retired — players hand-crop screenshots so frame-exact maps can never be robust; replaced by a STRUCTURAL reader (value-pill color signatures / label anchors / fixed row order), invariant to crop size/translation/margins, behind the UNCHANGED readScreenshot contract"
  - "Crop UX ratified to 'Remove gate, keep crop' (owner, 2026-10-12): the 2% confirm gate, dashed example rectangle, and gate/example copy are dead premises under the structural reader — the crop is an optional isolation tool; Usar recorte always confirms, default box = full image; the >5% needsCrop trigger stands"
  - "Accept gate recalibrated to spike parity (round 1): accept = parse + sanity; confidence is only the pickBestRead tiebreak — Tesseract mean confidence is unreliable on 1-6 glyph reads (a correct single-'0' read scores 0.0)"
  - "The 6 damage bonuses/reductions are FLAT stats everywhere (owner-authoritative): misclassification lived only in the catalog seed's value_type; live re-seed via apply-seed.mjs still PENDING (auth-gated, 05-02 precedent)"
  - "combat_power acceptance is tolerance-based in the harness only (|read − expected| ≤ 2000, thousands scale per the owner's volatility note) — the engine's read itself stays exact"
  - "INPT-02 is marked complete by the verification chain (/gsd-verify-work + transition), not by hand — per the 05-05 plan's key-link pin"

patterns-established:
  - "Exact-value harness as the permanent regression gate for OCR changes: grids B (native 56/56), G (rescales 16/16), H (margin pads 20/20), E (frame-exact crop 14/14), F (full-phone variant 14/14) — any engine/UI change re-proves the bar"
  - "Debug-session-driven UAT defect cycle: owner verbatim reports preserved, each defect diagnosed with pinned evidence (harness/byte/HTTP proofs), fixed TDD-first (RED→GREEN), ratified where the spec itself was wrong"

requirements-completed: []  # INPT-02 completes via /gsd-verify-work + transition (traceability key-link — deliberately NOT marked by hand here)

# Metrics
duration: ~23h wall (2026-10-11T21:23Z → 2026-10-12T20:15Z; active work across the 4 debug/fix rounds + owner-verification waits between rounds)
completed: 2026-10-12
---

# Phase 5 Plan 5: Owner UAT & Defect Cycle Summary

**Owner UAT APPROVED 2026-10-12 (all 11 steps PASS): the plan grew from a gate re-run + checkpoint into a 4-round defect cycle that pivoted the OCR engine to a structural reader, simplified the crop UX, and fixed validation parity, stat classification, and a decode-failure path — proven by a permanent exact-value harness (284/284 tests) and the owner's browser walk**

## Performance

- **Duration:** ~23h wall across 2026-10-11 → 2026-10-12 (active execution concentrated in 4 debug/fix rounds; the remainder was owner-verification waits between rounds)
- **Started:** 2026-10-11T21:23:18Z (gate re-run + preview for the checkpoint)
- **Completed:** 2026-10-12T20:15:00Z (owner approval verdict recorded)
- **Tasks:** 3 planned (gate re-run, checkpoint, UAT record) — executed to completion through the iterative approval cycle
- **Files modified:** ~20 across the rounds (see Files Created/Modified)

## Accomplishments

- **Task 1 — consolidated automated gate re-run (2026-10-11):** all phase gates green in one pass and recorded in 05-UAT.md — full vitest suite, `tsc -b` clean, production build green with all criterion-3 gates (entry-chunk `createWorker` 0 matches / lazy chunk only, self-hosted `dist/ocr/worker.min.js` + core WASM present, `FormData` 0 matches in the submit feature); live smokes auth-gated (no token in session — the 05-02 live evidence stands, 02-03 covered-by-automated-evidence precedent); preview served at localhost:4173
- **The 4-round defect cycle (D-05-UAT-1..11), all diagnosed → fixed → ratified → re-verified:**
  - **Round 1:** crop-on-every-upload (NOT reproducible on sample bytes — owner's uploads were misaligned frames; trigger recalibrated 12% → **5%**, owner-ratified) + wrong values / total read failures (accept-gate recalibrated to **spike parity** — the OCR_ACCEPT_CONFIDENCE=85 seed gate was rejecting 5/56 correct reads; confidence demoted to tiebreak)
  - **Round 2:** "forced square" crop, broken decline, zero-value post-crop reads — diagnosed as the near-square tall locks + label-semantics + frame-misalignment; owner ratified free-crop + example + gate (later superseded)
  - **Round 3 — ARCHITECTURE PIVOT:** owner directive ("we need a reading model that actually can read data from an image without relying on a pixel map") → pixel-fraction maps retired for a **STRUCTURAL reader** (value-pill color signatures / label anchors / fixed row order), ported verbatim from a proven spike and wired behind the unchanged `readScreenshot` contract; harness grid re-proved through the actual engine (native 56/56, rescales 16/16, margin pads 20/20, frame-exact crop 14/14)
  - **Round 4:** steps 1–7 and 9–11 PASS; three ratified fix-now items (D-05-UAT-9 **validation parity** — OCR pre-fills show the same per-field check as typed values via one shared rule; D-05-UAT-10 **6 flat damage stats reclassified** in the catalog seed; D-05-UAT-11a **combat_power tolerance** ≤ 2000 in harness expectation matching) + batch 2: D-05-UAT-8 **decode fallback chain** so the crop tool is reachable for every decodable upload (RED `7743f04` → GREEN `cfedfc5`, harness F full-phone variant 14/14) — step 8 then PASS
- **Task 3 — the UAT record:** 05-UAT.md carries the final verdict **OWNER UAT: APPROVED (2026-10-12)** with per-step PASS verdicts, the full 4-round defect history with owner verbatim reports, and the honest acceptance-file disposition (below)

## task Commits

Each unit was committed atomically (selected; full chain via `git log --grep "05-05"`):

1. **task 1: full automated gate re-run** - `8d7e6d3` (chore) + `87a6ef5` (docs: UAT record scaffold with gate evidence)
2. **round 1 dispositions** - `1c28590` (docs: defect dispositions + debug session), `b093b97`/`3ebef9d`/`f2ed1c2` (docs: round records)
3. **round 3 pivot** - `012956f` (test: structural spike proof grid) → `b2bd1db` (test RED) → `35cf99a` (feat: structure/locate modules) → `b58fe24` (feat: wire into readScreenshot, pixel path retired)
4. **crop-UX ratification** - `b29b00b` (test RED) → `224a88b` (feat: remove gate, keep crop)
5. **round-4 batch 1** - `310a741`→`c6bb579` (D-05-UAT-9 parity), `b705a89`→`6bbe1ca`→`4f6eba2` (D-05-UAT-10 flat stats), `0fc7a91`→`66fb7cb` (D-05-UAT-11a tolerance) + `70a2181` (docs)
6. **round-4 batch 2 (D-05-UAT-8)** - `7743f04` (test RED) → `cfedfc5` (fix: decode fallback chain) → `4210264` (test: harness F) → `2037985` (docs)
7. **task 3: UAT verdicts recorded** - `1f43080` (docs: owner UAT APPROVED)

## Files Created/Modified

- `.planning/phases/05-ocr-auto-read-layer/05-UAT.md` - the approved UAT record (created this plan; verdicts filled 2026-10-12)
- `scripts/ocr-browserport-harness.test.mjs` - the permanent exact-value harness (grids A/B/G/H/E/F; skip-guarded on .secrets presence)
- `scripts/ocr-spike-structural.mjs` - the structural-reader proof spike (012956f) the production port came from
- `src/features/submit/ocr/structure.ts` + `locate.ts` - the structural reader (visual grammar + panel/value localization; the new D-19 recalibration surface)
- `src/features/submit/ocr/recognize.ts` - readScreenshot wired to the structural reader; accept gate = parse + sanity
- `src/features/submit/ocr/sanity.ts` - OCR_ACCEPT_CONFIDENCE removed (calibration evidence documented in-code)
- `src/features/submit/OcrCapture.tsx` - 5% crop trigger; decodeUpload fallback chain (crop always reachable)
- `src/features/submit/CropOverlay.tsx` - free-form crop, always-confirm, full-image default box (gate/example removed)
- `src/features/submit/fieldValidation.ts` - the one shared per-field validation rule (typed + OCR parity)
- `src/features/submit/SubmitPage.tsx` / `StatGroupStep.tsx` - shared validation consumption on both render sites
- `supabase/seeds/stat_catalog.sql` - 6 damage stats reclassified flat (live re-seed PENDING, auth-gated)
- `regions.ts` keeps only the CAPTURES aspects (needsCrop); `regions.test.ts` + `convert-spike-regions.mjs` retired (no zombie pins)

## Decisions Made

- **The pivot itself (Rule 4 territory, taken to the owner and answered):** the plan's original scope — re-run gates, walk the owner, record — could not close INPT-02 because the shipped pixel-fraction reading model was structurally inadequate for real-world (hand-cropped) screenshots. The owner directed the structural-reader pivot mid-UAT; the D-19 recalibration model is amended (visual grammar in `structure.ts`, never pixel fractions).
- **Honest acceptance disposition:** the Ahrya acceptance file (D-05-UAT-7) and the step-8 file (D-05-UAT-8) were never dropped into `.secrets/ocr-samples/`; the owner approved with the harness variants + the browser walk as evidence. The tolerance-based combat_power matcher and the harness acceptance slots stand ready if the files ever land.
- **Round-4 triage respected the owner's directive:** D-05-UAT-9/10/11a fixed now; D-05-UAT-11(b) (power-shift significance gameplay rule) DEFERRED to a future phase (todos/pending/power-shift-significance.md).

## Deviations from Plan

### Scope growth (the headline deviation)

**[Rule 4 → owner decision] The plan's "owner UAT" became an iterative debug/approval cycle**
- **Found during:** task 2 (the checkpoint walk)
- **Issue:** the round-1 walk hit 3 defects, rounds 2–4 surfaced 8 more — including a round-3 owner directive that changed the reading architecture (structural reader replacing pixel-fraction maps)
- **Fix:** each round: owner report recorded verbatim → debug session diagnosis (harness/byte/HTTP evidence) → TDD-first fix → full gate re-verification → owner ratification where the spec itself was wrong (5% threshold, free-crop, remove-gate)
- **Files modified:** the engine, capture UI, crop overlay, catalog seed, harness, UAT record, two debug sessions
- **Verification:** final state = suite 284/284 green, `tsc -b` clean, build green, all criterion-3 gates holding, harness grids B/G/H/E/F all exact-value green
- **Committed in:** the ~30-commit chain listed above

### Auto-fixed Issues

**1. [Rule 1 - Bug] OCR_ACCEPT_CONFIDENCE=85 rejected correct reads** — round 1: 5/56 correct reads (confidences 0.0–82) were failing on exact frames; accept gate recalibrated to spike parity (parse + sanity; confidence = tiebreak only). Commit chain within the round-1 fixes.

**2. [Rule 1 - Bug] Single-strategy decode short-circuited to 'failed' before the crop decision (D-05-UAT-8)** — round 4 batch 2: one `createImageBitmap` rejection bypassed `needsCrop` entirely; fixed with the decodeUpload fallback chain. `7743f04` → `cfedfc5`.

**3. [Rule 1 - Bug] 6 flat damage stats classified percentual in the catalog seed (D-05-UAT-10)** — the single definition site the client display inherits; reclassified flat, percentual siblings pinned. `b705a89` → `6bbe1ca` → `4f6eba2`.

**4. [Rule 2 - Missing Critical] OCR pre-fills bypassed the per-field validation display (D-05-UAT-9)** — validation parity is the fix-up gate's spirit: one shared rule now owns the display for typed AND read values. `310a741` → `c6bb579`.

---

**Total deviations:** 1 scope growth (owner-directed) + 4 auto-fixed (3 bugs, 1 missing-critical) — plus the ratified spec changes the owner decided directly (5% trigger, free-crop → remove-gate, flat reclassification, tolerance).
**Impact on plan:** the plan's OBJECTIVE (owner-approved UAT record; Phase 5 ready for /gsd-verify-work) is achieved; the route there was materially longer and changed the OCR architecture.

## Issues Encountered

- The owner's real upload files were never available in `.secrets/ocr-samples/` — every diagnosis used harness-built variants calibrated to realistic geometries (margin pads, rescales, full-phone frames) and the actual canonical samples; final acceptance was the owner's own browser walk.
- Live smokes (gates 7–8) and the live catalog re-seed (D-05-UAT-10) are auth-gated: `SUPABASE_ACCESS_TOKEN` was never in session. The 05-02 live evidence stands for the smokes (nothing server-side changed since); the re-seed remains a pending live action for the owner's next token session.
- A harness-only canvas-construction bug invalidated the round-1 D evidence mid-diagnosis (9-arg drawImage out of bounds); caught and fixed in round 2 — the displacement mechanism was re-proven with a real panel in the frame.

## Known Stubs

None in shipped code. Two pending LIVE actions are tracked, not stubbed:
- `supabase/seeds/stat_catalog.sql` flat reclassification needs a live re-seed (`node scripts/apply-seed.mjs supabase/seeds/stat_catalog.sql` with `SUPABASE_ACCESS_TOKEN` in session — auth-gated, 05-02 precedent)
- The harness acceptance slots for the Ahrya (D-05-UAT-7) and step-8 (D-05-UAT-8) files await the owner's files in `.secrets/ocr-samples/` (acceptance currently stands via the approved walk)

## Security Notes (threat model compliance)

- **T-05-15 (mitigate, owner-witnessed):** UAT step 10 proved in DevTools that NO image bytes egress (only the panel's own API calls), the OCR chunk + worker + WASM load on FIRST upload only, and the page still makes exactly one `/rpc/my_report` request (no key-stat leak regression)
- **T-05-16 (mitigate, owner-witnessed):** steps 2–5 proved the human gate — pre-fill unchecks verification, edits force re-verification, blank Especial blocks, manual fix-up mandatory; server re-validation unchanged (create_submission)
- No new threat surface beyond the plan's register: no new network endpoints, no schema changes, no file-access changes (`.secrets` stays runtime-read only, never committed)

## User Setup Required

None new. Standing auth-gated actions for the owner's next token session: the live catalog re-seed above, and (optional) a fresh live smoke re-run — otherwise the 05-02 live evidence stands.

## Next Phase Readiness

- **INPT-02 is unblocked:** the approved UAT closes all three runtime criteria owner-witnessed; the requirement is marked complete by the verification chain (/gsd-verify-work → transition), per the plan's key-link pin
- **Phase 5 is ready for /gsd-verify-work** — all 5 plans executed with SUMMARYs
- For Phase 6: the submission lifecycle walked here (pending → discarded marks, validation-queue inputs) is exactly what the officer queue consumes; the power-shift-significance todo and owner-only-class-management todo await planner placement
- Standing note: OCR recalibration after a game-UI change now means recalibrating the VISUAL GRAMMAR in `structure.ts` and re-running the harness grid — never pixel fractions

## Self-Check: PASSED

- Files exist: 05-UAT.md (verdicts filled), 05-05-SUMMARY.md, harness + engine sources — all FOUND
- Commits exist: `8d7e6d3`, `1c28590`, `012956f`, `b2bd1db`, `35cf99a`, `b58fe24`, `224a88b`, `c6bb579`, `6bbe1ca`, `66fb7cb`, `cfedfc5`, `4210264`, `1f43080` — all FOUND in git log
- Verification at approval time (final state): full suite **284/284** green (harness grids B 56/56, G 16/16, H 20/20, E 14/14, F 14/14 exact), `tsc -b` clean, `npm run build` green, all criterion-3 gates holding (entry-chunk `createWorker` 0, `FormData` 0, `dist/ocr/` worker + wasm present)
- Owner verdict on record: **OWNER UAT: APPROVED (2026-10-12)** — "approved - lets follow to the next step"

---
*Phase: 05-ocr-auto-read-layer*
*Completed: 2026-10-12*
