# Plan 10-01 — Início tab shell + typed contract (complete)

Phase: 10 | Plan: 01 | Wave: 1 | Requirements: HOME-01

## What was done

**src/lib/api.ts** — Added `last_validated_at: string | null` to the `MyReport` interface (Phase 9 migration 0018 shipped it server-side; the TS type was missing). Field placed after `ovr`, per the existing interface ordering convention.

**src/features/dashboard/InicioPage.tsx** (new) — Início page component following the `DashboardPage` mount-fetch pattern (`useEffect` + cancelled flag, `fetchMyReport(session)`, `ApiError` kind → NETWORK_ERROR/SESSION_ERROR pt-BR copy). Renders loading (`Carregando…`), error (`role="alert"`), and success with `OvrHero` (`layout='card'`) showing the member's own OVR, `session.display_name`, `report.char_class`, `report.char_function`. No client-side points/OVR computation (AGENTS.md); `last_validated_at` is read but not yet consumed (consumed in 10-02).

**src/App.tsx** — Added `'inicio'` to the `Tab` union (after `'destaques`); added an Início nav button between Painel and Enviar Status (visible to all roles, UX-only gating, `aria-current='page'` when active, same `border-accent`/`glow-accent-soft` active style as other member buttons); added `showInicio ? <InicioPage session={session} />` render branch before the `DashboardPage` fallback. Value import of `InicioPage` (consistent with all other page imports — no import cycle since InicioPage doesn't import from App).

## Verification

- `npx tsc --noEmit` — passes, zero errors (covers api.ts, InicioPage.tsx, App.tsx)

## Must-haves (all confirmed)

- [x] After login, members can navigate to a new Início tab (`'inicio'` in Tab union + nav button + render branch)
- [x] The Início tab shows the player's own OVR card (reused OvrHero, `layout='card'`)
- [x] `last_validated_at` is available in the MyReport TypeScript interface
- [x] `tsc --noEmit` passes; build green

## Notes

- Top-3 best-stats strip and stale-data CTA are intentionally NOT in this plan — they land in 10-02 (depends on 10-01).
- `last_validated_at` is typed here but consumed in 10-02; no behavior change yet.
- Tab visibility is UX-only; enforcement is the member-invocable `my_report` RPC (SECURITY DEFINER, member-only gate).
