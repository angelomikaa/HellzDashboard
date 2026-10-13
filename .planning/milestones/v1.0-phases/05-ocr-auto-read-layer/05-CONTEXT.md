# Phase 5: OCR Auto-Read Layer - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Bolt client-side region-based OCR pre-fill onto the already-working submit wizard (INPT-02): uploading a screenshot auto-pre-fills stat values via percentage-scaled region maps, digit/percent whitelisting, and canvas preprocessing (never whole-image). OCR is an accelerator, never a silent authority — the mandatory fix-up gate is retained and restructured per-step. Also includes this phase's wizard realignment (routed from Phase 3): Especial becomes mandatory, the basic header screenshot becomes a 4th OCR capture (combat_power), and each capture step gains its own verification checkbox. Ships the pending-replacement lifecycle rule (one pending per player). OCR must work in the production build (lazy-loaded, Vite worker/core bundling verified) and manual entry must still work fully when OCR fails.

**Requirements covered:** INPT-02 (OCR auto-reads screenshots client-side, region-based, pre-fills values).

**Not in this phase:** officer approve/reject queue and overturn recalculation UI (Phase 6, AUTH-05 — only the `discarded` status and one-pending rule land here), OCRX-01 low-confidence field flagging (v2), in-app dev-only calibration page (Phase 1 carry-over — spike script remains the recalibration vehicle), delta badges (v2).

</domain>

<decisions>
## Implementation Decisions

### Device fragmentation & region scaling
- **D-01:** Region rects are stored as **percentages of the reference screenshot's dimensions** and scaled proportionally to whatever image the player uploads. The spike's calibrated maps (on panel crops) become the canonical reference.
- **D-02:** Domain fact (owner-provided): the game has a **fixed scaling window** — desktop keeps a fixed shape, mobile is fullscreen-only — so every device renders the same layout proportionally. Percentage rects are reliable; device fragmentation is low-risk. Recalibration is only needed when the **game UI itself changes**.
- **D-03:** Layout-mismatch detection is **sanity ranges only** — no anchor/label pre-check. Per-field sanity ranges reject absurd reads; a wrong-screen screenshot relies on the fix-up gate + officer layer to catch.
- **D-04:** **Fill what passed**: fields that read cleanly get pre-filled; failed/undetected fields stay blank with an inline failure message (D-14). One bad region never voids the whole group.
- **D-05:** **Optional in-app crop step, triggered only when the uploaded image shows excessive information** (a full screenshot / bad crop vs the expected panel crop). Optimal crops skip cropping entirely. This keeps the spike's crop-calibrated maps valid as the crop reference. If the player declines the crop, OCR simply fails gracefully into manual entry.

### Capture schema & wizard realignment
- **D-06:** The **basic header screenshot becomes a 4th OCR capture**: the intro step gains a file input and OCR pre-fills `combat_power` (the only catalog stat on that screen). The other basic reads (nickname, job, levels) are not submitted.
- **D-07:** **Especial becomes mandatory** in the wizard (the Phase 3 D-08 realignment lands here) — completeness gating includes Special exactly like Geral/Quasi.
- **D-08:** Every capture step (basic + Geral + Quasi + Especial) follows the **same flow**: upload screenshot → OCR reads → user checks values → manual fill where needed → **step-completion checkbox** confirming the values were verified. The 4 captures together form one validable character input. Per-step checkboxes become the review gate (the end-of-flow ReviewStep shrinks or is restructured accordingly — OpenCode's discretion); server re-validation via `create_submission` is unchanged.
- **D-09:** Upload is **optional per step, with a bright CTA** — "Faça upload dos seus status aqui" with an upload icon. The player is highly encouraged to use OCR instead of typing a long form, but the pure-manual path stays fully available on every step.
- **D-10:** OCR **auto-runs on upload** with a visible run-confirmation state; re-uploading a different screenshot re-runs the read.

### Submission lifecycle (pending replacement)
- **D-11:** **One pending submission per player.** A new submission marks the player's previous pending row `status = 'discarded'` — a status mark only; rows are never deleted or overwritten (INPT-04 append-only is non-negotiable). This changes `create_submission` in a new corrective migration.
- **D-12:** Pending counts as valid until an officer overturns it (Phase 3 D-06 stands: cohort = `status != 'rejected'`; `discarded` rows must also leave the rank cohort — researcher/planner: extend the 0009 cohort filters to exclude `discarded`).
- **D-13:** Officer overturn semantics (approve/reject queue, discard latest + recalc from last validated input) stay **Phase 6** (AUTH-05). This phase delivers only the `discarded` status + pending-replacement rule.

### OCR failure & confidence UX
- **D-14:** Fields OCR fails to detect show the failure **in the field itself** — locked pt-BR string: "O valor não foi detectado na print - Por favor preencha o campo manualmente".
- **D-15:** **Re-upload overwrites**: a fresh read replaces all pre-fillable fields (detected fields overwrite, undetected fields show the failure message). Re-upload means "read again".
- **D-16:** Accepted reads **pre-fill silently** — the internal confidence threshold (~85, needs production-data calibration) is a reject/accept gate, not a UI flag; anything accepted renders normally. The per-step checkbox is the human check. OCRX-01 (low-confidence field flagging) stays v2.
- **D-17:** Inputs are **disabled with skeleton/shimmer while the read runs**; fields flip to values or failure messages when it finishes. No race between typing and OCR writing.
- **D-18:** OCR engine unavailability/crash degrades gracefully to the manual flow (ROADMAP criterion 3) — exact messaging at OpenCode's discretion.

### Region map delivery & versioning
- **D-19:** Region maps AND sanity ranges ship as **bundled, versioned code artifacts in the client OCR module** (the ARCHITECTURE.md pattern: only the regions/parse files ever need game-UI updates). A game UI change = recalibrate the spike → update maps → normal app deploy. No remote fetching.
- **D-20:** Sanity ranges are **hardcoded in the OCR module** (not catalog/admin-tweakable) — they are OCR-input guards, not game truth. Officer accept/reject is the designed second layer against insane values that slip through.
- **D-21:** **Single active game-UI version** supported. After a game update, players on the new UI get failed reads (blank + failure message) and fill manually until recalibration ships. No multi-version detection.
- **D-22:** **Two-layer trust model**: OCR sanity (layer 1) produces a "valid until overturned" state; officer human validation (layer 2, Phase 6 UI) is the tool to discard insane stats that passed layer 1. Passes both = truly valid input.

### OpenCode's Discretion
- "Excessive information" detection heuristic for the crop trigger (aspect-ratio vs read-failure signals)
- Crop UI mechanics (drag handles, aspect lock to the reference proportions)
- Initial per-stat sanity-range values (~57 stats; seed from spike ground truth + catalog ceilings)
- Confidence-threshold calibration procedure on production data
- OCR module decomposition under `src/features/submit/ocr/` — port the spike pipeline (preprocessing, dual-polarity read, whitelists) as pure functions + TDD
- Lazy-load / dynamic-import mechanics and Vite worker/core bundling verification (ROADMAP criterion 3)
- pt-BR micro-copy beyond the two locked strings (run-confirmation state, crop prompt, OCR-unavailable message)
- Whether the end-of-flow ReviewStep is removed or shrunk to a last-chance summary (per-step checkboxes are the gate either way)
- Testing approach for the OCR pipeline (synthetic-image self-test like the spike's `--self-test`, unit tests for parse/scale pure functions)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OCR spike (the pipeline being ported to the client)
- `.planning/phases/01-foundation-secure-access-data-model/OCR-SPIKE-RESULTS.md` — GO verdict (222/222 fields), methodology, and the caveats this phase must honor (device fragmentation → resolved by D-02; region maps are game-UI-versioned; dual-polarity read mandatory; fix-up mandatory)
- `scripts/ocr-spike.mjs` — the validated pipeline: `parseValue` (pt-BR locale), digit/percent + text whitelists, grayscale→3x upscale→normalize→binarize preprocessing, dual-polarity read, region OCR runner
- `scripts/ocr-regions.json` — pixel rects + resolutions per screenshot (the basis for percentage conversion per D-01), categories (basic/ideal/common)
- `scripts/ocr-spike.accuracy.test.mjs` — pure-function unit-test pattern to replicate for the client port

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — INPT-02 definition; Out of Scope (fully automatic OCR with zero manual review is explicitly excluded — non-negotiable); INPT-03/INPT-04 constraints the realignment must preserve
- `.planning/ROADMAP.md` §Phase 5 — goal + 3 success criteria (region-based client-side OCR; fix-up gate applies to OCR output; prod-build lazy-load + manual fallback)
- `.planning/PROJECT.md` — Key Decisions (OCR auto-read + manual fix-up; screenshots never stored server-side), Context §stat structure

### Prior phase decisions
- `.planning/phases/01-foundation-secure-access-data-model/01-CONTEXT.md` — D-08/D-09/D-10 spike logistics; D-10 (no server-side screenshot storage) binds the client OCR design
- `.planning/phases/03-rank-engine/03-CONTEXT.md` — D-06 cohort (`status != 'rejected'`), D-07 latest-submission semantics, D-08 Special-mandatory realignment routed here; owner's Phase 5 vision quotes in `<specifics>`

### Live schema the lifecycle change touches (read-only — never edit in place)
- `supabase/migrations/0005_registry_catalog.sql` — `create_submission` RPC (the pending-replacement change target, D-11)
- `supabase/migrations/0009_rank_engine.sql` — rank cohort filters in `my_report`/`class_top5` that must exclude `discarded` (D-12)
- `src/features/submit/SubmitPage.tsx` + `StatGroupStep.tsx` + `ReviewStep.tsx` + `wizard.ts` — the wizard being realigned; `wizard.ts` already anticipates combat_power OCR ("OCR-filled in Phase 5")
- `src/lib/parseStatValue.ts` — the client pt-BR parse canonical; the ported OCR `parseValue` must agree with it (researcher: verify parity)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/ocr-spike.mjs` — the entire validated OCR pipeline to port client-side (Tesseract.js v7 is already in `devDependencies` — **it must move to `dependencies`** for the production bundle)
- `scripts/ocr-regions.json` — calibrated pixel maps + reference resolutions per screenshot; convert to percentage rects per D-01
- `src/lib/parseStatValue.ts` — pt-BR number parse/format (`1.234.567` separators) — the canonical client parser the OCR output must be compatible with
- `src/features/submit/wizard.ts` — pure wizard logic: `GroupInputs` (stat_key → raw input string) is exactly what OCR pre-fill writes into; `groupComplete`/`buildStatsPayload` are the gate functions the realignment extends (Special → required)
- `src/lib/api.ts` — REST data layer pattern; the `create_submission` wrapper's payload is unchanged by the lifecycle rule (the change is server-side)

### Established Patterns
- Screenshots never leave the player's device (D-10) — OCR is entirely client-side; no uploads, no Storage bucket
- Guards are UX-only; enforcement is server-side (the fix-up checkbox gate is UX; `create_submission` re-validates)
- Pure functions + TDD for all logic (`wizard.ts`, `rankMath.ts`, `presentation.ts` precedents)
- ARCHITECTURE.md OCR pipeline isolation: `src/features/submit/ocr/` with only regions/parse files ever needing game-UI updates
- Migrations are append-only corrective; live tables/RPCs never edited in place (D-11 is a new migration)
- pt-BR UI copy everywhere; group labels Geral/Quasi/Especial

### Integration Points
- Submit wizard steps gain: file input + bright CTA, optional crop trigger, OCR runner, per-field value/failure/skeleton states, per-step verification checkbox
- `create_submission` RPC (0005) gains pending-replacement semantics via new migration; `submissions.status` needs a `discarded` value (enum/migration)
- 0009 rank-engine cohort filters must exclude `discarded` rows (D-12) — verify `my_report` + `class_top5`
- `HistoryList.tsx` renders submission statuses ("Aguarda validação") — must handle `discarded` rows
- App `Painel` empty-state CTA and dashboard are untouched (pure RPC presentations)

</code_context>

<specifics>
## Specific Ideas

- Owner vision (Phase 3 quote): "the ideal input would be OCR fills all the fields and the user just confirms that OCR read it correctly — the manual input is a fallback so no data is lost."
- Locked pt-BR strings: CTA **"Faça upload dos seus status aqui"** (with upload icon); field failure **"O valor não foi detectado na print - Por favor preencha o campo manualmente"**
- Owner's flow framing: "provide screenshots > OCR reads > user checks > manual fill if needed > checkbox confirming the process is done" — all four captures follow it and "together they form a validable character input"
- Two-layer trust in the owner's words: "As long as sanity check is passed, the player input is assumed as valid until an officer manually overturns it" — officer rejection is "the tool to discard insane stats [that] went through the first layer"
- Owner's game knowledge: "the game has a fixed scaling window — the screen will always be the same, but proportionally smaller" (desktop fixed shape; mobile fullscreen-only)

</specifics>

<deferred>
## Deferred Ideas

- **In-app dev-only OCR calibration/test page** (carried from Phase 1) — NOT built this phase; the spike script remains the recalibration vehicle when the game UI changes
- **OCRX-01 low-confidence field flagging** — stays v2 (D-16 keeps threshold internal)
- **Officer approve/reject queue + overturn recalculation UI** — Phase 6 (AUTH-05); only the `discarded` status and one-pending rule land here
- **Reviewed todos (not folded):** `owner-only-class-management` (pending todo from 03-04 UAT) — class-creation policy is unrelated to OCR; stays pending for a future phase

</deferred>

---

*Phase: 05-ocr-auto-read-layer*
*Context gathered: 2026-10-11*
