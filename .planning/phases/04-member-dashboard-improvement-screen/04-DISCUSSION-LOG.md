# Phase 4: Member Dashboard & Improvement Screen - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-10
**Phase:** 4-Member Dashboard & Improvement Screen
**Areas discussed:** Tier thresholds, Dashboard layout, Percentile phrasing, Empty & weak states

---

## Tier thresholds

| Option | Description | Selected |
|--------|-------------|----------|
| Quartiles (25/50/75) | Bronze 0–24, Silver 25–49, Gold 50–74, Platinum 75–99 — each tier = one cohort quartile | |
| EAFC-style bands | Bronze <40, Silver 40–64, Gold 65–84, Platinum 85+ — skews generous, most active players land gold | |
| Top-heavy bands | Bronze <35, Silver 35–59, Gold 60–84, Platinum 85+ — stricter gold, top tier stays rare | ✓ |

**User's choice:** Top-heavy bands (→ D-01)
**Notes:** Follow-ups locked the OVR band scale (51–99, EAFC-style → D-02), color-only tier display (→ D-03), and an always-visible inline legend since tier names are not spelled out on cards (→ D-04).

## Dashboard layout

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible groups | Geral/Quasi/Especial sections, Geral open by default — mirrors wizard and Stats-Chave | ✓ |
| Always-open groups | Three sections, sticky headers while scrolling | |
| Flat + filter chips | One grid with Todos/Geral/Quasi/Especial filter chips | |

**User's choice:** Collapsible groups (→ D-05)
**Notes:** Grid density follow-up: 1 column mobile, 2 from `sm`, 3 at desktop (→ D-06). OVR presented as a tier-styled hero card at top with class + function (→ D-07). Card faces carry full info at one glance — no tap-to-expand (→ D-08).

## Percentile phrasing

| Option | Description | Selected |
|--------|-------------|----------|
| Badge + phrase | Tier-colored 0–99 points badge plus descriptive percentile line (CMP-02 literal) | ✓ |
| Badge only | Points badge alone satisfies "percentile position" | |
| Phrase only | Descriptive text, no points number | |

**User's choice:** Badge + phrase (→ D-09)
**Notes:** Phrase granularity = 10% steps ("entre os 30% melhores/piores") for stability as cohort shifts (→ D-10). Tone direct/neutral — melhores/piores, no softening, no rank-ordering (→ D-11). Média/Melhor shown as muted numbers only — no position bars (→ D-12).

## Empty & weak states

| Option | Description | Selected |
|--------|-------------|----------|
| CTA to Enviar Status | Empty state with pt-BR message + button jumping to submit tab | ✓ |
| Grayed full grid | Show all 57 cards zeroed/grayed before first submission | |
| Hero null state only | Only OVR hero in null state until first submission | |

**User's choice:** CTA to Enviar Status (→ D-13)
**Notes:** Missing individual stat values still render a grayed "Sem registro" card (→ D-14). n<3 cohorts show values with an explicit "Dados insuficientes" chip replacing the badge (→ D-15). A "Foco de melhoria" strip under the hero lists the 3 lowest-points stats with jump-to-card — the explicit improvement loop (→ D-16).

---

## OpenCode's Discretion

- Card visual treatment within the color-only tier rule (border weight, badge shape, hero accents)
- Component decomposition and file layout under `src/features/dashboard/`
- `fetchMyReport` api.ts wrapper shape and response typing
- Collapse/expand mechanics and default-open state within D-05
- Legend placement within "near the top"
- pt-BR micro-copy beyond the locked phrases
- "Foco de melhoria" tie-handling and insufficient-data behavior

## Deferred Ideas

None — discussion stayed within phase scope.
