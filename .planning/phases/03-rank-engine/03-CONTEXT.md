# Phase 3: Rank Engine - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Postgres RPCs that compute trustworthy, admin-tweakable ranks — per-stat percentile points within class+function (top = 99, rank-based) and an OVR from 6 hidden key stats with a normalization floor of 51 — entirely server-side so key-stat config never crosses the API boundary to members. Also delivers: the admin path to configure key stats (RNK-01), and the two Phase 2 hardening-debt fixes folded in by owner decision (CR-01 staff active-check migration, CR-02 verify-pin fix).

**Requirements covered:** RNK-01 (exactly-6 key-stat toggle per class), RNK-02 (key stats hidden server-side), RNK-03 (OVR, floor 51), RNK-04 (rank-based percentile), RNK-05 (insufficient-data state).

**Not in this phase:** member dashboards/improvement screen (Phase 4 — cards are pure presentations of these RPC outputs), OCR pre-fill (Phase 5), officer validation queue / promotion page (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Key-stat administration (RNK-01)
- **D-01:** Minimal key-stat admin UI page ships in Phase 3 — a new staff tab beside Personagens, using the same pattern (member_role gate as UX + server-side RLS/RPC enforcement). RNK-01's "admin can toggle" lands fully in Phase 3, not deferred to the Phase 6 officer panel.
- **D-02:** Exactly-6 enforcement = **block at 7**: adding a 7th key stat is rejected until one is removed. Classes may legitimately hold fewer than 6 mid-configuration — OVR for that class shows the insufficient-data state until the set is complete.
- **D-03:** **Officers + owner** can toggle key stats (matches the existing staff RLS pattern from 0005/0006).
- **D-04:** Picker layout: class selector → the 57-stat catalog rendered grouped by General/Quasi/Special with toggle chips and an "n/6" counter (mirrors the submit wizard's grouping).
- **D-05:** The key-stat page includes a **class top-5-by-OVR preview** shown after changes, so officers can sanity-check tweaks before members see them. Served by a staff-only RPC (never member-invocable); design it for later reuse by the Phase 6 promotion page.

### Rank cohort & recency (RNK-04/05 interplay)
- **D-06:** Rank cohort = submissions with `status != 'rejected'`. Pending submissions count today; when Phase 6 officers start rejecting, rejected rows drop out automatically — no flag flip, one status definition forever.
- **D-07:** A player is represented by their **latest submission**. Owner ruled all stats (incl. Special group) mandatory going forward, so future submissions are complete; the RPC stays defensive: per stat, use the most recent submission **containing that stat** (covers legacy submissions created before Special became mandatory).
- **D-08 (product realignment, routed to Phase 5):** Special group becomes mandatory in the submit wizard — see Deferred Ideas. Phase 3's RPC must not assume completeness of legacy rows.

### OVR composition & floor (RNK-03)
- **D-09:** OVR = **mean of the 6 key-stat percentile scores** (equal treatment — the same reason formula builders were rejected). Each key stat contributes its rank-based percentile points.
- **D-10:** Floor of 51 via **linear rescale**, not a clamp: `OVR = 51 + mean × (48/99)` — the worst player in a class shows 51, the best 99, and bottom-half players keep differentiation from each other (EAFC bronze→icon feel).
- **D-11:** **All 6 or nothing**: a player missing any one of their class's 6 key stats gets the insufficient-data state for OVR (per-stat percentile cards still show for stats they have).

### Insufficient data (RNK-05)
- **D-12:** Threshold = **n ≥ 3 players in the class+function cohort, for both per-stat points and OVR**. At n=3 the formula yields a genuine middle value (0/49.5/99); n=2 would be binary.
- **D-13:** In the insufficient-data state the RPC still returns the member's own raw value, class average, and best-in-guild — plus an explicit `data_sufficient = false` flag. Points/OVR are omitted, values are not. The improvement loop keeps working during early adoption.

### Phase 2 hardening debt (folded in by owner decision)
- **D-14:** **CR-01 folded**: ship corrective migration `0007_staff_active_check.sql` (sketched in 02-REVIEW — mirror the 0004 pattern; do NOT edit live 0005/0006 in place) with Phase 3's migrations. Every NEW staff RPC/policy in Phase 3 (key-stat writes, top-5 preview) must carry the same active-check pattern from day one.
- **D-15:** **CR-02 folded**: fix `verify-pin/index.ts` line 58 (`body.discord_handle` instead of undefined `discordHandle`), redeploy, and re-run `scripts/smoke-rls.mjs` against live to reconcile repo-vs-live drift — before rank RPC smoke testing claims live validation. This also un-blocks the standing "redeploy verify-pin" owner action.

### OpenCode's Discretion
- Tie-handling exact mechanics (research standard: equal values → equal points via average ranks; confirm in 03-01 spec with worked examples)
- OVR rounding (suggest integer display, decimal preserved internally)
- RPC signatures, response shapes, and how many RPCs exist (e.g. one "my report" RPC vs several)
- Pure-function formula spec structure (03-01) and unit-test cases
- Index additions for rank queries (cohort is tens-to-hundreds of rows — likely trivial)
- How the top-5 preview RPC parametrizes "preview under a hypothetical config" vs "current config"

</decisions>

<specifics>
## Specific Ideas

- "The player cannot submit without all fields validated, he will have to fill it manually if OCR fails" — the owner's completeness stance that made recency simple.
- Phase 5 input vision (owner quote): "the ideal input would be ocr fills all the fields and the user just confirms that OCR read it correctly — the manual input is a fallback so no data is lost."
- Wizard layout vision for Phase 5: "a big block with input and sample input, and then the fields, and then a box to tick confirming that you verified the read stats against the ones in the fields. Do it for each step."
- Top-5 preview exists so officers can sanity-check key-stat tweaks "before members see them."

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — RNK-01…RNK-05 definitions; Out of Scope table (no formula builders, no public leaderboards, key stats never exposed)
- `.planning/ROADMAP.md` §Phase 3 — goal, 4 success criteria, planned 03-01 (formula spec + unit tests first) / 03-02 (RPCs) breakdown, and Key Decisions (compute-on-read, rank engine before dashboards)
- `.planning/PROJECT.md` — Key Decisions table (percentile points, OVR floor 51, hidden key stats) and stat-structure Context

### Rank-math research (validated 2026-10-07)
- `.planning/research/ARCHITECTURE.md` §Pattern 3 — compute-on-read rank engine, OVR sketch (mean of 6 percentile points, floored), "latest validated submissions per member" cohort, anti-patterns 2/3 (no stored ranks, no client-side OVR)
- `.planning/research/PITFALLS.md` §Pitfall 2 — rank-based percentile formula, tie handling, churn policy; §Pitfall 4 — hidden key-stats enforcement (SECURITY DEFINER, aggregates-leak warning for small guilds)
- `.planning/research/STACK.md` §Percentile & OVR Computation — window functions per class, key stats never leave the DB
- `.planning/research/FEATURES.md` — rank feature rows (insufficient-data state early, admin toggle UI, promotion-page dependency)

### Schema & security foundation (live, read-only — never edit in place)
- `supabase/migrations/0001_schema.sql` — `class_key_stats(class_name, stat_key)`, `submissions.status` enum, EAV `submission_stats`
- `supabase/migrations/0002_rls.sql` — class_key_stats deny-all (RNK-02 foundation)
- `supabase/migrations/0005_registry_catalog.sql` — `create_submission` SECURITY-INVOKER RPC pattern, column grants, `members.char_class`/`char_function`
- `supabase/migrations/0006_staff_claim_fix.sql` — role checks MUST read `auth.jwt()->>'member_role'` (not `role`)
- `supabase/migrations/0004_rls_active.sql` — the active-check pattern 0007 must mirror

### Hardening debt being folded in (D-14/D-15)
- `.planning/phases/02-registry-catalog-manual-data-ingestion/02-REVIEW.md` — CR-01 (0007 sketch included) + CR-02 full fix details
- `.planning/phases/02-registry-catalog-manual-data-ingestion/deferred-items.md` — verify-pin line-58 latent bug details

### Prior phase context
- `.planning/phases/01-foundation-secure-access-data-model/01-CONTEXT.md` — D-decision framework (JWT claims, RLS-first, D-10 no screenshot storage)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/features/admin/CharactersPage.tsx` — staff admin page pattern (member_role gate, content re-check) to clone for the key-stat page
- `src/lib/api.ts` — REST data layer with explicit safe projections (never `select=*`); rank RPC clients plug in here
- `scripts/smoke-rls.mjs` — live smoke matrix pattern (14 assertions incl. DevTools-style probes); extend with rank RPC leak-checks + the deactivated-staff probe from 02-REVIEW
- `supabase/migrations/0003_lockout_rpc.sql` — `record_pin_failure` SECURITY DEFINER atomic-RPC precedent for the key-stat write RPC
- `src/features/submit/wizard.ts` + `parseStatValue.ts` — pt-BR parse/format utilities; catalog grouping helpers reusable for the grouped chips picker

### Established Patterns
- All role checks read `auth.jwt()->>'member_role'` (the 0006 lesson — policies silently match nothing otherwise)
- Migrations are append-only corrective: live tables are never edited in place (0007 continues the sequence after 0006)
- Column grants + RLS compose: clients use explicit projections; `pin_hash` ungranted
- Guards are UX-only; enforcement is RLS / SECURITY DEFINER with internal role checks (AGENTS.md non-negotiable)
- Compute-on-read: no stored ranks, no submit-time triggers

### Integration Points
- `class_key_stats` table (deny-all since 0001/0002) gets its first write path: a staff-only SECURITY DEFINER RPC for toggle add/remove with exactly-6-block-at-7 logic
- `members.char_class` + `char_function` are the cohort partition keys; `members.char_class` is nullable — unclassed members cannot rank (researcher: decide explicit handling)
- New member-facing rank RPC(s) are the contract Phase 4 dashboards render; RNK-02 requires they never echo key-stat identity
- Officer top-5 preview RPC shares OVR internals with the member RPC; Phase 6 promotion page will reuse it

</code_context>

<deferred>
## Deferred Ideas

- **Wizard UX realignment → Phase 5** (owner: "not a priority now, just a realignment"): (a) Special group becomes **mandatory** in the submit wizard — step completeness gating must include Special (revises the Phase 2 ratified "Especial optional" call); (b) OCR-first flow — screenshot input pre-fills via OCR, manual entry is fallback "so no data is lost", user confirms OCR read correctly; (c) per-step layout — big block with input + sample image, then fields, then a verification checkbox, for each step. Pair with Phase 5 planning.
- (Carried from Phase 1) In-app dev-only OCR calibration/test page — Phase 5.

</deferred>

---

*Phase: 03-rank-engine*
*Context gathered: 2026-10-09*
