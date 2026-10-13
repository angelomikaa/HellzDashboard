---
phase: 06-trust-celebration-officer-tools-promotion-page
reviewed: 2026-10-12T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - scripts/smoke-officer.mjs
  - scripts/smoke-promotion.mjs
  - scripts/smoke-rls.mjs
  - src/App.tsx
  - src/features/admin/CharactersPage.tsx
  - src/features/admin/ConfirmDialog.tsx
  - src/features/admin/ValidacoesPage.tsx
  - src/features/highlights/HighlightsPage.tsx
  - src/features/highlights/PromotionCard.tsx
  - src/lib/api.ts
  - supabase/migrations/0011_officer_tools_promotion.sql
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-10-12
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Phase 6 surfaces end to end: migration 0011 (officer queue/transitions, owner-only role RPC, role-differentiated removal, member-invocable promotion RPC, D-07 cohort supersession, owner-only class creation), the typed api.ts wrappers, the Validações/Destaques/Personagens pages, ConfirmDialog, App tab wiring, and the three smoke scripts.

**Server-side posture is solid.** The 0011 SECURITY DEFINER gates follow the established house pattern (member_role claim + live active row), target rules in `set_member_role`/`set_member_active` are logically complete (no path grants `owner`, owner rows immutable, self-target blocked, officer→member-only), the D-07 v3 bodies were verified line-by-line as faithful copies of 0010 with exactly the `and m.active` amendment, and the promotion payload's closed field list keeps key-stat identity off the wire (RNK-02). EXECUTE hygiene and append-only semantics are preserved.

**Defects found are client-side and test-side:** misleading per-row success feedback in Personagens after staff actions, a keyboard-trap bug in the shared ConfirmDialog, a non-unique React key on promotion cards, and a smoke matrix that claims — but does not deliver — coverage of the officer→officer-target rule (the plan's probe 13 intended two distinct cases; the implementation collapsed them into one duplicated self-target call).

No critical issues. 4 warnings, 4 info items below.

## Warnings

### WR-01: Actions column shows hardcoded "Salvo." after ANY staff confirm action

**File:** `src/features/admin/CharactersPage.tsx:583-584` (interacts with `271-278` and `543-547`)
**Issue:** `handleConfirm` sets `savedRow({ id: memberId, text: ROLE_UPDATED_MESSAGE | MEMBER_REMOVED_MESSAGE | MEMBER_REACTIVATED_MESSAGE })`. The Controles column correctly renders `savedRow.text` (line 543), but the last (Ações) column has its own branch `savedRow?.id === member.id ? <span>Salvo.</span> : ...` that ignores `savedRow.text`. After a role grant, removal, or reactivation, the row shows BOTH "Papel atualizado. Efetivo no próximo login." (Controles) AND a hardcoded "Salvo." (Ações) — claiming a character edit was saved when none happened. Misleading operator feedback on exactly the destructive-action surfaces this phase hardened.
**Fix:** Only render the hardcoded "Salvo." for actual character saves, e.g. track the feedback kind or compare the text:

```tsx
) : savedRow?.id === member.id && savedRow.text === 'Salvo.' ? (
  <span className="text-sm font-semibold text-success">Salvo.</span>
) : (
```

Better: add a `kind: 'save' | 'action'` discriminator to `RowFeedback` and branch on it instead of string comparison.

### WR-02: ConfirmDialog keyboard trap — Shift+Tab from the confirm button is swallowed

**File:** `src/features/admin/ConfirmDialog.tsx:65-78`
**Issue:** The two-button trap handler treats Shift+Tab from BOTH buttons identically: `if (e.shiftKey && (active === cancelRef.current || active === confirmRef.current)) { e.preventDefault(); confirmRef.current?.focus() }`. Backward-Tabbing from the confirm button should move focus to Cancel (the natural previous element); instead the handler prevents the default and refocuses confirm — the focus never moves. Keyboard users landing on "Rejeitar"/"Remover" are stuck on it until they press Enter or Tab forward. Since the confirm button is also the initial focus target (line 43), the very first Shift+Tab in every dialog is dead.
**Fix:** Restrict the backward-wrap special case to the cancel (first) button only and let the browser handle confirm→cancel:

```tsx
function handleTab(e: ReactKeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'Tab') return
  const active = document.activeElement
  if (e.shiftKey && active === cancelRef.current) {
    e.preventDefault()
    confirmRef.current?.focus()
  } else if (!e.shiftKey && active === cancelRef.current) {
    e.preventDefault()
    confirmRef.current?.focus()
  } else if (!e.shiftKey && active === confirmRef.current) {
    e.preventDefault()
    cancelRef.current?.focus()
  }
  // Shift+Tab on confirm: no preventDefault — browser moves focus to cancel.
}
```

### WR-03: Promotion cards keyed by non-unique `display_name`

**File:** `src/features/highlights/HighlightsPage.tsx:83`
**Issue:** `key={card.display_name}` — `display_name` is a free-text member field with no uniqueness guarantee. Two members with the same display name in the same class section (plausible in a small guild) produce duplicate React keys: React logs a warning and reconciliation can render stale/mismatched card content. The card payload carries no other unique field (`{display_name, char_function, ovr, highlights}`), so the client has nothing unique to key on.
**Fix:** Add the member id to the `get_promotion` card payload (it is a server-generated uuid; exposing it is no additional privacy surface beyond the display name already sanctioned by CMP-03), type it in `PromotionCardRow`, and key on it. Interim client-side mitigation: `key={`${card.display_name}-${index}`}` (safe here because the server order is the render order and cards never reorder client-side).

### WR-04: smoke-officer probes 13a/13e are the same self-target call twice — officer→officer-target rule is never tested

**File:** `scripts/smoke-officer.mjs:610-619` and `650-659`
**Issue:** Both probes send the identical request (officer token, `p_member = memberIds[HANDLES.officer]` — the officer's OWN row). 13a is labeled "officer targets an OFFICER row → non-2xx forbidden" but it is a self-target, exactly what 13e asserts. The plan (06-02-PLAN task matrix, probe 13) intended two DISTINCT cases: "officer targets smoke_officer (officer-row)" and "smoke_officer self-target". The fixture has only one officer, so the officer→*different-officer-row* case is structurally untestable as built — yet the validation matrix (06-VALIDATION, T-06-05 "officer cannot touch officer targets") claims this coverage, and the RPC rule (d) `v_target_role <> 'member'` for officer callers is never exercised against a non-self officer row.
**Fix:** Add a second officer fixture (e.g. `smoke_officer2`, officer/tank) to `HANDLES`/`ROLES`, then assert `set_member_active(officer1_token, officer2_id, false)` → forbidden and `set_member_role(officer1_token, officer2_id, 'member')` → forbidden. Alternatively, relabel 13a honestly as a self-target and re-scope the T-06-05 coverage claim in 06-VALIDATION.

## Info

### IN-01: officer_queue includes pending submissions of deactivated members

**File:** `supabase/migrations/0011_officer_tools_promotion.sql:110-113`
**Issue:** The queue CTE filters only `s.status = 'pending'` — pending rows belonging to deactivated members still appear and can be validated/rejected by staff. This is arguably desirable (a removed member's stale pending row needs adjudication to leave the queue), but it is undocumented in the function comment, and validating such a row has no rank effect while the member is inactive (D-07 cohort filter).
**Fix:** No code change required; add one sentence to the `comment on function` documenting that pending rows of inactive members remain visible/adjudicable by design.

### IN-02: get_promotion casts the member_id claim before the null check

**File:** `supabase/migrations/0011_officer_tools_promotion.sql:303`
**Issue:** `v_member := (auth.jwt()->>'member_id')::uuid` — if the claim is present but not a valid uuid (corrupted/minted-wrong token), the cast raises `invalid_text_representation` (raw 500) before the intended `no_member_claim` guard runs. The claim is server-minted by verify-pin, so exposure is minimal, but the guard order defeats its own purpose for malformed-claim input.
**Fix:** Validate the format before casting, e.g. `if auth.jwt()->>'member_id' !~ '^[0-9a-f]{8}-...' then raise exception 'no_member_claim';` or wrap the cast in a `begin/exception` block.

### IN-03: Stale comment in smoke-rls check 5 (staff-only insert → now owner-only)

**File:** `scripts/smoke-rls.mjs:187-193`
**Issue:** Check 5's inline comment says "member CANNOT insert a class (staff-only RLS)" — after migration 0011 class creation is OWNER-only (D-09), which check 7 correctly asserts. The stale label could mislead a future reader auditing the boundary matrix.
**Fix:** Update the comment to "member CANNOT insert a class (owner-only per 0011)".

### IN-04: ConfirmDialog initial focus lands on the destructive confirm button

**File:** `src/features/admin/ConfirmDialog.tsx:43`
**Issue:** Focus moves to `confirmRef` on open for every dialog, including the destructive ones (Rejeitar, Remover). The WAI-ARIA APG dialog pattern recommends initial focus on the least-destructive control for confirmation dialogs, so a hasty Enter press fires the destructive action.
**Fix:** Focus the cancel button when `destructive` is true: `;(destructive ? cancelRef : confirmRef).current?.focus()`.

---

_Reviewed: 2026-10-12T00:00:00Z_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
