# Phase 6: Trust & Celebration — Officer Tools & Promotion Page - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 10 (5 new, 4 modified, 1 no-change note)
**Analogs found:** 10 / 10 (all grounded in live repo files read this session)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/0011_officer_tools_promotion.sql` | migration | event-driven (RPC/status marks) | `supabase/migrations/0009_rank_engine.sql` + `0010_discard_lifecycle.sql` | exact |
| `src/features/admin/ValidacoesPage.tsx` | component | request-response (RPC read + status writes) | `src/features/admin/CharactersPage.tsx` | exact |
| `src/features/highlights/HighlightsPage.tsx` | component | request-response (single RPC fetch) | `src/features/dashboard/DashboardPage.tsx` + `CollapsibleGroup.tsx` | role-match |
| `src/features/highlights/PromotionCard.tsx` | component | transform (opaque payload → tiered UI) | `src/features/dashboard/OvrHero.tsx` + `StatCard.tsx` | exact |
| `src/lib/api.ts` (modify) | service | request-response | self (`setKeyStat`/`fetchMyReport`/`fetchClassTop5` wrappers) | exact |
| `src/App.tsx` (modify) | component shell | request-response | self (Tab union + UX-gate + re-check) | exact |
| `src/features/admin/CharactersPage.tsx` (modify) | component | CRUD + confirm dialogs | self (row state-machine + RoleLabels) | exact |
| `scripts/smoke-officer.mjs` | test | batch (probe matrix) | `scripts/smoke-lifecycle.mjs` | exact |
| `scripts/smoke-rls.mjs` (extend) | test | batch | self (check matrix + check 7 flip) | exact |
| `src/features/submit/HistoryList.tsx` | component | request-response | **NO CODE CHANGE** — `rejected: 'Rejeitado'` already exists (line 17); record wording call only | — |

---

## Pattern Assignments

### `supabase/migrations/0011_officer_tools_promotion.sql` (migration, RPC/status surfaces)

**Analog:** `supabase/migrations/0009_rank_engine.sql` (primary — gate shape, EXECUTE hygiene, comments), `0010_discard_lifecycle.sql` (cohort supersession), `0008_staff_active_check_fix.sql` (definer helper + policy drop/recreate)

**Header + claim contract pattern** (0009:1–19; copy verbatim, update phase refs):
```sql
-- NeoFoot Phase 6 (...): append-only corrective — 0001–0010 NEVER edited in
-- place (0008 precedent).
-- Claim contract (0006 lesson, never violate):
--   auth.jwt()->>'member_role' = 'member'|'officer'|'owner' (guild role)
--   auth.jwt()->>'role'        = 'authenticated' (PostgREST role-switch only)
```

**Staff gate pattern — copy VERBATIM into every new staff RPC** (0009:62–68):
```sql
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;
```

**Member gate pattern (promotion RPC — NOT the staff gate)** (0010:135–141):
```sql
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;
```

**Function signature + comment pattern** (0009:51–57, 97–98):
```sql
create or replace function public.set_key_stat(p_class text, p_stat_key text, p_enabled boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$ ... $$;

comment on function public.set_key_stat(text, text, boolean) is
  'Staff-only ... Internal gate: member_role in (officer,owner) AND caller active.';
```
Helpers use `set search_path = ''` with fully-qualified `public.members` (0008:29–42).

**EXECUTE hygiene — REQUIRED for every new function** (0009:338–345):
```sql
revoke execute on function set_key_stat(text, text, boolean) from public, anon;
grant  execute on function set_key_stat(text, text, boolean) to authenticated;
```

**Owner-only policy change pattern (folded todo)** — drop+recreate with name reuse (0008:66–70); policy is ON `classes`, so an inline members subquery is safe (0009:33–37 precedent — 42P17 only strikes policies ON `members`):
```sql
drop policy if exists staff_insert_classes on classes;
create policy staff_insert_classes on classes
  for insert to authenticated
  with check (auth.jwt()->>'member_role' in ('owner','owner') -- → owner ONLY, per 06 D-08
    and <active check: is_active_owner() helper or inline exists>);
```
Do NOT reuse `is_active_staff_member()` (it matches officers). Model a new helper on `is_active_staff_member()` (0008:29–42).

**Cohort supersession — "copy, don't paraphrase"** (0010:113–120, 122–338): my_report v3 = FULL copy of the 0010 v2 body with EXACTLY one change — add `and m.active` to the **cohort CTE join on members** (0010:164–167), NOT to `latest` (0010:148–159). class_top5 v3 = FULL copy of 0010:242–338 with `and m.active` added in the **`class_members` CTE** (0010:274–281 — the comment there already anticipates Phase 6). Record the 03-CONTEXT D-06 supersession ("member active-ness is NOT part of the cohort" 0009:14–15 → amended by 06-CONTEXT D-07) in the migration header so nobody "fixes" it back.

**Transition RPC pattern** (`set_submission_status`): imperative checks inside the definer — staff gate (above), `p_status in ('validated','rejected')` else `raise exception 'invalid_status'`, then `update submissions set status = p_status where id = p_submission and status = 'pending'`; if 0 rows affected, `raise exception 'not_pending'` (PostgREST zero-row UPDATE answers 204, not 403 — 05-02 lesson, smoke-lifecycle:300–323). Append-only: status mark only, never touch member_id/submitted_at (0010 header contract, 0010:57–60).

**RNK-02 comment contract for `get_promotion()`** (0010:239–240 shape):
```sql
comment on function public.get_promotion() is
  'Member-invocable promotion payload (SHWC-02): per class, top-5-by-OVR cards with top-6-by-points highlight stats. Key-stat identity is NEVER serialised (RNK-02) — class_key_stats is read internally for OVR only. Points use an identical formula for ALL 57 stats, so top-6-by-points selection cannot leak the key set. Active members only in every cohort (06-CONTEXT D-07).';
```

**Reuse for the promotion body:** copy the 0010 `latest`/`class_members`(+`and m.active`)/`cohort`/`cmp` CTE shape (0010:265–296) and the OVR lateral (0010:308–325); the `cmp` CTE already computes n/below/ties for ALL stats — points per stat = `(below + (ties-1)::numeric/2) / (n-1) * 99` (0010:319–321). Top-5 order: `ovr desc nulls last, display_name`, `limit 5` (0010:305, 327–329). Hide classes with no OVR-capable member server-side (D-13).

---

### `src/features/admin/ValidacoesPage.tsx` (component, staff queue)

**Analog:** `src/features/admin/CharactersPage.tsx` (full file — fetch/error/state machine/pt-BR)

**Imports + session-prop + enumeration-safe copy** (CharactersPage:11–28):
```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError, ... , type MemberRow } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'

// Enumeration-safe pt-BR copy (UI contract): never expose HTTP codes, gateway
// internals, or which check failed.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
```

**Load + cancel + error mapping pattern** (CharactersPage:70–86):
```tsx
  const load = useCallback(async () => {
    const [members, classes] = await Promise.all([fetchMembers(session), fetchClasses(session)])
    setData({ members, classes })
  }, [session])

  useEffect(() => {
    let cancelled = false
    load().catch((err: unknown) => {
      if (cancelled) return
      setError(
        err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
      )
    })
    return () => { cancelled = true }
  }, [load])
```

**Per-row action state machine** (CharactersPage:66–68, 130–151 — reuse for Validar/Rejeitar): `savingRowId`/`savedRowId`/`saveErrorRowId` pattern; disable every CTA while one request is in flight (`busy`, line 89); refetch the queue after a successful action (row leaves the queue — status no longer pending). Destructive action (Rejeitar) needs the modal-confirm pattern reserved at 01-UI-SPEC:226 — "Future destructive actions (Phase 6 remove/reject) WILL require a modal confirmation."

**Read-only 57-value grouping** (D-04): group by `group_name` with `GROUP_LABELS`/`GROUP_ORDER` from `src/lib/groups.ts:4–10` (Geral/Quasi/Especial); render value rows with StatCard's label+FLAT/PERCENTUAL anatomy (StatCard.tsx:47–52) and `formatStatValue` from `src/lib/parseStatValue`. Officers never PATCH values — the page has NO edit affordance at all.

**Shell/section copy pattern** (CharactersPage:154–164): `<section className="rounded-lg border border-line bg-surface p-6">` + `role="alert" aria-live="polite"` error block + `Carregando…` idle. Empty state (discretion): `Nenhuma submissão aguardando validação.`

---

### `src/features/highlights/HighlightsPage.tsx` (component, member promotion page)

**Analog:** `src/features/dashboard/CollapsibleGroup.tsx` (responsive grid) + `DashboardPage.tsx` (single-fetch page shape)

**Grid pattern** (CollapsibleGroup.tsx:54) — card grid, mobile-first (AGENTS.md):
```tsx
'mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
```

**Page shape:** session-prop page, one `useEffect` fetch of `fetchPromotion(session)` with the cancelled-guard + ApiError → SESSION_ERROR/NETWORK_ERROR mapping (CharactersPage:70–86 pattern). One section per class (D-13); a class omitted by the RPC gets no section (client adds an empty-state guard only). No role gate — every logged-in member sees it (D-12; same as `showSubmit` in App.tsx:47).

---

### `src/features/highlights/PromotionCard.tsx` (component, EAFC card)

**Analog:** `src/features/dashboard/OvrHero.tsx` (tier-styled card composition) + `StatCard.tsx` (badge/label anatomy)

**Tier styling — the hard constraint** (StatCard.tsx:6–8; presentation.ts:47–50): ALL tier classes flow through the literal maps; Tailwind v4 JIT never sees interpolated names:
```tsx
import { TIER_BORDER, TIER_TEXT, TIER_BG, tierForOvr, tierForPoints } from '../dashboard/presentation'
```
(presentation.ts:51–70 defines the maps; `tierForOvr` 19–25 for the OVR band, `tierForPoints` 10–16 for the 6 highlight facets — points arrive in the payload.)

**Card composition pattern** (OvrHero.tsx:36–49):
```tsx
    <section
      className={`rounded-lg border-2 bg-surface p-6 ${tier !== null ? TIER_BORDER[tier] : 'border-line'}`}
    >
      <p className="text-sm text-muted">OVR</p>
      <p className={`text-5xl font-semibold leading-none ${tier !== null ? TIER_TEXT[tier] : 'text-muted'}`}>
        {display}
      </p>
      ...
    </section>
```
Badge pattern (StatCard.tsx:33–37): `rounded-full border px-2 py-1 text-sm font-semibold ${TIER_BORDER[tier]} ${TIER_TEXT[tier]}` — use for the function badge (DPS/Tank via `FUNCTION_LABELS`, groups.ts:11–14) and per-facet point chips. Values via `formatStatValue(value, value_type)` (FLAT/PERCENTUAL parity, StatCard.tsx:55). Display name + class line pattern (OvrHero.tsx:46–47). OVR displayed ROUNDED (OvrHero.tsx:24).

---

### `src/lib/api.ts` (modify — RPC wrappers + MemberRow extension)

**Analog:** self — copy the established wrapper shapes.

**SECURITY DEFINER RPC wrapper pattern** (api.ts:176–190):
```ts
export async function setKeyStat(session: NeoFootSession, className: string, statKey: string, enabled: boolean): Promise<number> {
  const res = await restFetch(session, '/rpc/set_key_stat', {
    method: 'POST',
    body: JSON.stringify({ p_class: className, p_stat_key: statKey, p_enabled: enabled }),
  })
  return parseBody<number>(res)
}
```
Zero-arg RPC pattern (api.ts:230–247): `body: JSON.stringify({})` + `?? []` guard for list returns (api.ts:88, 120, 208) or the non-nullable malformed-shape throw for render-path contracts (api.ts:242–245). New wrappers: `fetchOfficerQueue`, `setSubmissionStatus`, `setMemberRole`, `setMemberActive`, `fetchPromotion` — same shape, typed interfaces like `ClassTop5Row` (api.ts:192–196).

**MemberRow projection extension** (api.ts:30–37, 114–121): add `active: boolean` to the interface and extend the explicit projection to `id,discord_handle,display_name,role,active,char_class,char_function` (safe — `active` is granted for SELECT, 0005:31; NEVER `select=*`, api.ts:97–100 comment). `SubmissionRow['status']` already includes `'rejected'` (api.ts:41) — no change.

---

### `src/App.tsx` (modify — two new tabs)

**Analog:** self. **Tab union** (App.tsx:18): add `'validacoes'` and `'destaques'`. **UX-only gate + content re-check** (App.tsx:38–47):
```tsx
        const isStaff =
          session.member_role === 'officer' || session.member_role === 'owner'
        const showCharacters = tab === 'characters' && isStaff
        const showKeyStats = tab === 'keystats' && isStaff
        const showSubmit = tab === 'submit'
```
Add `const showValidacoes = tab === 'validacoes' && isStaff`; Destaques needs NO role gate. **Staff nav button** (App.tsx:100–111): wrap the Validações button in `{isStaff && (...)}` with the identical className ternary; Destaques button renders for everyone (mirror Enviar Status, App.tsx:78–87). **Content switch** (App.tsx:116–124): two new branches — `<ValidacoesPage session={session} />` and `<HighlightsPage session={session} />`. Component homes: `src/features/admin/ValidacoesPage.tsx`, `src/features/highlights/HighlightsPage.tsx` (matches existing structure).

---

### `src/features/admin/CharactersPage.tsx` (modify — owner-only controls)

**Analog:** self. **Owner gate** (page receives `session`, line 56): `session.member_role === 'owner'` gates the role select (Membro↔Oficial + confirm) and Remover/Reativar buttons; the add-class form (lines 168–202, `handleAddClass` 91–111) renders owner-only (D-09). Reuse `ROLE_LABELS` (30–34) and the per-row state-machine (`savingRowId`/`savedRowId`/`saveErrorRowId`, 66–68) plus enumeration-safe copy constants (24–28). Reactivation affordance = same `setMemberActive` RPC with `p_active = true`. Deactivation/role actions call the new RPC wrappers — never direct PATCHes (role/active are ungranted for UPDATE, 0005:30–33).

---

### `scripts/smoke-officer.mjs` (new — live smoke matrix)

**Analog:** `scripts/smoke-lifecycle.mjs` (copy the whole skeleton).

**Skeleton pattern** (smoke-lifecycle.mjs): env loading 42–69 (SUPABASE_ACCESS_TOKEN + PROJECT_REF as SESSION env vars only — never written/echoed, lines 29–31), `check()` counter 86–96, `login()` via verify-pin 99–117, `rest()` wrapper with token===null-anon 120–137, `mgmtQuery()` 140–157, throwaway fixtures + `bcrypt.hashSync(PIN, 10)` seed 206–212, idempotent pre-run + finally cleanup 189–193/333–342, twice-consecutive-pass discipline (WR-06), exit 1 on any FAIL 344–349.

**Probe conventions to reuse:** direct-REST denial probes assert non-2xx (lifecycle:268–277); zero-row RLS updates assert 204/0-rows via `Prefer: return=representation` (lifecycle:300–323); deactivated-token probes follow smoke-rls check-13 shape. Phase 6 matrix (from RESEARCH §Validation Architecture): queue read staff-only; pending→validated/rejected transitions + `not_pending` on stale rows; member cannot set statuses; owner grants/revokes (officer → forbidden); role effective at next login; deactivation kills token + removes rows from cohort (promotion card/my_report shift), reactivation restores; owner rows untouchable; officer cannot touch officer targets; `get_promotion()` member 2xx + anon denied + key-stat leak diff (staff `fetchKeyStats` vs member response, zero overlap, no is_key-like fields) + insufficient-data class omitted; `smoke-rls.mjs` check 7 FLIPS to officer-denied/owner-allowed in the SAME plan as migration 0011 (smoke-rls.mjs:214).

---

## Shared Patterns

### Server-side gating (every new RPC/policy)
**Source:** `supabase/migrations/0009_rank_engine.sql:62–68` + `0008_staff_active_check_fix.sql:29–42`
**Apply to:** officer_queue, set_submission_status, set_member_role, set_member_active, get_promotion, staff_insert_classes recreation.
```sql
if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
   or not exists (select 1 from members m
     where m.id::text = auth.jwt()->>'member_id' and m.active) then
  raise exception 'forbidden';
end if;
```
- NEVER read `auth.jwt()->>'role'` for guild role (0006 live failure).
- Owner-only surfaces: `'owner'` alone (D-08) — not via `is_active_staff_member()`.
- Role-differentiated TARGET rules (officer→member rows; owner→member+officer rows; owner rows immutable; no self-deactivation) MUST be imperative checks in a SECURITY DEFINER RPC — two permissive RLS policies OR together and cannot express this (RESEARCH Area 3). No new policies ON `members` at all (42P17, 0007→0008).
- Every function: `security definer`, `set search_path = public` (helpers `''`), `comment on function`, EXECUTE hygiene revoke/grant block (0009:338–345).

### Append-only discipline
**Source:** `supabase/migrations/0010_discard_lifecycle.sql:1–24, 57–60`
**Apply to:** set_submission_status (status mark only), set_member_active (flag only — never delete rows). Submissions are never overwritten or deleted; `submitted_at`/`member_id` untouched.

### Cohort contract
**Source:** `supabase/migrations/0010_discard_lifecycle.sql:148–167, 274–281`
**Apply to:** my_report v3, class_top5 v3, get_promotion. `status not in ('rejected','discarded')` (existing) + `m.active` in cohort/class_members CTEs only. Full-copy supersession via `create or replace`; record D-06 supersession in the header.

### Key-stat boundary (RNK-02)
**Source:** `supabase/migrations/0010_discard_lifecycle.sql:239–240` (comment), `0009_rank_engine.sql:101–106`
**Apply to:** get_promotion + its frontend render. Serialized fields: stat_key/label/value_type/value/points ONLY. Forbidden: is_key flags, class_key_stats-derived fields, key-privileging order. Frontend renders the payload verbatim, never recomputes rank math (presentation.ts:1–5 header).

### Frontend data + error conventions
**Source:** `src/lib/api.ts:46–78` (both headers, explicit projections, parseBody), `src/features/admin/CharactersPage.tsx:22–28` (enumeration-safe pt-BR), `src/features/submit/HistoryList.tsx:14–28` (status label maps)
**Apply to:** all new wrappers and pages. Never `select=*`; `?? []` guards; SESSION_ERROR/NETWORK_ERROR mapping; `role="alert" aria-live="polite"`; pt-BR copy everywhere.

### UX-only gating
**Source:** `src/App.tsx:33–47`
**Apply to:** Validações tab (staff gate) and owner controls on Personagens. Enforcement is ALWAYS the RPC/policy server-side (AGENTS.md non-negotiable).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `set_member_role` / `set_member_active` RPC bodies | migration | imperative target-rule checks | First role-differentiated write surfaces in the repo — but the gate/signature/hygiene all copy 0009; only the target-rule logic is novel (RESEARCH Area 3 spells it out) |
| Promotion card visual treatment (metallic accents, exact sizing) | component | presentation | Discretion per D-02; the tier system, badge anatomy, and grid all have exact analogs above |

## Metadata

**Analog search scope:** `supabase/migrations/`, `supabase/functions/verify-pin/` (referenced via RESEARCH line numbers), `src/` (features + lib), `scripts/`
**Files read in full:** 0009, 0010, 0008, App.tsx, api.ts, CharactersPage.tsx, presentation.ts, StatCard.tsx, OvrHero.tsx, HistoryList.tsx, smoke-lifecycle.mjs, groups.ts
**Pattern extraction date:** 2026-10-12
