---
phase: 05-ocr-auto-read-layer
verified: 2026-10-12T21:45:00Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
open_review_findings:
  - "CR-01 (critical, ADVISORY): create_submission performs no numeric validation on stat values (NaN/Infinity/1e30 storable via direct REST; poisoned values enter the rank cohort). Routed to /gsd-code-review-fix — does not gate this phase: the client OCR/wizard path cannot emit such values (parse + sanity gates), and the mandatory review gate + officer validation (Phase 6) remain the designed backstops."
  - "WR-01..WR-04 + IN-01..IN-07 (advisory): worker whitelist race on concurrent reads, CropOverlay stale-measure on resize, 0010 anon-only revoke, duplicate stat_key acceptance, and 4 info items — all routed to /gsd-code-review-fix, none block a phase must-have."
deferred:
  - truth: "Power-shift significance (only thousands-scale shifts matter between submissions, as a gameplay rule)"
    addressed_in: "v2 deferred domain (DELT-01/HIST-01) — recorded as pending todo"
    evidence: "Owner triage 2026-10-12 (05-UAT.md D-05-UAT-11): part (a) tolerance-based acceptance implemented now; part (b) gameplay rule deferred to future phase per owner directive"
  - truth: "Ahrya (D-05-UAT-7) / step-8 (D-05-UAT-8) acceptance files as harness runs on the actual files"
    addressed_in: "Disposition closed by owner acceptance (not a later phase)"
    evidence: "Owner approved UAT 2026-10-12 with the harness variant grids (B/G/H/E/F) plus the browser walk as evidence; harness acceptance slots stand ready if the files ever land in .secrets/ocr-samples/"
---

# Phase 5: OCR Auto-Read Layer Verification Report

**Phase Goal:** OCR pre-fills stat values to reduce input friction — bolted onto the already-working submit wizard as an accelerator, never a silent authority; the mandatory review gate remains.
**Verified:** 2026-10-12T21:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC1 (as amended):** Uploading a screenshot auto-pre-fills stat values via CLIENT-SIDE OCR with digit/percent whitelisting and canvas preprocessing — never whole-image blind recognition | ✓ VERIFIED | `recognize.ts` wires the structural reader (`structure.ts` 27KB, `locate.ts`) behind the unchanged `readScreenshot` contract; whitelists are explicit (`DIGITS_WHITELIST='0123456789.,%-'`, `PILL_DIGITS_WHITELIST`, `LABELS_WHITELIST` in structure.ts); preprocessing pipeline real (`toGrayscale → adaptive upscale → normalizeContrast/binarize → margin pad → dual polarity`); recognition is always per-rect crop (pill rects / row value cells), never whole-image. **RATIFIED AMENDMENT RECORDED:** the original "region-based pixel-map" wording was owner-directed to a structural reader mid-phase (05-UAT.md round 3, verbatim directive; pivot RED `b2bd1db` → GREEN `35cf99a` → wire `b58fe24`). The criterion's INTENT (client-side auto pre-fill, whitelisted, preprocessed, never whole-image) is fully met — the pixel-map retirement actually STRENGTHENS the "never a silent authority" intent (scale/margin-invariant reads). `regions.ts` retains only the capture aspects for `needsCrop` — no zombie pixel-map path. Proof through the ACTUAL engine: harness grid B (native 56/56 exact on real samples), G (rescales 16/16), H (margins 20/20), E (frame-exact crop 14/14), F (full-phone variant 14/14) — all re-run by this verification, green. |
| 2 | **SC2:** Player must review/fix pre-filled values before acceptance — OCR misreads cannot slip through silently | ✓ VERIFIED | Per-step verification checkboxes (`StepVerifyCheckbox` ×4 in SubmitPage.tsx, Continuar gated `groupComplete && stepVerified`); THE single edit path `handleChange` unchecks the owning step on ANY write — OCR pre-fill flows through it (`applyOcrOutcomes` → `handleChange`, so a read invalidates stale confirmations exactly like typing); validation parity (D-05-UAT-9): one shared rule `fieldValidation.ts` (`statFieldFeedback`/`isFieldEngaged`) consumed at both render sites — OCR-filled fields show the same green check / invalid hint as typed values (`ocrFilledFields` state, commit c6bb579); Revisão Enviar gated on `allStepsVerified` (defense in depth); server re-validation unchanged — `handleSubmit → createSubmission` → `create_submission` v2 (0010, revalidates keys + reject empties). Blank Especial blocks (D-07); Especial blank-field failure message verified in StatGroupStep. Owner-witnessed UAT steps 2–5 + 11 PASS. |
| 3 | **SC3a:** OCR works in the production build (worker/core path bundling verified on Vite) | ✓ VERIFIED | Re-ran by this verification: `npm run build` green (entry 299.69kB + lazy `ocr-emtF670Z.js` 31.58kB); `dist/ocr/worker.min.js` True; `dist/ocr/core/tesseract-core-simd-lstm.wasm` True; `tesseract.js` in dependencies with `predev`/`prebuild` → `ocr:assets` hooks; `.gitignore` covers `public/ocr/`. |
| 4 | **SC3b:** OCR is lazy-loaded (doesn't slow initial page load) | ✓ VERIFIED | `Select-String dist/assets/index-*.js -Pattern "createWorker"` → **0 matches** (fresh build `index-Cf4fHoR_.js`); the dedicated `ocr-*.js` chunk holds the 1 match. The lazy boundary is `await import('./ocr')` in OcrCapture.tsx (only tesseract entry; CAPTURES statically imported from data-only regions.ts). Owner-witnessed in DevTools (UAT step 10b: chunk + worker + wasm load on FIRST upload only). |
| 5 | **SC3c:** Manual entry still works fully when OCR fails | ✓ VERIFIED | D-18 path: any chain failure (decode import/worker/read) → `onReadFailed()` + expected-state status line (`role="status"`), inputs untouched; failed-read clears claims without touching inputs; no-OCR flow intact (05-03 manual realignment preserved). Owner-witnessed UAT step 11 (zero uploads, submits fine) PASS. |
| 6 | **Lifecycle (05-02):** one pending per player (discard-on-resubmit), discarded rows out of rank cohorts, Descartado surfaced | ✓ VERIFIED | `0010_discard_lifecycle.sql`: `update submissions set status='discarded'` in create_submission v2, `submissions_discard_own_pending` policy (using+with check), `grant update (status)`; cohort filter `not in ('rejected','discarded')` appears exactly 2× (my_report + class_top5); `HistoryList.tsx` renders `discarded: 'Descartado'` / `text-muted`; `SubmissionRow` union extended. Live proof: LIFECYCLE SMOKE 11/11 ×2 + rank smoke (recorded 05-02; nothing server-side changed since — this verification did not touch live credentials per instructions). Owner-witnessed UAT step 9 PASS. |
| 7 | Structural reader is substantive and faithful (not a stub), ported from the proven spike | ✓ VERIFIED | `structure.ts` (26.9KB, exports SCREENS grammar, GAME_LABELS vocabulary, detect/assign/matchLabel/resolveConflicts) + `locate.ts` (panel localization) — 05-REVIEW verified the port function-by-function against `scripts/ocr-spike-structural.mjs`; harness runs the ACTUAL `readScreenshot` through it on real samples with exact-value assertions (re-run green this verification). |
| 8 | Crop UX per ratified simplification: 5% trigger, free-form crop, always-confirm, cancel semantics | ✓ VERIFIED | `needsCrop` at `>5% + 1e-9` (owner-ratified 2026-10-11); CropOverlay free-form (gate/example removed per "Remove gate, keep crop" ratification), decline = `Cancelar leitura` + `Leitura cancelada` status line; decode fallback chain (`decodeUpload`) keeps the crop reachable (D-05-UAT-8, commit cfedfc5). Boundary tests + harness A (no-crop on all 11 calibration samples) + harness F (trigger fires on full-phone frames) green. |
| 9 | Validation parity for OCR-filled fields (D-05-UAT-9) | ✓ VERIFIED | `fieldValidation.ts` single shared rule; SubmitPage step-1 combat_power field engaged by `blurred || ocrFilledFields[1].has('combat_power')`; StatGroupStep consumes the same rule via `ocrFilledFields` prop. Pinned by fieldValidation.test.ts + wizard-flow tests (c6bb579). |
| 10 | Owner UAT APPROVED on record | ✓ VERIFIED | 05-UAT.md: all 11 steps PASS (round-4 walk on the structural-reader build; step 8 PASS after cfedfc5); verdict verbatim "approved - lets follow to the next step" (2026-10-12); automated gate results recorded in the same doc. |

**Score:** 10/10 truths verified

### Deferred Items

Items not blocking the goal, explicitly dispositioned by the owner.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Power-shift significance gameplay rule | v2 deferred domain (DELT-01/HIST-01 area) | Owner triage D-05-UAT-11(b): deferred, pending todo recorded; acceptance tolerance (a) implemented now |
| 2 | Ahrya/step-8 acceptance files as harness runs | Closed by owner acceptance | Owner approved UAT with harness variants + walk as evidence; slots ready if files land |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/features/submit/ocr/recognize.ts` | worker lifecycle + readScreenshot contract | ✓ VERIFIED | 345 lines; structural wiring, self-hosted paths, accept gate = parse + sanity |
| `src/features/submit/ocr/structure.ts` / `locate.ts` | structural reader (visual grammar + localization) | ✓ VERIFIED | 27KB / 6.3KB; review-verified faithful spike port; harness-proven |
| `src/features/submit/ocr/regions.ts` | capture aspects only (pixel maps retired) | ✓ VERIFIED | 1.4KB; no zombie region-map read path |
| `src/features/submit/ocr/sanity.ts` | sanity ranges + ratified accept-gate calibration | ✓ VERIFIED | 12 overrides; OCR_ACCEPT_CONFIDENCE removed with in-code calibration evidence (ratified round-1 fix) |
| `src/features/submit/OcrCapture.tsx` | CTA → decode chain → 5% crop gate → lazy read | ✓ VERIFIED | 284 lines; decodeUpload fallback; status state machine; locked CTA string |
| `src/features/submit/CropOverlay.tsx` | free-form crop, always-confirm, cancel | ✓ VERIFIED | Ratified UX; pinned by CropOverlay.test.ts |
| `src/features/submit/SubmitPage.tsx` | per-step gate engine + OCR outcome application | ✓ VERIFIED | 547 lines; single edit path; applyOcrOutcomes D-15; allStepsVerified |
| `src/features/submit/fieldValidation.ts` | shared typed/OCR validation rule | ✓ VERIFIED | Parity rule + INVALID_HINT single definition |
| `src/features/submit/wizard.ts` | REQUIRED_GROUPS incl. special; combat_power-only optional | ✓ VERIFIED | 15-test suite green |
| `supabase/migrations/0010_discard_lifecycle.sql` | discard lifecycle + cohort filters | ✓ VERIFIED | All structural checks pass (see truth 6) |
| `supabase/seeds/stat_catalog.sql` | 6 damage stats reclassified flat | ✓ VERIFIED | All 6 keys `'flat'` in seed (D-05-UAT-10); live re-seed recorded as applied in verification context |
| `scripts/ocr-browserport-harness.test.mjs` | permanent exact-value harness | ✓ VERIFIED | 28KB; grids A/B/G/H/E/F re-run green on real `.secrets/ocr-samples/` |
| `.planning/.../05-UAT.md` | owner UAT record + verdict | ✓ VERIFIED | APPROVED 2026-10-12, all steps PASS |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| OcrCapture.tsx | ocr engine | `await import('./ocr')` (lazy boundary) | ✓ WIRED | Only tesseract entry; entry chunk 0 createWorker matches proves the split |
| OcrCapture.tsx | ocr/regions.ts | static `CAPTURES` import | ✓ WIRED | Data-only module; needsCrop + overlay aspect |
| SubmitPage.tsx | wizard.ts | `groupComplete(catalog, STEP_GROUP[step], inputs)` + stepVerified gate Continuar | ✓ WIRED | Lines 534 + 523 |
| SubmitPage.tsx | ReviewStep.tsx | `allStepsVerified` prop gates Enviar | ✓ WIRED | Line 493 |
| recognize.ts | src/lib/parseStatValue.ts | `import { parseStatValue }` — no second parser | ✓ WIRED | Line 35; grep: no local parse re-implementation |
| recognize.ts | tesseract.js | `createWorker('eng', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/core' })` | ✓ WIRED | Line 82; self-hosted assets in dist |
| package.json | copy-ocr-assets.mjs | predev/prebuild hooks | ✓ WIRED | `"prebuild": "npm run ocr:assets"` present |
| 0010 SQL | 0005 create_submission | `create or replace function create_submission` + discard step | ✓ WIRED | Supersede verified; cohort filter ×2 |
| HistoryList.tsx | api.ts | status union + STATUS_LABELS | ✓ WIRED | `discarded: 'Descartado'`, union extended |
| StatGroupStep.tsx / SubmitPage.tsx | fieldValidation.ts | shared `statFieldFeedback` on both render sites | ✓ WIRED | Parity for OCR-filled fields |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| OcrCapture/SubmitPage | `inputs` (GroupInputs) | real OCR outcomes (`readScreenshot` on the uploaded bitmap) or manual typing — both via `handleChange` | Yes | ✓ FLOWING |
| SubmitPage | `ocrFilledFields` / `failedFields` | replaced wholesale per fresh read from actual `OcrFieldOutcome[]` | Yes | ✓ FLOWING |
| StatGroupStep | `entries` | live catalog via `fetchCatalog(session)` (57-stat RPC) | Yes | ✓ FLOWING |
| Harness | expected values | `.secrets/ocr-samples/` real screenshots, runtime-read only (never committed) | Yes | ✓ FLOWING |

No hardcoded empty props at call sites; initial empty Sets are state overwritten by reads — not stubs.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full test suite incl. real-sample harness | `npx vitest run` | 17 files, **284/284** passed; harness grids A (no-crop 11 samples), B (native 56/56 exact), G (16/16), H (20/20), E (14/14), F (14/14) all green through the ACTUAL `readScreenshot` | ✓ PASS |
| Type check | `npx tsc -b` | clean, zero errors | ✓ PASS |
| Production build | `npm run build` | green; entry 299.69kB + lazy ocr chunk 31.58kB | ✓ PASS |
| Self-hosted assets in dist | `Test-Path dist/ocr/worker.min.js` / `...wasm` | True / True | ✓ PASS |
| Lazy-chunk gate | `Select-String dist/assets/index-*.js -Pattern "createWorker"` | 0 matches (ocr chunk: 1) | ✓ PASS |
| Privacy gate (D-10) | grep `FormData` in `src/features/submit/**` | 0 matches | ✓ PASS |
| Live smokes (lifecycle/rank) | `node scripts/smoke-*.mjs` | NOT RUN — live credentials excluded per instructions; 05-02 recorded evidence (11/11 ×2, rank pass) stands | ? SKIP (recorded evidence) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| INPT-02 | 05-01, 05-02, 05-03, 05-04, 05-05 | OCR auto-reads screenshots (client-side) and pre-fills values, with the mandatory review/fix-up gate | ✓ SATISFIED | All three roadmap criteria verified above (truths 1–5); owner UAT APPROVED 2026-10-12. Note: REQUIREMENTS.md traceability currently shows INPT-02 **Pending** — per the 05-05 plan's key-link pin, the verification chain (not a hand edit) marks it Complete on this verification passing. |

Orphaned requirements: none — every Phase 5 requirement ID in REQUIREMENTS.md (only INPT-02) is declared in all 5 plans' frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| StatGroupStep.tsx / SubmitPage.tsx | various | "placeholder" grep hits | ℹ️ Info | False positives — the D-17 reading-skeleton `placeholder` attribute and a step-indicator `'todo'` state label; legitimate UI |
| 0010_discard_lifecycle.sql | 104–106 | CR-01: no numeric validation on stat values (blind numeric cast) | ⚠️ Warning (advisory) | Direct-REST tampering surface for rank cohorts — routed to /gsd-code-review-fix; not reachable through the shipped client path and does not gate the phase must-haves (see open_review_findings) |

No TODO/FIXME/return-null/empty-handler stubs in any phase file.

### Open Review Findings

05-REVIEW.md (1 critical, 4 warnings, 7 info) is **ADVISORY and routed to /gsd-code-review-fix** per instructions — none gate this phase. Most relevant to note: **CR-01** (create_submission numeric blind-cast) touches SC2's "server re-validation" backstop: the RPC re-validates stat keys and rejects empty stats, but does not numerically validate values against direct-REST garbage. The client OCR/wizard path cannot produce such values (parse + sanity gates at every layer), so criterion 2's intent — OCR misreads cannot slip through silently — holds; the fix belongs to the review-fix cycle before Phase 6 officer validation leans on cohort integrity.

### Human Verification Required

None outstanding. All runtime/visual claims were human-verified by the owner in a real browser on the production-shaped build (vite preview, 2026-10-12): pre-fill behavior, fix-up gate, crop tool, degradation, manual-only path, lazy-load DevTools checks, and the discard lifecycle — 11/11 steps PASS, verdict **APPROVED** on record in 05-UAT.md.

### Gaps Summary

None. All 10 merged must-haves verified against the actual codebase; every automated gate re-run by this verification passes (284/284 suite incl. the real-sample exact-value harness, tsc clean, build green, entry-chunk/FormData/dist-asset gates holding); the owner UAT is APPROVED with the full 4-round defect history dispositioned. The structural-reader pivot (owner-directed round 3) is recorded as the ratified amendment to SC1's original "region-based" wording — the criterion's intent is met and strengthened. Deferred items (power-shift rule, acceptance-file slots) are owner-dispositioned and non-blocking.

---

_Verified: 2026-10-12T21:45:00Z_
_Verifier: OpenCode (gsd-verifier)_
