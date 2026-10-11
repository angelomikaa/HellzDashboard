# Phase 5 Research: OCR Auto-Read Layer

**Domain:** Client-side region-based OCR pre-fill bolted onto the submit wizard + pending-replacement submission lifecycle
**Researched:** 2026-10-11
**Confidence:** HIGH for the pipeline (the spike already validated it end-to-end on real data — this phase PORTS it); MEDIUM-HIGH for browser-mechanics specifics (Tesseract.js v7 API verified against installed 7.0.0 + official docs; canvas preprocessing is a mechanical translation of the proven sharp pipeline)
**Discovery level:** 2 (standard research — one known library moving from Node to browser context, plus a small SQL lifecycle change with established in-repo patterns)

---

## 1. What is already proven (do not re-litigate)

- **The OCR pipeline itself is GO**: 222/222 fields, 100.0% on 11 real guild screenshots (`OCR-SPIKE-RESULTS.md`). Phase 5 ports `scripts/ocr-spike.mjs`; it does not invent a new pipeline.
- **`src/lib/parseStatValue.ts` IS the spike's `parseValue`**, already ported rule-for-rule in Phase 2 ("Change NOTHING in the rules: Phase 2 manual entry and Phase 5 OCR output must normalize identically"). The client OCR module **imports it — it must NOT re-implement parsing**. Parity is by construction; the plan only needs a guard test that the OCR module contains no second parser.
- **Dual-polarity read is mandatory** (spike observation 2: a hard negate made `sampbasic` combat_power unreadable). The port keeps: binarize → if mean < 128, OCR both polarities, best parseable read wins.
- **Fixed scaling window** (owner domain fact, D-02): every device renders the same layout proportionally → percentage rects are reliable; only game-UI changes need recalibration (D-19/D-21).

## 2. Canonical region maps → percentage conversion (D-01)

`scripts/ocr-regions.json` holds per-screenshot pixel rects + reference resolutions. The **panel-crop ("ideal" + "basic") samples are the canonical references** (D-01); the `common` samples are arbitrary scrolled crops used only for spike robustness measurement — NOT shipped.

| Capture (wizard step) | Reference group | Reference resolution | Aspect (w/h) |
|---|---|---|---|
| basic (step 1, combat_power only per D-06) | `sampbasic` | 691×416 | 1.661 |
| general (step 2) | `sampideal1` | 648×759 | 0.854 |
| quasi (step 3) | `sampideal2` | 673×759 | 0.887 |
| special (step 4) | `sampideal3` | 649×782 | 0.830 |

**Conversion:** `pct = round((pixel / refDim) × 10000) / 10000` for x, y, w, h. **Inverse at read time:** `x = round(pct.x × imgW)` (clamped to image bounds), same for y/w/h.

**Trimming decision (planner, within D-19 discretion):** shipped maps contain only regions whose stat_key belongs to **the step's own catalog group** (`supabase/seeds/stat_catalog.sql`):

- basic → keep ONLY `combat_power` (D-06: nickname/job/levels are never submitted — reading them is wasted OCR time)
- general → 14 regions (the 14 general-group stats other than combat_power; **drop** the 10 quasi-group rows that also appear on the general screen: aspd, mspd, variable_ct, variable_ct_pct, fixed_ct, fixed_ct_pct, healing_done, healing_taken, crit, crit_res)
- quasi → all 26 quasi regions
- special → 15 regions (all special-group stats except `dmg_vs_demi_human`, which is not in the `sampideal3` calibration — the player always fills that one manually; it gets the D-14 failure message after a read)

Rationale: a read then replaces exactly the fields displayed on its own step (D-15 stays deterministic), each read is smaller/faster, and no cross-step silent clearing of user-typed data is possible. Coverage is unchanged: 56 of 57 catalog stats are OCR-readable (only `dmg_vs_demi_human` is not), because the 10 shared rows are read by the quasi capture anyway.

`scripts/convert-spike-regions.mjs` (committed) performs the conversion and writes `src/features/submit/ocr/regions.ts`. It is the D-19 recalibration vehicle: after a game UI change, recalibrate the spike maps → re-run the script → normal deploy.

## 3. Browser port of the spike pipeline

### 3.1 Preprocessing (sharp → Canvas 2D)

Spike: `greyscale → 3x upscale (cubic) → normalize → threshold(140)` per region, then dual polarity. Browser equivalent:

1. **Crop**: `ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)` (same top-left-origin rect semantics as the region maps).
2. **Grayscale + normalize + binarize + negate**: pure functions over `ImageData` (luma 0.299/0.587/0.114; contrast-stretch min/max luma → 0..255; threshold 140; negate flips bytes). Unit-testable without a canvas.
3. **3x upscale**: `drawImage` with `imageSmoothingQuality: 'high'` — **accepted deviation** from sharp's cubic kernel (the browser doesn't expose kernel choice). Risk absorbed by the dual-polarity read + confidence threshold + mandatory fix-up gate. Documented in code.
4. **Polarity decision**: binarized-crop mean luma < 128 → produce both polarities, else one (spike rule, verbatim).

`createImageBitmap(file)` decodes the upload (handles png/jpeg/webp; EXIF orientation via `{ imageOrientation: 'from-image' }`).

### 3.2 Tesseract.js v7 in the browser

Installed: **tesseract.js 7.0.0** (+ `tesseract.js-core` present in node_modules). Verified against the package + official docs:

- `createWorker('eng', 1, { workerPath, corePath, langPath })` — paths are overridable so the worker script and WASM core can be self-hosted (docs/local-installation.md). `langPath` must serve `eng.traineddata.gz`.
- `worker.setParameters({ tessedit_char_whitelist, user_defined_dpi: '300', tessedit_pageseg_mode: PSM.SINGLE_BLOCK })` — identical tuning to the spike.
- `worker.recognize(image)` accepts `HTMLCanvasElement` / `ImageBitmap` / `Blob` — the port feeds each **preprocessed region canvas** directly (same as the spike feeding buffers; the `rectangle` option is not needed since we crop ourselves).
- `data.confidence` (0–100) is the per-read confidence used by the ~85 accept gate (D-16). Best-read scoring ports verbatim from `recognizeBest`: parseable read (+1000) > non-empty (+100) > higher confidence.
- **Whitelist**: only the numeric `'0123456789.,%-'` ships (text header fields are dropped per D-06, so the text whitelist is dead code in the client).

### 3.3 Self-hosting + Vite production bundling (ROADMAP criterion 3)

- **Move `tesseract.js` from devDependencies → dependencies** (it becomes runtime app code, dynamically imported).
- **`scripts/copy-ocr-assets.mjs`** (committed) copies to **`public/ocr/`** (gitignored — no WASM binaries in git):
  - `node_modules/tesseract.js/dist/worker.min.js` → `public/ocr/worker.min.js`
  - all of `node_modules/tesseract.js-core/*.{js,wasm}` → `public/ocr/core/` (the worker probes SIMD/LSTM support and picks a variant at runtime — all variants must exist)
- Wired as npm lifecycle hooks: `"ocr:assets": "node scripts/copy-ocr-assets.mjs"`, `"predev": "npm run ocr:assets"`, `"prebuild": "npm run ocr:assets"` — regenerated from node_modules on every build, so versions stay lockstep with package-lock and deploys need no committed binaries.
- Worker creation: `createWorker('eng', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/core' })`. **`langPath` stays on the default tessdata CDN** (`https://tessdata.projectnaptha.com/4.0.0`): the browser caches `eng.traineddata.gz` (IndexedDB) after first use. Tradeoff accepted: if the CDN is down, OCR is unavailable → manual entry (D-18), which is the designed fallback (criterion 3). Self-hosting lang data would add a network-fetch step to the build for marginal benefit.
- **Lazy loading**: `src/features/submit/ocr/` is imported ONLY via `await import('../ocr')` inside the upload handler — Vite emits it as a separate chunk, so `tesseract.js` + OCR code never load on initial page load. The main bundle stays OCR-free.

### 3.4 Module decomposition (ARCHITECTURE.md pattern, CONTEXT discretion)

```
src/features/submit/ocr/
  regions.ts     # GENERATED by scripts/convert-spike-regions.mjs — pct rects + reference aspects + GAME_UI_VERSION
  sanity.ts      # hardcoded sanity ranges (D-20): defaults + per-stat overrides
  preprocess.ts # pure ImageData functions: grayscale, normalize, binarize(140), negate, meanLuma, pickBestRead
  recognize.ts  # worker lifecycle + readScreenshot(): crop→preprocess→dual-polarity→recognize→parse→confidence≥85→sanity
  index.ts       # public API: readScreenshot, types (CaptureKey, OcrFieldOutcome)
```

Sanity range seeds (D-03: reject absurd reads only; D-20: hardcoded, never admin-tweakable; calibration-friendly constants):

- `FLAT_DEFAULT = { min: -100_000, max: 100_000_000 }`
- `PERCENTUAL_DEFAULT = { min: -1_000, max: 5_000 }`
- Overrides (spike-informed): `combat_power {0..1e8}`, `aspd {0..5000}`, `mspd {0..1000}`, `hit {0..10000}`, `flee {0..10000}`, `crit {0..1000}`, `crit_res {0..1000}`, `variable_ct {-100..0}`, `fixed_ct {-100..0}`, `variable_ct_pct {-100..0}`, `fixed_ct_pct {-100..0}`, `global_cd_pct {-100..0}` (CT/CD display as negative reductions in-game — spike data confirmed negative reads on exactly these keys).

`OCR_ACCEPT_CONFIDENCE = 85` (D-16 — internal accept/reject gate, never a UI flag; OCRX-01 flagging stays v2).

## 4. Submission lifecycle (D-11/D-12/D-13) — SQL design

Migrations are **append-only corrective** (0008-fixed-0007 precedent); 0001/0005/0009 are never edited in place. New `0010_discard_lifecycle.sql`:

1. **Status constraint swap**: drop the 0001 inline check (auto-named `submissions_status_check`; resolve the name from `pg_constraint` in a DO block for safety), re-add with `('pending','validated','rejected','discarded')`.
2. **Column grant**: `grant update (status) on submissions to authenticated` — column-limited so nothing else is touchable through the new policy path.
3. **RLS policy** `submissions_discard_own_pending`: `for update to authenticated using (member_id = jwt member_id AND status = 'pending') with check (member_id = jwt member_id AND status = 'discarded')` — members can perform exactly ONE transition (own pending → discarded) directly or through the RPC; nothing else (not validated, not rejected, not others' rows).
4. **`create_submission` v2** (invoker semantics kept, 0005 design): before the insert, `update submissions set status = 'discarded' where member_id = v_member and status = 'pending'` — the one-pending-per-player rule (D-11). Rows are never deleted/overwritten (INPT-04 intact — a status mark only).
5. **Cohort filters (D-12)**: recreate `my_report` and `class_top5` from 0009 with the single change `where sub.status not in ('rejected','discarded')` in both `latest` CTEs (0009 lines 141 and 262). A discarded row must leave the rank cohort exactly like a rejected one (Phase 3 D-06 semantics extended).

Client surface: `SubmissionRow['status']` union in `src/lib/api.ts` gains `'discarded'`; `HistoryList` gains `discarded: 'Descartado'` (text-muted). Officer overturn UI stays Phase 6 (D-13) — only the status + rule land here.

**Live push (schema gate, [BLOCKING]):** `supabase db push` with `SUPABASE_ACCESS_TOKEN` supplied by the owner as a session env var (03-02 precedent — never on disk/commit/echo). Verification: a new `scripts/smoke-lifecycle.mjs` modeled on `smoke-rank.mjs` helpers proves: submit A → pending; submit B (missing one stat A had) → A becomes `discarded`, B pending; `my_report` own_value for the omitted stat is null (discarded A left the cohort); direct PATCH `status='validated'` on own row fails (policy tightness).

## 5. Wizard realignment (D-06/D-07/D-08)

- `wizard.ts`: `REQUIRED_GROUPS` becomes `['general','quasi','special']` (D-07); `isOptionalEntry` reduces to `combat_power` only. `groupComplete`/`buildStatsPayload` logic is otherwise unchanged — the existing functions already gate on `REQUIRED_GROUPS`/`isOptionalEntry`.
- Per-step verification checkboxes (D-08) replace the end-of-flow 3-checkbox gate: each capture step (1–4) gets a native checkbox reusing the existing locked-style copy (`Revisei os valores de {Geral|Quasi|Especial} contra as capturas e estão corretos.`) plus a new basic-step string; **editing any value unchecks that step's checkbox** (stale-confirmation reset, same principle as the current ReviewStep `useEffect`). Revisão (step 5) shrinks to a tap-to-fix summary + Enviar, gated on all four step verifications.
- Server re-validation via `create_submission` is untouched — the checkbox gate is UX-only (INPT-03 discipline).

## 6. Common pitfalls (from spike + research)

1. **Single-polarity binarization silently kills regions** — dual-polarity is not optional (spike `bf85768`).
2. **Never re-implement the parser** — import `parseStatValue`; a second parser WILL drift (the single-dot 3-digit-tail rule is subtle: `1.234` → 1234, `12.34` → 12.34).
3. **Region maps are game-UI-versioned** (D-19/D-21): single active version; after a game update, reads fail gracefully (blank + D-14 message) until recalibration ships. No multi-version detection.
4. **Whole-image recognition is prohibited** (INPT-02) — always region crops.
5. **Screenshots never leave the device** (D-10): the OCR feature must contain no `FormData`/upload path — extend the 02-03 grep gate to the new files. The ONLY network calls the OCR stack makes are the worker's own asset fetches (self-hosted `/ocr/*` + tessdata CDN for `eng.traineddata.gz`).
6. **EXIF orientation**: decode via `createImageBitmap(file, { imageOrientation: 'from-image' })` or a phone-portrait screenshot crops at wrong rects.
7. **Crop-decline semantics** (D-05): declining the crop cancels the read (no garbage read on a full screenshot; fields stay blank for manual entry) — running anyway would produce scaled-to-wrong-frame garbage.
8. **UI copy literal-gate discipline** (04-01/04-02 lesson): locked strings appear exactly once (definition site); comments describe, never quote.

## 7. Validation Architecture (Nyquist — test gates embedded in plans)

| Dimension | Gate |
|---|---|
| Parse/scale/sanity/polarity pure functions | vitest unit tests, RED-first (regions scaling round-trip, sanity accept/reject, pickBestRead ordering, preprocess pixel math on synthetic ImageData) |
| Wizard realignment | wizard.test.ts extended: special-required paths, combat_power-still-optional, missingRequired labels |
| No second parser / no upload path | grep gates: `parseValue` not re-implemented in `ocr/`; `FormData|upload(` absent from `src/features/submit/ocr/` |
| Region keys ⊆ catalog | unit test: every shipped region stat_key exists in `supabase/seeds/stat_catalog.sql` group lists |
| Type + build | `npx tsc -b`, `npx vite build` green |
| Production lazy-load + self-host (criterion 3) | build-output checks: OCR/tesseract code lands in a lazy chunk (not the entry chunk); `dist/ocr/worker.min.js` + `dist/ocr/core/*.wasm` exist |
| Server lifecycle | `scripts/smoke-lifecycle.mjs` live (after `supabase db push`): discard-on-resubmit, cohort exclusion, policy tightness |
| End-to-end truth | owner UAT with real screenshots (all 4 captures, crop trigger, failure message, manual-only path, DevTools: no image bytes leave, lazy chunk loads on first upload only) |

## Sources

- `tesseract.js` 7.0.0 installed package + official docs (`docs/api.md`, `docs/local-installation.md`) via Context7 — workerPath/corePath/langPath overrides, `setParameters` whitelist, `recognize` image formats, `rectangle` — HIGH confidence
- `scripts/ocr-spike.mjs`, `scripts/ocr-regions.json`, `OCR-SPIKE-RESULTS.md` — the validated pipeline being ported — HIGH confidence (owner-validated on real data)
- `supabase/migrations/0001/0002/0005/0009`, `supabase/seeds/stat_catalog.sql`, `src/features/submit/*`, `src/lib/{api,parseStatValue}.ts` — live integration surfaces — read directly
- Canvas preprocessing mechanics (ImageData pixel ops, `imageSmoothingQuality`) — standard web platform, no library needed — HIGH confidence

---
*Phase 5 research for: NeoFoot guild stats panel (05-ocr-auto-read-layer)*
