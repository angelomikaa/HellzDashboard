# Phase 6: Trust & Celebration — Officer Tools & Promotion Page - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 delivers the trust-and-celebration loop: (a) the officer validation queue — a new staff tab where officers review pending submissions (all 57 values, read-only) and validate or reject them before they count toward ranks (AUTH-05); (b) player removal by deactivation — officers remove ordinary members, the owner removes officers, access dies instantly, and removed players' submissions leave the rank cohort (AUTH-04); (c) owner-managed officer roles — grant/revoke on the Personagens page, owner-only (AUTH-03); (d) the promotion page — a member-visible tab showing each class's top-5-by-OVR players as EAFC-style cards, fed by a new member-invocable promotion RPC (SHWC-02). Also folds the pending owner-only-class-management todo (class creation becomes owner-only — server policy + UI gate). Rejection/removal are status/flag marks only — append-only is non-negotiable everywhere.

**Requirements covered:** AUTH-03 (owner grants/revokes officer role manually), AUTH-04 (officers remove players, revoking panel access), AUTH-05 (officers validate or reject submissions before they count toward ranks), SHWC-02 (promotion page shows top players as EAFC-style cards).

**Not in this phase:** delta badges (v2, DELT-01), submission history/progression view (v2, HIST-01), officer guild-health dashboard (v2, OFCR-01), stat catalog self-service (v2, CAT-01), shareable PNG card export (v2, SHAR-01), rejection-reason free-text fields, notification systems (panel has none), public/unauthenticated leaderboards (Out of Scope permanently).

</domain>

<decisions>
## Implementation Decisions

### Promotion card contents (SHWC-02 × RNK-02 resolution)
- **D-01:** Promotion cards show **OVR (tier band) + class/function + the player's top 6 stats BY POINTS with values** — computed server-side, never labeled as key stats. Any 6 shown are just "their best stats"; key-stat identity never crosses the API boundary (RNK-02/AGENTS.md non-negotiable). The ROADMAP phrase "featuring their key stats" is satisfied by featuring the stats that make them top, not the key-stat config.
- **D-02:** **6 highlight stats per card, tier-styled** with the Phase 4 tier palette (`src/index.css` tokens) — the EAFC FACET-card look. Cards show display name, class, function badge, OVR with its tier band.

### Validation queue (AUTH-05)
- **D-03:** A **new staff tab "Validações"** lists all players' pending submissions (newest first), tap to expand — same UX-only tab gate + content re-check pattern as Personagens/Stats-Chave (App.tsx). Enforcement is server-side as always.
- **D-04:** Officer review shows **all 57 values read-only**, grouped Geral/Quasi/Especial. Officers NEVER edit values — append-only means the player resubmits; the officer's only actions are validate and reject.
- **D-05:** **Reject = status mark `'rejected'`; validate = status mark `'validated'`.** Compute-on-read does the rest: the player's ranks instantly revert to their last validated submission per stat (03-CONTEXT D-07 latest-containing rule) — no manual recalculation, no deletion, one status definition forever (03 D-06 honored).
- **D-06:** The player learns of a rejection via the **status label "Rejeitada" in their own submission history** (HistoryList). No rejection-reason field in v1.

### Removal & role management (AUTH-03, AUTH-04, folded todo)
- **D-07:** "Remove a player" = **deactivation (`active = false`)**: existing 0004 RLS active-checks kill minted tokens instantly and login is blocked; append-only rows stay untouched. **Removed players' submissions leave the rank cohort** — the new migration adds an active-member filter to the rank RPCs (my_report / class_top5 / the new promotion RPC), so class averages/bests stop counting ex-members.
- **D-08:** **Officers deactivate/reactivate ordinary members. The owner grants/revokes officers and removes officers. The owner account can never be removed or demoted** (server-side enforced, not just UI).
- **D-09:** Role management + the owner-only class-creation gate live on the **existing Personagens page** as owner-only controls (it already lists all members via `fetchMembers`); `createClass` becomes owner-only (UI gate + server-side policy change).
- **D-10:** **Stale elevated JWT on demotion is accepted and documented**: role changes take effect at next login (7-day JWT); deactivation is the immediate kill-switch for the dangerous case. No token-epoch/force-relogin mechanism in v1.
- **D-11:** Officers can see who is who in the queue and member list (role is already a granted column) — no additional officer-visibility restrictions.

### Promotion page shape & visibility (SHWC-02)
- **D-12:** The promotion page is a **new tab visible to every logged-in member** (celebration is the point; public/unauthenticated stays Out of Scope per REQUIREMENTS.md).
- **D-13:** Composition: **one section per class, each with its top-5-by-OVR EAFC cards** (mirrors class_top5 semantics; function shown as a card badge). **Classes with insufficient data (n<3) are hidden**, not shown empty.
- **D-14:** Data source: a **new SECURITY DEFINER promotion RPC, member-invocable**, returning the full card payload per class (display name, function, OVR, tier band, top-6-by-points stats with labels/values). Key-stat identity never serialized. `class_top5` stays staff-only (Stats-Chave preview) — the promotion RPC is the member-boundary contract.

### OpenCode's Discretion
- Exact card visual treatment within the locked tier-palette + 6-facet-stat rule (metallic accents, card sizing, mobile layout)
- Validações tab mechanics: list density, expand/collapse behavior, empty-queue state, pt-BR micro-copy
- pt-BR tab label for the promotion page (e.g. "Destaques") and all micro-copy beyond nothing locked here
- Promotion RPC signature/shape (e.g. all classes in one call vs per-class), and how insufficient-data classes are filtered server-side vs client-side
- Personagens owner-controls interaction design (role select vs grant/revoke buttons, confirm dialogs, reactivation affordance)
- Migration sequencing (append-only corrective — next number after 0010) and how the active-member cohort filter composes with existing status filters
- Whether officers get any queue convenience features (e.g. jump to member) — plain newest-first list is the baseline
- Testing approach: extend `scripts/smoke-rls.mjs` with officer/owner/removed-player probes per the established matrix pattern

### Folded Todos
- **owner-only-class-management** (from 03-04 owner UAT, `.planning/todos/pending/owner-only-class-management.md`): restrict class creation to the owner handle only — officers must not be able to add classes (structural change). Folded here because Phase 6 touches officer role boundaries anyway: server-side policy change on the classes insert path + owner-only UI gating on the Personagens add-class control (D-09).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — AUTH-03/AUTH-04/AUTH-05/SHWC-02 definitions; Out of Scope table (no public leaderboards, no key-stat exposure, members see aggregates only — promotion page is the sanctioned view of top players)
- `.planning/ROADMAP.md` §Phase 6 — goal, 4 success criteria, dependency on Phases 3+4
- `.planning/PROJECT.md` — Key Decisions table (officer elevation, promotion page sanctioned view), Active requirements (officer role granted manually by owner)

### Submission lifecycle & rank cohort contract
- `supabase/migrations/0010_discard_lifecycle.sql` — status set (pending/validated/rejected/discarded), one-pending rule, cohort filters (`status NOT IN ('rejected','discarded')`); the officer-queue RPC and active-member cohort filter extend this
- `supabase/migrations/0009_rank_engine.sql` — my_report/class_top5 SECURITY DEFINER pattern, internal member_role+active gates, RNK-02 no-key-stat-serialization rule, accepted small-guild aggregate leak
- `.planning/phases/03-rank-engine/03-CONTEXT.md` — D-05 (class_top5 designed for promotion-page reuse), D-06 (cohort definition), D-07 (latest-containing per-stat fallback = the auto-revert D-05 here relies on), D-12 (n≥3 threshold)
- `.planning/phases/05-ocr-auto-read-layer/05-CONTEXT.md` — D-13/D-22 (officer overturn semantics deliberately routed to Phase 6; two-layer trust model)

### Auth & security foundation
- `supabase/migrations/0004_rls_active.sql` — the active-check pattern that makes deactivation kill tokens (AUTH-04 groundwork)
- `supabase/migrations/0006_staff_claim_fix.sql` — role checks MUST read `auth.jwt()->>'member_role'` (not `role`)
- `supabase/migrations/0007_staff_active_check.sql` + `0008_staff_active_check_fix.sql` — is_active_staff_member() definer pattern (same-table policy recursion lesson)
- `supabase/migrations/0005_registry_catalog.sql` — column grants (role column ungranted to UPDATE — the role-change RPC/policy design starts here), create_submission RPC
- `src/features/auth/session.ts` — NeoFootSession.member_role union; 7-day JWT expiry assumption (D-10)

### Frontend patterns
- `src/App.tsx` — tab shell + UX-only gating + content re-check pattern (the two new tabs plug in here)
- `src/lib/api.ts` — REST wrapper pattern (both headers, explicit projections, SECURITY DEFINER RPC wrappers); `fetchMembers`/`updateCharacter`/`fetchClassTop5` precedents; `MemberRow.role` already projected
- `src/features/admin/CharactersPage.tsx` — staff page pattern to extend with owner-only role/removal controls (D-08/D-09)
- `src/features/dashboard/OvrHero.tsx` + `StatCard.tsx` + `src/index.css` tier tokens — tier-styled card components/palette the promotion cards reuse (D-01/D-02)
- `src/features/submit/HistoryList.tsx` — where "Rejeitada" status labeling lands (D-06); already handles discarded/pending labels
- `scripts/smoke-rls.mjs` — live smoke matrix pattern to extend with officer/owner/removed-player probes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/api.ts` — thin REST client; add the queue fetch, validate/reject RPC wrappers, role/removal RPC wrappers, and promotion RPC wrapper here
- `src/features/dashboard/` leaf components (OvrHero, StatCard, TierLegend) + `presentation.ts` TDD pure functions — the promotion card's tier styling and presentation logic extend these patterns
- `src/features/admin/CharactersPage.tsx` — already lists all members with role labels (`ROLE_LABELS` incl. 'Oficial'); the owner-only role/removal controls bolt onto it
- `src/features/submit/HistoryList.tsx` + `wizard.ts` group labels — Geral/Quasi/Especial grouping for the officer's 57-value review view
- `supabase/migrations/0003_lockout_rpc.sql` — SECURITY DEFINER atomic-RPC precedent for officer action RPCs

### Established Patterns
- All role checks read `auth.jwt()->>'member_role'`; staff gates live INSIDE SECURITY DEFINER RPCs (member_role claim + active flag), never UI-only
- Migrations are append-only corrective — live tables/RPCs superseded via `create or replace`, prior files byte-untouched (next migration number: 0011)
- Column grants + RLS compose; explicit projections only, never `select=*`; `role`/`pin_hash` columns currently ungranted to any client write
- Guards are UX-only; enforcement is RLS/RPC server-side (AGENTS.md non-negotiable)
- pt-BR UI copy everywhere; group labels Geral/Quasi/Especial; compute-on-read (no stored ranks, no triggers)
- Submissions append-only — status transitions are the only mutation surface (0010's own-row pending→discarded policy is the narrowest-precedent for officer status writes)

### Integration Points
- `submissions.status` gains officer-driven transitions: pending→validated, pending→rejected (append-only preserved; new officer RLS/RPC surface required — officer writes must go through a gated RPC or a narrow column-grant policy like 0010's)
- Rank RPC cohort filters (my_report 0010-v2, class_top5, new promotion RPC) gain an **active-member** join condition (D-07) — researcher: verify current filters and enumerate every cohort site
- `verify-pin` already fails deactivated members (0004); removal needs no Edge Function change
- `members.role` changes need a new server-side path (column currently ungranted) — owner-only gate server-side (D-08/D-09)
- `classes` insert path (staff_insert_classes) becomes owner-only (folded todo) — server policy change + `createClass` UI gating on Personagens
- App.tsx `Tab` union gains two tabs: officer "Validações" (staff-gated) and the promotion page (all members)

</code_context>

<specifics>
## Specific Ideas

- The promotion page is the "EAFC Ultimate Team feel" payoff — the owner's original vision: "a promotion page for top players as EAFC cards to promote the best players in the guild"
- CMP-03's privacy line: members see aggregates only — the promotion page is explicitly the ONE sanctioned view of top players' individual values (PROJECT.md Key Decisions)
- The officer queue is layer 2 of the owner's two-layer trust model (05-CONTEXT D-22): "officer human validation is the tool to discard insane stats that passed layer 1" — reject exists precisely to catch values OCR/sanity can't

</specifics>

<deferred>
## Deferred Ideas

- **Rejection-reason free text** — plain status label in v1; a reason column + UX is a small future escalation if players ask why they were rejected
- **Officer guild-health dashboard (OFCR-01)** — participation %, who hasn't submitted, OCR failure rate; stays v2
- **Force re-login on demotion (token epoch)** — D-10 accepts stale claims until next login; revisit only if it ever causes real trouble
- **Promotion page export/sharing (SHAR-01)** — shareable PNG cards stay v2

</deferred>

---

*Phase: 06-trust-celebration-officer-tools-promotion-page*
*Context gathered: 2026-10-11*
