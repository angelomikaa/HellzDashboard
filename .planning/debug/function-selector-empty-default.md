---
status: diagnosed
trigger: "Diagnose ONE UAT gap (08-UAT Test 3): Função selector on Enviar Status must start EMPTY, member's choice saved on first submission and prefilled from then on; function only changes when member or staff changes it. Today it is NOT empty by default and the member's choice is not persisted as their function."
created: 2026-10-22T00:00:00Z
updated: 2026-10-22T00:45:00Z
---

## Current Focus

hypothesis: CONFIRMED — three layered design decisions, working exactly as planned, jointly produce the gap: (1) client init/prefill hardcodes a non-empty function, (2) D-20 blocks promotion of the member's validated choice to members.char_function, (3) the members schema (NOT NULL DEFAULT 'dps') cannot represent an "unchosen" function, so the registry prefill can never be empty.
test: n/a (root cause confirmed by direct code evidence on all layers; no runtime experiment needed — static tracing is unambiguous).
expecting: n/a
next_action: Return ROOT CAUSE FOUND (goal: find_root_cause_only — no fix applied).

## Symptoms

expected: The Função selector on Enviar Status (SubmitPage step 1) must start EMPTY (no default assumption). The member's choice is saved on first submission and prefilled from then on. The function only changes when the member changes it or a staff member changes it.
actual: "the function selector must be empty by default, but saved after the first fill. once the user signals his function, his function will be that one, unless he changes it, or a staff member changes it for him" — i.e., today it is NOT empty by default and the member's choice is not persisted as their function.
errors: None reported.
reproduction: Test 3 in .planning/phases/08-whitelist-lifecycle-self-request-whitelisting-first-login-pi/08-UAT.md
started: Present since 08-04 (identity capture on submissions shipped); the underlying staff-only design is D-20 from the 08-CONTEXT decisions.

## Eliminated

- hypothesis: The selector shows a stale/default value because of an OCR-derived function inference.
  evidence: OCR never touches char_function by design — SubmitPage.tsx:321-333 (readIdentityProfile) passes `char_function: current.char_function` through untouched; 08-04-SUMMARY.md:46,76 confirm "never derives char_function".
  timestamp: 2026-10-22T00:20:00Z

- hypothesis: The member's choice is lost between submissions because the client fails to send it.
  evidence: handleSubmit (SubmitPage.tsx:425) sends the full `identity` incl. char_function to create_submission; the server stores it on the submissions row (0014:1238-1239) and appends it to member_identity_history on validation (0014:1296-1300). The data IS persisted — it is never PROMOTED to the member row.
  timestamp: 2026-10-22T00:30:00Z

## Evidence

- timestamp: 2026-10-22T00:05:00Z
  checked: src/features/submit/SubmitPage.tsx (identity state init, prefill effect, select markup)
  found: |
    - Lines 186-191: useState initializes `char_function: 'dps'` (hardcoded default — NOT empty).
    - Lines 252-262 (useEffect after fetchMe): char_function overwritten with `me.char_function` (registry row) unless identityTouchedRef.current.char_function === true.
    - Lines 683-700: the <select> renders ONLY FUNCTION_OPTIONS (dps/mdps/suporte) — no `<option value="">` placeholder exists to render an empty state.
    - Lines 302-307: handleIdentityFunction stores the member's choice in component state only (marks touched).
  implication: The "not empty by default" symptom has two client sources (hardcoded 'dps' initial state + members-row prefill) plus a missing empty <option>.

- timestamp: 2026-10-22T00:10:00Z
  checked: src/lib/api.ts fetchMe (line 142-148) + MemberRow (line 32-39)
  found: fetchMe selects `char_function` from the members table; MemberRow.char_function is typed non-nullable `'dps' | 'mdps' | 'suporte'`.
  implication: The prefill source is the members registry row.

- timestamp: 2026-10-22T00:12:00Z
  checked: supabase/migrations/0005_registry_catalog.sql:24-26 + 0012_catalog_alignment_roles.sql:50-53
  found: members.char_function is `text not null default 'dps'` (0005:26). 0012 dropped/re-added only the CHECK constraint (dps/mdps/suporte); the NOT NULL DEFAULT 'dps' was never touched.
  implication: EVERY member row carries a concrete function — staff-set (approve_request/correct_identity/officer PATCH), seed-set, or the schema default 'dps' (add_member at 0014:312-313 omits it, so the default applies). The registry prefill can never be empty; there is no representable "member hasn't chosen yet" state in the members table.

- timestamp: 2026-10-22T00:15:00Z
  checked: supabase/migrations/0014_whitelist_requests_identity.sql — create_submission (1169-1246) and set_submission_status (1254-1311)
  found: |
    - create_submission:1213 extracts char_function; 1225-1227 raises `invalid_function` when null/empty/not in (dps,mdps,suporte) — the server REQUIRES the member's choice on every submission (correct per the truth: the member must choose before submitting).
    - create_submission:1238-1239 stores char_function ON THE SUBMISSIONS ROW (per-submission data, column added at 0014:62).
    - set_submission_status on 'validated': appends the choice to member_identity_history incl. char_function, source='submission' (1296-1300) — then updates members with ONLY char_id/display_name/char_class (1302-1306). char_function is DELIBERATELY excluded from the members update.
    - Comments lock the intent: 0014:1251-1253 "members.char_function is NEVER auto-applied (D-20)", 0014:1292 "char_function stays staff-only", 0014:1314 "char_function is NEVER auto-applied — staff-only".
  implication: The member's choice is preserved as submission/history data but NEVER becomes the member's function. The next submission's prefill reads the unchanged members row, so the choice appears "not saved".

- timestamp: 2026-10-22T00:18:00Z
  checked: Who can write members.char_function (0005:30-42 policies; 0006/0007/0008 re-creations; 0014 RPCs)
  found: members UPDATE policy `staff_update_characters` is officer/owner-only (0005:39-42, kept verbatim in 0006:26-27, 0007:27-28, 0008:58-59). The 0005:33 column grant `update (display_name, char_class, char_function) to authenticated` is therefore unusable by members (RLY blocks non-staff). Writers today: approve_request (0014:927, staff-chosen at approval), correct_identity (0014:1099-1105, staff-only apply), staff PATCH via Personagens (smoke-rls.mjs:246-259 proves it), and the schema DEFAULT on add_member inserts.
  implication: There is NO member-facing path to change their own function today — "unless he changes it" is impossible by design, which the owner's truth explicitly requires to be possible.

- timestamp: 2026-10-22T00:20:00Z
  checked: What consumes the member's function (rank/card paths)
  found: my_card (0013:302 `select m.char_class, m.char_function into ...`), role_rank (0013:474-476 `where m.char_function = p_function`), get_promotion/role boards (0011:467,494; 0014:1434-1436), officer_queue fallback (0014:1349 `coalesce(s.char_function, m.char_function)`) — ALL read members.char_function, never the submission's value. 08-RESEARCH.md:48-50 documents this.
  implication: Even after a member picks a different function on a validated submission, their OVR/percentile cohort/rank board stay on the OLD staff-registered function. The per-submission choice affects nothing downstream.

- timestamp: 2026-10-22T00:22:00Z
  checked: src/features/submit/identity.ts — types and validation
  found: |
    - Line 11: `CharFunction = 'dps' | 'mdps' | 'suporte'` — no empty member.
    - Line 48: `SubmissionIdentity.char_function: CharFunction` — the submit-flow draft type CANNOT hold ''.
    - Lines 215-218 (identityProblems): empty/undefined char_function IS rejected with FUNCTION_ERROR 'Selecione a função do personagem.' (line 191) — but this is unreachable in the submit flow because the state inits 'dps' and prefills me.char_function.
  implication: The empty-state validation copy already exists; the type system is what prevents modeling the empty default.

- timestamp: 2026-10-22T00:25:00Z
  checked: src/features/request/requestFlow.ts + RequestAccessPage.tsx (the consistency comparison)
  found: The request flow ALREADY implements exactly the owner-expected pattern: `RequestFormDraft.charFunction: CharFunction | ''` (requestFlow.ts:56), empty init `useState<CharFunction | ''>('')` (RequestAccessPage.tsx:73), placeholder `<option value="">Selecione a função</option>` (RequestAccessPage.tsx:510), and a submit gate `if (draft.charFunction === '') return 'char_function'` (requestFlow.ts:76).
  implication: The submit flow diverged from its sibling flow; the fix pattern already exists in-repo and is unit-tested.

- timestamp: 2026-10-22T00:28:00Z
  checked: Phase 08 plan docs — where the current behavior was spec'd
  found: |
    - 08-04-PLAN.md:22: "char_function is NOT inferred from the screenshot; it is chosen by the player (prefilled from their member row) and recorded per submission" — registry prefill was the PLAN.
    - 08-04-PLAN.md:119: "`Funcao` select ... prefilled `data.me.char_function`".
    - 08-CONTEXT.md:50 (D-20): "The build role stays staff-only — never auto-applied from a submission."
    - 08-01-PLAN.md:193: "NEVER update `members.char_function` (build role stays staff-only)."
  implication: This is working-as-designed, not an implementation slip. The UAT gap is the owner's truth superseding D-20 + the 08-04 prefill decision. The gap-closure plan must explicitly reverse D-20 (for member-originated choices) and the prefill decision.

- timestamp: 2026-10-22T00:32:00Z
  checked: Test locks that assert the current behavior
  found: |
    - scripts/smoke-identity.mjs:1127-1129 — "11c. D-20: validated char_function is NOT auto-applied (member stays dps, history records mdps)" — LIVE smoke assertion locking non-promotion.
    - 08-01-PLAN.md:263 and 08-06-PLAN.md:190 — plan tests assert "char_function UNCHANGED" after validation.
    - identity/requestFlow unit tests cover the request-flow empty pattern.
  implication: Closing the gap requires flipping these smoke/plan assertions (the promotion test becomes "member's validated choice IS applied"), plus new tests for the empty-default selector.

## Resolution

root_cause: Three stacked design decisions — all implemented exactly as planned in Phase 08 — jointly contradict the owner's truth:
  (1) CLIENT: SubmitPage's identity state hardcodes `char_function: 'dps'` at init (SubmitPage.tsx:190) and the fetchMe effect prefills from the members row (SubmitPage.tsx:258-261); the <select> has no empty placeholder option (SubmitPage.tsx:695-699). The prefill source `members.char_function` is never empty because
  (2) SCHEMA: the column is `text not null default 'dps'` (0005:26; 0012 kept the default) — every member row carries a function (staff-set, seed-set, or schema default), so there is no representable "unchosen" state to prefill or start from; and
  (3) SERVER: the member's submission choice is stored per-submission (0014:1238-1239) and appended to member_identity_history on validation (0014:1296-1300), but D-20 deliberately excludes char_function from the members-row promotion in set_submission_status (0014:1302-1306 updates only char_id/display_name/char_class) — so the choice never becomes the member's function, the next submission prefills the unchanged registry value, and every rank/card RPC (my_card 0013:302, role_rank 0013:474-476, get_promotion) keeps consuming the staff-registered function. Members also have no sanctioned write path to their own function (members UPDATE RLS is staff-only, 0005:39-42), so "unless he changes it" is impossible today.
  Net effect: the selector can never start empty, and the member's choice is advisory data that is silently discarded as "their function" while being recorded only on the submission + history rows.

fix: (not applied — find_root_cause_only). Direction for the gap-closure plan below.

verification: (not applicable — no fix applied; root cause confirmed by direct static evidence on all three layers: client init/prefill lines, schema DDL, RPC promotion block, RLS policies, smoke locks).

files_changed: []
