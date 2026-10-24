# Phase 10: Personalized Home Landing Tab - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24T00:00:00.000Z
**Phase:** 10-first-access-by-print
**Areas discussed:** Default tab on login, Início page layout, Destaques slider card width, Animations & skeletons

---

## Animations & skeletons

| Option | Description | Selected |
|--------|-------------|----------|
| Static-only (07.1 D-05) | Zero animations, `prefers-reduced-motion` respected app-wide | |
| Soft animations + skeletons | Smooth, low-complexity animations + skeleton loaders allowed in Phase 10 only | ✓ |

**User's choice:** Overrule 07.1 D-05 for Phase 10 — allow soft animations and skeleton loaders, keep smooth and complexity low. The existing `neon-ring` animation (rotating red conic-gradient frame, `prefers-reduced-motion` safe) is the accepted reference bar for acceptable animation complexity in this project.

**Notes:** rockhall.com is the aesthetic reference (bold, premium). Skeleton loaders replace the static "Carregando…" pattern. Existing pt-BR error/session copy strings preserved.

---

## Default tab on login

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 'painel' default | 'inicio' added to nav but login stays on 'painel' | |
| Default to 'inicio' | Login lands on the new Início tab | ✓ |

**User's choice:** Implicitly roadmap HOME-01 ("members land on a new Início tab") — capture as decision D-04; confirm at planning if intent differs.

---

## Início page layout

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical stack | OvrHero + stale-data CTA + top-3 strip stacked (per plan 10-02) | ✓ |
| Side-by-side desktop | OVR + strip side-by-side, CTA as top banner | |

**User's choice:** Vertical stack per plan 10-02, mirroring DashboardPage mount-fetch pattern.

---

## Destaques slider card width

| Option | Description | Selected |
|--------|-------------|----------|
| Plan 10-03 spec | 1-up mobile full width minus gutter; 3-up desktop ~1/3 width each | ✓ |

**User's choice:** Plan 10-03 spec stands — 1-up mobile, 3-up desktop at `lg`.

---

## OpenCode's Discretion

- Exact soft-animation implementation (CSS transitions/keyframes only, no new npm dependencies)
- Skeleton loader visual design within low-complexity bar
- Exact stale-data CTA pt-BR copy strings (enumeration-safe fixed strings)

---

## Deferred Ideas

- Public visitor homepage — explicitly deferred (owner decision 2026-10-20)
- Animation/skeleton work outside Phase 10 — 07.1 D-05 static-only remains in force for all other phases
