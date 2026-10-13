---
phase: 05-ocr-auto-read-layer
plan: 01
subsystem: ocr
tags: [ocr, tesseract.js, canvas, imagedata, vitest, tdd, self-hosted-assets, vite-lazy-chunk]

# Dependency graph
requires:
  - phase: 01-foundation (plan 01-04)
    provides: owner-validated OCR spike pipeline (scripts/ocr-spike.mjs + ocr-regions.json, 222/222 fields GO)
  - phase: 02-data-model-wizard (plan 02-01)
    provides: parseStatValue — the single locale parser the OCR module must import, never re-implement
provides:
  - lazy-importable readScreenshot(capture, image) -> OcrFieldOutcome[] public API (src/features/submit/ocr/index.ts)
  - group-trimmed percentage region maps per capture + rectToPixels scaling (regions.ts, GENERATED)
  - sanity gates: OCR_ACCEPT_CONFIDENCE=85 + defaults + 12 per-stat overrides (sanity.ts)
  - pure preprocessing pipeline + best-read scoring (preprocess.ts)
  - scripts/convert-spike-regions.mjs — the D-19 recalibration vehicle
  - scripts/copy-ocr-assets.mjs + predev/prebuild hooks — self-hosted worker/core in gitignored public/ocr/
affects: [05-ocr-auto-read-layer (05-02 SQL lifecycle, 05-03/05-04 wizard wiring, 05-05 UAT)]

# Tech tracking
tech-stack:
  added: [tesseract.js 7.0.0 (promoted devDependency -> runtime dependency, self-hosted worker + WASM core)]
  patterns: [generated-code header + committed generator (regions.ts never hand-edited), pure ImageDataLike functions for DOM-free unit tests, single lazy worker promise per wizard session, npm lifecycle hooks regenerating gitignored binary assets]

key-files:
  created:
    - scripts/convert-spike-regions.mjs
    - scripts/copy-ocr-assets.mjs
    - src/features/submit/ocr/regions.ts
    - src/features/submit/ocr/regions.test.ts
    - src/features/submit/ocr/sanity.ts
    - src/features/submit/ocr/sanity.test.ts
    - src/features/submit/ocr/preprocess.ts
    - src/features/submit/ocr/preprocess.test.ts
    - src/features/submit/ocr/recognize.ts
    - src/features/submit/ocr/index.ts
  modified:
    - package.json
    - package-lock.json
    - .gitignore

key-decisions:
  - "CaptureKey is defined in the GENERATED regions.ts (the plan's interfaces block references it there via Record<CaptureKey, CaptureMap> but never declares it); index.ts re-exports it — the public surface is exactly readScreenshot/CaptureKey/OcrFieldOutcome/CAPTURES"
  - "A failed worker init resets the cached workerPromise so the next read retries; the awaiting read still rejects (D-18 manual fallback)"
  - "The winning read's confidence is paired back via reads.find(text === best) — consistent with pickBestRead's first-wins-ties semantics"
  - "INPT-02 stays Pending by traceability (03-02/03-03/04-01 precedent): this plan ships the tested engine only; the requirement completes when 05-04 wires the wizard and 05-05 UAT-verifies end-to-end"

patterns-established:
  - "Generated-module pattern: committed generator + GENERATED-header output + loud aborts on catalog/count drift (convert-spike-regions.mjs is the template for future recalibration vehicles)"
  - "ImageDataLike structural type: pure pixel functions accept { data, width, height } so real ImageData satisfies them without DOM tests"
  - "Self-hosted binary-asset pattern: gitignored public/ocr/ regenerated from node_modules by predev/prebuild — version-locked, no binaries in git"

requirements-completed: []  # INPT-02 deliberately left Pending — engine only; completes in 05-04/05-05 (traceability precedent)

# Metrics
duration: 50min
completed: 2026-10-11
---

# Phase 5 Plan 1: OCR Auto-Read Engine Summary

**Owner-validated spike OCR pipeline ported to the browser as a lazy-importable, unit-proven module: generated pct region maps, sanity gates, pure ImageData preprocessing, and a self-hosted Tesseract worker behind `readScreenshot(capture, image)`**

## Performance

- **Duration:** ~50 min (active work; first commit 15:26, last 15:55 local)
- **Started:** 2026-10-11T15:10-03:00 (approx.)
- **Completed:** 2026-10-11T15:55-03:00
- **Tasks:** 3 (all TDD where specified: RED → GREEN per task)
- **Files modified:** 13 (10 created, 3 modified)

## Accomplishments

- Region maps generated deterministically from the committed spike calibration: basic=1 (combat_power only, D-06), general=14 (quasi rows trimmed), quasi=26, special=15 (dmg_vs_demi_human excluded — not in the sampideal3 calibration); 56 of 57 catalog stats OCR-covered; generator is idempotent (hash-proven)
- Sanity gates hardcoded per 05-RESEARCH §3.4: `OCR_ACCEPT_CONFIDENCE = 85` (D-16), FLAT/PERCENTUAL defaults, exactly 12 spike-informed overrides (CT/CD negative-only)
- Spike preprocessing math + recognizeBest scoring ported as pure, DOM-free functions (dual-polarity rule included — §6 pitfall 1); pickBestRead imports `parseStatValue` (no second parser — §6 pitfall 2)
- `readScreenshot` complete: crop → grayscale → 3x upscale (smoothing-high, documented deviation from cubic) → normalize → binarize(140) → dual polarity → whitelisted read → pickBestRead → parse → confidence ≥ 85 && sanity gate; any worker/canvas error rejects (D-18 graceful degradation contract)
- Self-hosting wired: `scripts/copy-ocr-assets.mjs` copies worker.min.js + all 19 core variants into gitignored `public/ocr/` via `predev`/`prebuild` hooks; tesseract.js promoted to a runtime dependency with package-lock synced

## task Commits

Each task was committed atomically:

1. **task 1: region maps + sanity ranges (RED → GREEN)** - `23cdfeb` (test) → `b76c1a5` (feat)
2. **task 2: preprocessing pure functions + read scoring (RED → GREEN)** - `edead0c` (test) → `9f78a28` (feat)
3. **task 3: worker lifecycle, readScreenshot, self-hosted assets, lazy wiring** - `6afcb5a` (feat) + `7af1c7e` (chore: package-lock sync)

## TDD Gate Compliance

- RED gate: `23cdfeb` (task 1, both suites failing on missing modules) and `edead0c` (task 2, failing on missing module) — both verified failing before implementation
- GREEN gate: `b76c1a5` and `9f78a28` — 39/39 ocr tests green after each
- No refactor passes needed (implementation was clean on first GREEN)

## Files Created/Modified

- `scripts/convert-spike-regions.mjs` - spike pixel maps → regions.ts generator; the D-19 recalibration vehicle; loud aborts on unknown keys or count drift
- `src/features/submit/ocr/regions.ts` - GENERATED pct region maps per capture, reference aspects, `GAME_UI_VERSION`, `rectToPixels` (round + clamp)
- `src/features/submit/ocr/regions.test.ts` - scaling/clamping/round-trip, group-trim shape, 57-stat catalog membership, aspects (16 tests)
- `src/features/submit/ocr/sanity.ts` - `OCR_ACCEPT_CONFIDENCE`, `FLAT_DEFAULT`, `PERCENTUAL_DEFAULT`, 12 `SANITY_OVERRIDES`, `sanityAccepts` (inclusive bounds)
- `src/features/submit/ocr/sanity.test.ts` - accept/reject matrix incl. negative-only CT/CD and default fallback (9 tests)
- `src/features/submit/ocr/preprocess.ts` - `toGrayscale`, `normalizeContrast`, `binarize(140)`, `negate`, `meanLuma`, `needsDualPolarity`, `pickBestRead` — pure ImageDataLike functions
- `src/features/submit/ocr/preprocess.test.ts` - pixel-math fixtures + best-read ordering (14 tests)
- `src/features/submit/ocr/recognize.ts` - single lazy worker (self-hosted paths, spike whitelist/PSM/DPI), `readScreenshot` region loop with confidence+sanity accept gate
- `src/features/submit/ocr/index.ts` - the ONLY import surface: `readScreenshot`, `CaptureKey`, `OcrFieldOutcome`, `CAPTURES` (05-04 consumes via dynamic import → lazy chunk)
- `scripts/copy-ocr-assets.mjs` - worker + all core variants → `public/ocr/` (gitignored), fails loudly on missing packages
- `package.json` / `package-lock.json` - tesseract.js devDependencies → dependencies; `ocr:assets` + `predev`/`prebuild` hooks
- `.gitignore` - `public/ocr/`

## Decisions Made

- `CaptureKey` lives in the generated `regions.ts` (the plan's interfaces reference it via `Record<CaptureKey, CaptureMap>` but never declare it); `index.ts` re-exports it — public surface is exactly the four planned exports
- Worker-init failure resets the cached promise (next read retries) while the awaiting read still rejects — the 05-04 UI turns rejection into the designed manual fallback
- The best read's confidence is recovered with `reads.find(r => r.text === best)` — mirrors pickBestRead's first-wins-ties semantics; the parse gate dominates anyway
- INPT-02 left Pending by traceability (04-01 precedent): the engine is unit-proven, but the requirement is end-to-end and completes in 05-04 (wizard wiring) + 05-05 (owner UAT)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - spec correction] Plan's clamp example is arithmetically impossible**
- **Found during:** task 1 (RED, writing regions.test.ts)
- **Issue:** the plan's behavior says `rectToPixels({x:0.99,w:0.5}, 200, 100)` → "x clamped to 199, w to 200-199" — but 0.99×200 = 198, which is inside [0, dim-1] and needs no clamp; 199 is unreachable from that input under the action's round+clamp spec
- **Fix:** the test pins the plan's stated clamp OUTCOME via `{x:0.995}` (lands on 199; w clamps to 200−199=1) and additionally documents the exact math for the plan's literal 0.99 input (x=198, w=2)
- **Files modified:** src/features/submit/ocr/regions.test.ts
- **Verification:** 16/16 regions tests green, including both clamp cases
- **Committed in:** 23cdfeb / b76c1a5

**2. [Rule 3 - Blocking] package-lock.json out of sync after the dependency move**
- **Found during:** task 3 (post-commit hygiene check)
- **Issue:** moving tesseract.js devDependencies → dependencies without a lockfile update would drift `npm ci` (lock still marked the subtree dev-only)
- **Fix:** `npm install` to sync; lock drops `"dev": true` from tesseract.js + its runtime subtree
- **Files modified:** package-lock.json
- **Verification:** `npm install` clean, 0 vulnerabilities; diff shows only dev-flag removals
- **Committed in:** 7af1c7e

### Unsatisfiable plan criterion (documented, intent preserved)

**3. `Select-String regions.ts "aspd|mspd|crit"` returns NOTHING — cannot hold**
- The plan's own must-haves require `CAPTURES.quasi` to ship 26 regions, and quasi legitimately contains aspd, mspd, crit, crit_res, crit_dmg, crit_dmg_res — a whole-file grep can never return nothing. Same class of contradiction as the 04-01 whole-file gate (recorded as a ratified precedent decision).
- **Intent preserved and proven:** the criterion exists to prove the GENERAL map is trimmed — the generated `general` block contains zero matches (verified: all 6 whole-file matches sit in the quasi block, lines 49–60), and the unit test asserts general's 14 keys are all general-group and none quasi-group.

---

**Total deviations:** 2 auto-fixed (1 spec correction, 1 blocking) + 1 documented unsatisfiable criterion (intent proven by test)
**Impact on plan:** None on scope or behavior — the engine matches the plan's must-haves exactly; both auto-fixes were correctness/hygiene requirements.

## Issues Encountered

- A PowerShell encoding round-trip briefly double-encoded non-ASCII characters (§, —) in scripts/convert-spike-regions.mjs during creation; repaired to clean UTF-8 BEFORE any commit — the committed file is clean (verified: 0 replacement chars, 3 §, 10 —)
- Pre-existing oxlint warnings (4, in verify-pin/ReviewStep/KeyStatsPage/CharactersPage) and 0 errors — unrelated files, out of scope per the scope boundary; the new OCR module lints clean

## Security Notes (threat model compliance)

- T-05-01 (mitigate): grep gates green — `FormData|upload|storage` = 0 matches across `src/features/submit/ocr/*.ts` (incl. tests); the only OCR-stack network is the worker's own asset fetch (self-hosted `/ocr/*` + tessdata CDN)
- T-05-02 (mitigate): sanity + confidence gate shipped and unit-proven; real gates (per-step human verification, create_submission re-validation) land in 05-03/05-04
- T-05-03 (accept): readScreenshot rejects on any worker/canvas error → D-18 manual fallback, by design
- No threat surface beyond the plan's register was introduced

## User Setup Required

None - no external service configuration required. (The tessdata CDN fetch is automatic and browser-cached.)

## Next Phase Readiness

- The engine is importable and typed: 05-04 wires `await import('../ocr')` into the wizard upload handlers (Vite will then emit the lazy chunk — build-output proof lands there per the plan)
- 56/57 stat coverage; `dmg_vs_demi_human` deliberately reads as `failed` (D-14 message + manual fill)
- Recalibration path locked: recalibrate spike maps → `node scripts/convert-spike-regions.mjs` → normal deploy
- Standing Phase-5 note (STATE): OCR_ACCEPT_CONFIDENCE=85 + sanity ranges are seeds needing production-data calibration; device fragmentation not covered by the spike

## Self-Check: PASSED

- Files exist: regions.ts, regions.test.ts, sanity.ts, sanity.test.ts, preprocess.ts, preprocess.test.ts, recognize.ts, index.ts, convert-spike-regions.mjs, copy-ocr-assets.mjs — all FOUND
- Commits exist: 23cdfeb, b76c1a5, edead0c, 9f78a28, 6afcb5a, 7af1c7e — all FOUND
- 171/171 repo tests green; `npx tsc -b` clean; `npm run ocr:assets` verified (worker + simd-lstm wasm present)

---
*Phase: 05-ocr-auto-read-layer*
*Completed: 2026-10-11*
