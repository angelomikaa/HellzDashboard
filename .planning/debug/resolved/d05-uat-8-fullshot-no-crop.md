---
status: awaiting_human_verify
trigger: "Phase 5 round-4 batch 2 — owner UAT re-walk: uploading a FULL phone screenshot on a capture step went DIRECTLY TO ERROR — the crop interface never opened (all other steps pass). Diagnose the actual code path, fix, add a realistic full-phone-shot harness variant. TDD, atomic commits."
created: 2026-10-12T16:00:00Z
updated: 2026-10-12T16:45:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "The owner's step-8 upload FAILED TO DECODE in their browser (createImageBitmap
    rejected — file-specific: unsupported format, dimension overflow, or corrupt transfer), so
    handleFile's catch fired onReadFailed() + setStatus('failed') BEFORE the needsCrop decision
    was ever reached. Decode is the ONLY await between 'reading' and the crop decision. The
    crop decision logic itself is correct for every phone geometry."
  confirming_evidence:
    - "Census (OcrCapture.tsx:132-154): exactly one await sits between setStatus('reading') and
      the needsCrop branch — its rejection yields exactly the symptom: fast failed status, no
      overlay. Every other step passed because their files decode fine."
    - "needsCrop math: no-crop requires imgAspect in [0.788,0.930] or [1.578,1.744]; phone
      aspects (~0.47 portrait, ~2.1 landscape) deviate 43-71% from every reference — no dist
      lineage (12% or 5% gate) can skip the crop for a phone shot."
    - "No ErrorBoundary in src; CropOverlay has no crash path; Escape/cancel yields
      'Leitura cancelada' (never the failed line); calibration experiment: readScreenshot on a
      full 1080x2280 frame completes gracefully (0/14 filled, NO throw) — no exception path."
    - "Round-2 walk: the same owner flow on a full phone shot DID open the overlay (decode
      worked); OcrCapture.tsx is byte-identical since — the variable is the round-4 file."
  falsification_test: "If the owner's actual file (once dropped into .secrets/ocr-samples/)
    decodes fine through all fallback strategies — or fails to open the overlay again after
    the fix — this hypothesis dies and the investigation reopens. If the file itself fails to
    decode here (sharp) too, the mechanism is confirmed directly."
  fix_rationale: "The decode path is the only code that can bypass the ratified crop tool. A
    fallback chain (from-image createImageBitmap -> bare createImageBitmap -> <img> element
    decode) covers the known browser-side decode-failure classes a single call cannot, making
    the overlay reliably reachable for every decodable upload — exactly the owner-ratified
    'crop = optional isolation tool; overlay opens per the 5% trigger' design."
  blind_spots: "The owner's exact file is not yet in .secrets/ocr-samples/ (checked
    2026-10-12) — the specific decode trigger is UNCONFIRMED; the chain covers the known
    failure classes but final acceptance is the owner's re-walk with the real file. If their
    browser rejects all three strategies (e.g. true HEIC on Chromium), the designed 'failed'
    status remains the honest outcome and the file must be converted before upload."

hypothesis: (R4-H1, see checkpoint) decode rejection short-circuits to 'failed' before the
  crop decision.
test: TDD RED first — decodeUpload fallback-chain unit tests (mocked globals, node env) +
  full-phone needsCrop pins for all four captures; then GREEN implement; then the harness
  full-phone variant (calibrated: crop-then-read 14/14 at 30% and 36% panel width; direct
  read no-throw).
expecting: RED confirms the missing fallback (import error on decodeUpload); GREEN makes the
  chain live; harness F proves the full-shot flow end-to-end without touching the proven
  grid (B/G/H/E stay green).
next_action: Delete the scratch calibration file; write the RED tests in OcrCapture.test.ts;
  run vitest to record RED; implement decodeUpload in OcrCapture.tsx; run GREEN.

## Symptoms

expected: Step 8 of the UAT walk — upload a FULL phone screenshot (aspect ~0.47, deviating
  43-71% from every capture reference) → needsCrop fires → crop overlay opens (full-image
  default box) → confirm/cancel per the ratified UX.
actual: The failed-read status line ("Não foi possível ler a captura automaticamente...") appeared
  directly — the crop interface never opened. All other steps (1-7, 9-11) PASS.
errors: None captured; the failed status line is the only observable.
reproduction: Owner re-walk step 8, real browser (preview build), their real full phone
  screenshot. File NOT yet in .secrets/ocr-samples/ (checked 2026-10-12 — only the 11
  calibration samples present).
started: Round-4 walk 2026-10-12, after the structural-reader pivot + crop simplification
  (224a88b-era build).

## Eliminated

- hypothesis: needsCrop returned false for the owner's upload (aspect check computed on the
  wrong basis; CAPTURES lookup undefined → NaN → false)
  evidence: needsCrop can only return false within ±5% of a reference aspect — the reference
    set is {1.6611, 0.8538, 0.8867, 0.8299}, so no-crop requires imgAspect ∈ [0.788, 0.930] ∪
    [1.578, 1.744]; a phone screenshot is ~0.42-0.55 portrait (or ~1.9-2.2 landscape) —
    mathematically outside every no-crop window. CAPTURES is complete at source (regions.ts)
    and no dist version ever shipped a different aspect set (round-1/2 byte checks). No
    phone-shaped image can skip the crop decision.
  timestamp: 2026-10-12
- hypothesis: the overlay mount crashed (synchronous exception in CropOverlay → error state)
  evidence: no ErrorBoundary exists anywhere in src (grep) — a render/effect crash would blank
    the tree, not render the failed status line; CropOverlay's mount path (canvas draw,
    focus, listener) has no throw for any bitmap size; cancel/Escape yields 'cancelled'
    ("Leitura cancelada"), never 'failed'.
  timestamp: 2026-10-12
- hypothesis: readScreenshot ran directly on the full shot and threw (needsCrop skipped)
  evidence: requires needsCrop false — eliminated above; additionally readScreenshot's rows
    path completes (empty outcomes) rather than throwing when the panel can't be localized,
    and the pills path never throws on busy input. A direct read yields 'done' + per-field
    failure alerts, not the failed status line.
  timestamp: 2026-10-12
- hypothesis: stale dist (owner walked an older build without the new flow)
  evidence: every shipped OcrCapture version (12% gate, 5% gate) fires the crop for
    phone-shaped aspect deviations (43-71% ≫ 12%); the overlay opens in every dist lineage —
    a stale build cannot produce "no overlay".
  timestamp: 2026-10-12

## Evidence

- timestamp: 2026-10-12 code-path census (handleFile, OcrCapture.tsx:132-154)
  checked: every path from file selection to status
  found: exactly ONE await sits between setStatus('reading') and the needsCrop decision —
    createImageBitmap(file, { imageOrientation: 'from-image' }). If it rejects, handleFile's
    catch fires onReadFailed() + setStatus('failed') — the failed line, fast, with the crop
    decision never reached. That is the ONLY mechanism consistent with "directly to error,
    no overlay" while every other step (whose files decode fine) passes.
  implication: R4-H1 — the step-8 file failed to DECODE in the owner's browser
    (file-specific: unsupported format like HEIC, dimension overflow such as scrolling
    captures beyond decoder limits, or corrupt transfer). The code has no decode fallback and
    no way for the crop tool to appear when decode fails.

- timestamp: 2026-10-12 calibration experiment (scratch harness, since deleted)
  checked: the crop-then-read path and the direct read on a realistic full phone frame
  found: 1080x2280 dark game-bg frame, sampideal1 panel scaled to 30% (324x380 at (378,420))
    and 36% width — loose owner box (panel + 8% margins) → readScreenshot('general') = 14/14
    EXACT at both scales. Direct full-frame read: resolves gracefully, 0/14 filled, NO throw
    (computePanelRect's span-relative threshold cannot localize a panel occupying ~17% of the
    frame height — by design the crop overlay is the isolation tool).
  implication: (a) the crop→read path works end-to-end at deep margins far beyond harness H's
    20% — the harness variant can assert 14/14 at ~30% panel width; (b) the reader must NOT
    be forced onto full frames — no exception exists, so the symptom cannot come from the
    read path, only from the decode path before it.

- timestamp: 2026-10-12 TDD RED
  checked: npx vitest run src/features/submit/OcrCapture.test.ts
  found: 5 failed / 16 passed — all 5 decodeUpload chain tests fail (TypeError: decodeUpload
    is not a function — the fallback chain does not exist); the 2 new full-phone needsCrop
    pins pass immediately (they pin the already-correct crop decision for every phone
    geometry).
  implication: the missing decode fallback is pinned as RED; proceed to implement.

- timestamp: 2026-10-12 fix applied (GREEN commit cfedfc5)
  checked: src/features/submit/OcrCapture.tsx — decodeUpload fallback chain + handleFile wiring
  found: decodeUpload(file) tries (1) createImageBitmap(file, {imageOrientation:'from-image'}),
    (2) bare createImageBitmap(file), (3) <img> element decode (object URL + decode(), URL
    revoked) with both createImageBitmap forms — only a total failure rejects into the
    designed D-18 failed status. handleFile now calls decodeUpload; every other line
    unchanged (needsCrop math, overlay flow, cancel semantics untouched).
  implication: the crop decision is now reachable for every decodable upload regardless of
    which decode strategy the owner's browser needs.
- timestamp: 2026-10-12 TDD GREEN + harness variant (commit 4210264)
  checked: npx vitest run src/features/submit/OcrCapture.test.ts → 21/21 (5 decodeUpload
    tests green); harness F (1080x2280 frame, panel ~30% width): needsCrop true on ALL FOUR
    captures; loose panel+8% crop → readScreenshot('general') 14/14 EXACT; direct full-frame
    read resolves gracefully (0/14, no throw).
  implication: the full-phone flow is proven end-to-end offline; only the owner's real file
    in their real browser remains as acceptance.

## Resolution

root_cause: The uploaded full phone screenshot failed to DECODE in the owner's browser.
  The decode was a single createImageBitmap(file, {imageOrientation:'from-image'}) call and
  the ONLY await between the reading status and the crop-overlay decision in handleFile
  (OcrCapture.tsx) — its rejection short-circuited to onReadFailed() + the failed status
  BEFORE the needsCrop branch, so the crop interface never opened ("directly to error").
  Evidence that the crop decision itself is sound: no phone-shaped aspect (~0.47 portrait,
  ~2.11 landscape) falls in any no-crop window ([0.788,0.930] ∪ [1.578,1.744]) — needsCrop
  mathematically fires on every capture step (pinned by the new unit tests); no error
  boundary exists; the overlay/cancel/read paths cannot produce the failed line without the
  overlay having shown; the structural reader degrades gracefully on full frames (harness F:
  no throw). The round-2 walk opened the overlay for the same owner flow with byte-identical
  OcrCapture code — the variable is the round-4 file (unsupported format, dimension-overflow
  capture such as a scrolling screenshot, or a corrupted transfer).
fix: decodeUpload fallback chain in OcrCapture.tsx (commit cfedfc5): from-image
  createImageBitmap → bare createImageBitmap → <img> element decode path (object URL +
  decode(), both createImageBitmap forms, URL revoked); handleFile uses it. Only a total
  decode failure lands in the designed D-18 failed status. Crop math/UX untouched (the
  ratified simplifications and the 5% trigger stand).
verification: TDD RED 5-failed → GREEN 21/21 (OcrCapture.test.ts); full suite 284/284 (17
  files — includes the proven grids B 56/56, G 16/16, H 20/20, E 14/14 and the new harness F);
  npx tsc -b clean; npm run build green; entry-chunk createWorker 0 matches (lazy ocr-*.js
  holds them); FormData 0 matches; dist/ocr/worker.min.js + core wasm present. Harness F
  (commit 4210264): realistic 1080x2280 full-phone frame, panel ~30% width — crop trigger
  fires on every capture, loose panel+8% crop reads 14/14 exact, direct read graceful.
  REMAINING: owner acceptance — the actual step-8 file was requested into
  .secrets/ocr-samples/ (not present as of 2026-10-12); if it decodes here, run it through
  the harness as acceptance too.
files_changed:
  - src/features/submit/OcrCapture.tsx (decodeUpload fallback chain + handleFile wiring)
  - src/features/submit/OcrCapture.test.ts (decodeUpload chain tests + full-phone needsCrop pins)
  - scripts/ocr-browserport-harness.test.mjs (harness F: full-phone-shot variant)
  - .planning/phases/05-ocr-auto-read-layer/05-UAT.md (round-4 D-05-UAT-8 disposition)
  - .planning/debug/d05-uat-8-fullshot-no-crop.md (this record)
