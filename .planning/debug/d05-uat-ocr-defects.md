---
status: awaiting_human_verify
trigger: "Phase 5 owner UAT BLOCKED by 3 OCR defects: crop overlay appears on every upload (incl. optimal samples), high rate of wrong pre-filled values on optimal input, some reads fail completely. Spike scored 222/222 on the same samples in Node."
created: 2026-10-11T00:00:00Z
updated: 2026-10-12T00:00:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: Primary suspect (H1, explains all three): needsCrop fires on the optimal samples
  because the actual PNG file dimensions differ from the calibration `resolution` recorded in
  scripts/ocr-regions.json (or the aspect stored in generated regions.ts is otherwise not the
  aspect the real file decodes to). Once the crop overlay wrongly fires, the owner drags an
  arbitrary aspect-locked box over an ALREADY-optimal image; the read then scales region rects
  against the re-cropped bitmap => systematically displaced regions => wrong values (D-2) and
  all-field failures (D-3). Secondary suspects: (H2) worker/core/lang URL wiring broken under
  vite preview => total failures; (H3) preprocessing divergence (canvas upscale vs sharp cubic)
  => wrong values.
test: Measure actual PNG dimensions of every .secrets/ocr-samples/*.png with sharp; compute
  needsCrop(actualAspect, CAPTURES[capture].aspect) for the canonical capture<-sample pairs.
expecting: If H1 is true, at least the canonical samples show |imgAspect/refAspect - 1| > 0.12
  (or the raw dims differ from the recorded resolution). If H1 is false, all canonical samples
  return needsCrop=false and the crop defect must live elsewhere (e.g. decode/EXIF).
next_action: Run a Node dimension-measurement script over .secrets/ocr-samples/, compare each
  sample's real WxH and aspect to scripts/ocr-regions.json resolution entries and to the
  CAPTURES aspects in src/features/submit/ocr/regions.ts.

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

