# Phase 4: Member Dashboard & Improvement Screen - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers the member-facing dashboard — the "Painel" tab (currently a placeholder in `src/App.tsx`) that renders the live `my_report()` RPC output: a tier-styled OVR hero card, an improvement-focus strip, and 57 tiered stat cards (bronze/silver/gold/platinum, own visual identity) grouped by Geral/Quasi/Especial, each showing the player's value, class average, best in guild, and percentile position. Also covers the member-side presentation of all edge states (no submission, missing stat values, insufficient cohort data) and confirms aggregates-only privacy on the client (CMP-03).

**Requirements covered:** CMP-01 (mobile-first dashboard with stat cards), CMP-02 (per-stat comparison: own value, class average, best, percentile position), CMP-03 (aggregates only — never other individuals' values), SHWC-01 (tiered cards, own visual identity).

**Not in this phase:** promotion page with top players as EAFC cards (Phase 6, SHWC-02), delta badges (v2, DELT-01), OCR pre-fill (Phase 5), any new server RPCs beyond a `my_report` api.ts wrapper (the rank engine is complete — this phase is pure presentation), officer tools (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Tier thresholds (SHWC-01)
- **D-01:** Per-stat card tiers use **top-heavy bands on the 0–99 points scale**: Bronze < 35, Silver 35–59, Gold 60–84, Platinum 85+. The top tier stays genuinely rare; tiers feel earned.
- **D-02:** The OVR hero uses **EAFC-style bands on its own 51–99 scale** (floor of 51 makes the stat bands unusable): Bronze 51–64, Silver 65–74, Gold 75–84, Platinum 85+.
- **D-03:** Tiers communicate through **color only** — tier-colored border/badge on stat cards, no tier name spelled out. The existing tier tokens in `src/index.css` (bronze `#B87333`, silver `#B8C0CC`, gold `#E9B44C`, platinum `#D7E3F0`) are the palette.
- **D-04:** A small **inline legend** (one-line Bronze · Prata · Ouro · Platina color swatches) sits near the top of the dashboard, always visible, so the color code is self-explanatory.

### Dashboard layout (CMP-01)
- **D-05:** The 57 stat cards are grouped into **collapsible sections Geral / Quasi / Especial** (Geral open by default) — mirrors the submit wizard and Stats-Chave groupings.
- **D-06:** Grid: **1 column on phones, 2 from the `sm` breakpoint, 3 at desktop `max-w-3xl`** — readability over density.
- **D-07:** A **tier-styled OVR hero card** at the top: big OVR number (D-02 bands), character name, class + function (e.g. "Assassino · DPS"), with an explicit insufficient-data state when `ovr.data_sufficient` is false.
- **D-08:** Each stat card shows everything **in one glance**: label + FLAT/PERCENTUAL tag, own value (big), tier-colored points badge, and a muted comparison line with Média and Melhor da classe. No tap-to-expand.

### Percentile phrasing (CMP-02)
- **D-09:** Percentile position is expressed as **points badge + descriptive phrase**: the tier-colored 0–99 badge AND a pt-BR line satisfying CMP-02's example literally.
- **D-10:** Phrase granularity = **10% steps**: "Você está entre os 30% melhores/piores em CRIT" — coarse enough to stay stable as the cohort shifts.
- **D-11:** Tone is **direct/neutral**: melhores for top bands, piores for bottom bands — factual, no softening, no competitive rank-ordering.
- **D-12:** Class average and best-in-guild appear as **muted numbers only** ("Média: 1.234 · Melhor: 9.876") — no position bars, no delta-from-own.

### Empty & weak states
- **D-13:** Member with **no submission yet** sees an empty-state message in pt-BR ("Envie seus status para ver seus cards") plus a button jumping to the Enviar Status tab — not a grayed grid.
- **D-14:** A submitted player **missing one stat's value** still gets that card, rendered grayed with "Sem registro" in the value slot — the 57-stat shape stays stable.
- **D-15:** When the class+function cohort has **n < 3** (`data_sufficient = false`): cards keep own value + Média/Melhor, the points badge is replaced by a muted "Dados insuficientes" chip, and the OVR hero explains the class needs 3+ players (D-13 of 03-CONTEXT honored on the client).
- **D-16:** A **"Foco de melhoria" strip** under the OVR hero lists the player's 3 lowest-points stats with a jump-to-card action — the explicit "what to improve" loop (core value).

### OpenCode's Discretion
- Exact card visual treatment within the locked color-only tier rule (border weight, badge shape, metallic accents on the hero)
- Component decomposition (StatCard, TierBadge, OvrHero, FocusStrip, CollapsibleGroup) and file layout under `src/features/dashboard/`
- The `fetchMyReport` api.ts wrapper shape and any response typing
- Collapse/expand mechanics (default-open state, chevron affordance) within D-05
- Legend placement within "near the top" (inside the hero card vs. a line under it)
- pt-BR micro-copy beyond the locked phrases (empty-state message wording, "Sem registro", "Dados insuficientes")
- How the "Foco de melhoria" strip handles ties at the 3-worst boundary and insufficient data (e.g. hide strip when no stats have points)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — CMP-01/CMP-02/CMP-03/SHWC-01 definitions; Out of Scope table (no individual members' raw stats, no key-stat exposure, no public leaderboards); v2 DELT-01 (delta badges deferred)
- `.planning/ROADMAP.md` §Phase 4 — goal ("core value delivered here"), 3 success criteria, dependency on Phase 3 RPC outputs
- `.planning/PROJECT.md` — Key Decisions table (tier cards own identity, EAFC percentile feel), Context §Reference card model (pt-BR dashboard we improve on, not copy)

### Rank engine contract (the data this phase renders)
- `supabase/migrations/0009_rank_engine.sql` §4 `my_report()` (lines 101–224) — THE member contract: response shape (`char_class`, `char_function`, `stats[]` with `stat_key/label/group_name/value_type/own_value/class_average/best/points/data_sufficient`, `ovr {value, data_sufficient}`); ABSOLUTE RULE: key-stat identity never serialized; accepted small-guild aggregates leak documented in the function comment
- `.planning/phases/03-rank-engine/03-CONTEXT.md` — D-06 cohort definition, D-12 n≥3 threshold, D-13 values-not-omitted semantics, D-09/D-10/D-11 OVR semantics

### Frontend foundation
- `src/App.tsx` — tab shell; the dashboard mounts where the "Painel" placeholder currently renders (line 119); tab state pattern
- `src/lib/api.ts` — REST data layer pattern (explicit projections, never `select=*`); `fetchClassTop5` shows the RPC-wrapper pattern to follow for `fetchMyReport`
- `src/index.css` — design tokens: dark surfaces (60/30/10), gold accent `#E3B341`, and the tier tokens (lines 19–23) this phase consumes
- `src/features/admin/KeyStatsPage.tsx` — the newest page pattern (grouped chips by Geral/Quasi/Especial, staff gating) — visual/grouping consistency reference
- `src/features/submit/SubmitPage.tsx` + `wizard.ts` — wizard step flow, group labels, pt-BR utility patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/api.ts` — thin REST client with `ApiError` and both-headers `restFetch`; add `fetchMyReport()` here following the `/rpc/class_top5` wrapper precedent
- `src/lib/parseStatValue.ts` — pt-BR number parse/format (`1.234.567` separators) for displaying values
- `src/index.css` tier tokens — foundational, defined in Phase 1 explicitly "consumed in Phase 4+"; wire via Tailwind v4 `@theme` classes (e.g. `border-tier-gold`)
- `src/features/auth/RequireAuth.tsx` — session injection pattern every page receives (`session: NeoFootSession`)

### Established Patterns
- Tab visibility is UX-only gating; enforcement is server-side RLS/RPC (App.tsx comments, 02-02/03-04 precedent) — the Painel tab is for every role, no new gating needed
- All client data flows through explicit projections and the raw-fetch gateway contract (no supabase-js)
- pt-BR labels and phrasing everywhere; group names are Geral/Quasi/Especial (03-04 decision: wizard's real labels win)
- Compute-on-read: the dashboard renders whatever `my_report()` returns at fetch time; no client-side rank math, no caching of OVR/points

### Integration Points
- `my_report()` RPC (0009, live) — callable by `authenticated`; returns the full report shape with no parameters (identity from JWT)
- App.tsx `Tab` union type `'painel'` already exists with placeholder content — replace the placeholder branch with the new dashboard component
- `session.display_name` powers the header greeting; hero card reuses it plus `char_class`/`char_function` from the RPC response
- RNK-02 leak rule binds this phase: no UI code may derive, hint at, or request key-stat identity; points/OVR arrive opaque from the RPC

</code_context>

<specifics>
## Specific Ideas

- SHWC-01's tier wording maps to the locked bands: bronze = "mediocre", silver = "mildly elevated", gold = "highly elevated", platinum = "top of the class" — the top-heavy cutoffs (<35/35-59/60-84/85+) were chosen so gold and platinum stay earned
- CMP-02's example sentence ("you're in the bottom 30% of Assassins for CRIT") is the literal template for D-10's phrase: "Você está entre os 30% piores em CRIT" (direct tone per D-11)
- The owner wants the panel to feel like an improved, own-identity version of the Portuguese reference card model — not a copy of its orange/green borders (tier colors already diverge deliberately)
- "Foco de melhoria" exists because the phase goal is a loop: see standing → know what to improve (D-16)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Delta badges DELT-01 and the promotion page SHWC-02 were already deferred at roadmap level and did not resurface.)

</deferred>

---

*Phase: 4-Member Dashboard & Improvement Screen*
*Context gathered: 2026-10-10*
