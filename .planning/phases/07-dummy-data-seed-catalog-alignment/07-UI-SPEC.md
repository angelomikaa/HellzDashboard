---
phase: 7
slug: dummy-data-seed-catalog-alignment
status: approved
shadcn_initialized: false
preset: none
created: 2026-10-13
---

# Phase 7 — UI Design Contract

> Minimal-surface contract: Phase 7 is data + catalog work. The only user-visible changes
> are the build-role **label vocabulary** (ROLE-05 UI side) and the staff edit form's
> role selector. No new components, layouts, colors, or typography.

---

## Scope of UI Change

| Surface | File | Change |
|---------|------|--------|
| Shared label map | `src/lib/groups.ts` | `FUNCTION_LABELS` becomes `Record<'dps' \| 'mdps' \| 'suporte', string>` with new pt-BR vocabulary |
| Staff edit form (Personagens) | `src/features/admin/CharactersPage.tsx` | `Draft.charFunction` type widens to `'dps' \| 'mdps' \| 'suporte'`; role `<select>` gains the Dano Mágico option; local `FUNCTION_LABELS` (lines 53–56) replaced by the shared import |
| Submission header | `src/features/submit/SubmitPage.tsx` | Local `FUNCTION_LABELS` (line 58) replaced by shared import; type widens |
| Read-only label consumers | `ValidacoesPage.tsx`, `KeyStatsPage.tsx`, `OvrHero.tsx`, `PromotionCard.tsx` | No code change beyond the shared map they already import — labels update automatically |

**Explicitly out of UI scope:** Stats-Chave role selector (Phase 9), any member-facing
role self-service (out of scope per CONTEXT), any layout/spacing/color change.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Tailwind v4 `@theme` tokens already established in `src/index.css`) |
| Preset | not applicable |
| Component library | none (native elements + existing page patterns) |
| Icon library | none used this phase |
| Font | unchanged (existing app font stack) |

---

## Spacing Scale

**No new spacing decisions.** The form select and any label rendering reuse the exact
classes already present in `CharactersPage.tsx` edit form. No layout change → no new
tokens. Exceptions: none.

---

## Typography

**No new typography decisions.** Labels render in existing table/hero text styles.
Exceptions: none.

---

## Color

**No new color decisions.** No new badges, tiers, or status colors this phase. The
existing tokens in `src/index.css` (dominant `#0D1117`, surface `#161B22`, accent
`#E3B341`, content `#E6EDF3`, muted `#8B949E`) are untouched. Exceptions: none.

---

## Copywriting Contract

The ONLY copy change this phase is the build-role vocabulary (CONTEXT D-04/D-05,
success criterion 2: "the staff edit form and labels speak the new vocabulary"):

| Element | Copy (pt-BR, locked) |
|---------|----------------------|
| Role label — `dps` | `Dano Físico` |
| Role label — `mdps` | `Dano Mágico` |
| Role label — `suporte` | `Suporte` |
| Staff form select options | `Dano Físico` / `Dano Mágico` / `Suporte` (same three strings; select option text = display label, single source: `FUNCTION_LABELS`) |
| Select aria-label / visible label (if present in form) | `Função` (existing wording preserved — do not invent new field names) |

Rationale: the owner's nomenclature decision (REQUIREMENTS ROLE-05) names the three
roles Dano Físico / Dano Mágico / Suporte; CONTEXT D-05 explicitly renames
`tank` → `suporte` → "Suporte". The old short forms (`DPS`, `Tank`) are retired
everywhere the map is rendered — one vocabulary, one source (`src/lib/groups.ts`).

**No new empty states, error states, or destructive confirmations are introduced.**
All existing copy in `CharactersPage.tsx` (feedback messages, confirm dialogs) is
untouched.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| third-party | none | not required |

No npm dependencies added (ROADMAP cross-cutting constraint; AGENTS.md stack).

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — single vocabulary, one source map, pt-BR, matches owner nomenclature
- [x] Dimension 2 Visuals: PASS — no layout/component change; reuse of existing form select pattern
- [x] Dimension 3 Color: PASS — zero color decisions; existing tokens untouched
- [x] Dimension 4 Typography: PASS — zero typography decisions
- [x] Dimension 5 Spacing: PASS — zero spacing decisions; existing form classes reused
- [x] Dimension 6 Registry Safety: PASS — no registry blocks, no new dependencies

**Approval:** approved 2026-10-13 (minimal-surface contract — auto-approved under yolo mode; vocabulary per CONTEXT D-04/D-05)
