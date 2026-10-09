---
phase: 2
slug: 02-registry-catalog-manual-data-ingestion
status: draft (auto-generated — yolo-mode run; owner may re-spec interactively via /gsd-ui-phase 2)
shadcn_initialized: false
preset: none
created: 2026-10-09
---

# Phase 2 — UI Design Contract: Registry, Catalog & Manual Data Ingestion

> Visual and interaction contract for Phase 2's user-facing screens: the app navigation shell, the admin character/class management page ("Personagens"), and the member submit wizard ("Enviar Status"). **Extends — does not replace — the Phase 1 design system** (`01-UI-SPEC.md`): same tokens, spacing scale, typography, dark-only theme, pt-BR copy, and a11y patterns. Phase 1's spec explicitly deferred "first true empty states" to this phase — they are specced here.

---

## Design System (delta from Phase 1)

| Property | Value |
|----------|-------|
| Tool / library | none — hand-rolled components, semantic Tailwind v4 utilities against the `@theme` tokens in `src/index.css` (unchanged) |
| Icon library | none — Phase 2 needs no icons; text labels only (deferred with Phase 1 spec) |
| Language | pt-BR for ALL user-facing copy; numbers via `Intl.NumberFormat('pt-BR')` (e.g. `99.716`, `−33,38%`) |
| Theme | dark-only, 60/30/10 — unchanged |
| New tokens | none. `text-success` (#3FB950) gets its first use: validated-status badge in the submissions history |

### Reused tokens (from 01-UI-SPEC — do not redeclare)

`bg-dominant #0D1117` · `bg-surface #161B22` · `border-line #30363D` · `bg-accent #E3B341` / `text-accent-foreground` · `text-content #E6EDF3` · `text-muted #8B949E` · `text-destructive #F85149` · `text-success #3FB950`

**Spacing:** multiples of 4; label→input gap 8px; field gaps 16px; card padding 24px; **every interactive element ≥44px tall**.

**Type scale (unchanged):** Body 16/400 · Label 14/600 · Heading 20/600 · Display 28/600. No new sizes. Wizard step indicator uses Label size.

---

## Screen 1: App shell + navigation

The Phase 1 top bar is kept verbatim (Olá + role pill + Sair). Below it, a **tab bar** appears when the member is past login:

```
┌──────────────────────────────────────────────┐
│ Olá, Ahrya [Oficial]                    Sair  │  ← Phase 1 header, unchanged
├──────────────────────────────────────────────┤
│ [ Painel ]  [ Enviar Status ]  [ Personagens ] │  ← tabs, 44px tall, Label size
├──────────────────────────────────────────────┤
│                 (view)                       │
└──────────────────────────────────────────────┘
```

- Tabs are buttons (`type="button"`), state-driven (no router); active tab: `border-b-2 border-accent text-content`; inactive: `text-muted`.
- **Tab visibility is UX-only gating** (guards are UX — enforcement is RLS, AGENTS.md): `Painel` + `Enviar Status` for everyone; `Personagens` only when `session.member_role` is `officer`/`owner`.
- `Painel` keeps the Phase 1 placeholder copy until Phase 4.
- Mobile: tabs scroll horizontally if needed (`overflow-x-auto`); page content `px-4` with `max-w-3xl mx-auto` for the wide tables/forms.

---

## Screen 2: Personagens (officer/owner)

Single card (`bg-surface border border-line rounded-lg p-6`) containing, stacked:

1. **Heading (20px):** `Personagens` + sub-copy (14px, muted): `Registre nome, classe e função de cada membro.`
2. **Add-class form (REG-02):** one row — label `Nova classe` + text input (44px) + button `Adicionar Classe` (outline style: `border-line text-content`, NOT accent). Success: input clears + inline confirmation `Classe "{nome}" adicionada.` (Label size, `text-success`). Error: `Não foi possível adicionar. Verifique a conexão.` (`text-destructive`, `role="alert"`).
3. **Member table:** one row per member — `select=id,discord_handle,display_name,role,char_class,char_function` (pin_hash is NEVER in any payload; column grants enforce server-side). Columns: Personagem (display_name, 16px content) / Discord (14px muted) / Papel (role pill) / Classe (select dropdown) / Função (select: `DPS`, `Tank`).
   - **Inline edit:** each row's Classe/Função selects save on a per-row `Salvar` button (accent style, 44px). While saving: `aria-busy`, disabled. Character name (`display_name`) edits via the same row (text input replacing the static name, `Salvar` persists all three).
   - Success feedback: row's status text `Salvo.` (text-success). Failure: `Falha ao salvar — tente novamente.` (text-destructive).
   - **Empty state:** `Nenhum membro na lista branca ainda.` (muted, centered).
   - Load state: `Carregando…` (muted) — never a blank screen.

**State matrix:** idle / carregando / salvando (row buttons disabled) / erro (inline destructive, retry by pressing Salvar again). Officer-only data errors (401/403): `Sua sessão expirou ou você não tem permissão. Entre novamente.`

---

## Screen 3: Enviar Status — the submit wizard (members)

Five steps with a persistent step indicator `1 Personagem → 2 Geral → 3 Quasi → 4 Especial → 5 Revisão` (Label size; current=`text-content`, done=`text-success`, todo=`text-muted`).

**Step 1 — Personagem (intro):**
- Shows the member's registered character from their own member row: `Ahrya — Assassino (DPS)` (Heading size). The example "basic" header screenshot (`/examples/basic.svg`) sits beside the block.
- One optional input: `Poder de Combate` (numeric, parsed with the pt-BR rules).
- **Blocked state (no char_class):** wizard stops with copy `Seu personagem ainda não foi registrado. Peça a um oficial para registrá-lo na aba Personagens.` + disabled continue button. (Empty-state contract owed by Phase 1 spec.)

**Steps 2–4 — one per stat group (Geral → Quasi → Especial):**
- Each stat row: label (`CRIT`, Label size) + input (44px, `inputMode="decimal"`, percentual fields show a literal `%` suffix inside the field's right edge; flat fields show none).
- **Example shot beside input boxes (INPT-01):** the group's example image (`/examples/general.svg`, `/examples/quasi.svg`, `/examples/special.svg`) renders in a side panel (≥128px wide) on wide viewports and as a tappable thumbnail above the list on mobile (object-fit cover, `rounded-md border-line`).
- Inputs accept pt-BR forms (`1.234.567`, `12,34`, `−33,38%`); on blur the parsed canonical value previews back pt-BR-formatted (`✓ 1.234.567`). Parse failure: field border `destructive` + hint `Valor inválido — use números (ex.: 1.234.567 ou 12,5%).` (Label size).
- Required: **Geral + Quasi fields must all parse to continue**; **Especial fields are optional** (blank = not captured; a blank is never stored as 0).
- Nav: `Continuar` (accent, 44px, disabled while required fields incomplete) + `Voltar` (outline).

**Step 5 — Revisão (the mandatory fix-up gate, INPT-03):**
- All entered values listed by group (label, formatted value). Any stat can be tapped to jump back and fix it.
- Three confirmation checkboxes (44px touch rows), one per group: `Revisei os valores de {Geral|Quasi|Especial} contra as capturas e estão corretos.` Especial's checkbox also confirms blanks are intentional.
- **`Enviar` (accent) stays `disabled` until all three checkboxes are checked.** Server-side, `create_submission` re-validates regardless (guards are UX only).
- Submitting: `aria-busy`, all controls disabled. Error: `Não foi possível enviar. Verifique sua conexão e tente novamente.`

**Success view:** `Envio registrado!` (Heading, text-success) + copy `Seu envio foi salvo e aguarda validação de um oficial.`

**Minhas entradas (history, INPT-04 made visible):**
- List of the member's own submissions (`select=id,status,submitted_at&order=submitted_at.desc`): `Envio de 08/10/2026 14:32 — Aguarda validação` (status badge: pending=`text-muted`, validated=`text-success`, rejected=`text-destructive`).
- CTA: `Enviar novos status` → restarts the wizard as a NEW submission (append-only; nothing is prefilled or overwritten).
- Empty state: `Você ainda não enviou status.`

---

## Copywriting Contract (pt-BR — all Phase 2 strings)

| Element | Copy |
|---------|------|
| Tabs | `Painel` · `Enviar Status` · `Personagens` |
| Admin sub-heading | `Registre nome, classe e função de cada membro.` |
| Add class | label `Nova classe` · CTA `Adicionar Classe` · ok `Classe "{nome}" adicionada.` |
| Save row | `Salvar` · ok `Salvo.` · erro `Falha ao salvar — tente novamente.` |
| Wizard intro | `{nome} — {classe} ({função})` · `Poder de Combate` · blocked: `Seu personagem ainda não foi registrado. Peça a um oficial para registrá-lo na aba Personagens.` |
| Field error | `Valor inválido — use números (ex.: 1.234.567 ou 12,5%).` |
| Review checkboxes | `Revisei os valores de {grupo} contra as capturas e estão corretos.` |
| Submit | `Enviar` · success `Envio registrado!` + `Seu envio foi salvo e aguarda validação de um oficial.` |
| History | `Minhas entradas` · `Envio de {data} — Aguarda validação` / `— Validado` / `— Rejeitado` · CTA `Enviar novos status` |
| Function labels | `DPS` · `Tank` |

**Network/server errors** reuse Phase 1's enumeration-safe copy: `Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.` Never expose HTTP codes, free-tier internals, or which check failed.

---

## Accessibility Contract (extends Phase 1)

- Every input has `<label htmlFor>`; checkbox rows are `<label>` wrapping native checkboxes.
- Errors: `role="alert"` + `aria-live="polite"`; busy states: `aria-busy`.
- `focus-visible: ring-2 ring-accent` on all interactive elements; wizard step indicator marks current step `aria-current="step"`.
- Images have `alt` (`Exemplo da captura de {grupo}`); the a11y path never depends on reading the example image.
- Contrast: only existing AA-passing token pairs; no new colors.
- No animation beyond native focus/active states; `prefrefers-reduced-motion` needs nothing new.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| (none) | none | not applicable — no component registries; hand-rolled Tailwind v4 only |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: pending owner review (auto-generated)
- [ ] Dimension 2 Visuals: pending owner review (auto-generated)
- [ ] Dimension 3 Color: reuses Phase 1 AA-passing tokens
- [ ] Dimension 4 Typography: Phase 1 scale, unchanged
- [ ] Dimension 5 Spacing: Phase 1 scale, unchanged
- [ ] Dimension 6 Registry Safety: n/a

**Approval:** pending — this contract was auto-generated during a yolo-mode `/gsd-plan-phase 2` run (no CONTEXT.md, no interactive ui-phase). Owner should ratify at the plan 02-03 checkpoint or re-run `/gsd-ui-phase 2` and replan.
