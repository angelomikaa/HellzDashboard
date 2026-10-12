---
status: partial
phase: 05-ocr-auto-read-layer
source: [05-05-PLAN.md, 05-04-SUMMARY.md, 05-02-SUMMARY.md]
build_tested: "commit 8d7e6d3 — vite preview of the production-shaped dist (src tree identical to c95c794, the 05-04 wizard wiring)"
server: "http://localhost:4173 (vite preview — restart with npm run preview; see How to resume)"
started: 2026-10-11T21:23:18Z
updated: 2026-10-12T13:45:00Z
---

# Phase 5 Owner UAT — OCR Auto-Read Layer (INPT-02 end-to-end)

**Purpose:** close INPT-02's three success criteria with the owner's eyes in a real browser using REAL guild screenshots (`.secrets/ocr-samples/` — sampbasic.png, sampideal1-3.png, common samples; D-09/D-10 discipline: they never enter git or the network).

**Automated gates:** re-run in one consolidated pass on 2026-10-11 (task 1 of 05-05) — all results recorded below before this walk.

---

## Automated Gate Results (task 1 — recorded 2026-10-11)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `npx vitest run` (full suite) | **PASS** | 12 test files, **179/179 tests green** |
| 2 | `npx tsc -b` | **PASS** | clean, zero errors |
| 3 | `npm run build` | **PASS** | green; prebuild regenerated `public/ocr`; entry `index-C2Plt_5x.js` (302.53 kB) + lazy `ocr-DyKqMXa6.js` (20.53 kB) — same chunk hashes as the 05-04 proof (byte-stable tree) |
| 4 | `Test-Path dist/ocr/worker.min.js` / `dist/ocr/core/tesseract-core-simd-lstm.wasm` | **PASS** | True / True (self-hosted assets ship in dist) |
| 5 | `Select-String dist/assets/index-*.js -Pattern "createWorker"` | **PASS** | **0 matches** in the entry chunk (lazy-chunk proof; the dedicated `ocr-*.js` chunk holds the 1 match) |
| 6 | `Select-String src/features/submit/*.tsx,src/features/submit/ocr/*.ts -Pattern "FormData"` | **PASS** | **0 matches** (D-10 — no upload machinery of any kind) |
| 7 | `node scripts/smoke-lifecycle.mjs` | **AUTH-GATED** | pre-flight abort: `Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF` — zero live-data contact (see note) |
| 8 | `node scripts/smoke-rank.mjs` | **AUTH-GATED** | same pre-flight abort (see note) |

### Live-smoke disposition (gates 7–8)

`SUPABASE_ACCESS_TOKEN` is **not available in this session** (it is only ever a session env var — never on disk, never committed; 03-02/05-02 precedent). Both smokes abort loudly before touching any live data — an auth gate, not a failure.

The standing live evidence from **05-02 (2026-10-11)** remains valid and is the current disposition:

- migration **0010 pushed live** (dry-run confirmed it was the only pending migration)
- **LIFECYCLE SMOKE PASSED 11/11, twice consecutively** (no residue — pre-run + finally cleanup)
- **RANK SMOKE PASSED** (the 0009→0010 function replacement caused no rank regression)
- **nothing server-side has changed since**: 05-03 (wizard realignment) and 05-04 (OCR wiring) were client-only commits — no migrations, no function deploys

**OPTIONAL during the walk:** if the owner wants a fresh live re-run of either smoke, supply `SUPABASE_ACCESS_TOKEN` (+ `SUPABASE_PROJECT_REF` if not defaulted) as a session env var and OpenCode will run both — same discipline as 03-02/05-02. Otherwise the recorded 05-02 live evidence stands (02-03 "covered-by-automated-evidence" precedent).

**Preview server:** running the production-shaped build at **http://localhost:4173** (HTTP 200 verified).

---

## Owner Browser Walk — 11 steps (result: BLOCKED BY DEFECTS)

*(Walk attempted 2026-10-11 after the earlier deferral — could not be completed; see Deviations below. Step verdicts stay `[pending]` until the defects are fixed and the walk is re-run.)*

Use your real screenshots from `.secrets/ocr-samples/`. Expected behavior per step, from the locked 05-05 plan / 05-UI-SPEC:

### Step 1 — Login + wizard entry
- **expected:** Login as a whitelisted member → open **Enviar Status**. Every capture step shows the upload CTA `Faça upload dos seus status aqui`; **Continuar stays disabled** on every step until the step's verification checkbox is checked.
- **result:** pending
- **owner notes:** —

### Step 2 — Basic capture (step 1, Poder de Combate)
- **expected:** upload `sampbasic.png` (or your real basic header shot) → inputs show the skeleton (`Lendo captura…`, disabled) → **Poder de Combate pre-fills** → status line `Leitura concluída`. Check the step-1 checkbox → Continuar enables. Now change the combat_power value by hand → the checkbox **unchecks itself** (stale-confirmation reset); re-check it.
- **result:** pending
- **owner notes:** —

### Step 3 — Geral (step 2, 14 fields)
- **expected:** upload your general screenshot → **all 14 fields pre-fill** → fix at least one value manually (the checkbox unchecks) → re-check → Continuar.
- **result:** pending
- **owner notes:** —

### Step 4 — Quasi (step 3)
- **expected:** upload your quasi screenshot → fields pre-fill → check → Continuar.
- **result:** pending
- **owner notes:** —

### Step 5 — Especial (step 4, mandatory)
- **expected:** upload your special screenshot → fields pre-fill, and **`Dano vs Humanoide` (dmg_vs_demi_human) is BLANK** with the message `O valor não foi detectado na print - Por favor preencha o campo manualmente` (intentionally not in the region map) → fill it manually (message clears) → check → Continuar. A blank Especial field **BLOCKS** Continuar (Especial is mandatory).
- **result:** pending
- **owner notes:** —

### Step 6 — Revisão (step 5)
- **expected:** grouped summary with tap-to-fix; **NO checkboxes here**; Enviar enabled → submit → `Envio registrado!`.
- **result:** pending
- **owner notes:** —

### Step 7 — Re-upload semantics (replace-all-displayed, D-15)
- **expected:** start a new submission (`Enviar novos status`), upload a group shot, then upload a DIFFERENT shot of the same group → values are **replaced by the fresh read** (detected overwrite; failed/unmapped fields go blank + failure message).
- **result:** pending
- **owner notes:** —

### Step 8 — Crop trigger (D-05; free-crop + example per the 2026-10-12 ratification)
- **expected:** upload a FULL phone screenshot (with surrounding UI) on any step → the crop overlay appears (`Ajuste o recorte da captura`, a dashed example rectangle at the step's capture frame, a FREE crop box opening at that same shape) → freely drag/resize the box; crop roughly to the panel in the example's shape → `Usar recorte` → the read proceeds. If you confirm a crop shaped clearly off the example (e.g. a square on the Basic step), the inline message `Ajuste o recorte ao formato do exemplo` shows and the overlay stays open — fix the shape or cancel. In a second attempt press `Cancelar leitura` → the read is **CANCELLED**: no garbage pre-fill, fields stay blank, the status line `Leitura cancelada` shows, manual entry continues (the line clears on the next upload).
- **result:** pending
- **owner notes:** —

### Step 9 — Lifecycle (D-11)
- **expected:** submit once, then submit again with different values → **Minhas entradas** shows the first row as **Descartado** (muted) and the new one as **Aguarda validação**.
- **result:** pending
- **owner notes:** —

### Step 10 — DevTools (criterion 3 + D-10, T-05-15)
- **expected:** with the Network tab open: **(a)** NO image bytes are ever sent — the only requests are the panel's own API calls; **(b)** on FIRST upload only, the OCR chunk + `/ocr/worker.min.js` + a `/ocr/core/*.wasm` load — and none of these were loaded at page load before the first upload; **(c)** reload the page → Painel still makes **exactly one `/rpc/my_report` request** (no key-stat leak regression).
- **result:** pending
- **owner notes:** —

### Step 11 — Manual-only path (criterion 3)
- **expected:** start a new submission and complete it with **ZERO uploads** (type everything, including Especial) → submits fine.
- **result:** pending
- **owner notes:** —

---

## Deviations from Expected Behavior

**Owner report (verbatim, 2026-10-11):**

> "the sheer amount of error on readings while using our optimal input and the crop step appering all the time and completely failed readings render testing the points 1-11 completely impossible"

**Derived defect list (each needs a disposition via the debug session):**

| # | Symptom | Suspect area (to be confirmed by diagnosis) |
|---|---------|---------------------------------------------|
| D-05-UAT-1 | Crop overlay appears on **every upload** — even on the spike-calibrated optimal samples (`.secrets/ocr-samples/`) where it should not trigger | `needsCrop` trigger in `OcrCapture.tsx` / aspect/area basis vs sample geometry |
| D-05-UAT-2 | High rate of **wrong values** pre-filled when reading the optimal input (spike delivered 100.0% on the same samples in Node) | region-map scaling basis (crop vs full image), preprocessing, decode divergence between spike and browser pipeline |
| D-05-UAT-3 | Some reads **fail completely** (all fields failing/blank) | worker/core/lang path wiring under vite preview, out-of-bounds regions after crop, read-error handling |

**Dispositions (debug session `.planning/debug/d05-uat-ocr-defects.md`, 2026-10-12 — diagnosed offline with a committed exact-value harness on the real samples, `scripts/ocr-browserport-harness.test.mjs`):**

| # | Root cause (evidence) | Fix / disposition |
|---|----------------------|-------------------|
| D-05-UAT-1 | **Not reproducible on the sample bytes.** The shipped `needsCrop` formula and region aspects are provably correct (dist bytes verified; harness test A pins `needsCrop=false` on all four canonical samples — actual PNG dims match calibration exactly, deviation ≤0.01% vs the threshold; no EXIF/XMP orientation on any sample). The crop fired on every upload because the owner's uploads were frames with aspect deviation beyond the then-shipped trigger — full phone screenshots or differently-cropped copies of the optimal screens — where the locked D-05 formula correctly offers the crop each time. | No defect in the trigger's mechanics (diagnosis stood at the original 12% gate). **Owner-ratified calibration change (answered 2026-10-11):** the trigger was tightened from >12% to **>5%** aspect deviation (exclusive + epsilon semantics kept; TDD boundary tests re-pinned, harness A re-proven, full suite 187/187). **Re-walk guidance:** steps 2–5 must use the exact `.secrets/ocr-samples/` files (sampbasic/sampideal1-3) at their matching steps — the crop stays silent on those (deviation ≤0.01%, proven at the 5% gate). Full screenshots (and now also 5–12% misaligned frames, e.g. samp2 vs quasi at 9.4%) correctly trigger the crop (step 8 tests exactly that). |
| D-05-UAT-2 | **Frame misalignment, not engine divergence.** Region fractions are valid ONLY on the calibration frame. Frames that pass the 12% aspect gate uncropped (e.g. `samp2.png` vs quasi = 9.4% deviation) or a crop-confirm box that is not frame-exact (the overlay's DEFAULT centered-80% box — one click on the auto-focused confirm) displace every region onto neighboring rows/labels → parseable-but-wrong values pre-fill (digits-only whitelist + generous sanity accept neighboring rows' numbers). On exact frames the engine produces ZERO wrong values: harness B measured 56/56 reads exactly correct on the canonical samples. | Engine fix not required (reads are exact on calibration frames — the spike bar reproduced). The mandatory per-step human verification (D-08/D-22) is the designed backstop for rough crops. **Ratified-call proposal to the owner:** tighten the 12% crop trigger (canonical samples deviate ≤0.01%; frames 2–12% off are different crops and could route to the crop overlay instead of reading garbage uncropped). |
| D-05-UAT-3 | **Two components, both pinned.** (a) The same frame-misalignment mechanism: reproduced offline — a full screenshot + the default centered-80% crop confirm yields **0/14 fields, all failed** (a completely failed reading). (b) A genuine engine defect: the `OCR_ACCEPT_CONFIDENCE=85` seed gate rejected **5/56 CORRECT reads even on exact frames** (confidences 0.0/63/70/79/82 — Tesseract mean confidence is unreliable on 1-6 glyph reads; a correct single-`0` read scores 0.0; the spike, owner-validated at 222/222, never gated on confidence). Worker/core/lang wiring was exonerated over HTTP against the running preview: `/ocr/worker.min.js`, `/ocr/core/tesseract-core-simd-lstm.{wasm,wasm.js}`, and the jsdelivr `eng.traineddata.gz` all return 200 with correct MIME types. | **Fixed (commit pending):** accept gate recalibrated to spike parity — accept = parse + sanity; confidence remains only the `pickBestRead` tiebreak (spike `recognizeBest` scoring, verbatim). Sanity ranges, dual-polarity, human verification, and server re-validation unchanged. Post-fix harness: **56/56 fields filled and exactly correct**. |

**Fix verification (2026-10-12):** offline exact-value harness on the real samples — `readScreenshot` reproduces the spike bar **56/56 exact** (harness B; committed, skip-guarded on `.secrets` presence); full suite `npx vitest run` **183/183 green**; `npx tsc -b` clean; `npm run build` green with all criterion-3 gates holding (entry chunk `createWorker`: 0 matches — lazy chunk only; self-hosted `/ocr/*` assets in dist; `FormData`: 0 matches). The remaining runtime proof (real browser, first-upload lazy-chunk load, zero image bytes on the wire) is exactly the re-walk below.

**Owner-ratified threshold change (2026-10-11, applied 2026-10-12):** the D-05-UAT-2 ratified-call proposal (tighten the 12% crop trigger) was answered by the owner — **ratified at 5%** (exclusive boundary, epsilon semantics kept). The trigger now routes 5–12% misaligned frames (the samp2-vs-quasi 9.4% uncropped-garbage case) to the crop overlay; the 11 calibration samples (≤0.01% deviation) remain no-crop — re-proven post-change through the shipped `needsCrop` (harness A + re-pinned boundary tests; full suite **187/187 green**; `tsc -b` clean; `npm run build` green; dist entry formula `Math.abs(e/t-1)>.050000001`). See `.planning/debug/d05-uat-ocr-defects.md` § Owner-Ratified Calibration Change.

**Consequence:** steps 1–11 could not be walked — the UAT is blocked, not approved. Routed to a debug session for root-cause diagnosis before any re-walk.

**Round 2 — owner report (verbatim, 2026-10-11, after the 5% recalibration + accept-gate fix):**

> "crop tool is appearing incorrectly and cropping incorrenctly (it forces the crop into a square, optimal input is a rectangle, send without cropping doesnt work, and square, unoptimal cropping forced by the cropping tool working in a way that is not intended still is unable to read any values."

**Round 2 defect list (observed during the step-8 crop test — full phone screenshot, where the crop appearing IS by design):**

| # | Symptom | Suspect area (to be confirmed by diagnosis) |
|---|---------|---------------------------------------------|
| D-05-UAT-4 | Crop tool **forces a square** crop box — but the optimal capture frame is a wide rectangle (calibration aspect ≈ 1.66:1); the aspect lock appears to be 1:1 instead of the step's capture aspect | `CropOverlay.tsx` aspect-lock source; default centered-80% box aspect |
| D-05-UAT-5 | **`Enviar sem recortar` doesn't work** (ratified design: declining cancels the read entirely and returns cleanly to manual entry — determine whether the button no-ops, errors, or leaves the overlay/state stuck) | cancel handler wiring in `CropOverlay.tsx` / `OcrCapture.tsx` |
| D-05-UAT-6 | After the (forced-square) crop, the read produces **zero values** — expected consequence of a wrong-aspect crop vs. region fractions calibrated to the capture frame; must ALSO be verified independently: a correct-aspect crop of a full screenshot must read well | crop→read geometry contract (region scaling applied to the cropped bitmap) |

**Round 2 dispositions (debug session, 2026-10-12 — full evidence in `.planning/debug/d05-uat-ocr-defects.md`):**

- **D-05-UAT-4: NO CODE DEFECT.** The lock was always the step's capture aspect (verified src + dist, pinned by `CropOverlay.test.ts`). Steps 2–4 locked **tall near-square** boxes because their calibration frames ARE tall rectangles (648×759, 673×759, 649×782); only Basic is wide (691×416). The "forced square" perception = cropping a wide screenshot against a tall step's lock. **RESOLVED (owner-ratified 2026-10-12, verbatim directive: "make the square unlocked - the player can crop the way he feels necessary - he must be shown an example of how to crop properly, and reproduce it using the crop tool."):** the hard aspect lock is REMOVED — the crop box is now free-form (drag/resize to any shape) with a dashed EXAMPLE rectangle at the step's capture aspect plus helper copy, and confirm is GATED on the crop matching that aspect within the 2% frame tolerance (out-of-tolerance: inline message, overlay stays open, no read consumed — harness E: frame-exact 14/14, square 0/14). Supersedes the Phase 5 planning discretion that made the crop aspect-locked hard; recorded in 05-UI-SPEC.md as an owner-ratified deviation (2026-10-12). TDD-proven: geometry pins rewritten (free-crop + example + confirm-gate), full suite 209/209, `tsc -b` clean, build green with all criterion-3 gates holding.
- **D-05-UAT-5: NO CODE DEFECT.** Decline (button + Escape) cancels the read exactly as ratified (D-05: "declining the crop cancels the read"; UI-SPEC: decline → idle) — overlay closes, no pre-fill, manual entry intact. The label `Enviar sem recortar` read as "proceed uncropped" while the behavior cancels, and the return was silent by spec. **RESOLVED (owner-ratified 2026-10-12):** the decline button is relabelled to `Cancelar leitura` AND a visible cancelled-feedback status line `Leitura cancelada` now surfaces on decline (button or Escape) before the flow returns to manual entry — the line clears on the next upload. Decline still CANCELS the read entirely (ratified D-05 semantics unchanged: no pre-fill, no failure spam, manual entry intact). Recorded in 05-UI-SPEC.md as an owner-ratified copy deviation (2026-10-12); pinned by the statusMessage tests (cancelled line, single-slot replacement on next upload).
- **D-05-UAT-6: EXPECTED CONSEQUENCE — contract proven sound.** Harness (after fixing a harness-only canvas-construction bug that had invalidated the D evidence): **frame-exact crop → 14/14 exact**; forced square → 0/14; default rough box → 0/14 (11 failed + 3 wrong). Rough crops are caught by the mandatory verification checkbox + manual fix-up (the designed safety net) — and, since the 2026-10-12 free-crop ratification, by the confirm gate: an off-capture-aspect crop can no longer reach the read at all (only a same-aspect but non-frame-exact crop still relies on the human backstop).

**Round 3 — owner report (verbatim, 2026-10-12):**

> "first, we need a small adjustment to OCR - the readings are failing on the first step - probably because the "combat power field" is not completerly associated with the power field (they're the same). For instance, the correct return for this example would be 288927"

**Round 3 defect candidate (diagnosis pending the actual screenshot file):**

| # | Symptom | Notes |
|---|---------|-------|
| D-05-UAT-7 | Basic-step read fails on a NEW screenshot (Ahrya/Gypsy, Power = **288927** expected — image shown in chat, file NOT yet in `.secrets/ocr-samples/`) | Owner's hypothesis: the wizard's Poder de Combate and the game's "Power" row are the same field and the read isn't associating them. Confirmed mapping: `combat_power` IS the Power row (D-06: basic map = combat_power only). Calibration frame sampbasic.png is 691×416 (aspect 1.6611); the reported shot appears to be a DIFFERENT window size — region fractions are calibrated to the exact frame, so window-size variance is the prime suspect. Exact failure mode (blank vs wrong value) to be established by reproduction. |



**OWNER UAT: BLOCKED BY DEFECTS — round 1 walk attempted 2026-10-11 (crop trigger + accept gate: fixed, owner-ratified 5% threshold); round 2 re-walk hit CropOverlay defects (D-05-UAT-4/5/6) — still blocked, not approved.**

The earlier deferral record (below) is superseded by this attempt: the owner returned, ran the preview at http://localhost:4173 with the real screenshots, and hit the three defects above. **No step is marked PASS; INPT-02 completion and Phase 5 verification remain HELD.**

**Round-2 owner decisions RESOLVED and implemented (2026-10-12):** D-05-UAT-4/5 were ratified by the owner (free-form crop + dashed example + 2% confirm gate; decline relabel + cancelled status line — dispositions above) and implemented with TDD proof (full suite 209/209, `tsc -b` clean, build green, all criterion-3 gates holding). The re-walk below exercises the new flow; D-05-UAT-6 needs no code action.

---

*Superseded deferral record (2026-10-11, kept for history):* the owner was absent at the first checkpoint and directed (verbatim): *"I'll be absent for a while hence cannot do tests — let's proceed with the next step. Record steps 1 to 11 so we can do it later."*

## How to resume

1. **Fixes land first:** the debug session (see `.planning/debug/`) diagnosed D-05-UAT-1/2/3 (fixed + owner-ratified 5% threshold, proven by the offline exact-value harness on the real samples + full suite + build) and the round-2 dispositions D-05-UAT-4/5 were owner-ratified 2026-10-12 and implemented (free-form crop + example + confirm gate; cancel feedback). All automated gates re-verified post-change (full suite 209/209, `tsc -b` clean, build green, lazy-chunk + no-upload + dist-assets gates holding).
2. Restart the preview server: `npm run preview` (serves http://localhost:4173).
3. Re-walk steps 1–11 above in a real browser with your real screenshots from `.secrets/ocr-samples/` (sampbasic.png, sampideal1-3.png, common samples — they never enter git or the network).
4. Reply **"approved"** to accept, or report the step numbers + observed behavior for anything that differed (each deviation gets a disposition: accepted / needs-fix → becomes a gap plan and feeds /gsd-verify-work).
5. The continuation session then fills the verdicts in this file, writes 05-05-SUMMARY.md, and the phase verification chain (/gsd-verify-work → /gsd-transition) runs.

Optional during the walk: supply `SUPABASE_ACCESS_TOKEN` (+ `SUPABASE_PROJECT_REF` if not defaulted) as a session env var for a fresh live smoke re-run (gates 7–8) — same discipline as 03-02/05-02. Otherwise the recorded 05-02 live evidence stands.
