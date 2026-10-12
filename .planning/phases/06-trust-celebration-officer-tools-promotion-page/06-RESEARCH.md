# Phase 6: Trust & Celebration — Officer Tools & Promotion Page - Research

**Researched:** 2026-10-12
**Domain:** Supabase RLS/SECURITY DEFINER officer action surfaces, rank-cohort filtering, member-boundary promotion RPC, React tab-shell extensions
**Confidence:** HIGH (all claims grounded in live repo artifacts read this session; zero external API assumptions)

## Summary

Phase 6 adds four server surfaces and two tabs to a mature, security-hardened codebase. The critical structural discovery: **officers currently have NO read path into other members' submissions** — every `submissions` policy (0002/0004/0010) is own-row-only — so the validation queue MUST be a new SECURITY DEFINER RPC, not a REST fetch. Similarly, `active` and `role` are ungranted for client UPDATE (0005 column grants), and the role-differentiated removal rules (officer touches only members; owner also touches officers; owner rows untouchable) **cannot be expressed as RLS policies because Postgres permissive policies OR together** — two policies would widen each other. Both removal and role changes therefore require gated SECURITY DEFINER RPCs with imperative checks (set_key_stat/0009 pattern).

The active-member cohort filter (D-07) has exactly **two existing cohort sites** to amend via `create or replace` supersession (my_report cohort CTE, class_top5 class_members CTE — 0010 v2 shapes) plus the new promotion RPC born with the filter. The top-6-by-points promotion card selection is provably key-stat-safe: per-stat points are computed with an identical formula for ALL 57 catalog stats (0010:174–199), so sorting by points is uncorrelated with `class_key_stats` — no key-stat identity can leak through selection. Frontend work is additive: two `Tab` union members in App.tsx (existing UX-gate + content re-check pattern), RPC wrappers in api.ts, owner-only controls bolted onto CharactersPage, and EAFC cards reusing the literal `TIER_*` maps + `tierForOvr` from presentation.ts. HistoryList **already renders "Rejeitado"** (HistoryList.tsx:17) — D-06's status label largely exists; only a wording check ("Rejeitado" vs CONTEXT's "Rejeitada") remains.

**Primary recommendation:** One append-only corrective migration `0011_officer_tools.sql` (SECURITY DEFINER RPCs: `officer_queue`, `set_submission_status`, `set_member_role`, `set_member_active`, `get_promotion`; `create or replace` my_report/class_top5 v3 with active filter; owner-only `staff_insert_classes` policy) — every RPC with the 0006 claim contract (`auth.jwt()->>'member_role'`), the internal active gate, and 0009 §6 EXECUTE hygiene — plus a new officer smoke script extending the proven smoke-lifecycle probe patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim, D-01..D-14)

**Promotion card contents (SHWC-02 × RNK-02):**
- **D-01:** Cards show **OVR (tier band) + class/function + the player's top 6 stats BY POINTS with values** — computed server-side, never labeled as key stats. Key-stat identity never crosses the API boundary.
- **D-02:** **6 highlight stats per card, tier-styled** with the Phase 4 tier palette (`src/index.css` tokens) — the EAFC FACET-card look. Cards show display name, class, function badge, OVR with its tier band.

**Validation queue (AUTH-05):**
- **D-03:** New staff tab **"Validações"** listing all players' pending submissions (newest first), tap to expand — UX-only tab gate + content re-check pattern (App.tsx). Enforcement server-side.
- **D-04:** Officer review shows **all 57 values read-only**, grouped Geral/Quasi/Especial. Officers NEVER edit values — only validate and reject.
- **D-05:** **Reject = status `'rejected'`; validate = status `'validated'`.** Compute-on-read auto-reverts ranks to the last validated submission per stat (03-CONTEXT D-07 latest-containing rule). No deletion, no recalculation.
- **D-06:** Player learns of rejection via the **status label "Rejeitada" in their own submission history** (HistoryList). No rejection-reason field in v1.

**Removal & role management (AUTH-03/AUTH-04/folded todo):**
- **D-07:** "Remove a player" = **deactivation (`active = false`)**: 0004 RLS active-checks kill minted tokens instantly and login is blocked; append-only rows untouched. **Removed players' submissions leave the rank cohort** — the new migration adds an active-member filter to my_report / class_top5 / the new promotion RPC.
- **D-08:** **Officers deactivate/reactivate ordinary members. The owner grants/revokes officers and removes officers. The owner account can never be removed or demoted** (server-side enforced, not just UI).
- **D-09:** Role management + owner-only class-creation gate live on the **existing Personagens page** as owner-only controls; `createClass` becomes owner-only (UI gate + server policy change).
- **D-10:** **Stale elevated JWT on demotion is accepted and documented**: role changes take effect at next login (7-day JWT); deactivation is the immediate kill-switch. No token-epoch mechanism in v1.
- **D-11:** Officers can see who is who in the queue and member list (role already a granted column).

**Promotion page (SHWC-02):**
- **D-12:** New tab **visible to every logged-in member** (public/unauthenticated stays Out of Scope).
- **D-13:** **One section per class, each with its top-5-by-OVR EAFC cards**; function as card badge. **Classes with insufficient data (n<3) are hidden**, not shown empty.
- **D-14:** Data source: a **new SECURITY DEFINER promotion RPC, member-invocable**, returning the full card payload per class (display name, function, OVR, tier band, top-6-by-points stats with labels/values). Key-stat identity never serialized. **`class_top5` stays staff-only** — the promotion RPC is the member-boundary contract.

### OpenCode's Discretion
- Exact card visual treatment within the locked tier-palette + 6-facet-stat rule
- Validações tab mechanics: list density, expand/collapse, empty-queue state, pt-BR micro-copy
- pt-BR tab label for the promotion page (e.g. "Destaques") and micro-copy
- Promotion RPC signature/shape (all classes in one call vs per-class); server vs client filtering of insufficient-data classes
- Personagens owner-controls interaction design (role select vs buttons, confirm dialogs, reactivation affordance)
- Migration sequencing (next number after 0010) and how the active filter composes with status filters
- Queue convenience features (plain newest-first list is baseline)
- Testing approach: extend `scripts/smoke-rls.mjs` with officer/owner/removed-player probes

### Deferred Ideas (OUT OF SCOPE)
- Rejection-reason free text; officer guild-health dashboard (OFCR-01); force re-login on demotion (token epoch); promotion page export/sharing (SHAR-01)

### AGENTS.md Security Rules (non-negotiable, apply throughout)
- Key-stat config never in member-facing responses; members see aggregates only **except** the sanctioned promotion page
- PINs hashed; rate-limited server-side; RLS on every table; **submissions append-only** — status transitions are the only mutation surface; all rank math in Postgres RPCs
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-03 | Owner grants/revokes officer role manually | `set_member_role` SECURITY DEFINER RPC (owner-only gate; `role` column ungranted 0005:30–33); verify-pin re-mints `member_role` at next login (index.ts:169–174) — D-10 documented |
| AUTH-04 | Officers remove players, revoking access | `set_member_active` RPC (role-differentiated target rules; RLS-policy path proven infeasible — permissive policies OR); 0004 active-checks kill sessions instantly; cohort filter (D-07) via my_report/class_top5 v3 |
| AUTH-05 | Officers validate/reject registers before they count | New staff queue RPC (no staff submissions read path exists today) + `set_submission_status` gated RPC (pending→validated/rejected only); 0009/0010 cohort filters drop rejected automatically (D-05) |
| SHWC-02 | Promotion page: top players as EAFC-style cards | New member-invocable `get_promotion()` SECURITY DEFINER RPC reusing class_top5 OVR internals; top-6-by-points leak analysis (§ Area 4); frontend tab + tier-palette cards |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Officer validate/reject transitions | Database/Storage (RPC + status mark) | — | Append-only status marks; enforcement in SECURITY DEFINER gate, never UI |
| Officer queue read | Database/Storage (SECURITY DEFINER RPC) | Frontend (Validações tab render) | No staff submissions RLS exists; RPC is the only narrow read surface |
| Player removal (deactivation) | Database/Storage (RPC on members.active) | — | Column ungranted; RLS active-checks (0004/0008) do the revocation |
| Role grant/revoke | Database/Storage (owner-only RPC) | Frontend (owner-only controls on Personagens) | Role takes effect at next login (verify-pin mints claim) |
| Promotion card payload | Database/Storage (member-invocable RPC) | Frontend (tier styling via TIER_* maps) | Key-stat boundary enforced server-side; client renders opaque payload |
| Owner-only class creation | Database (policy change) | Frontend (owner-only add-class form) | Server policy is the enforcement; UI gate is UX-only per house pattern |
| Rank cohort active filter | Database/Storage (create-or-replace RPCs) | — | Compute-on-read; no stored ranks exist to migrate |

---

## Area 1: Officer action RPCs & status transitions (AUTH-05)

### Current state of the `submissions` write/read surface (verified)

Policies on `submissions` today — all own-row, no staff surface:
- `member_select_own_submissions` (0004_rls_active.sql:25–29) — own rows, active-checked
- `member_insert_own_submissions` (0004:33–36) — own rows, active-checked
- `submissions_discard_own_pending` (0010:57–60) — the narrowest-precedent transition policy: `using (member_id = own and status = 'pending')` + `with check (member_id = own and status = 'discarded')`
- Column grant: `grant update (status) on submissions to authenticated` (0010:47) — **already exists**; status is the only client-updatable column

**Critical finding [VERIFIED — full migration read]:** there is NO staff SELECT policy on `submissions` or `submission_stats`. An officer JWT today sees only their own rows. The Validações queue (all players' pending submissions, all 57 values) **cannot be a plain REST fetch** — it must be a new SECURITY DEFINER RPC (or a widening staff-select policy, rejected below).

### Recommendation: gated SECURITY DEFINER RPCs (queue + transition)

**A. `officer_queue()` — read RPC.** Returns all `status = 'pending'` submissions newest-first with member display_name/discord_handle/char_class/char_function and the 57 values joined to `stat_catalog` (stat_key, label, group_name, value_type, value) so the frontend groups Geral/Quasi/Especial exactly like the wizard/KeyStatsPage. Internal gate: `member_role in ('officer','owner')` + caller active (verbatim 0009:62–68 gate shape). The 0010 one-pending rule (0010:101–102) guarantees ≤ 1 pending per member, so the list is naturally deduplicated.

**B. `set_submission_status(p_submission uuid, p_status text)` — transition RPC.** Imperative checks inside the definer:
1. staff gate (as above) — else `forbidden`
2. `p_status in ('validated','rejected')` — else `invalid_status`
3. `update submissions set status = p_status where id = p_submission and status = 'pending'` — a non-pending row (already validated/rejected/discarded) matches 0 rows; return the affected count or raise `not_pending` so the officer sees a stale-queue error instead of a silent no-op
Append-only preserved: status mark only, `submitted_at`/`member_id` untouched (0010 header contract).

**Alternative considered — officer RLS policy on `submissions` (the 0010 narrow-policy path):** viable for the transition, because a single uniform rule is expressible in ONE policy: `for update ... using (is_active_staff_member() and status = 'pending') with check (status in ('validated','rejected'))` (the `update (status)` grant already exists; the exists-on-members subquery inside a submissions policy does NOT recurse — 0004 precedent; recursion only strikes policies ON `members`, 0008 lesson). Trade-offs:
- Policy path: fewer moving parts, composes with a future invoker-RPC discard, but the transition logic lives in two places (policy + any future RPC) and the 0-rows-matched silent 204 (05-02 lesson) makes officer-facing errors crude.
- RPC path: one transition site, explicit `not_pending` feedback, matches the established set_key_stat/record_pin_failure precedent, easier to probe in smoke.
**Recommendation: RPC** for both queue and transition. Keep the 0010 own-row discard policy untouched.

**C. What the frontend must never do:** officers never PATCH values; the queue renders read-only (D-04). The member contract side is already complete: `create_submission` discards only `pending` rows (0010:101–102), so a **rejected** submission never blocks resubmission — the player's new row starts fresh `pending` (D-05 auto-revert works via my_report's latest-containing distinct-on, 0010:153–158).

## Area 2: Active-member cohort filter (D-07) — every site enumerated

The rank cohort contract today (0010 v2, verified): `where sub.status not in ('rejected','discarded')` in each latest CTE. D-07 adds an **active-member** condition. There are exactly **two existing cohort sites** plus the new promotion RPC:

1. **`my_report()` (0010:147–167):** add `and m.active` to the **cohort CTE's join on members** (lines 164–167). Do NOT add it to the `latest` CTE — the caller's own values flow from `latest` via the separate left joins at 0010:205 and 229, and the caller is already gate-checked active (0010:139). Filtering `latest` directly would be behaviorally equivalent today but couples the filter to the wrong CTE and invites future regressions when `latest` is reused.
2. **`class_top5()` (0010:265–281):** add `and m.active` to the **`class_members` CTE** (lines 274–281). This single site covers both the value cohorts (cohort CTE joins `class_members`, 0010:282–286) and the displayed top-5 list (0010:299–329). Note the 0010 comment at 274–277 explicitly anticipated this: "Phase 6 may filter the displayed list."
3. **New promotion RPC:** born with the active filter (only active members appear on cards).

Both existing functions are superseded via `create or replace` (0010 §5 precedent — FULL copy with minimal change, "copy, don't paraphrase").

**Decision-supersession note for the migration header:** 03-CONTEXT D-06 declared the cohort "status-only... one definition forever," and 0009:14–15 codified "member active-ness is NOT part of the cohort." 06-CONTEXT D-07 explicitly amends this — the migration comment must record the supersession so a future reader doesn't "fix" it back.

**Semantics check (verified):** deactivation is reversible (reactivation returns the member's rows to the cohort automatically — compute-on-read, no data migration). Removal is a flag mark, not a delete; append-only audit trail untouched (D-07/AGENTS.md).

## Area 3: Role changes & player removal (AUTH-03, AUTH-04) — why RPC, not RLS

### Verified column-grant state (0005:30–33)
```
grant select (id, discord_handle, display_name, role, active, char_class, char_function, created_at) on members to authenticated;
grant update (display_name, char_class, char_function) on members to authenticated;
```
`role` and `active` are **ungranted for UPDATE** to every client credential. Any grant-based path would also need new policies **ON `members`**, which triggers the 0007→0008 lesson: policy-time subqueries on `members` from a policy on `members` recurse (42P17) — they must go through `is_active_staff_member()` (0008:29–42).

### The decisive argument: permissive RLS policies OR together
D-08 requires role-differentiated **target** rules in one table: officers may deactivate only `role = 'member'` rows; the owner may deactivate `member` and `officer` rows; `role = 'owner'` rows are untouchable by anyone. With RLS, these would be two permissive UPDATE policies — Postgres ORs permissive policies on the same table/action, so the officer policy would also admit owner rows. `with check` cannot subtract what another policy's `using` admits. **RLS cannot express this rule set safely; a SECURITY DEFINER RPC with imperative checks is the only correct surface.**

### Recommended RPCs (both with the 0009 gate shape + EXECUTE hygiene)

**`set_member_role(p_member uuid, p_role text)` — AUTH-03:**
- Caller gate: `member_role = 'owner'` AND caller active (owner-only, D-08/D-09)
- Target rules: target's current role must be `'member'` or `'officer'` (owner rows immutable — never demote/remove owner, D-08); `p_role in ('member','officer')` only (no self-promotion path to owner; owner identity is seeded, 01-USER-SETUP)
- Update `members.role` directly — SECURITY DEFINER runs as table owner, bypassing column grants (0003/0009 precedent)
- Effect timing: **verify-pin mints `member_role` from `members.role` at login** (verify-pin/index.ts:172) — role change applies at next login; no Edge Function change needed (D-10, verified)

**`set_member_active(p_member uuid, p_active boolean)` — AUTH-04:**
- Caller gate: active staff (`officer` or `owner`)
- Target rules (imperative): if caller is officer → target `role = 'member'` only; if owner → target `role in ('member','officer')`; never any `role = 'owner'` row; block `target = caller` (self-deactivation lockout guard)
- Deactivation takes effect INSTANTLY for existing tokens: `member_select_own` (0004:17–19) requires `active`, all staff policies require `is_active_staff_member()` (0008:52–70), and verify-pin refuses inactive logins (index.ts:143–146). Verified: no Edge Function or token-epoch work needed.
- Reactivation (`p_active = true`) is the same RPC with the same target rules — officers reActivate ordinary members; owner reactivates officers (D-08 discretion affordance on Personagens)

**UI note for the owner controls:** `fetchMembers` (api.ts:114–121) projects `id,discord_handle,display_name,role,char_class,char_function` — it **omits `active`** even though the column is granted (0005:31). The Personagens owner controls need the active flag to show Remover vs Reativar; extend the projection (safe — column granted; explicit projections only, never `select=*`).

## Area 4: Promotion RPC (SHWC-02) — member boundary + key-stat leak proof

### Recommended shape (discretion areas resolved with a default)

**`get_promotion()` — zero-argument, one call for all classes.** Rationale: the page renders every class section at once (D-13); one request matches the CMP-03 single-request evidence pattern the owner DevTools-verifies (04-03 step 6), and per-class calls would let a member probe class-by-class with no added safety. Shape sketch:

```jsonc
// returns jsonb — one entry per class WITH sufficient data (D-13 hidden classes omitted server-side)
[
  {
    "class_name": "Assassin",
    "cards": [   // top-5 by OVR, ovr desc nulls last then display_name (class_top5 semantics, 0010:299–329)
      {
        "display_name": "...",
        "char_function": "tank",          // function badge (D-13)
        "ovr": 87.3,                       // floor-51 value, same exactly-6-key-stats / n>=3 gate as class_top5 (0010:310–326)
        "highlights": [                    // top 6 stats BY POINTS, desc (D-01)
          { "stat_key": "crit", "label": "CRIT", "value_type": "percentual", "value": 16.5, "points": 94.2 }
          // ... exactly 6 (or fewer if fewer stats have points — planner discretion; recommend exactly-6-when-available)
        ]
      }
      // ...up to 5; members with ovr null are excluded or sorted out per class_top5 semantics
    ]
  }
]
```

- **Gate:** member-invocable — any caller with a valid JWT whose member row is `active` (mirror the my_report gate, 0010:135–141; NOT the staff gate). `class_top5` stays staff-only untouched (D-14).
- **Tier band:** recommend **client-side** via the existing `tierForOvr` (presentation.ts:19–25) — it is presentation, already unit-locked by presentation.test.ts:62–87, and the RPC comment stays honest ("ovr value only"). If the planner prefers server-side banding for D-14 literalism, compute the same bands in SQL; both are safe. (D-14 says the RPC returns "OVR, tier band" — returning the value and deriving the band client-side is within the stated discretion "promotion RPC signature/shape".)
- **n<3 hidden server-side (D-13):** recommend the RPC omit any class where no member produced a non-null OVR (i.e., no OVR-capable cards) — hides empty sections without a second client call. "n<3" per 03-CONTEXT D-12 is the per-stat cohort threshold already baked into the OVR gate (each key stat needs cohort n ≥ 3), so a class with <3 active members with data yields no OVR → omitted. Client additionally guards with an empty-state.
- **Reuse:** copy the `latest`/`class_members`(with `and m.active`)/`cohort`/`cmp` CTE shape from class_top5 (0010:265–296) — the `cmp` CTE already computes per-(member, stat) `n/below/ties` for **all** stats, which is exactly what top-6-by-points needs.

### Key-stat leak analysis (CRITICAL — verified against the SQL)

**Claim: top-6-by-points selection cannot leak `class_key_stats` identity.** Evidence chain:
1. Per-stat points are computed by an **identical formula for every one of the 57 catalog stats**, keyed only on cohort values — my_report computes `points` for every catalog entry (0010:174–199), and class_top5's `cmp` CTE computes `n/below/ties` for every (member, stat) pair in the cohort (0010:287–296). No `class_key_stats` join participates in any per-stat points computation.
2. `class_key_stats` is read internally **only** inside the OVR lateral (0010:313–325) and influences exactly one number: `ovr`.
3. Therefore "sort all 57 stats by points, take 6" is a function of cohort values alone — uncorrelated with the key set. A member seeing the top-6 cannot distinguish a key stat that coincidentally ranks high from any other high-point stat; the only OVR-coupled signal is the single OVR number itself, which is the **already-accepted** T-03-10 small-guild brute-force leak (my_report comment, 0010:240) — unchanged in kind.
4. Serialized fields must stay exactly: stat_key/label (public catalog, 0002 read policy), value_type, value, points. **Forbidden:** any `is_key`/`contributes_to_ovr` flag, any ordering that privileges key stats, any `class_key_stats`-derived field. The RPC comment must state the RNK-02 contract verbatim (my_report comment pattern, 0010:239–240).
5. Smoke probe (see Validation Architecture): call `get_promotion()` as a member, assert the response contains **zero** stat_keys equal to the class's key set — fetch the key set first via the staff-only `fetchKeyStats` (api.ts:165–174) in the same script (staff session) and diff.

## Area 5: Owner-only class creation (folded todo)

- **Server:** `staff_insert_classes` currently admits officer/owner + active (0008:66–70). Drop + recreate with `member_role = 'owner'` (+ active check). Because the policy is **on `classes`** (not `members`), an inline `exists (select 1 from members ...)` subquery is safe (0009:33–37 precedent on class_key_stats) — the 42P17 lesson applies only to policies ON members. For uniformity with 0008, a new `is_active_owner()` SECURITY DEFINER helper (search_path = '' pattern, 0008:34) is equally fine; either passes review. Do NOT reuse `is_active_staff_member()` — it matches officers too.
- **UI:** the add-class form (CharactersPage.tsx:168–202, `handleAddClass` 91–111) becomes owner-only: hide the form for officers (session re-check pattern — the page receives `session` already, line 56). `createClass` wrapper (api.ts:139–142) unchanged; the server policy is the enforcement.
- **Regression watch:** smoke-rls.mjs check 7 asserts "officer POST /classes → 201" (line 214) — this probe **must flip** to assert officer DENIED + owner allowed in the same migration's smoke, or the old matrix will fail after push. Flag for the planner so the smoke extension lands in the same plan as the migration.

## Area 6: Frontend integration (verified patterns)

### App.tsx tab shell (src/App.tsx)
- `Tab` union at line 18: `export type Tab = 'painel' | 'submit' | 'characters' | 'keystats'` — gains `'validacoes'` (staff-gated) and `'destaques'` (all members, D-12).
- Gate pattern (lines 38–47): `const isStaff = ...` then `const showValidacoes = tab === 'validacoes' && isStaff` — UX-only gating with content re-check (T-02-09). The promotion tab needs NO role gate (D-12) — render unconditionally like `showSubmit`.
- Nav buttons: staff tab buttons are wrapped in `{isStaff && ...}` (lines 88–111); the Destaques button renders for everyone.
- Content switch (lines 116–124): add two branches. Suggested component homes (match existing structure): `src/features/admin/ValidacoesPage.tsx` (staff) and `src/features/highlights/HighlightsPage.tsx` (member).

### api.ts additions (restFetch pattern, lines 46–78)
New SECURITY DEFINER RPC wrappers — all `POST /rpc/<fn>` with `JSON.stringify({})` or named params, mirroring `fetchMyReport` (230–247) / `setKeyStat` (176–190):
- `fetchOfficerQueue(session)` → queue rows (typed: submission_id, submitted_at, display_name, discord_handle, char_class, char_function, stats[])
- `setSubmissionStatus(session, id, status)` → count/void
- `setMemberRole(session, memberId, role)` / `setMemberActive(session, memberId, active)`
- `fetchPromotion(session)` → typed sections/cards payload
- Extend `MemberRow` with `active: boolean` + update the `fetchMembers`/`fetchMe` projections (Area 3 note)
- `SubmissionRow['status']` union already includes `'rejected'` (api.ts:41) — no type change.

### CharactersPage owner controls (src/features/admin/CharactersPage.tsx)
- Page receives `session` (line 56) → owner-only section: per-row controls when `session.member_role === 'owner'` (role select Membro↔Oficial + confirm, Remover/Reativar + confirm). 01-UI-SPEC:226 reserved the destructive-confirmation modal pattern — "Future destructive actions (Phase 6 remove/reject) WILL require a modal confirmation."
- Reuse `ROLE_LABELS` (lines 30–34, includes 'Oficial') and the per-row state-machine conventions (`savingRowId`/`savedRowId`/`saveErrorRowId`, lines 66–68). Enumeration-safe pt-BR error copy convention (lines 24–28).
- Add-class form gate: render only when owner (Area 5).

### Validações queue page
- Render all 57 values read-only grouped Geral/Quasi/Especial — reuse the wizard's group label machinery (`src/features/submit/wizard.ts` group labels / `src/lib/groups.ts` FUNCTION_LABELS); StatCard's label+FLAT/PERCENTUAL anatomy (StatCard.tsx:47–52) is the visual vocabulary for value rows.
- Actions per expanded card: Validar / Rejeitar with the modal-confirm pattern; after action, refetch queue (the row leaves: status no longer pending).
- Empty state: "Nenhuma submissão aguardando validação." (pt-BR, discretion).

### HistoryList (D-06) — already nearly complete
`STATUS_LABELS` already contains `rejected: 'Rejeitado'` and `rejected: 'text-destructive'` (HistoryList.tsx:14–28). CONTEXT D-06 says the label "Rejeitada" — the existing masculine "Rejeitado" agrees with the row's "Envio de …" subject. **Recommendation: keep "Rejeitado" (no code change); the planner records the wording call.** No other D-06 surface exists (no reason field, per D-06).

### Promotion cards (EAFC look, D-01/D-02)
- Tier styling flows ONLY through the literal maps `TIER_BORDER`/`TIER_TEXT`/`TIER_BG` (presentation.ts:51–70; Tailwind v4 JIT never sees interpolated names — hard constraint). Tier tokens: `--color-tier-*` in src/index.css:19–23.
- `tierForOvr` (presentation.ts:19–25) for the OVR band; `tierForPoints` (10–16) for the 6 highlight facets if individually tier-styled (D-02 "tier-styled" facets — points arrive in the payload).
- OvrHero.tsx (36–51) is the border-2 + tier-text composition precedent; StatCard.tsx shows the badge pattern for points chips. Values rendered via `formatStatValue` (parseStatValue) for FLAT/PERCENTUAL parity with the dashboard.
- Card grid: DashboardPage's 1→2→3 column responsive grid (04-03) is the layout precedent; mobile-first per AGENTS.md.

## Area 7: Migration & deploy sequencing

- **Next number: 0011** (verified — highest existing is 0010). Append-only corrective: never edit 0001–0010 in place; supersede RPCs via `create or replace` (0010 §4–5 precedent); policies via `drop policy if exists` + create (0004/0006/0007/0008 precedent).
- **Recommended single migration** `supabase/migrations/0011_officer_tools_promotion.sql` containing: (1) `officer_queue()` + `set_submission_status()`; (2) `set_member_role()` + `set_member_active()`; (3) `get_promotion()`; (4) my_report v3 + class_top5 v3 (active filter); (5) owner-only `staff_insert_classes` (± `is_active_owner()` helper). Splitting into 0011/0012 is acceptable (discretion) but one file keeps the cohort-filter supersession atomic with the surfaces that depend on it.
- **Every new function gets the 0009 §6 EXECUTE hygiene block**: `revoke execute ... from public, anon; grant execute ... to authenticated;` (0009:338–345). PostgREST calls functions as `authenticated`; membership enforced inside.
- **Claim contract in every function header** (0006 lesson, verbatim in 0007/0008/0010 headers): `member_role` = guild role; `role` = 'authenticated' role-switch — never read `auth.jwt()->>'role'` for guild role.
- **Deploy:** `supabase db push` with `SUPABASE_ACCESS_TOKEN` as a **session env var** — never on disk/commit/echo (03-02/05-02 precedent, STATE.md:158–159). Dry-run first (`supabase db push --dry-run`) to confirm 0011 is the only pending migration (05-02 precedent). Node v24.13.0 + supabase CLI 2.120.0 verified installed.
- **Regression coupling (planner must sequence):** the owner-only classes policy and the smoke-rls check-7 flip must ship in the same deploy+smoke step (Area 5). Also after push, re-run smoke-rank.mjs to prove no 0009→0011 rank regression (05-02 precedent re-ran rank smoke after 0010).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rank/points/OVR math for cards | Re-computing points in TS | Copy the 0009/0010 SQL CTE shape inside `get_promotion()` | Production rank truth lives in Postgres RPCs (03-01 lock); duplication drifts |
| "Who may touch whom" rules | Two permissive RLS policies on members | One SECURITY DEFINER RPC with imperative checks | Permissive policies OR together — officer policy would admit owner rows (Area 3) |
| Staff queue read | New staff SELECT policies on submissions/submission_stats | `officer_queue()` RPC | Policy widening exposes raw EAV rows to direct REST browsing; RPC keeps one narrow read |
| Tier styling | New CSS/tokens or dynamic class names | `TIER_*` literal maps + existing tokens | Tailwind v4 JIT literal-class constraint (presentation.ts:47–50) |
| OVR tier banding | New band constants | `tierForOvr` (unit-locked) | Single source, already tested (presentation.test.ts:62–87) |
| Session revocation | Token epoch / force-logout machinery | `active = false` + existing 0004/0008 checks | D-10; the kill-switch already exists and is live-proven (smoke-rls check 13) |
| PIN/lockout, catalog, JWT minting | Any change | Untouched | Out of phase scope; verify-pin needs NO edits (role minted at login, verified index.ts:169–174) |

## Common Pitfalls

### Pitfall 1: 42P17 infinite recursion on members policies
**What:** any new policy ON `members` with an exists-subquery on `members` recurses (0007 live failure, 0008 fix).
**Avoid:** role/active writes go through SECURITY DEFINER RPCs (no new members policies at all). If a members policy is ever added, use a definer helper (0008 pattern).

### Pitfall 2: Wrong JWT claim in new policies/RPCs
**What:** `auth.jwt()->>'role'` is always 'authenticated' — staff gates silently match nothing (0006 live failure, caught by smoke).
**Avoid:** every gate reads `auth.jwt()->>'member_role'`; copy the gate verbatim from 0009:62–68.

### Pitfall 3: PostgREST zero-row UPDATE answers 204, not 403
**What:** an RLS `using` clause filters rows out silently; a fully-blocked PATCH looks successful (05-02 live lesson).
**Avoid:** in the RPC path this is moot (imperative checks raise), but any direct-REST probe in smoke must use `Prefer: return=representation` and assert 0 rows updated (smoke-lifecycle pattern).

### Pitfall 4: Stale member_role claim after grant/revoke
**What:** a demoted officer keeps staff UI + staff RPC access until their 7-day JWT expires — the claim is frozen at login.
**Avoid:** accepted and documented (D-10). Server gates still enforce on inactive/dead rows; deactivation is the immediate kill-switch. Document in the RPC comment and UAT; do NOT build token epochs.

### Pitfall 5: Active filter placed in the wrong CTE
**What:** adding `m.active` to `my_report`'s `latest` CTE or `class_top5`'s `latest` couples the filter to a shared CTE instead of the cohort site.
**Avoid:** `my_report` → cohort CTE join (0010:164–167); `class_top5` → `class_members` CTE (0010:274–281). Full-copy supersession, "copy, don't paraphrase" (0010:118–119).

### Pitfall 6: Forgetting EXECUTE hygiene / search_path
**What:** Postgres grants EXECUTE to PUBLIC at creation; missing `set search_path = public` breaks definer functions.
**Avoid:** every new function: `security definer`, `set search_path = public` (or `''` for helpers), revoke/grant block (0009:338–345).

### Pitfall 7: OVR all-6-or-nothing empties promotion sections
**What:** a class without exactly 6 key stats configured (e.g. the live "gypsy" class, STATE.md:127) yields ovr null for everyone → section hidden by the n<3/no-OVR filter. Owner may perceive data loss.
**Avoid:** expected behavior (03-CONTEXT D-09..D-12 gate); the empty state should say the class needs key-stat configuration; UAT step should cover a configured class only.

### Pitfall 8: smoke-rls check 7 breaks after the owner-only classes policy
**What:** the existing matrix asserts officer class insert SUCCEEDS (line 214).
**Avoid:** flip that probe (officer denied, owner allowed) in the same plan as migration 0011.

### Pitfall 9: officer validating an already-adjudicated row
**What:** two officers with the queue open; second action hits a non-pending row → PostgREST/RPC must not silently succeed.
**Avoid:** `set_submission_status` scopes the UPDATE to `status = 'pending'` and reports affected-rows/raises `not_pending` (Area 1B); queue refetch after action.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 (unit, `npm test`) + live smoke scripts (Node, `scripts/smoke-*.mjs`) |
| Config file | vitest in package.json (`"test": "vitest run"`); no separate config needed |
| Quick run command | `npm test` (vitest run — presentation/session unit locks) |
| Full suite command | `npm test` + `node scripts/smoke-rls.mjs` + `node scripts/smoke-rank.mjs` + new officer/promotion smoke |

SQL/RLS behavior is proven by live smoke scripts (established convention — no DB test harness exists; 02-01/03-03/05-02 precedent).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-05 | Queue RPC returns all pending rows w/ 57 values for staff; member/anon denied | live smoke | `node scripts/smoke-officer.mjs` (new) | ❌ Wave 0 |
| AUTH-05 | pending→validated raises my_report points for that member; pending→rejected removes them (compute-on-read) | live smoke | `node scripts/smoke-officer.mjs` (cohort assertions) | ❌ Wave 0 |
| AUTH-05 | transition RPC: member CANNOT set statuses; non-pending row → `not_pending`; own-discard policy still one-transition (regression) | live smoke | `node scripts/smoke-officer.mjs` + re-run `node scripts/smoke-lifecycle.mjs` | ❌ / ✅ (lifecycle exists) |
| AUTH-03 | owner RPC grants/revokes officer; officer RPC call → forbidden; role effective at next login (re-login mints new claim) | live smoke | `node scripts/smoke-officer.mjs` | ❌ Wave 0 |
| AUTH-04 | officer deactivates member → deactivated token denied everywhere (0004/0008 pattern, smoke-rls check-13 shape); member reactivates → access restored | live smoke | `node scripts/smoke-officer.mjs` | ❌ Wave 0 |
| AUTH-04 | removed player's rows leave the cohort: my_report aggregates shift / promotion card disappears after deactivation, return after reactivation | live smoke | `node scripts/smoke-officer.mjs` (or smoke-rank extension) | ❌ Wave 0 |
| AUTH-04 | owner rows untouchable: officer/owner RPC on role='owner' target → forbidden; officer cannot touch officer targets | live smoke | `node scripts/smoke-officer.mjs` | ❌ Wave 0 |
| SHWC-02 | member `get_promotion()` returns top-5-by-OVR cards; anon → denied; class_top5 (staff-only) unchanged | live smoke | `node scripts/smoke-promotion.mjs` (new, or merged into smoke-officer) | ❌ Wave 0 |
| SHWC-02 | key-stat leak probe: member response contains ZERO of the class's key-stat stat_keys (staff fetchKeyStats diff) and no is_key-like fields | live smoke | same script | ❌ Wave 0 |
| SHWC-02 | D-13: class with <3 active members with data / no OVR → section omitted | live smoke | same script (fixture class) | ❌ Wave 0 |
| (folded) | owner-only classes: officer POST /classes denied; owner allowed; smoke-rls check 7 flipped | live smoke | `node scripts/smoke-rls.mjs` (extended) | ✅ extend existing |
| — | my_report/class_top5 v3 no rank regression | live smoke | `node scripts/smoke-rank.mjs` (27/27 exact-value must stay green) | ✅ exists |

### Sampling Rate
- **Per task commit:** `npm test` (unit locks) + `npx tsc -b` typecheck
- **Per wave merge (post-push):** new officer/promotion smoke + `smoke-rls.mjs` + `smoke-rank.mjs` — full matrix, twice consecutively with no residue (WR-06/05-02 discipline)
- **Phase gate:** all smokes green + owner browser UAT (Validações walk, Destaques walk, Personagens owner controls) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `scripts/smoke-officer.mjs` — queue/transition/role/removal probes (fixture discipline per smoke-lifecycle: throwaway members via Management API seed or direct insert, bcrypt PIN 1234, try/finally cleanup, twice-consecutive-pass)
- [ ] smoke-rls.mjs check 7 flip (owner-only classes) + officer-still-blocked-after-role-rpc probes
- [ ] Env gate: SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF as session env vars (deploy + smoke both need them)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | smoke scripts, builds | ✓ | 24.13.0 | — |
| Supabase CLI | `db push`, migration history | ✓ | 2.120.0 | Management API database/query (legacy /v1, proven 01-01) |
| SUPABASE_ACCESS_TOKEN | deploy + Management API smoke cleanup | session-supplied | — | BLOCKS deploy until owner supplies (03-02/05-02 precedent: owner provides as session env var) |
| SUPABASE_PROJECT_REF | smoke Management API calls | ✓ (.env/precedent) | — | — |
| bcryptjs | smoke fixture PINs | ✓ (devDep 3.0.3) | — | — |

**Missing dependencies with no fallback:** none — SUPABASE_ACCESS_TOKEN is a standing owner-action pattern, not a missing tool.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Single owner account exists in live `members` (role='owner' rows = 1) and owner identity is seed-managed (no self-service path) | Area 3 | If multiple owners ever exist, `set_member_role`/`set_member_active` target rules still hold (all owner rows immutable), but "the owner account" UI copy assumes one — low risk |
| A2 | `is_active_staff_member()` is safe to call inside SECURITY DEFINER RPCs (not only policies) | Area 1/3 | Trivially true (definer helpers are ordinary SQL functions); verified by reading 0008 — near-zero risk |
| A3 | D-13 "n<3" maps to "no OVR-capable member in class" (per-stat cohort threshold via the OVR gate) rather than a raw member count | Area 4 | If the owner meant raw member count, the filter changes to `count(active members with data) >= 3` — planner discretion note; behavior difference is small (both hide sparse classes) |
| A4 | Exactly-6 highlight stats when available; fewer only if fewer stats carry points | Area 4 | Cosmetic; planner may lock exactly-6-or-hide-card instead |
| A5 | HistoryList wording "Rejeitado" satisfies D-06's "Rejeitada" (grammatical agreement with "Envio") | Area 6 | Pure copy call — owner may prefer "Rejeitada"; one-line change either way |

## Open Questions (RESOLVED — locked during planning)

1. **Queue payload size / limits** — What we know: one-pending rule caps rows at #members; 57 stats each. What's unclear: none material at guild scale (~tens). Recommendation: no pagination in v1. → **RESOLVED: no pagination in v1** (locked in plan 06-04, task 3 step 9; one-pending rule caps rows).
2. **Should `set_submission_status` also admit officer-own pending rows?** What we know: an officer's own submission sits in their own queue. What's unclear: whether validating your own row should be blocked. Recommendation: allow (small guild, owner trusts officers; reject-by-self is harmless — the player can resubmit). Planner may lock either. → **RESOLVED: officer own-row validation ALLOWED** (locked in plan 06-01 task 3 — no self-blocking in `set_submission_status` — and UI-SPEC Surface 1: "no special-case UI, no self-blocking").

## Sources

### Primary (HIGH confidence — read in full this session)
- `supabase/migrations/0001–0010` (all ten, verbatim) — schema, RLS policies, column grants, RPC gates, cohort CTEs, EXECUTE hygiene
- `supabase/functions/verify-pin/index.ts` — member_role minting (169–174), inactive refusal (143–146)
- `src/App.tsx`, `src/lib/api.ts`, `src/features/admin/CharactersPage.tsx`, `src/features/submit/HistoryList.tsx`
- `src/features/dashboard/{OvrHero,StatCard,presentation.ts}` + `presentation.test.ts`, `src/index.css` tier tokens
- `scripts/smoke-rls.mjs` (358 lines), `scripts/smoke-lifecycle.mjs` (probe patterns)
- `.planning/REQUIREMENTS.md`, `ROADMAP.md` §Phase 6 (grep), `PROJECT.md` key decisions, `STATE.md`, `06-CONTEXT.md`

### Secondary (MEDIUM)
- Prior phase contexts/plans cross-referenced: 03-CONTEXT D-05/D-06/D-07, 05-CONTEXT D-13/D-22, 01-UI-SPEC (modal-confirm reservation), 02 deferred-items (204 probe convention)

### Tertiary (LOW)
- None — no external/web sources needed; the phase is fully grounded in the repo.

## Metadata

**Confidence breakdown:**
- Server surfaces (RPCs/policies): HIGH — every claim read from the live migration files; the RLS-OR argument is Postgres-documented behavior
- Cohort filter sites: HIGH — both CTEs read line-by-line; supersession precedent (0010 §5) verified
- Key-stat leak analysis: HIGH — derived directly from the points computation in 0010/my_report SQL
- Frontend integration: HIGH — all named files read; only new-component design is discretionary
- Pitfalls: HIGH — every pitfall maps to a live-documented incident in STATE.md

**Research date:** 2026-10-12
**Valid until:** 2026-11-12 (stable repo; re-verify only if new migrations land meanwhile)

