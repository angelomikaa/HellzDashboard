---
phase: 5
slug: ocr-auto-read-layer
status: approved
reviewed_at: 2026-10-11
shadcn_initialized: false
preset: none
created: 2026-10-11
---

# Phase 5 — UI Design Contract

> OCR capture layer on the existing submit wizard (02-UI-SPEC Screen 3 screens are the base; everything below extends them). Derived from 05-CONTEXT.md locked decisions (D-04..D-10, D-14..D-18) and the established hand-rolled design system.
>
> **pt-BR throughout.** All user-facing strings are final copy. The two CONTEXT-locked strings are marked 🔒.
>
> **Update mode:** this contract refines the planner-derived baseline (same file, 2026-10-11) into the full 6-dimension format. Every locked decision (05-CONTEXT.md, 05-DISCUSSION-LOG.md) and every baseline-resolved discretion value (crop trigger, micro-copy, crop mechanics) is preserved verbatim; additions are the explicit token/spacing/typography/color declarations, state matrix, component inventory, and a11y/security contracts the checker and executor consume. The owner ratifies this spec at the 05-05 UAT checkpoint (STATE.md Phase 05 planning decision).
>
> **Owner-ratified deviations recorded in place (2026-10-12, 05-UAT.md round-2 dispositions D-05-UAT-4/5):** (1) the crop box is FREE-FORM (any shape) with a dashed example rectangle at the capture aspect, and confirm is gated on a 2% aspect tolerance — superseding the aspect-locked crop mechanics discretion below; (2) the crop decline button is relabelled and declining now surfaces a cancelled-feedback status line — superseding the silent decline copy/semantics presentation. Earlier ratified deviation (2026-10-11): the crop trigger runs at >5% aspect deviation (was >12%). All other contract dimensions are unchanged.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (hand-rolled components — shadcn deliberately NOT initialized; locked project decision, 04-UI-SPEC) |
| Preset | not applicable |
| Component library | none — React 19 function components, Tailwind v4 utilities only |
| Icon library | none — text-first UI; the upload icon on the CTA is a single inline SVG (arrow-up-from-bracket shape, 16px) |
| Font | System UI stack (Tailwind default sans — no custom family declared in `@theme`) |
| Touch targets | 44px (`h-11`) on every interactive element, incl. the upload CTA and crop buttons |

All existing tokens apply (`bg-dominant`, `bg-surface`, `border-line`, `bg-accent`/`text-accent-foreground`, `text-content`, `text-muted`, `text-destructive`, `text-success`, `focus-visible:ring-2 focus-visible:ring-accent`, enumeration-safe error copy). **No new tokens are created this phase.** Tier tokens are not used (dashboard-only).

**Why no shadcn:** four shipped phases share the `@theme` token set in `src/index.css` and concrete component patterns (`h-11` controls, `rounded-md/lg`, `border-line`, `bg-surface`, accent-filled primary CTAs, `role="alert" aria-live="polite"` error copy). The hand-rolled stack is a locked project decision — the shadcn gate is answered by upstream artifacts, not re-asked. Registry safety gate: **not applicable** (no registry, no third-party blocks).

---

## Spacing Scale

Declared values (all multiples of 4 — Tailwind's 4px base). Unchanged from 02/04-UI-SPEC; restated as binding for the new elements:

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs | 4px | Upload-icon ↔ CTA-label gap (`gap-1`), field label→input gap, status-line gaps |
| sm | 8px | Upload block → step content (`mt-2`), checkbox row gaps (`gap-3` label-to-checkbox is 12px — see exceptions) |
| md | 16px | Field gaps in the input list (`gap-4`), upload CTA block internal spacing |
| lg | 24px | Step content → nav buttons (`mt-6`), card padding (`p-6`), crop overlay panel padding |
| xl | 32px | Not used this phase (reserved) |
| 2xl | 48px | Not used this phase (reserved) |
| 3xl | 64px | Not used this phase (reserved) |

**Exceptions (declared, established patterns):**
- **44px touch targets** (`h-11`) on every interactive element: upload CTA, Continuar, Voltar, Enviar, crop buttons, checkbox rows (`min-h-11`) — mobile-first (Ragnarok Origin players are on phones).
- **12px horizontal padding** (`px-3`) on outline controls and list rows; filled CTAs use `px-4` (shipped App.tsx / wizard pattern).
- **12px checkbox label gap** (`gap-3`) and 20px native checkbox (`h-5 w-5`) — shipped ReviewStep pattern, reused verbatim.
- **16px crop corner handle** (`h-4 w-4`) — pointer target, off the scale steps but a multiple of 4.

Everything renders inside App's existing `max-w-3xl px-4 py-6` main wrapper — no new page-level spacing.

---

## Typography

Exactly 3 sizes, 2 weights (all map to existing Tailwind classes in the shipped wizard; the project's 4th size — 48px Display — is dashboard-only and not used here):

| Role | Size | Weight | Line Height | Classes | Used for |
|------|------|--------|-------------|---------|----------|
| Body | 16px | 400 | 1.5 | `text-base` | Input values, checkbox copy, button labels, CTA |
| Label/Caption | 14px | 400 (600 for labels, status lines, errors) | 1.5 | `text-sm` | Field labels, status lines (`Lendo captura…` etc.), failure/error messages, history status badges |
| Heading | 20px | 600 | 1.2 | `text-xl font-semibold` | Crop overlay heading `Ajuste o recorte da captura`, step headings |

**Rules:**
- The upload CTA label is Body size, `font-semibold` (it is a primary CTA — matches Continuar/Enviar).
- Field failure messages are `text-sm font-semibold text-destructive` (existing error pattern).
- No other sizes or weights. No italics.

---

## Color

60/30/10 is already tokenized in `src/index.css` — restated as the binding contract:

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0D1117` (`bg-dominant`) | Page background (App root — already set) |
| Secondary (30%) | `#161B22` (`bg-surface`) | Wizard card, inputs, crop overlay panel, history rows |
| Line | `#30363D` (`border-line`) | Input borders (default), outline buttons, history row borders |
| Accent (10%) | `#E3B341` (`bg-accent` / `text-accent-foreground`) | See reserved list below |
| Destructive | `#F85149` (`text-destructive`) | Error/failure text ONLY (incl. the 🔒 OCR failure message) |
| Success | `#3FB950` (`text-success`) | Read-done status line, ✓ parse previews, step-indicator done, `Envio registrado!` |
| Content | `#E6EDF3` (`text-content`) | All primary text, labels, input values |
| Muted | `#8B949E` (`text-muted`) | Reading status, degraded-read status, disabled states, `Descartado` badge, `%` suffixes |

**Accent reserved for (exhaustive list — never "all interactive elements"):**
1. **Upload CTA** — filled `bg-accent text-accent-foreground` (D-09: the bright, encouraged OCR entry point)
2. Existing primary CTAs, unchanged: `Continuar`, `Enviar`, `Enviar novos status`
3. `focus-visible` rings on all interactive elements (project-wide pattern)
4. Active tab underline (existing App pattern — unchanged)
5. **Crop overlay selection affordance**: crop box border (`border-2 border-accent`) + corner handle (`bg-accent`)

**Accent is NOT used for:** input borders, failure messages, status lines, skeleton shimmer, the crop-decline button (outline `border-line`), the dashed crop example/ghost rectangle (muted), or the cropped-image preview. `animate-pulse` runs on the token default (content color at reduced opacity) — no new color introduced.

---

## Copywriting Contract

All strings are final pt-BR copy. Error copy is enumeration-safe — raw engine/worker/network text is never rendered.

| Element | Copy |
|---|---|
| Upload CTA 🔒 | `Faça upload dos seus status aqui` |
| Field failure 🔒 | `O valor não foi detectado na print - Por favor preencha o campo manualmente` |
| Reading status | `Lendo captura…` (also the disabled input placeholder) |
| Read done | `Leitura concluída — confira os valores abaixo.` |
| Read failed / OCR unavailable (D-18) | `Não foi possível ler a captura automaticamente. Preencha os valores manualmente.` |
| Read cancelled (ratified deviation, D-05-UAT-5) | `Leitura cancelada` |
| Crop heading | `Ajuste o recorte da captura` |
| Crop example helper (ratified deviation, D-05-UAT-4) | `Ajuste a área de recorte no formato do exemplo tracejado` |
| Crop confirm | `Usar recorte` |
| Crop decline (ratified relabel, D-05-UAT-5) | `Cancelar leitura` |
| Crop confirm-gate message (ratified deviation, D-05-UAT-4) | `Ajuste o recorte ao formato do exemplo` |
| Step 1 verification checkbox | `Revisei os valores do personagem e estão corretos.` |
| Steps 2–4 verification checkboxes | existing group copy verbatim: `Revisei os valores de {Geral\|Quasi\|Especial} contra as capturas e estão corretos.` |
| Discarded history badge (D-11) | `Descartado` |
| Primary CTA (phase-level) | The upload CTA above — verb+noun, the encouraged action; `Continuar`/`Enviar` unchanged |
| Empty state | none new — the wizard's existing empty/blocked states (02-UI-SPEC) are unchanged; OCR is additive |
| Error state | D-18 degradation copy above (problem + what to do next: fill manually); network/session/submit errors reuse the existing wizard copy verbatim |
| Destructive confirmation | none — this phase has no destructive actions; `discarded` is an automatic server-side status mark (INPT-04: rows are never deleted or overwritten; the UI gains no delete/edit path) |

**Literal-gate discipline (04-01/04-02):** the two 🔒 strings appear exactly once in the source (definition site); comments describe them, never quote them.

---

## Capture Step Anatomy (steps 1–4)

Each capture step (Personagem/step 1 = basic header, Geral, Quasi, Especial) gains, **above its existing content** (step 1: above the Poder de Combate field; steps 2–4: above the example-shot/input list):

### 1. Upload CTA (D-09, D-10)

- Accent-filled `h-11 rounded-md` button: inline SVG upload icon (16px, `text-accent-foreground`) + label 🔒 **"Faça upload dos seus status aqui"**. `accept="image/*"`, hidden file input (no `capture` attribute — screenshots come from the gallery).
- Bright and immediately visible — the player is encouraged to OCR instead of typing ~50 fields — but the button is the ONLY OCR entry: manual entry stays fully available with no upload (criterion 3).
- **Run-confirmation state (D-10):** while a read runs, the CTA area shows a status line `text-sm text-muted` — `Lendo captura…` — and the CTA becomes `disabled` (`aria-busy`, no double reads). Auto-run on file select; re-uploading a different screenshot re-runs the read.
- **After a completed read:** status line shows `Leitura concluída — confira os valores abaixo.` (`text-success`) and the CTA re-enables (re-upload = read again, D-15). After a failed/crashed read or engine unavailability (D-18): `Não foi possível ler a captura automaticamente. Preencha os valores manualmente.` (`role="status"`, `text-muted` — degradation is an expected state, not an error the player must fix). Status lines use `role="status" aria-live="polite"` so screen readers announce read completion.
- Retry path for failures: re-upload (the CTA stays the single entry).

### 2. Field states (D-04, D-14, D-15, D-16, D-17)

- **Running (D-17):** every input of the step is `disabled` with `animate-pulse` (the skeleton/shimmer) and placeholder `Lendo captura…`. No typing/OCR race.
- **Detected:** value silently pre-filled (D-16 — no confidence badge, no UI flag; the threshold is an internal accept/reject gate, OCRX-01 stays v2). The existing blur-driven `✓ <valor>` parse preview applies unchanged.
- **Failed / not read:** field left blank with the 🔒 failure message under it: **"O valor não foi detectado na print - Por favor preencha o campo manualmente"** (`text-sm font-semibold text-destructive`, `role="alert" aria-live="polite"`). Typing in the field clears the message; from then on the existing parse feedback (✓ preview / `Valor inválido…` hint) governs. The OCR failure message and the parse hint never coexist — the failure message exists only on blank unread fields.
- **A fresh read resets the step's failure set** (D-15: re-upload replaces all of the step's fields — detected overwrite, the rest blank + failure message).
- Fields not belonging to the step are never touched by that step's read (RESEARCH §2 group-trimming — no cross-step silent clearing of user-typed data). `dmg_vs_demi_human` is never OCR-readable: after a special-step read it always shows the 🔒 failure message and is filled manually.

### 3. Per-step verification checkbox (D-08 — the review gate)

- Native checkbox in a `<label>` row, identical style to the current ReviewStep checkboxes (`h-5 w-5 accent-[#E3B341]`, `min-h-11` row, Body size copy).
- Step 1 copy: `Revisei os valores do personagem e estão corretos.` — steps 2–4 reuse the existing group copy verbatim: `Revisei os valores de {Geral|Quasi|Especial} contra as capturas e estão corretos.`
- **Continuar is disabled until the checkbox is checked AND the group parses complete** (all Geral/Quasi/Especial fields required now — Especial mandatory per D-07; on step 1 only combat_power is optional, but a typed value must parse).
- **Editing any value on the step unchecks it** (stale-confirmation reset — same principle as the current ReviewStep `useEffect`). **A completed read (initial or re-read) also unchecks that step's checkbox** — the values may have changed, so the player re-verifies against the new screenshot. Other steps' checkboxes are untouched (reads are step-scoped).

---

## Crop Overlay (D-05 — optional, triggered only on "excessive information")

**Trigger (ratified calibration change, 2026-10-11):** the uploaded image's aspect ratio deviates > **5%** (exclusive boundary, was >12% at baseline) from the capture's reference aspect (basic 1.661 / general 0.854 / quasi 0.887 / special 0.830) → the crop prompt appears BEFORE any read. Optimal crops skip cropping entirely.

**Crop mechanics (owner-ratified deviation, 2026-10-12 — D-05-UAT-4, supersedes the baseline's aspect-locked box):**

- Fullscreen fixed overlay (`fixed inset-0 bg-black/80 z-50`), the image contained (`max-h-[80vh]`), pt-BR heading `Ajuste o recorte da captura` (`text-xl font-semibold text-content` on a `bg-surface` panel, `p-6`), helper line `Ajuste a área de recorte no formato do exemplo tracejado` (`text-sm text-muted`).
- **Example:** a dashed ghost/template rectangle at the step's CAPTURE aspect (the framing the read expects — region fractions are calibrated to that frame), centered at the full capture-frame size, rendered BEHIND the player's crop box (`border-2 border-dashed border-muted`, non-interactive). The helper copy tells the player to reproduce that framing with the crop box.
- **Free-form crop box**: `border-2 border-accent`, NO aspect lock — the player drags it anywhere and resizes it via one corner handle (16px `h-4 w-4`, `bg-accent`) to ANY shape; each axis is bounded by the image and floored at 40% of the capture-frame extent on that axis. The default opening box starts AT the capture aspect (centered, 80% of the capture-frame extents — a good starting point that already matches the example), freely adjustable from there. Pointer events, no library.
- **Confirm gate (non-negotiable physics, harness-proven):** `Usar recorte` proceeds ONLY when the crop's aspect matches the capture aspect within the **2% frame tolerance** (inclusive + a 1e-9 epsilon, the needsCrop convention). Out of tolerance → the read is NOT consumed: an inline message `Ajuste o recorte ao formato do exemplo` (`role="alert" aria-live="polite"`, `text-sm font-semibold text-destructive`) shows and the overlay stays OPEN so the player fixes the crop or cancels. Within tolerance → the read proceeds with the cropped canvas exactly as before. Evidence: harness experiment E — frame-exact crop → 14/14 exact; forced 1:1 square → 0/14; default rough box → 0/14.
- Buttons (both `h-11`): `Usar recorte` (accent-filled — proceeds to the read via the confirm gate) and `Cancelar leitura` (`border-line` outline — **cancels the read**; per D-05 declining the crop lands the player in manual entry, no garbage read on a full screenshot).
- **Decline semantics (ratified deviation, 2026-10-12 — D-05-UAT-5):** overlay closes, NO read runs, no field/failure changes — and the step now surfaces a visible cancelled-feedback status line `Leitura cancelada` (`text-muted`) so the return is no longer silent. The line clears on the next upload (reading state). Declining is always a complete, safe exit.
- **Focus management:** on open, focus moves to `Usar recorte`; both buttons are keyboard-operable; `Escape` maps to decline (cancel). The drag/resize gesture itself is pointer-only — the decline button is the full keyboard path.

---

## Wizard Realignment (05-03 — manual-first half)

- **Especial mandatory (D-07):** step 4's `Continuar` now gates on all Especial fields parsing, exactly like Geral/Quasi. `combat_power` stays the only optional stat.
- **Per-step checkboxes (D-08):** all four capture steps gain the verification checkbox above; the review gate moves from end-of-flow to per-step.
- **ReviewStep (step 5 — Revisão) shrinks** (discretion resolved: kept as last-chance summary, not removed): it loses its three checkboxes (they moved to the steps) and stays as the tap-to-fix summary + `Enviar`, with `Enviar` also gated on **all four step verifications being currently checked** (defense in depth — jump-back-and-fix unchecks that step's box and the player re-verifies it; server re-validation via `create_submission` is unchanged regardless, INPT-03).
- Step indicator, Voltar/Continuar nav, blocked state, and success view are unchanged (02-UI-SPEC).

---

## HistoryList Addition (D-11)

- `SubmissionRow['status']` union in `src/lib/api.ts` gains `'discarded'`; `HistoryList` gains `discarded: 'Descartado'` with `text-muted` (same visual weight as `Aguarda validação` — a discarded row is the player's own replaced pending, not an officer judgment).
- No new row actions: the list stays append-only read-only; `Enviar novos status` restarts the wizard with fresh inputs (unchanged).

---

## Component Inventory

New UI surface (decomposition within `src/features/submit/` is the planner's call; visual contracts are fixed):

| Element | Contract |
|---------|----------|
| Upload CTA block | `{ state: 'idle' \| 'reading' \| 'done' \| 'failed'; onFile: (file: File) => void }` — accent button + hidden `accept="image/*"` input + status line; the single OCR entry per step |
| OCR field-state wiring | StatGroupStep (and step 1's combat_power input) gain a per-field outcome map + `reading` flag driving disabled/`animate-pulse`/failure-message rendering; parse feedback paths unchanged |
| CropOverlay | `{ bitmap: ImageBitmap; aspect: number; onConfirm: (cropped: HTMLCanvasElement) => void; onCancel: () => void }` — FREE-FORM box (ratified deviation) + dashed example at the capture aspect + 2% confirm gate (out-of-tolerance: inline message, overlay stays open); decline cancels the read; focus + Escape handling per above |
| Per-step checkbox | native checkbox row, copy per table, stale-reset wiring in the step component |
| ReviewStep (restructured) | summary rows + Enviar; loses its checkbox block; gains the four-verifications gate |
| HistoryList | status map extension only |

The OCR engine module itself (`src/features/submit/ocr/` — regions, sanity, preprocess, recognize) is engine code, not UI; its contracts live in 05-RESEARCH §3.4.

---

## State Matrix

**Step-level (OCR):**

| State | Detection | Rendering |
|-------|-----------|-----------|
| Idle | no read on this step | CTA enabled, no status line — pure manual flow (02-UI-SPEC unchanged) |
| Crop prompt | aspect deviates > 5% from reference (ratified threshold, 2026-10-11) | overlay before any read; confirm → 2% aspect gate: in-tolerance → read, out-of-tolerance → inline message + overlay stays open (no read consumed); decline → cancelled state |
| Reading | read in flight | CTA disabled + `aria-busy`; status `Lendo captura…` (`text-muted`); all step inputs disabled + `animate-pulse` + placeholder |
| Done | read finished (any outcome mix) | status `Leitura concluída…` (`text-success`); CTA re-enabled; step checkbox unchecked |
| Failed / unavailable | engine crash or unavailable (D-18) | status `Não foi possível ler…` (`role="status"`, `text-muted`); fields untouched; CTA re-enabled (retry = re-upload) |
| Cancelled (ratified deviation, 2026-10-12) | player declined the crop (button or Escape) | status `Leitura cancelada` (`role="status"`, `text-muted`); CTA enabled; fields untouched; cleared by the next upload (reading state) |

Precedence: crop prompt > reading > done/failed/cancelled. Existing wizard errors (network/session/submit) are unchanged and separate.

**Field-level (within a reading step):**

| State | Rendering |
|-------|-----------|
| Reading | disabled + `animate-pulse`, placeholder `Lendo captura…` |
| Detected | value pre-filled, renders normally (no badge — D-16); ✓ preview on blur per existing rules |
| Not detected | blank + 🔒 failure message (`role="alert"`, destructive); cleared on typing |
| Typed invalid (existing) | unchanged blur-driven `Valor inválido…` path |

**Re-read (D-15):** replace-all-displayed — detected overwrite, undetected blank + failure message; the step's checkbox unchecks.

---

## Accessibility & Interaction Contract

- Every interactive element is `h-11` (44px) with `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`; every input keeps its `<label htmlFor>` (02-UI-SPEC pattern).
- Status lines (reading/done/failed) use `role="status" aria-live="polite"`; field failure messages use `role="alert" aria-live="polite"`; `aria-busy` on the CTA and step container while reading.
- The OCR flow never removes the manual path: every field remains a labeled text input regardless of OCR state — the a11y path never depends on reading a screenshot.
- Checkbox rows are `<label>` wrapping native checkboxes (shipped ReviewStep pattern); `disabled` + `disabled:opacity-60 disabled:cursor-not-allowed` while submitting.
- No hover-only affordances; the crop decline button is the keyboard-safe exit (with Escape); `prefers-reduced-motion` needs nothing new (`animate-pulse` is the only motion, matching the shipped skeleton convention).
- Values render via `formatStatValue` (pt-BR `1.234.567` / `,` decimals / trailing `%`) — never raw JSON numbers.

---

## Security Rules (non-negotiable, bind the executor)

1. **Screenshots never leave the player's device (D-10):** no `FormData`, no upload path, no Storage bucket anywhere in the OCR feature — extend the 02-03 grep gate to `src/features/submit/ocr/` + new UI files. The only network calls the OCR stack makes are the worker's own asset fetches (self-hosted `/ocr/*` + tessdata CDN `eng.traineddata.gz`).
2. **Lazy-load (criterion 3):** the OCR module is imported only via dynamic `import()` in the upload handler — Tesseract + OCR code must land in a separate chunk, never the entry bundle; manual entry works identically with the chunk unloaded.
3. **OCR is never a silent authority (INPT-03):** the per-step checkbox gate is UX-only; `create_submission` re-validates regardless.
4. **Confidence stays internal (D-16):** no threshold, confidence number, or low-confidence hint is ever surfaced; OCRX-01 is v2.
5. **Single parser:** the OCR module imports `parseStatValue` — no second parser (drift hazard, 05-RESEARCH pitfall 2).
6. **Step-scoped writes only:** a read touches only its own step's displayed fields (group-trimmed region maps) — never another step's data.
7. **Append-only (INPT-04):** `discarded` is a server-side status mark; the UI gains no delete or overwrite path anywhere.
8. **Literal gate:** the two 🔒 strings appear exactly once in source (definition site); comments describe, never quote.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none (hand-rolled components) | — | not applicable |

No shadcn, no third-party registries, no third-party UI blocks. Nothing to vet.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending — owner ratifies at the 05-05 UAT checkpoint

---
*Pre-populated from: 05-CONTEXT.md (D-01..D-22, both 🔒 strings, all locked), 05-DISCUSSION-LOG.md (option selections), 05-RESEARCH.md (§2 trimming, §5 realignment, reference aspects, pitfalls), 02-UI-SPEC.md (Screen 3 base), 04-UI-SPEC.md (design-system declarations), src/index.css tokens, src/features/submit/* shipped code. Discretion areas resolved: read-unchecks-checkbox rule, crop overlay focus/Escape handling, field-state precedence, state matrix.*
