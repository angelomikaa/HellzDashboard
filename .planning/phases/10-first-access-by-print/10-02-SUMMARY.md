# Plan 10-02 — Stale-data CTA + top-3 best-stats strip (complete)

Phase: 10 | Plan: 02 | Wave: 2 | Depends on: 10-01 | Requirements: HOME-01, HOME-02

## What was done

**src/App.tsx** — Passes `onNavigate={setTab}` to `<InicioPage />` so the CTA "Enviar Status" button navigates to the submit tab (same pattern as DashboardPage).

**src/features/dashboard/InicioPage.tsx** — Extended with:
- `daysSince(lastValidatedAt, now = Date.now())` — pure epoch-diff arithmetic on the ISO string, no date library
- `extractStaleBanner(report, now = Date.now())` — pure function: `'first'` when `last_validated_at === null`, `'stale'` when strictly >7 days, `null` when ≤7 days (exactly 7 days = no banner)
- `extractTop3(report)` — pure function: filters `own_value !== null && points !== null`, sorts by `points` desc, `slice(0,3)`, maps each to `{stat_key, label, value, points, tier}` using `formatStatValue` + `tierForPoints`
- Component wires OvrHero (top) → conditional CTA banner (first/stale) → top-3 strip (below), each strip entry a small tile with label, formatted value, raw points, tier color
- No client-side points/OVR computation (AGENTS.md); `onNavigate('submit')` on CTA button
- All pt-BR copy is enumeration-safe fixed strings

**src/features/dashboard/InicioPage.test.tsx** (new) — 8 vitest tests:
- extractStaleBanner: null → 'first'; exactly 7 days → null (boundary locked); 7 days + 1ms → 'stale'; within 7 days → null
- extractTop3: top-3 by points desc excluding nulls; tier badge = tierForPoints(points); fewer than 3 when fewer eligible; empty when none eligible

## Verification

- `npx vitest run src/features/dashboard/InicioPage.test.tsx` — 8/8 passed
- `npx tsc --noEmit` — passes, zero errors (covers InicioPage.tsx, InicioPage.test.tsx, App.tsx)

## Must-haves (all confirmed)

- [x] >7 days stale → stale-data CTA to Enviar Status
- [x] Never submitted → evergreen first-submission variant
- [x] ≤7 days fresh → no banner
- [x] Strictly->7-days boundary locked in test (exactly 7 days = no banner, +1ms = stale)
- [x] Top-3 best-stats strip sorted by points desc with value + points + tier badge
- [x] last_validated_at drives the stale-data decision; no client-side points recomputation
- [x] tsc --noEmit passes; vitest passes

## Notes

- `extractStaleBanner` / `extractTop3` / `daysSince` are exported pure functions — the component consumes them verbatim, so behavior can never drift during UI work.
- The `now` parameter on `daysSince`/`extractStaleBanner` defaults to `Date.now()`; tests pass it explicitly for boundary determinism (no fake timers needed).
- Tab visibility remains UX-only; enforcement is the member-invocable `my_report` RPC.
