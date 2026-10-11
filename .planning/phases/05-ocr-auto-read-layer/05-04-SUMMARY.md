---
phase: 05-ocr-auto-read-layer
plan: 04
subsystem: submit-wizard
tags: [ocr, wizard-wiring, d05-crop, d15-replace-all, lazy-chunk, self-hosted-assets, production-build-proof, tdd]

# Dependency graph
requires:
  - phase: 05-ocr-auto-read-layer (plan 05-01)
    provides: lazy-importable readScreenshot(capture, image) -> OcrFieldOutcome[] + CAPTURES region maps (static-safe data module)
  - phase: 05-ocr-auto-read-layer (plan 05-03)
    provides: the realigned step engine — central handleChange edit wrapper that unchecks stepVerified[step], per-step verification checkboxes
  - phase: 02-data-model-wizard (plan 02-01)
    provides: parseStatValue — the single locale parser the OCR engine already gates on (05-01)
provides:
  - OcrCapture (upload CTA → EXIF-aware decode → optional aspect-locked crop → lazy readScreenshot → outcome/error callbacks) + needsCrop pure trigger
  - CropOverlay (pointer drag + corner resize, ratio-locked, 40% min box, decline/Escape cancels the read)
  - the complete OCR-assisted submit flow on all four capture steps with locked UX semantics (D-04/D-05/D-10/D-14..D-18)
  - criterion 3 build proof: tesseract ONLY in the lazy chunk, self-hosted worker/core in dist/ocr/, zero upload paths
affects: [05-ocr-auto-read-layer (05-05 owner UAT — runtime half of criterion 3 + end-to-end INPT-02 verification)]

# Tech tracking
tech-stack:
  added: []
  patterns: [aspect-deviation trigger with float-epsilon boundary guard, pointer-capture crop gesture with display-pixel box + image-fraction crop math, per-component status line as the OCR run/done/failed state machine (parent owns field effects)]

key-files:
  created:
    - src/features/submit/OcrCapture.tsx
    - src/features/submit/CropOverlay.tsx
    - src/features/submit/OcrCapture.test.ts
  modified:
    - src/features/submit/StatGroupStep.tsx
    - src/features/submit/SubmitPage.tsx

key-decisions:
  - "The plan's dynamic-import specifier ('../ocr') does not resolve from src/features/submit/ (it would point at src/features/ocr) — the correct and used specifier is './ocr'; the plan's own tsc -b acceptance gate made the literal path impossible, so the lazy-chunk INTENT is what's pinned (entry createWorker: 0 matches, ocr chunk: 1)"
  - "needsCrop pins the binding formula (>12%, exclusive) — the plan's 11.2% case listed 'true' while its own parenthetical said false; the test documents the contradiction (05-01 clamp-example class)"
  - "A 1e-9 epsilon absorbs IEEE-754 noise at the exact-12% boundary (1.12-1 evaluates a hair above 0.12) so the documented 'exactly 0.12 → false' holds; human-relevant gaps (0.001) are unaffected"
  - "INPT-02 stays Pending by traceability (05-01/02/03 precedent): criteria 1+2 are code-complete and criterion 3's build half is proven, but the requirement completes at 05-05 owner UAT (runtime half + end-to-end walk)"

patterns-established:
  - "Decline-cancels-read is a complete safe exit: no onOutcomes, no onReadFailed, status back to idle — the failure callback is reserved for real read failures (D-18), never for a user decline (pitfall 7)"
  - "Screenshot memory hygiene: the decode bitmap is close()d on read completion, crop confirm, and crop decline — bytes never outlive the gesture (T-05-11)"

requirements-completed: []  # INPT-02 deliberately left Pending — completes at 05-05 UAT (traceability precedent)

# Metrics
duration: 32min
completed: 2026-10-11
---

# Phase 5 Plan 4: OCR Wizard Wiring Summary

**The 05-01 engine is now player-visible: an accent upload CTA on every capture step auto-runs the region-based read (decode → optional aspect-locked crop → lazy readScreenshot), pre-fills silently through the central edit wrapper, flags unread fields with the locked manual-fill message, replaces the whole step on re-upload, and degrades cleanly — with the production build proving tesseract lives only in a lazy chunk over self-hosted assets**

## Performance

- **Duration:** ~32 min (first commit 18:56 UTC, last 19:15 UTC local sessions; started 17:41Z)
- **Tasks:** 2 (task 1 TDD RED → GREEN; task 2 wizard integration + build proof)
- **Files modified:** 5 (3 created, 2 modified)
- **Commits:** 3 (1 test + 2 feat)

## Accomplishments

- **OcrCapture (task 1):** accent-filled `h-11` CTA with inline 16px upload SVG + the locked label (definition site, exactly once); hidden `accept="image/*"` file input where re-selecting the same file re-runs (value reset); EXIF-aware decode via `createImageBitmap(file, { imageOrientation: 'from-image' })` (pitfall 6); `needsCrop` aspect check against the statically-imported data-only `CAPTURES`; read = `await import('./ocr')` (THE lazy boundary) → `readScreenshot` → `onOutcomes` → done status (`Leitura concluída…`, text-success); ANY chain error → D-18 expected-state status line (`role="status"`, text-muted) + `onReadFailed`, manual flow untouched; the bitmap is `close()`d on every exit path (T-05-11)
- **CropOverlay (task 1):** fullscreen `fixed inset-0 bg-black/80 z-50` overlay, `bg-surface p-6` panel, heading + image drawn on a contained canvas (`max-h-[80vh]`), aspect-locked crop box (`border-2 border-accent`, one `h-4 w-4 bg-accent` corner handle), pointer-capture drag/resize with ratio preserved and a 40%-of-limiting-dimension minimum — react is the only import; `Usar recorte` draws the cropped canvas (focused on open), `Enviar sem recortar`/Escape cancels the read entirely (no outcomes, no failure spam — pitfall 7)
- **StatGroupStep (task 2):** new `ocrRunning` (inputs disabled + `animate-pulse` + `Lendo captura…` placeholder, D-17) and `failedFields` props; the locked field-failure message renders under flagged fields (`role="alert" aria-live="polite"`, destructive) and is DEFINED AND EXPORTED here — the single definition site codebase-wide (verified: 1 occurrence); blur parse hints unchanged
- **SubmitPage (task 2):** `ocrRunningStep` + per-step `failedFields` state (both reset in `restartWizard`); `applyOcrOutcomes(step, outcomes)` implements D-15 replace-all-displayed — filled → `handleChange(key, raw)`, failed/unmapped → `handleChange(key, '')` + failure flag, failure set replaced wholesale — ALL through the central edit wrapper so every pre-fill unchecks `stepVerified[step]` exactly like manual typing (T-05-12); `onReadFailed` clears the step's claims without touching inputs; `handleChange` now also clears a field's failure flag on typing (D-14); OcrCapture mounted on all four capture steps (step 1 `basic` above Poder de Combate per D-06; steps 2–4 `STEP_GROUP[step]` above the example-shot list) with the same inline running/failure treatment on the combat_power input
- **Build proof (criterion 3):** `npm run build` green; `dist/ocr/worker.min.js` + `dist/ocr/core/tesseract-core-simd-lstm.wasm` present (self-hosted, prebuild-regenerated); `createWorker` matches — entry chunk `index-C2Plt_5x.js`: **0**, lazy chunk `ocr-DyKqMXa6.js`: **1** (tesseract never in the entry bundle); `FormData` grep across the whole submit feature: **0 matches**; full suite 179/179, `tsc -b` clean

## task Commits

Each task was committed atomically:

1. **task 1: OcrCapture + CropOverlay components (RED → GREEN)** - `63f463c` (test) → `6401f95` (feat)
2. **task 2: wizard integration + production-build verification** - `c95c794` (feat)

## TDD Gate Compliance

- RED gate: `63f463c` — verified failing before implementation (module missing, 0 tests collected)
- GREEN gate: `6401f95` — 6/6 needsCrop tests green after implementation (one mid-GREEN fix: the float-epsilon boundary guard, committed within the GREEN commit)
- Task 2 was not TDD-flagged by the plan (UI wiring; the underlying pure logic — needsCrop, wizard gates — is the tested surface; house pattern: component-level state wiring has no DOM test harness)

## Files Created/Modified

- `src/features/submit/OcrCapture.tsx` - upload CTA + needsCrop + decode/crop/lazy-read flow with run/done/failed status lines and decline-cancels semantics
- `src/features/submit/CropOverlay.tsx` - aspect-locked crop overlay (pointer events only, no library, Escape-safe)
- `src/features/submit/OcrCapture.test.ts` - 6 needsCrop boundary cases (exact-0.12 both sides, 0.121 both sides, basic/general reference pairs, optimal-crop skip)
- `src/features/submit/StatGroupStep.tsx` - running skeleton state, per-field failure rendering, exported locked failure constant
- `src/features/submit/SubmitPage.tsx` - OCR state, applyOcrOutcomes (D-15 via handleChange), read-failed/run-state handlers, four capture-step mounts, combat_power inline treatment

## Decisions Made

- The dynamic-import specifier is `'./ocr'`, not the plan's literal `'../ocr'` (which cannot resolve from `src/features/submit/` and would fail the plan's own `tsc -b` gate) — the lazy-chunk intent is what matters and is build-proven
- `needsCrop(0.95, 0.854)` pins to `false`: the plan's "→ true" contradicted its own formula, parenthetical ("11.2% → false"), and boundary cases — same contradiction class as the 05-01 clamp example
- The exact-12% boundary gets a 1e-9 epsilon: `1.12 - 1` evaluates to `0.1200000000000001` in IEEE-754, which flipped the documented "exactly 0.12 → false" — the epsilon restores the documented semantics without affecting real deviations
- INPT-02 stays Pending by traceability: criteria 1+2 are code-complete (region-based pre-fill + fix-up gate via per-step verification and server re-validation) and criterion 3's build half is proven; 05-05 UAT completes the requirement
- Status lines are per-component (ephemeral on step navigation) while field effects (pre-fill, failure flags) live in the parent — navigating steps never loses read results

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - spec correction] Plan's 11.2% crop case is self-contradictory**
- **Found during:** task 1 (RED, writing the boundary tests)
- **Issue:** the plan's behavior block lists `needsCrop(0.95, 0.854)` → "true (11.2% → false)" — the expected value contradicts its own parenthetical, the binding formula in the action block, and the boundary cases (exactly 0.12 → false)
- **Fix:** the test pins `false` (0.95/0.854 = 1.1123 → 11.2% ≤ 12%) with the contradiction documented in the test header
- **Files modified:** src/features/submit/OcrCapture.test.ts
- **Verification:** 6/6 needsCrop tests green
- **Committed in:** 63f463c / 6401f95

**2. [Rule 1 - bug] IEEE-754 noise flipped the exact-boundary case**
- **Found during:** task 1 (first GREEN run — 1 of 6 failing)
- **Issue:** `1.12/1 - 1` evaluates to `0.1200000000000001` (above the float 0.12), so the documented "exactly 0.12 → false" case returned true
- **Fix:** `needsCrop` compares against `0.12 + 1e-9` — the epsilon absorbs representation noise while 0.001-wide real deviations remain unaffected
- **Files modified:** src/features/submit/OcrCapture.tsx
- **Verification:** all 6 boundary tests green, including both exact-0.12 sides and both 0.121 sides
- **Committed in:** 6401f95

**3. [Rule 3 - Blocking] The plan's lazy-import specifier cannot resolve**
- **Found during:** task 1 (implementation)
- **Issue:** the plan specifies `await import('../ocr')` in OcrCapture.tsx, but from `src/features/submit/` that specifier points at `src/features/ocr` (nonexistent) — the plan's own `npx tsc -b` acceptance gate would fail on the literal path
- **Fix:** used the resolving specifier `await import('./ocr')`; the lazy-boundary intent is fully preserved and build-proven (entry chunk: 0 `createWorker` matches; one dedicated `ocr-*.js` chunk: 1). Literal-gate precedent: 04-01/05-01
- **Files modified:** src/features/submit/OcrCapture.tsx
- **Verification:** `tsc -b` clean; dist chunk inspection proves the split
- **Committed in:** 6401f95

**4. [Rule 1 - literal gate] Own comment quoted the gated FormData token**
- **Found during:** task 2 (running the privacy grep)
- **Issue:** the D-10 comment in OcrCapture.tsx contained the literal `FormData`, making the 0-match grep gate fail against my own doc text
- **Fix:** reworded to "no multipart/upload machinery of any kind" (comments describe, never quote gated tokens — 04-02 discipline)
- **Files modified:** src/features/submit/OcrCapture.tsx
- **Verification:** `FormData` grep across `src/features/submit/*.tsx` + `ocr/*.ts` → 0 matches
- **Committed in:** c95c794

### Documented literal-gate nuance

**5. "Mounts four OcrCapture instances" = 2 JSX sites, 4 runtime instances**
- The plan's own action prescribes exactly this structure: one mount for step 1 (`capture="basic"`) and one shared mount for steps 2–4 (`capture={STEP_GROUP[step]}`), yielding the four captures basic/general/quasi/special. Counted as designed, not contorted into four duplicated JSX blocks.

---

**Total deviations:** 4 auto-fixed (2 spec corrections, 1 float bug, 1 literal-gate hygiene) + 1 documented nuance
**Impact on plan:** None on scope or behavior — every must-have truth is implemented and verified; the auto-fixes were correctness/hygiene requirements the plan's own gates demanded.

## Issues Encountered

- PowerShell console codepage renders non-ASCII as mojibake in Select-String output; all acceptance greps were re-run with match COUNTS and verified via direct file reads — committed files are clean UTF-8

## Security Notes (threat model compliance)

- T-05-11 (mitigate): zero `FormData`/upload paths in the whole submit feature (grep-proven); screenshot bytes live only in memory — the decode bitmap is `close()`d on read completion, crop confirm, and crop decline; the crop overlay draws to canvas, never object URLs
- T-05-12 (mitigate): `applyOcrOutcomes` writes EVERY field through the single central `handleChange` wrapper, so OCR pre-fill unchecks the owning step's verification exactly like manual edits — a stale confirmation can never survive a read (T-05-10 inheritance); `create_submission` re-validates server-side regardless (INPT-03)
- T-05-13 (accept, proven): the lazy import and the whole read chain reject into the D-18 expected-state copy + manual flow — verified by the status-line state machine design
- T-05-14 (mitigate, build-proven): worker.min.js + all core variants ship self-hosted from the version-locked node_modules copy (`dist/ocr/` present); langData remains the data-only CDN fetch (05-01 design)
- No threat surface beyond the plan's register was introduced: zero new network endpoints, zero schema changes

## Known Stubs

None — every rendered value flows from real player inputs (manual typing or OCR pre-fill through the same edit path); no placeholder data paths exist.

## User Setup Required

None — 05-05 UAT will walk the flow in a real browser (runtime half of criterion 3: lazy chunk load on first upload, self-hosted asset fetches, DevTools leak-check).

## Next Phase Readiness

- 05-05 (owner UAT): the complete flow is ready to walk — upload per step, crop prompt on a full screenshot, decline-cancels, re-upload replacement, per-field failure messages, degradation (e.g. devtools offline), manual-only flow, and the locked-copy review; INPT-02 completes there
- Standing Phase-5 note (unchanged): OCR_ACCEPT_CONFIDENCE=85 + sanity ranges are spike-seeded constants; recalibration vehicle = `scripts/convert-spike-regions.mjs` (D-19)

## Self-Check: PASSED

- Files exist: OcrCapture.tsx, CropOverlay.tsx, OcrCapture.test.ts, StatGroupStep.tsx, SubmitPage.tsx, 05-04-SUMMARY.md — all FOUND
- Commits exist: 63f463c (test/RED), 6401f95 (feat/GREEN), c95c794 (feat/task 2) — all FOUND in git log
- Verification re-confirmed at self-check time: 179/179 repo tests green, `tsc -b` clean, `npm run build` green, dist asset + chunk + privacy gates all green

---
*Phase: 05-ocr-auto-read-layer*
*Completed: 2026-10-11*
