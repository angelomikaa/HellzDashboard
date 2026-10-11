---
phase: 5
slug: ocr-auto-read-layer
status: derived (owner ratifies at 05-05 UAT)
reviewed_at: 2026-10-11
shadcn_initialized: false
preset: none
created: 2026-10-11
---

# Phase 5 — UI Design Contract

> OCR capture layer on the existing submit wizard (02-UI-SPEC Screen 3 screens are the base; everything below extends them). Derived from 05-CONTEXT.md locked decisions (D-04..D-10, D-14..D-18) and the established hand-rolled design system.
>
> **pt-BR throughout.** All user-facing strings are final copy. The two CONTEXT-locked strings are marked 🔒.

> **Note:** this spec was derived by the planner from 05-CONTEXT.md because the phase's UI decisions were locked at discuss time (flow states, CTA copy, failure copy, per-step checkbox gate). The owner reviews and ratifies it during the 05-05 UAT checkpoint; run `/gsd-ui-phase 5` first if a dedicated pass is preferred.

---

## Design System (unchanged from 04-UI-SPEC)

| Property | Value |
|----------|-------|
| Component library | none — React 19 function components, Tailwind v4 utilities only |
| Icons | none — text-first UI; the upload icon on the CTA is a single inline SVG (arrow-up-from-bracket shape) |
| Typography | the 4 sizes/2 weights from 04-UI-SPEC: CTA and states use `text-base`/`text-sm`; no new sizes |
| Touch targets | 44px (`h-11`) on every interactive element, incl. the upload CTA and crop buttons |

All existing tokens apply (`bg-accent`, `text-accent-foreground`, `border-line`, `bg-surface`, `text-content`, `text-muted`, `text-success`, `text-destructive`, `focus-visible:ring-2 focus-visible:ring-accent`, enumeration-safe error copy). No new tokens.

---

## Capture step anatomy (applies to steps 1–4)

Each capture step (Personagem/step 1 = basic header, Geral, Quasi, Especial) gains, **above its existing content** (step 1: above the Poder de Combate field; steps 2–4: above the example-shot/input list):

### 1. Upload CTA (D-09, D-10)

- Accent-filled `h-11 rounded-md` button: inline SVG upload icon (16px, `text-accent-foreground`) + label 🔒 **"Faça upload dos seus status aqui"**. `accept="image/*"`, hidden file input.
- Bright and immediately visible — the player is encouraged to OCR instead of typing ~50 fields — but the button is the ONLY OCR entry: manual entry stays fully available with no upload (criterion 3).
- **Run-confirmation state (D-10):** while a read runs, the CTA area shows a status line `text-sm text-muted` — `Lendo captura…` — and the CTA becomes `disabled` (no double reads).
- **After a completed read:** status line shows `Leitura concluída — confira os valores abaixo.` (success tint `text-success`) and the CTA re-enables (re-upload = read again, D-15). After a failed/crashed read (D-18): `Não foi possível ler a captura automaticamente. Preencha os valores manualmente.` (`role="status"`, `text-muted` — degradation is an expected state, not an error the player must fix).

### 2. Field states (D-04, D-14, D-15, D-17)

- **Running (D-17):** every input of the step is `disabled` with `animate-pulse` and placeholder `Lendo captura…`. No typing/OCR race.
- **Detected:** value silently pre-filled (D-16 — no confidence badge, no UI flag; the checkbox is the human check).
- **Failed / not read:** field left blank with the 🔒 failure message under it: **"O valor não foi detectado na print - Por favor preencha o campo manualmente"** (`text-sm font-semibold text-destructive`, `role="alert" aria-live="polite"`). Typing in the field clears the message. A fresh read resets the step's failure set (D-15: re-upload replaces all of the step's fields — detected overwrite, the rest blank + failure message).
- Fields not belonging to the step are never touched by that step's read (RESEARCH §2 trimming).

### 3. Per-step verification checkbox (D-08 — the review gate)

- Native checkbox in a `<label>` row, identical style to the current ReviewStep checkboxes (`h-5 w-5 accent-[#E3B341]`, 44px row).
- Step 1 copy: `Revisei os valores do personagem e estão corretos.` — steps 2–4 reuse the existing group copy verbatim: `Revisei os valores de {Geral|Quasi|Especial} contra as capturas e estão corretos.`
- **Continuar is disabled until the checkbox is checked** (and the group parses complete — Especial now required, D-07). **Editing any value on the step unchecks it** (stale-confirmation reset).
- Step 5 (Revisão) loses its three checkboxes (they moved to the steps); it stays as the tap-to-fix summary + Enviar, with Enviar also gated on all four step verifications being currently checked (defense in depth — server re-validates regardless).

---

## Crop overlay (D-05 — optional, triggered only on "excessive information")

**Trigger (discretion, seeded):** the uploaded image's aspect ratio deviates > **12%** from the capture's reference aspect (basic 1.661 / general 0.854 / quasi 0.887 / special 0.830) → the crop prompt appears BEFORE any read. Optimal crops skip cropping entirely.

- Fullscreen fixed overlay (`fixed inset-0 bg-black/80 z-50`), the image contained (`max-h-[80vh]`), pt-BR heading `Ajuste o recorte da captura` (`text-xl font-semibold text-content` on a `bg-surface` panel).
- **Aspect-locked crop box**: `border-2 border-accent`, lock ratio = reference aspect. Drag inside the box to move; one corner handle (16px, `bg-accent`) to resize; minimum box = 40% of the limiting dimension. Pointer events, no library.
- Buttons (both `h-11`): `Usar recorte` (accent-filled — proceeds to the read with the cropped canvas) and `Enviar sem recortar` (`border-line` — **cancels the read**; per D-05 declining the crop lands the player in manual entry, no garbage read on a full screenshot).

---

## HistoryList addition (D-11)

New status badge value: `discarded: 'Descartado'`, `text-muted` (same visual weight as Aguarda validação — a discarded row is the player's own replaced pending, not an officer judgment).

---

## Copy table (final pt-BR strings)

| Element | Copy |
|---|---|
| Upload CTA 🔒 | `Faça upload dos seus status aqui` |
| Field failure 🔒 | `O valor não foi detectado na print - Por favor preencha o campo manualmente` |
| Reading status | `Lendo captura…` (also the disabled input placeholder) |
| Read done | `Leitura concluída — confira os valores abaixo.` |
| Read failed/unavailable | `Não foi possível ler a captura automaticamente. Preencha os valores manualmente.` |
| Crop heading | `Ajuste o recorte da captura` |
| Crop confirm | `Usar recorte` |
| Crop decline | `Enviar sem recortar` |
| Step 1 checkbox | `Revisei os valores do personagem e estão corretos.` |
| Steps 2–4 checkboxes | existing `Revisei os valores de {Geral\|Quasi\|Especial} contra as capturas e estão corretos.` |
| Discarded history badge | `Descartado` |

**Literal-gate discipline (04-01/04-02):** the two 🔒 strings appear exactly once in the source (definition site); comments describe them, never quote them.

---
*Phase 5 UI contract — .planning/phases/05-ocr-auto-read-layer*
