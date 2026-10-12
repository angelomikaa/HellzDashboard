---
status: resolved
trigger: "Phase 5 owner UAT BLOCKED by 3 OCR defects: crop overlay appears on every upload (incl. optimal samples), high rate of wrong pre-filled values on optimal input, some reads fail completely. Spike scored 222/222 on the same samples in Node."
created: 2026-10-11T00:00:00Z
updated: 2026-10-12T21:50:00Z
resolution: "All three rounds closed: round-1 defects D-05-UAT-1/2/3 (5% crop trigger, spike-parity accept gate), round-2 D-05-UAT-4/5/6 (no code defect; ratified UX changes, later superseded by the structural-reader 'Remove gate, keep crop'), round-3 ARCHITECTURE PIVOT implemented (structural reader wired behind the unchanged readScreenshot contract; harness grids B/G/H/E/F exact). Owner UAT APPROVED 2026-10-12 (all 11 steps PASS). The D-05-UAT-7 Ahrya acceptance file never landed in .secrets/ocr-samples/ — acceptance stands via the harness variants + the approved walk. Final state: suite 284/284, tsc clean, build green, criterion-3 gates holding."
symptoms_prefilled: true
goal: find_and_fix
---

# ROUND 2 — CropOverlay defects D-05-UAT-4/5/6 (owner re-walk after round-1 fixes)

Owner report (verbatim, round 2): "crop tool is appearing incorrectly and cropping incorrenctly
(it forces the crop into a square, optimal input is a rectangle, send without cropping doesnt
work, and square, unoptimal cropping forced by the cropping tool working in a way that is not
intended still is unable to read any values." Observed during the step-8 walk (full phone
screenshot — the crop appearing there IS by design under the 5% gate).

## Current Focus

hypothesis: (R2-H1, D-05-UAT-4) The "forced square" is NOT a 1:1 lock: src AND dist bytes prove
  the box model is `height = width / CAPTURES[capture].aspect` everywhere (verified in the
  compiled entry chunk index-CYbfIruJ.js). But general/quasi/special lock at aspects
  0.8538/0.8867/0.8299 => box h/w = 1.17/1.13/1.20 — visually NEAR-SQUARE tall rectangles that
  exactly match the tall calibration frames (648x759 etc.); only basic (1.6611) is a wide
  rectangle. If the owner walked step 8 at a step 2-4 lock with a wide/basic-content
  screenshot, the lock box looks square-ish, cannot cover the wide panel, and any confirmed
  crop reads zero — matching every clause of the report. (R2-H2, D-05-UAT-5) The decline
  button is fully wired in dist (onClick -> cancel handler -> bitmap.close, overlay unmount,
  status idle, onRunStateChange(false)); ratified semantics are spec'd in 05-UI-SPEC
  ("decline -> idle", silent) — "doesn't work" is either the label-semantics mismatch
  ("Enviar sem recortar" reads as 'proceed uncropped' but cancels) or the silent-idle giving
  zero visible feedback. (R2-H3, D-05-UAT-6) Zero values after a rough/mismatched crop is the
  harness-D mechanism (regions scaled to the cropped bitmap require a frame-exact crop; the
  default centered-80% box measured 0/14); the crop->read contract itself (rectToPixels
  against cropped dims) is correct and must be PROVEN by a correct-aspect frame-exact crop
  reading 14/14.
test: (1) Pin the overlay geometry with unit tests: export maxBoxWidth/clampPosition/defaultBox
  and assert the default box ratio == capture aspect for all four captures (never 1:1).
  (2) Extend the harness: E1 full-screenshot -> needsCrop true -> aspect-locked frame-exact
  crop -> readScreenshot -> 14/14 exact; E2 same screenshot square-cropped around the panel
  (the owner's claimed tool behavior) -> ~zero reads; E3 decline-path: no read, no outcomes.
  (3) Re-verify all 11 samples' dims match their recorded calibration resolutions and the
  canonical 4 stay no-crop at the 5% gate.
expecting: E1 14/14 proves the crop->read contract; E2 near-zero proves a square crop (if it
  were ever forced) yields exactly the owner's zero-value symptom; the geometry pins pass
  immediately (byte-verified behavior) — if any pin FAILS, the real defect is found and gets a
  RED->GREEN fix.
next_action: Write the geometry pin tests + harness extension (E1/E2/E3 + all-11 re-verify),
  run them against the shipped code, record results, then write dispositions + re-walk
  guidance; owner-decision items (decline label/feedback copy) go to the checkpoint, not
  unilateral spec changes.

## Symptoms

expected: On the spike-calibrated optimal samples (.secrets/ocr-samples/sampbasic.png,
  sampideal1-3.png), uploading to the matching wizard step must (a) NOT trigger the crop
  overlay, (b) pre-fill every mapped field with the exact spike-verified value (spike scored
  222/222 = 100.0% on these same samples in Node), (c) show "Leitura concluída".
actual: (D-05-UAT-1) Crop overlay "Ajuste o recorte da captura" appears on EVERY upload,
  including the optimal samples. (D-05-UAT-2) High rate of WRONG values pre-filled when
  reading optimal input. (D-05-UAT-3) Some reads fail COMPLETELY (all fields failing/blank).
errors: No specific error messages captured by the owner; UI shows failed-read status lines.
reproduction: npm run preview at localhost:4173, login, open Enviar Status, upload
  sampbasic.png / sampideal1-3.png at their matching steps.
started: First owner UAT walk attempt of Phase 5 (2026-10-11), commit 8d7e6d3 (src tree c95c794).

## Eliminated

## Evidence

- timestamp: 2026-10-12 initial code review
  checked: scripts/ocr-regions.json calibration resolutions vs generated regions.ts aspects
  found: sampbasic 691x416 -> aspect 1.6611; sampideal1 648x759 -> 0.8538; sampideal2
    673x759 -> 0.8867; sampideal3 649x782 -> 0.8299. regions.ts aspects match these recorded
    resolutions exactly (generator is consistent with its input).
  implication: The generator faithfully converts pixel rects to fractions of the RECORDED
    resolution. Whether those recorded resolutions match the REAL PNG files is unverified —
    that is the H1 experiment.

- timestamp: 2026-10-12 initial code review
  checked: browser pipeline order (OcrCapture handleFile -> needsCrop -> readScreenshot ->
    prepareCandidates) vs spike pipeline (preprocessRegion)
  found: Both pipelines: crop -> grayscale -> 3x upscale -> normalize -> threshold(140) ->
    dual polarity when binarized mean < 128. Browser upscale uses canvas high-quality
    smoothing (documented deviation from sharp cubic). Browser adds gates the spike did not
    have: confidence >= 85 + sanityAccepts before pre-fill.
  implication: Pipeline order is faithful; the added gates could turn borderline reads into
    'failed' (contributes to D-3), but cannot explain WRONG values passing. Geometry
    displacement (H1) remains the best candidate for D-2.

## Evidence (continued)

- timestamp: 2026-10-12 experiment E-dims
  checked: Actual PNG dimensions of all 11 .secrets/ocr-samples files (sharp metadata)
    vs scripts/ocr-regions.json recorded resolutions; needsCrop(actualAspect, CAPTURES aspect).
  found: ALL 11 files match their recorded calibration dims EXACTLY (sampbasic 691x416,
    sampideal1 648x759, sampideal2 673x759, sampideal3 649x782, samp1-7...). needsCrop
    computes FALSE for every canonical sample at its canonical capture (max deviation
    0.01% vs 12% threshold).
  implication: D-05-UAT-1 CANNOT be reproduced from the shipped code + the exact sample
    files: crop mathematically cannot fire on them. The crop firing on every upload is
    consistent with the owner uploading FULL phone screenshots (their real workflow
    captures), where aspect deviation is ~45-95% and the crop correctly fires every time.

- timestamp: 2026-10-12 experiment E-exif
  checked: PNG chunk structure of all 11 samples (eXIf / iTXt XMP orientation)
  found: NO eXIf chunk on any sample. sampbasic has NO metadata chunks at all. The 10
    others carry only an iTXt XMP chunk with tiff:Orientation=1 (normal).
  implication: browser createImageBitmap('from-image') decodes intrinsic dims for these
    files; no orientation divergence between spike (raw pixels) and browser. EXIF
    hypothesis ELIMINATED.

- timestamp: 2026-10-12 experiment E-dist
  checked: shipped dist bytes (dist/assets/index-C2Plt_5x.js, ocr-DyKqMXa6.js built at
    commit 8d7e6d3) vs src: CAPTURES aspects (1.6611/.8538/.8867/.8299), needsCrop
    constants, imageOrientation, worker/core paths.
  found: dist contains the exact src aspects; needsCrop compiled as
    `Math.abs(e/t-1)>.120000001` (minifier-folded 0.12+1e-9, behaviorally identical);
    worker.min.js + /ocr/core paths present in the lazy chunk.
  implication: stale-build hypothesis ELIMINATED — the owner ran byte-equivalent code.

- timestamp: 2026-10-12 code review E-wiring
  checked: tesseract.js 7.0.0 browser wiring (spawnWorker blob+importScripts, getCore
    corePath resolution, loadLanguage default langPath, loadImage canvas→PNG via toBlob)
  found: wiring is coherent for same-origin vite preview: blob worker importScripts
    resolves '/ocr/worker.min.js' against the document base; corePath '/ocr/core' +
    '/tesseract-core-simd-lstm.wasm.js' exists in dist; langData fetched from
    jsdelivr @tesseract.js-data/eng/4.0.0_best_int (research doc said
    tessdata.projectnaptha.com — doc drift only, same purpose).
  implication: no obvious wiring defect; and the owner's report of WRONG VALUES at a high
    rate proves the worker DID run (a dead worker yields uniform failures, not wrong
    values). D-3 total failures are consistent with misaligned regions hitting
    non-digit pixels (whitelist → parse fail → 'failed' per field).

- timestamp: 2026-10-12 causal analysis
  checked: CropOverlay default behavior (auto-focused confirm button, default box =
    80% of maxBoxWidth CENTERED) vs region-map alignment tolerance
  found: The overlay's confirm button is AUTO-FOCUSED and the default box is a centered
    80% crop. Region rects tolerate only ~2% frame misalignment (rows are ~46px pitch on
    a 759px frame; regions are ~31px tall). A one-click "Usar recorte" on any full
    screenshot produces a frame that displaces every region systematically.
  implication: Strong mechanism candidate for D-2/D-3 under the owner's real workflow:
    every upload fires the crop (correctly, for full screenshots) → owner confirms the
    default/rough box → regions read neighboring rows/labels → wrong values pre-fill
    (parseable garbage) or all fields fail (labels/background under a digits-only
    whitelist). REMAINS TO BE PROVEN by harness experiment B.

## Current Focus (updated — pre-fix reasoning checkpoint)

reasoning_checkpoint:
  hypothesis: "The browser port's ONLY in-pipeline divergence from the owner-validated
    spike is the OCR_ACCEPT_CONFIDENCE=85 accept gate (a 05-01 seed constant the spike
    never had). On the real canonical samples the port's OCR reads are 56/56 exact
    (harness C), but 5 correct reads carry confidences 0.0/63/70/79/82 — Tesseract's
    mean confidence is unreliable on 1-6 glyph reads — and are rejected (harness B:
    51/56 filled, all 51 exact, zero wrong). D-05-UAT-1 (crop on every upload) is
    UNREPRODUCIBLE on the sample bytes (harness A + dist-byte check) — the crop fires
    only on frames with >12% aspect deviation (full phone screenshots or
    differently-cropped copies), i.e. the locked D-05 formula working as specified on
    the owner's real uploads. D-05-UAT-2/3 at the reported rate come from
    displaced regions on non-calibration frames: the crop overlay's DEFAULT centered-80%
    confirm box produces 0/14 all-failed (harness D — D-3 reproduced), and
    one-row-displaced frames read the neighboring row's digits — parseable, sanity-passing
    WRONG values (D-2 mechanism); only the mandatory human verification (D-08/D-22)
    catches those, per the locked design."
  confirming_evidence:
    - "harness B (actual readScreenshot, canonical samples): 51/56 filled, 51/51 exactly correct — the engine produces ZERO wrong values on calibration frames"
    - "harness C (diagnostic replica): 56/56 best-reads EXACT vs expected.json; the 5 rejects fail ONLY the confidence>=85 term (confs 0.0, 79, 70, 63, 82); parse+sanity pass on all 56"
    - "harness A: needsCrop=false on all four canonical optimal samples; dist bytes hold the identical formula and aspects"
    - "harness D: full screenshot → needsCrop=true (D-1 for the owner's real input) → default centered-80% crop confirm → 0/14 correct, all fields failed (D-3 reproduced offline)"
  falsification_test: "If the confidence gate is not the in-pipeline divergence, removing
    the confidence term from the accept condition leaves harness B below 56/56 (parse or
    sanity failures would remain). If crop-on-samples were a code bug, harness A would
    have failed."
  fix_rationale: "Recalibrate the accept gate to the spike-validated semantics: accept =
    parse ok && sanity ok; confidence remains ONLY the pickBestRead tiebreak (spike
    recognizeBest scoring, verbatim). STATE.md's standing note explicitly flagged
    OCR_ACCEPT_CONFIDENCE=85 as a seed needing production-data calibration; the
    production data proves ANY threshold > 0 rejects correct reads (a correct single-'0'
    read carries confidence 0.0). Safety is preserved by sanity ranges, dual-polarity
    scoring, mandatory per-step human verification (D-08/D-22), and server-side
    re-validation (INPT-03). Crop-path misalignment gets a documented disposition (not
    a code defect within the locked specs: D-14/D-15 semantics and the 12% trigger are
    pinned by plans 05-03/05-04; the 12% looseness is proposed to the owner as a
    ratified-call, not changed unilaterally)."
  blind_spots: "The owner's exact upload files are not observable from here; the
    crop-on-samples claim rests on their report and cannot be reproduced by the shipped
    bytes — dispositioned as input framing and pinned by harness test A. The browser's
    own canvas/Skia upscale and worker runtime are only runtime-provable at the owner
    re-walk (D-18 covers CDN/worker failure). The langData fetch depends on jsdelivr
    reachability from the owner's network."

## Evidence (continued — harness measurements)

- timestamp: 2026-10-12 harness A (needsCrop on canonical samples)
  checked: needsCrop(realAspect, CAPTURES aspect) for basic←sampbasic, general←sampideal1,
    quasi←sampideal2, special←sampideal3
  found: false on all four (max deviation 0.01% vs the 12% threshold) — PASS
  implication: The optimal-sample path never triggers the crop in the shipped code;
    pinned permanently by harness test A.

- timestamp: 2026-10-12 harness B (ACTUAL readScreenshot on canonical samples)
  found: 56 fields → 51 filled, 51/51 exactly correct, 5 failed
    (sampideal1:refine_mdef, sampideal2:variable_ct, sampideal2:fixed_ct,
    sampideal2:healing_done, sampideal3:equip_patk_pct). ZERO wrong values.
  implication: The ported engine is faithful on calibration frames; the only casualty
    source is an added gate, not geometry/preprocessing/OCR divergence.

- timestamp: 2026-10-12 harness C (diagnostic replica, gate decomposition)
  found: best reads are 56/56 EXACT vs expected.json. The 5 rejects fail ONLY the
    confidence>=85 term: confidences 0.0 (refine_mdef "0"), 79 (variable_ct "0"),
    70 (fixed_ct "0"), 63 (healing_done "32.14%"), 82 (equip_patk_pct "74.12%").
    All other reads: conf 87-96. Only sampbasic:combat_power needed dual polarity.
  implication: OCR_ACCEPT_CONFIDENCE=85 is miscalibrated for this content — Tesseract
    mean confidence is meaningless on very short reads. Any threshold > 0 rejects
    correct reads on the spike-aced samples. The spike (owner-validated truth) had no
    confidence accept-gate.

- timestamp: 2026-10-12 harness D (owner-flow reproduction)
  found: full screenshot (1080x2280, panel at (216,420)) → needsCrop TRUE; crop
    overlay DEFAULT box (80% of maxBox, centered) → confirm → readScreenshot('general'):
    correct=0/14, failedFields=14/14 — a completely failed reading (D-05-UAT-3 signature).
  implication: The crop-confirm path has no alignment safeguard; a one-click confirm
    yields a frame that displaces every region. Slightly different drags land regions on
    neighboring value rows → parseable wrong pre-fills (D-05-UAT-2 signature).

## Evidence (continued — fix + verification)

- timestamp: 2026-10-12 fix applied
  checked: accept-gate recalibration (spike parity) in recognize.ts + sanity.ts
  found: OCR_ACCEPT_CONFIDENCE removed from the accept path; accept = parseStatValue ok
    && sanityAccepts; confidence remains only inside pickBestRead tiebreak (spike
    recognizeBest scoring verbatim). sanity.test.ts pins the recalibration (the module
    no longer exports a confidence constant).
  implication: The engine now reproduces the spike's acceptance semantics exactly.

- timestamp: 2026-10-12 harness re-run (post-fix proof)
  found: harness B (ACTUAL readScreenshot, canonical samples): 56/56 fields filled and
    56/56 exactly correct — the spike bar reproduced. Harness A: needsCrop false on all
    four optimal samples. Harness D still documents the crop-misalignment mechanism
    (0/14 on the default centered-80% confirm box) as a permanent regression-documenting
    test.
  implication: D-05-UAT-2/3's in-pipeline component is FIXED and PROVEN on the real
    samples.

- timestamp: 2026-10-12 full verification chain
  found: `npx vitest run` → 13 files, 183/183 green (179 pre-existing + 4 harness);
    `npx tsc -b` → clean; `npm run build` → green; entry chunk `createWorker` = 0
    matches (lazy chunk ocr-BNAwpiWw.js holds it); dist/ocr/worker.min.js +
    dist/ocr/core/tesseract-core-simd-lstm.{wasm,wasm.js} present; FormData = 0 matches
    in src/features/submit.
  implication: all INPT-02 criterion-3 build gates hold after the fix.

- timestamp: 2026-10-12 worker-wiring HTTP proof (H2 closure)
  checked: the exact URLs the browser code builds, fetched against the running
    `vite preview` at localhost:4173 (post-rebuild dist) + the default langData CDN
  found: /ocr/worker.min.js → 200 text/javascript (111307 B);
    /ocr/core/tesseract-core-simd-lstm.wasm.js → 200 (3899472 B);
    /ocr/core/tesseract-core-simd-lstm.wasm → 200 application/wasm;
    /ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js → 200;
    https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz
    → 200 application/gzip (2952873 B).
  implication: worker/core/lang wiring under vite preview is fully servable — the
    "completely failed readings" were NOT asset wiring; they are explained (and
    reproduced offline) by frame misalignment plus the (now recalibrated) gate.

## Resolution

root_cause: Three distinct causes, one per defect:
  D-05-UAT-1 (crop on every upload): NOT reproducible on the spike sample bytes — the
    shipped needsCrop formula and CAPTURES aspects are correct (dist bytes verified;
    harness test A pins needsCrop=false on all four canonical samples, deviation
    ≤0.01% vs the 12% threshold). The crop fired on every upload because the owner's
    real uploads were frames with >12% aspect deviation — full phone screenshots or
    differently-cropped copies of the optimal screens (the locked D-05 formula then
    correctly offers the crop each time).
  D-05-UAT-2 (wrong values at a high rate): region fractions are valid ONLY on the
    calibration frame. Frames that pass the 12% aspect gate uncropped (e.g. samp2 vs
    general = 13.6% fires the crop, but samp2 vs quasi = 9.4% passes uncropped) or
    crop-confirm boxes that are not frame-exact (the overlay's DEFAULT centered-80%
    box, one click on the auto-focused confirm) displace every region onto
    neighboring rows/labels → parseable-but-wrong values pre-fill (digits-only
    whitelist + generous sanity accept neighboring rows' numbers). On EXACT frames
    the engine produces zero wrong values (harness: 56/56 reads exact).
  D-05-UAT-3 (reads failing completely): (a) the same frame-misalignment mechanism —
    reproduced offline: default crop box → 0/14 fields, all failed; (b) the
    OCR_ACCEPT_CONFIDENCE=85 seed gate rejected 5/56 CORRECT reads even on exact
    frames (Tesseract mean confidence is unreliable on 1-6 glyph reads: confidences
    0.0/63/70/79/82, all values exact vs expected.json) — the spike (owner-validated
    222/222) never gated on confidence.
fix: Accept-gate recalibration to spike parity (the code defect): accept = parseStatValue
  ok && sanityAccepts (recognize.ts); OCR_ACCEPT_CONFIDENCE removed (sanity.ts) with the
  calibration evidence documented in-code; confidence remains only the pickBestRead
  tiebreak (sp recognizeBest scoring, verbatim); sanity.test.ts pins the recalibration.
  D-05-UAT-1's formula needs no code change (correct + pinned by harness test A);
  D-05-UAT-2/3's frame-misalignment component is a documented disposition + owner
  guidance (use panel-cropped captures like the spike samples; the mandatory per-step
  human verification D-08/D-22 is the designed backstop for rough crops), with a
  ratified-call proposal to the owner: tighten the 12% crop trigger so
  aspect-close-but-differently-framed uploads route to the crop overlay instead of
  reading garbage uncropped.
verification: Offline exact-value harness on the REAL samples
  (scripts/ocr-browserport-harness.test.mjs, committed, skip-guarded on .secrets):
  harness B = 56/56 fields filled and exactly correct through the ACTUAL readScreenshot
  (the spike's bar on the shipped region maps; the spike's 222/222 additionally covered
  per-sample text/common maps not shipped at runtime). Full suite 183/183 green;
  npx tsc -b clean; npm run build green; entry-chunk createWorker 0 matches; self-hosted
  worker/core assets in dist verified over HTTP (200s incl. correct MIME) against the
  running vite preview; langData CDN reachable (200). Remaining runtime proof (real
  browser, first-upload lazy chunk load, no image bytes on the wire) is the owner's
  UAT re-walk (05-UAT.md steps 1-11).
files_changed:
  - src/features/submit/ocr/recognize.ts (accept gate recalibrated; confidence removed from accept)
  - src/features/submit/ocr/sanity.ts (OCR_ACCEPT_CONFIDENCE removed; calibration note)
  - src/features/submit/ocr/sanity.test.ts (pins the recalibration)
  - scripts/ocr-browserport-harness.test.mjs (offline exact-value proof harness, new)
  - .planning/phases/05-ocr-auto-read-layer/05-UAT.md (defect dispositions appended)
  - .planning/debug/d05-uat-ocr-defects.md (this record)

## Owner-Ratified Calibration Change — 5% Crop Trigger (2026-10-11)

decision_checkpoint_answered: The ratified-call proposal in the resolution above (tighten the
  12% crop trigger so aspect-close-but-differently-framed uploads route to the crop overlay
  instead of reading garbage uncropped) was answered by the owner on 2026-10-11: RATIFIED —
  tighten to 5% aspect deviation (exclusive boundary; the 1e-9 epsilon semantics kept).
rationale: The D-05-UAT-2 mechanism showed frames in the 5-12% band (e.g. samp2 vs quasi =
  9.4%) passing the old gate uncropped and producing parseable-but-wrong pre-fills. At 5%,
  those misaligned uploads reach the crop overlay instead. The 11 exact calibration samples
  deviate at most 0.01% from their calibration aspects — they remain no-crop (re-proven
  below through the shipped needsCrop).
threshold_changed:
  - src/features/submit/OcrCapture.tsx: CROP_DEVIATION_MAX 0.12 -> 0.05 (comments updated;
    exclusive + epsilon semantics unchanged)
  - src/features/submit/OcrCapture.test.ts: boundary tests re-pinned to the 5% gate (TDD:
    RED 4-failed against the 12% implementation, then GREEN) — exactly 0.05 -> false;
    0.0501 -> true; 9.4% (samp2 vs quasi) -> true; the old 0.12 cases -> true; the exact
    calibration frames (<=0.01%) -> false
  - src/features/submit/CropOverlay.tsx: doc comment aligned (>12% -> >5%)
  - harness test A needed no change: it pins needsCrop=false on the canonical samples
    against the shipped CAPTURES aspects, which holds at 5% (it never asserted the literal
    12% formula)
evidence (re-run 2026-10-12 post-change):
  - full suite `npx vitest run`: 13 files, 187/187 green (includes harness A-D on the real
    samples; A re-proves no-crop on all four canonical optimal samples through the ACTUAL
    shipped 5% needsCrop; B re-proves 56/56 exact; D re-proves the full screenshot still
    fires the crop)
  - all 11 samples (sharp metadata vs recorded calibration resolutions): deviation 0.0000%
    each — needsCrop=false at the 5% gate for every sample on its own calibration frame
  - `npx tsc -b` clean; `npm run build` green; entry chunk createWorker 0 matches (lazy
    ocr-joxhRLpY.js holds the 1); FormData 0 matches in src/features/submit;
    dist/ocr/worker.min.js + dist/ocr/core/tesseract-core-simd-lstm.{wasm,wasm.js} present;
    dist entry formula compiles as `Math.abs(e/t-1)>.050000001` (epsilon convention
    consistent with the prior `.120000001` fold)


## Evidence (continued � round 2 investigation)

- timestamp: 2026-10-12 R2 code+dist review (D-05-UAT-4 aspect-lock source)
  checked: src/features/submit/CropOverlay.tsx, OcrCapture.tsx, and the COMPILED dist entry
    (dist/assets/index-CYbfIruJ.js) around the overlay component; git history of CropOverlay
  found: The lock is CAPTURES[capture].aspect at the call site (src line 197 and compiled
    spect:nn[e].aspect); box height is ox.w / aspect in the initial-box effect, the
    clamp, the resize bound, the confirm drawImage, the cropped-canvas dims, AND the rendered
    style (height:c.w/t). CropOverlay has exactly 2 commits (6401f95, f5e32c1) � NO version
    ever carried a 1:1/square lock. CAPTURES aspects in dist: 1.6611/.8538/.8867/.8299 � none
    is 1. The default centered-80% box uses the same aspect (same formulas).
  implication: Hypothesis "lock reads wrong source / hardcoded 1:1 / missing-aspect default"
    is ELIMINATED at byte level for src and dist. A literal square box is impossible in any
    shipped build.

- timestamp: 2026-10-12 R2 geometry analysis (the near-square shapes)
  checked: default box h/w = 1/aspect per capture, vs the calibration frames
  found: basic 0.602 (wide, like 691x416); general 1.171, quasi 1.128, special 1.205 �
    near-square TALL rectangles that match the tall calibration frames exactly (sampideal1
    648x759 => 1.171, sampideal2 673x759 => 1.128, sampideal3 649x782 => 1.205). The
    near-square look at steps 2-4 is the CORRECT lock; only step 1 (basic) yields a wide box.
  implication: The owner's "it forces the crop into a square, optimal input is a rectangle"
    is coherently explained by walking step 8 at a step-2/3/4 lock (near-square box) with a
    wide/basic-content screenshot (691x416 = 1.66): the lock prevents the wide selection,
    and the forced near-square crop then reads zero. Tool working AS SPECIFIED (05-UI-SPEC:
    "lock ratio = reference aspect"), but nothing in the UI tells the player which frame
    shape the step expects � a UX gap to surface to the owner, not a code defect.

- timestamp: 2026-10-12 R2 cancel-path review (D-05-UAT-5)
  checked: compiled OcrCapture cancel handler (m) + CropOverlay decline wiring + wizard
    callbacks (SubmitPage handleOcrRunState/applyOcrOutcomes/handleOcrReadFailed)
  found: Decline button onClick and Escape both route to the cancel handler: bitmap.close(),
    cropBitmap=null (overlay unmounts), status 'reading'->'idle', onRunStateChange(false)
    (wizard un-skeletons inputs). No outcomes, no onReadFailed � no pre-fill, no failure
    spam, manual entry intact. This is EXACTLY the ratified D-05 semantics, and 05-UI-SPEC
    state matrix line "decline -> idle" makes the silent return spec'd behavior.
  implication: No functional defect in the cancel path (src, dist, and wiring all verified).
    The report is explained by (a) label semantics � "Enviar sem recortar" (Send without
    cropping) reads as 'proceed uncropped' while the ratified behavior cancels the read; and
    (b) the spec'd silent idle giving zero visible feedback. Changing label/copy or adding a
    cancelled-status line = UI-SPEC copy-table deviation => OWNER DECISION, not unilateral.

- timestamp: 2026-10-12 R2 crop->read contract review (D-05-UAT-6)
  checked: readScreenshot (recognize.ts) � rectToPixels(region.rect, image.width,
    image.height) against the CROPPED canvas dims; regions are fractions of the capture frame
  found: the contract is correct: an aspect-preserving, frame-exact crop reproduces the
    calibration frame exactly, so fractions land on the right pixels. Frame-exactness is the
    binding constraint: regions tolerate ~2% displacement (round-1 harness D measured the
    default centered-80% box at 0/14 fields). To be PROVEN by harness E1/E2 below.
  implication: zero values after the owner's rough/near-square crop is the EXPECTED
    consequence of a non-frame-exact crop (mechanism already pinned by harness D); the
    contract itself needs the positive proof (correct-aspect frame-exact crop -> 14/14).

## Resolution (round 2 — 2026-10-12)

- **Harness construction bug found and fixed (D/E experiments):** the full-screenshot canvas was built with the 9-arg drawImage form drawImage(panel, 216, 420, 648, 759, 216, 420, 648, 759) — a SOURCE rect (216,420,648,759) off the 648x759 panel itself, i.e. out of bounds: the panel stamped BLACK. Round-1 D's ""0/14 misalignment"" evidence was therefore unsound as coded (black canvas, not displacement). Fix: the 5-arg form drawImage(panel, 216, 420, 648, 759) (draw AT position, natural size) in both D and E. The displacement mechanism is now re-proven with a real panel in the frame.
- **E1 (frame-exact, capture-aspect crop of a full screenshot): 14/14 exact** — the crop→read contract is SOUND: regions are fractions of the capture frame, and an aspect-preserving frame-exact crop reproduces the uncropped spike-bar read.
- **E2 (forced 1:1 square containing the panel): 0/14** — documents why a square crop cannot read: region fractions scale to the wrong frame shape.
- **D (default centered-80% box, real panel): 0/14 (11 failed + 3 wrong)** — a one-click default crop misaligns every region; the mandatory verification checkbox + manual fix-up is the designed safety net for rough crops.

### Dispositions

- **D-05-UAT-4 (crop forces a square): NO CODE DEFECT.** Byte-level: the lock is CAPTURES[capture].aspect everywhere (default box, drag clamp, resize bound, confirm drawImage, cropped-canvas dims, rendered style); dist matches src; no shipped version ever locked 1:1 (aspects 1.6611/0.8538/0.8867/0.8299 — none is 1). The near-square boxes at steps 2–4 are CORRECT: their calibration frames are TALL rectangles (648x759, 673x759, 649x782 → h/w 1.17–1.21); only basic (691x416) is wide. The owner's perception came from cropping a WIDE screenshot against a TALL step lock. Open UX decision for the owner: nothing in the UI communicates the expected frame shape per step.
- **D-05-UAT-5 (""Enviar sem recortar"" doesn't work): NO CODE DEFECT.** Decline (button + Escape) routes to the cancel handler: bitmap closed, overlay unmounts, status idle, wizard skeleton cleared, no pre-fill, no failure spam — exactly the ratified D-05 semantics (""declining the crop cancels the read"") and the 05-UI-SPEC state matrix (""decline -> idle""). The report is explained by (a) the label reading as ""proceed uncropped"" while the ratified behavior CANCELS, and (b) the spec'd silent return giving zero visible feedback. Copy/feedback changes are UI-SPEC deviations → OWNER DECISION.
- **D-05-UAT-6 (zero values after crop): EXPECTED CONSEQUENCE, contract proven.** A non-frame-exact crop (forced square or rough default box) misaligns every region (E2: 0/14; D: 0/14); a frame-exact crop reads exactly (E1: 14/14). The mandatory manual fix-up is the designed safety net.

Pinned permanently by CropOverlay.test.ts (geometry pins: no capture locks 1:1, default box carries the capture aspect) and harness experiments A/D/E.

## ROUND 3 — Architecture pivot: structural OCR spike proven (2026-10-12)

Owner directive (verbatim in 05-UAT.md round 3): "we need a reading model that actually can read
data from an image without relying on a pixel map" — the round-1/2 dispositions showed the
pixel-fraction region maps (regions.ts) are only valid on frame-exact crops, so the reading
strategy itself was pivoted. Proof spike: `scripts/ocr-spike-structural.mjs` (commit 012956f).

strategy:
  - Basic screen (sampbasic): value PILLS detected by color saturation (chroma >= 50 column/row
    runs; the gray Job pill is excluded by the same mask). Pill text is WHITE on a saturated
    fill — located by a high-luma (>= 210) column extent scanned over the band's middle rows,
    binarized at 180 (the 05-01 normalize+140 recipe binarizes the gradient into hollow
    outlines). combat_power = the bottom-most pill whose digits-whitelist read parses as a flat
    number inside sanity (HP/SP read "N/N", Base "MAX/MAX" — both rejected by the content gate).
  - Details screens (sampideal1-3): text row BANDS from a dark-pixel row profile; within a band,
    value clusters are the LOW-CHROMA dark clusters (values render dark navy, labels indigo —
    chroma separates them; chevrons/header bars excluded by the same mask). Two-column screens
    split at the content midline; the value is the rightmost cluster per cell. Keys map from
    OCR'd labels via fuzzy match against the game-label vocabulary, with a fixed-row-order
    fallback when the band count matches exactly (skips label OCR).
  - Background-independent localization: both readers crop to the panel's cream paper rectangle
    first (high luma + low chroma run detection), so synthetic white/gray/dark margins do not
    perturb detection.
  - Recognition core unchanged: the proven 05-01 recipe (grayscale -> adaptive upscale ->
    normalize -> threshold -> dual polarity -> digits whitelist -> best-read scoring).

grid (the pivot's acceptance bar — exact values on the 56 shipped fields):
  - F native: all 4 canonical samples PASS (1/1, 14/14, 26/26, 15/15).
  - G rescales 0.6x/0.75x/1.25x/1.5x: all 16 variants PASS.
  - H loose crops (white/gray/dark synthetic margins, 5 pad patterns): all 20 variants PASS.
  - Final line: "Variants failing the exact-value bar: 0".
  - Last fix (G x1.5 sampbasic, root cause): row-label glyph antialiasing (indigo on cream
    blends to ~rgb(142,164,208), chroma 66 >= the 50 pill threshold) crossed the pill column
    threshold at 1.5x, forming w=4 saturated runs 318px left of the Power pill; the first..last
    pill extent dragged across the label, the white-text scan then swept the cream paper, and
    the read collapsed to "4" (which passes the sanity gate). Fix: anchor the pill extent on the
    dominant saturated mass (drop column runs < 15% of the widest run before spanning) —
    scale-invariant, no 1.5x special case; every other variant stayed green.

D-10 discipline: the spike reads .secrets/ocr-samples/ at runtime and contains no image bytes or
derived pixel data; the 9 scratch _debug-*.mjs scripts used during calibration were deleted
uncommitted. The structural reader is NOT yet wired into src/ — the engine implementation is a
separate task (INPT-02 remains open; no SUMMARY written for it).
