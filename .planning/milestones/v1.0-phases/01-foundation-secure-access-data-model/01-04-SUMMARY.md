---
phase: 01-foundation-secure-access-data-model
plan: "04"
subsystem: testing
tags: [ocr, tesseract.js, sharp, feasibility-spike, vitest, region-based-ocr]

# Dependency graph
requires:
  - phase: 01-foundation-secure-access-data-model (01-01)
    provides: committed repo + scripts tooling; gitignored .secrets/ convention
provides:
  - Re-runnable region-based OCR spike (`scripts/ocr-spike.mjs`) with candidates mode, self-test, and info modes
  - Calibrated region maps for all 11 real guild screenshots (`scripts/ocr-regions.json`, category-tagged basic/ideal/common)
  - Unit-tested accuracy/verdict math (parseValue pt-BR locale, computeAccuracy, verdict, compareField — 25 Vitest tests)
  - Documented GO decision: 222/222 fields, 100.0% accuracy vs ~70% threshold (OCR-SPIKE-RESULTS.md)
affects: [05-ocr-assisted-submission, 02-manual-ingestion]

# Tech tracking
tech-stack:
  added: [tesseract.js, sharp]
  patterns:
    - "Region-based OCR only (never whole-image): pixel-rect crop → grayscale → 3x cubic upscale → normalize → binarize"
    - "Dual-polarity read: when the binarized crop is ambiguous (mean < 128), OCR both polarities and keep the parseable/higher-confidence read"
    - "Candidates protocol: --dump-candidates → owner eye-validation → expected.json ground truth (gitignored) → re-run for accuracy"

key-files:
  created:
    - scripts/ocr-spike.mjs
    - scripts/ocr-spike.accuracy.test.mjs
    - scripts/ocr-regions.json
    - scripts/ocr-samples-expected.example.json
    - .planning/phases/01-foundation-secure-access-data-model/OCR-SPIKE-RESULTS.md
  modified:
    - package.json
    - .gitignore

key-decisions:
  - "OCR verdict: GO — 222/222 fields correct (100.0%), +30 pp above the ~70% pivot threshold; Phase 5 proceeds as planned"
  - "Ground truth built from owner-eye-validated OCR candidates (approved without corrections); pipeline reproduced all 222 reads identically (deterministic)"
  - "Dual-polarity OCR read required — a single hard-polarity policy made sampbasic combat power unreadable"
  - "sampbasic header screen endorsed as 4th region group / first screenshot of the capture schema (job/nickname as text-type regions)"
  - "Device fragmentation NOT covered by the spike — Phase 5 needs capture guidelines or resolution-relative regions + confidence threshold (~85)"

patterns-established:
  - "Eye-validation ground-truth protocol: dump candidates → human validates → expected.json → re-run (reusable for any OCR recalibration)"
  - "Per-category accuracy reporting (basic / ideal / common) — input quality differs per category, verdicts report each separately"

requirements-completed: [] # plan frontmatter maps no REQ-IDs to the spike (ROADMAP Phase 1 success criterion 4)

# Metrics
duration: 2h 51min
completed: 2026-10-08
---

# Phase 1 Plan 04: OCR Feasibility Spike Summary

**Region-based Tesseract.js spike on 11 real guild screenshots: 222/222 fields read correctly (100.0% vs ~70% threshold) → GO — Phase 5 proceeds as planned**

## Performance

- **Duration:** 2h 51min (incl. two human checkpoints for real-data placement and candidate validation)
- **Started:** 2026-10-08T20:03:34Z
- **Completed:** 2026-10-08T22:54:17Z
- **Tasks:** 2 (task 1 TDD spike build; task 2 real-data run + decision, executed across three continuation sessions)
- **Files modified:** 8 (6 created, 2 modified) + gitignored real data

## Accomplishments
- Committed, re-runnable OCR spike: region-based recognition (never whole-image) with pt-BR locale parsing (`1.234.567`, comma decimals, `%`, negative CT/CD values) and 25 unit-tested pure functions
- Calibrated pixel-rect region maps for all 11 real screenshots, category-tagged (basic 6 / ideal 65 / common 151 fields) for per-category accuracy reporting
- Real-data measurement: **222/222 fields correct, 100.0% field accuracy — VERDICT: GO** vs the ~70% pivot threshold (D-08), documented in OCR-SPIKE-RESULTS.md
- Owner eye-validated all 222 candidate values (approved without corrections) → became expected.json ground truth (gitignored, D-10); re-run reproduced every read identically (deterministic)

## Task Commits

Each task was committed atomically (TDD tasks have RED/GREEN commits):

1. **task 1: spike script + accuracy/verdict math (TDD)** — `38a0710` (test, RED), `42c269a` (feat, GREEN), `7a22900` (docs: checkpoint stop)
2. **task 2: real-data run + GO/NO-GO decision** — `2d02352` (test, RED: negatives/text compare), `6972b0d` (feat, GREEN), `8250146` (feat: region calibration + candidates mode), `bf85768` (fix: dual-polarity OCR), `2f5df9c` (docs: checkpoint stop), `7c19360` (test, RED: text rows in computeAccuracy), `0231d49` (fix, GREEN), `15cf95a` (docs: GO decision document)

**Plan metadata:** (final commit follows this summary)

## Files Created/Modified
- `scripts/ocr-spike.mjs` — spike CLI: region-based OCR pipeline, candidates mode, self-test, accuracy report + GO/NO-GO verdict
- `scripts/ocr-spike.accuracy.test.mjs` — 25 Vitest unit tests for parseValue / computeAccuracy / verdict / compareField
- `scripts/ocr-regions.json` — calibrated pixel rects per screenshot (11 groups, category tags, recalibration notes)
- `scripts/ocr-samples-expected.example.json` — expected-values template for future re-runs
- `.planning/phases/01-foundation-secure-access-data-model/OCR-SPIKE-RESULTS.md` — the GO decision record with per-category numbers and Phase 5 caveats
- `package.json` — `ocr:spike` script + tesseract.js/sharp devDependencies
- `.gitignore` — `.secrets/` protection (D-10)
- `.secrets/ocr-samples/` (gitignored, never committed) — 11 real screenshots + candidates.json + expected.json

## Decisions Made
- **GO verdict recorded as a project decision**: 100.0% field accuracy on 222 real fields, +30 pp above the ~70% pivot threshold — Phase 5 proceeds as planned; manual-entry fallback pivot not triggered
- Ground-truth protocol: owner eye-validated the OCR candidate table (all 222 approved, no corrections); pipeline re-run agreed 222/222 — OCR reads established as true on-screen values
- Dual-polarity read is a hard requirement for the production pipeline (single hard negate broke sampbasic combat power)
- Phase 5 caveats carried to STATE/ROADMAP: device fragmentation not covered (region maps calibrated per screenshot on the owner's device), region maps are game-UI-versioned artifacts, manual fix-up stays mandatory regardless of accuracy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] computeAccuracy deflated text-field rows via Number() coercion**
- **Found during:** task 2 (final spike run — report inconsistency)
- **Issue:** Report showed "Correct: 222" but "Field accuracy: 99.1%" and basic 66.7% with 6/6 correct — `computeAccuracy` compared `Number(parsed) === Number(expected)`, and text rows (sampbasic job/nickname carry strings) became `NaN === NaN` → counted as misses despite `ok: true`
- **Fix:** Text rows count via compareField's ok flag (the verdict for strings); numeric rows unchanged (ok AND value equality). TDD: RED `7c19360`, GREEN `0231d49`
- **Files modified:** scripts/ocr-spike.mjs, scripts/ocr-spike.accuracy.test.mjs
- **Verification:** 25/25 Vitest tests green; re-run reports consistent 222/222 = 100.0%, basic 6/6 = 100.0%
- **Committed in:** `7c19360` + `0231d49`

**2. [Rule 1 - Bug] Hard-polarity negate made sampbasic combat power unreadable**
- **Found during:** task 2 (prior session — candidates run)
- **Issue:** Binarized mean < 128 flipped polarity unconditionally; negated read came back empty for sampbasic combat_power
- **Fix:** preprocessRegion returns BOTH polarities when ambiguous; recognizeBest picks the parseable/higher-confidence read
- **Files modified:** scripts/ocr-spike.mjs
- **Verification:** 222/222 non-empty reads, deterministic across re-runs
- **Committed in:** `bf85768`

**3. [Rule 2 - Missing critical] Negative values + text-field comparison (real data exceeded plan's math)**
- **Found during:** task 2 (prior session — real screenshots contained negative CT/CD stats and text header fields the plan's parseValue/compare didn't cover)
- **Fix:** parseValue handles leading `-`; new compareField compares by type (numeric locale parse vs text case-insensitive). TDD: RED `2d02352`, GREEN `6972b0d`
- **Files modified:** scripts/ocr-spike.mjs, scripts/ocr-spike.accuracy.test.mjs
- **Verification:** unit tests green; all real negative fields (-33.38%, -60.00%, -10.00%) and both text fields read correctly
- **Committed in:** `2d02352` + `6972b0d`

**4. [Rule 3 - Blocking] Expected-values workflow impractical to hand-fill from scratch**
- **Found during:** task 2 (prior session — checkpoint: plan expected the owner to hand-fill expected.json against screenshots)
- **Fix:** Added `--dump-candidates` mode: OCR every region without ground truth, dump a candidate table for owner eye-validation; validated candidates become expected.json. Also 11 screenshots instead of the planned 10 — the owner added the sampbasic header screen (user-endorsed as the 4th region group / first capture screenshot)
- **Files modified:** scripts/ocr-spike.mjs, scripts/ocr-regions.json
- **Verification:** candidates.json: 222 fields, 0 empty, deterministic; owner approved all values
- **Committed in:** `8250146`

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 missing critical, 1 blocking)
**Impact on plan:** All fixes required by real data (the plan's synthetic math was incomplete for negatives/text fields) and by report correctness. No scope creep — the 11th screenshot was owner-endorsed.

## Issues Encountered
- None beyond the deviations above. Two planned human checkpoints (real-data placement, candidate validation) resolved smoothly — the owner approved all 222 candidates without corrections.

## User Setup Required
None - no external service configuration required. (Pre-existing reminder from 01-01 stands: rotate the Supabase access token and placeholder PINs before inviting real members — see 01-USER-SETUP.md.)

## Next Phase Readiness
- ROADMAP success criterion 4 (OCR go/no-go on real data) is DONE with a documented GO
- Phase 5 inherits: region-based pipeline pattern, dual-polarity preprocessing, candidates eye-validation protocol, per-category reporting — plus explicit caveats (device fragmentation, UI-versioned region maps, mandatory manual fix-up, confidence threshold ~85 calibration)
- Phase 01 remaining: 01-03 (LoginPage UI — consumes the verify-pin contract proven in 01-02) is the last plan of this phase
- `.secrets/ocr-samples/` (screenshots, candidates.json, expected.json) stays local and gitignored — verified ignored before every commit (D-10)

---
*Phase: 01-foundation-secure-access-data-model*
*Completed: 2026-10-08*

## Self-Check: PASSED

- All 6 key files exist on disk (scripts/ocr-spike.mjs, ocr-spike.accuracy.test.mjs, ocr-regions.json, ocr-samples-expected.example.json, OCR-SPIKE-RESULTS.md, 01-04-SUMMARY.md)
- All 9 task commits found in git log (38a0710, 42c269a, 2d02352, 6972b0d, 8250146, bf85768, 7c19360, 0231d49, 15cf95a)
- Plan-level verification re-run: `npx vitest run scripts/ocr-spike.accuracy.test.mjs` → 25/25 green; `node scripts/ocr-spike.mjs` → 222/222 fields OK, 100.0% accuracy, VERDICT: GO
- Acceptance criteria re-verified: tests green (incl. 0.7 GO / 0.6 NO-GO boundary); spike contains tessedit_char_whitelist, user_defined_dpi, ocr-samples guard, exports parseValue/computeAccuracy/verdict; regions cover all groups (basic/ideal/common); expected.json gitignored (D-10)
