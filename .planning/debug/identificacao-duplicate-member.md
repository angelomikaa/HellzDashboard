---
status: diagnosed
trigger: "Diagnose ONE UAT gap — find the root cause only, do NOT fix anything. Identificação routed the OWNER (existing handle, NO member row) into the member re-link path; approving the member-type request created a brand-new member row 'satturne' — same person now has two handles (owner + member)."
created: 2026-10-21T00:00:00Z
updated: 2026-10-21T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — no layer enforces the "member-type request = re-link for an EXISTING handle" invariant. create_membership_request accepts any handle (format/dummy/active-member/pending/char_id guards only — no handle-existence check for request_type 'member'), and approve_request's else-branch INSERTs a brand-new members row when the request handle has no members row — a branch that only prospect requests should reach. The client's identify probe (any non-409 verify-pin outcome → re-link form) is the delivery mechanism, not the root cause: the enumeration-safe 401 (T-01-07) makes client-side pre-filtering structurally impossible, so the open server path is reachable by any anonymous user with any handle.
test: direct code reading of all five caller-specified files + verify-pin + smoke-identity.mjs fixtures (predict→observe per layer).
expecting: each link of the chain confirmed by quoted code — done, see Evidence.
next_action: return ROOT CAUSE FOUND to caller (goal: find_root_cause_only — no fix applied).

reasoning_checkpoint:
  hypothesis: "The truth 'Identificação is only for EXISTING handles' exists only in prose (UI copy 'Já sou da guilda', staff badge 'Já é membro', 08-02-SUMMARY 'identity re-link for inactive/legacy handles') — no layer enforces it. An unknown handle gets the enumeration-safe 401 from verify-pin, the client routes it to the member re-link form, request-access/create_membership_request accept the member-type request (no handle-existence guard), and approve_request's member-creation else-branch mints a claimed members row — exactly what a re-link must never do."
  confirming_evidence:
    - "verify-pin/index.ts:113-116 — `if (!member || member.active === false)` → dummy compare → uniform 401 invalid_credentials: unknown handle is indistinguishable from wrong-PIN claimed handle (T-01-07, deliberate)."
    - "RequestAccessPage.tsx:122-135 — only `409 + pin_setup_required` routes to first-access; comment line 130: 'Claimed or unknown handle -> member re-link form'. Any 401 (incl. unknown handle) opens the re-link form with requestType='member'."
    - "request-access/index.ts:121-128 — the already_member guard only fires when a members row EXISTS and is active; an unknown handle passes vacuously. No guard requires an existing members row for request_type 'member' anywhere in the function."
    - "0014_whitelist_requests_identity.sql:459-592 (create_membership_request) — guards: invalid_handle(format)/dummy_handle/invalid_pin/invalid_request_type/invalid_identity/unknown_class/invalid_function/invalid_proof/invalid_stats/request_pending/duplicate_char_id. NO handle-existence check for member-type requests. The 566-568 comment ('an inactive legacy member may re-request with their own ID') shows the design ASSUMED member requests come from existing rows but never enforces it."
    - "0014:908-937 (approve_request) — v_existing lookup by handle returns null for an unknown handle → already_member doesn't fire → else-branch (930-937) INSERTs a brand-new members row with the request's pin_hash/claimed_at/char_id. The INSERT branch is shared by both request types and is undifferentiated: it exists for prospects (where minting a member IS the feature) and doubles as the duplication backdoor for member-type requests."
    - "assert_char_id_available passed vacuously: char_id 32980 was held by NO member row (the owner-handle row has char_id null — owner never linked a character), so neither members_char_id_key nor the cross-table guard detected the person duplication. Same char_id blocking is NOT sufficient duplicate-person detection."
    - "smoke-identity.mjs §7 (lines 887-919) creates a member-type request for H.memberreq ('smoke-idn-memberreq') — a handle with NO seeded members row (ROLES lines 130-138 doesn't include it) — and asserts as PASS: request created (7a), no submission (7b), and the approved handle logs in with the request PIN (7c — only possible if approve_request CREATED a member row). The hole was codified as the expected contract and shipped green through 117 live probes twice."
  falsification_test: "If any layer had rejected the unknown handle, the satturne row could not exist: setup-pin 401s unknown handles (index.ts:123) and claim_pin raises 'invalid' on missing rows (0014:409) — the first-access flow is structurally safe, which ELIMINATES it and isolates the member re-link request path as the only system path that mints a claimed member row from a self-request for a handle with no prior row."
  fix_rationale: "Server-side invariant enforcement is the only complete fix: (1) intake guard in create_membership_request — for request_type 'member' require an EXISTING members row for the handle (existence, not active-ness: active is already caught by already_member; inactive must keep working), raising a new token (e.g. 'not_member'); (2) defense-in-depth at approve_request — member-type + v_existing.id null must raise instead of INSERT (also drains requests that slipped intake before the guard lands); the INSERT branch stays for prospects only. The client cannot fix this alone — any client-only fix leaves the API minting rows via curl."
  blind_spots: "Assumed the live satturne row came from the member-type request approval (per user report + DB evidence: pin claimed + request approved in Validações); no live DB access from this environment to re-verify. Did not audit whether the owner logged in as satturne and submitted stats afterwards (cleanup must CHECK submissions for that member_id). Did not read 08-01/08-02 PLAN design docs beyond the SUMMARY quotes — the UAT truth and UI copy are the authoritative intent."

## Symptoms

expected: Identificação is only for EXISTING handles: an unknown handle must never reach the member re-link path, and a member-type request must never create a second account for a person who already has one.
actual: "doing this with the owner account resulted in a duplication - ahrya is now both a member and the owner - two handles for the same person". Live DB evidence (already confirmed): owner-handle (role owner, display_name 'Ahrya') AND a NEW row satturne (role member, display_name 'Ahrya', char_id 32980, created 2026-10-22 01:00, pin claimed). The owner went through Solicitar acesso → Identificação with a handle that had NO member row, was routed to the member re-link form, submitted a member-type request, and approving it in Validações created a brand-new member row.
errors: None — the flow succeeded, which is the bug.
reproduction: Test 7 in .planning/phases/08-whitelist-lifecycle-self-request-whitelisting-first-login-pi/08-UAT.md
started: UAT of Phase 8 (whitelist lifecycle / self-request whitelisting / first login PIN), observed live 2026-10-22.

## Eliminated

- hypothesis: The first-access claim flow (setup-pin/claim_pin) created the duplicate row.
  evidence: setup-pin/index.ts:123 refuses handles with no members row with a uniform 401 ("Uniform 401 for missing/inactive handles"); claim_pin (0014:409-414) raises 'invalid' when `v_member.id is null or not v_member.active`. Neither path creates a members row — the claim flow is structurally limited to existing rows. Also add_member (0014:312-314) creates rows with pin_hash NULL (unclaimed); the satturne row is claimed, so the manual whitelist path is ruled out too.
  timestamp: 2026-10-21

- hypothesis: The client-side 401→re-link routing is the root cause.
  evidence: It is the delivery mechanism, not the cause. verify-pin's uniform 401 (index.ts:113-116, T-01-07 anti-enumeration) is a locked security contract — the client CANNOT distinguish unknown handle from wrong-PIN claimed handle without a new server oracle that would itself leak handle existence. Even a perfect client leaves the server path open (any anon curl can mint a member row today). The routing belongs to the fix surface for copy/UX, not the root cause.
  timestamp: 2026-10-21

- hypothesis: The prospect path created the row.
  evidence: The user went through Identificação (member-type); a prospect request would carry 56 stats and mint a first validated submission (0014:943-952) — the evidence and the user report match the member-type path exactly (no submission, request approved in Validações).
  timestamp: 2026-10-21

## Evidence

- timestamp: 2026-10-21
  checked: .planning/phases/08-.../08-UAT.md Test 7 + gap entry
  found: Gap recorded with live DB facts: owner-handle (role owner, 'Ahrya') AND satturne (role member, 'Ahrya', char_id 32980, created 2026-10-22 01:00, pin claimed) — "an unknown handle entered Identificação, was routed to the member re-link form (401 probe cannot distinguish unknown from claimed), the request was approved and approve_request created a new member row". Severity major.
  implication: The live duplication exists and matches the member re-link request path.

- timestamp: 2026-10-21
  checked: src/features/request/RequestAccessPage.tsx submitIdentify (lines 106-139)
  found: The identify probe posts verify-pin with dummy pin '0000' (line 119). ONLY `res.status === 409 && body.error === 'pin_setup_required'` routes to the first-access flow (line 122). Everything else — explicitly documented at line 130: "Claimed or unknown handle -> member re-link form" — opens the re-link form with requestType='member' (lines 130-135). Chooser copy (line 276) sells Identificação as "Já sou da guilda" ("I'm already in the guild") — an intent the pipeline never verifies.
  implication: The client deliberately routes unknown handles into a flow whose server contract doesn't require existence.

- timestamp: 2026-10-21
  checked: supabase/functions/verify-pin/index.ts (lines 102-131)
  found: Line 113: `if (!member || member.active === false)` → dummy bcrypt compare → `invalidCredentials()` → 401 `{error:'invalid_credentials'}`. Comment lines 72-73: "missing handle, inactive member, and wrong PIN return the IDENTICAL 401 shape (T-01-07: no user enumeration)". Line 123: active handle with pin_hash null → 409 pin_setup_required (the only distinguishable state).
  implication: The client's 401→re-link routing is forced by the anti-enumeration contract; the handle's existence is unknowable client-side. Any real fix must be server-side.

- timestamp: 2026-10-21
  checked: supabase/functions/request-access/index.ts (intake, lines 81-261)
  found: Guards in order: request shape (81-110), dummy_handle (113), already_member (121-128 — `admin.from('members')...eq('discord_handle', handle).maybeSingle()`; fires ONLY when a members row exists AND active — an unknown handle passes vacuously), pending/supersede with previous-PIN proof (132-190), proof upload (205-211), then RPC create_membership_request (215-226). The function's own header says "Never writes members" (line 6) — but it ACCEPTS any handle for request_type 'member'. The rpcError mapping block (228-239) has no not_member branch (token doesn't exist yet).
  implication: Intake is the natural place the guard is missing; the unknown handle reaches the RPC unchecked.

- timestamp: 2026-10-21
  checked: supabase/migrations/0014_whitelist_requests_identity.sql create_membership_request §6.4 (lines 459-595)
  found: Validates handle FORMAT (489-491), dummy namespace (492-494), pin hash length (495-497), request type (498-500), identity (501-506), class (507-509), function (510-512), proof (513-515), stats shape (519-542), D-11 supersede (547-564), cross-table char_id uniqueness (569-573) — then INSERTs the request row (575-579). MISSING GUARD: nothing requires an EXISTING members row for request_type 'member'. The comment at 566-568 ("Exclude the requesting handle's own member row (an inactive legacy member may re-request with their own ID)") proves the design ASSUMED member requests come from existing rows — but assumption was never encoded.
  implication: The invariant is enforced nowhere; the intake RPC accepts member-type requests for any handle shape-valid handle. NOTE: any fix lands in a NEW append-only migration (project discipline: 0001-0014 are never edited in place).

- timestamp: 2026-10-21
  checked: supabase/migrations/0014_whitelist_requests_identity.sql approve_request §6.9 (lines 878-972)
  found: Staff gate (891-897) → pending check (903-906) → `select * into v_existing from members where discord_handle = v_req.discord_handle` (908) → already_member only when v_existing EXISTS and is active (909-911) → assert_char_id_available(v_req.char_id, v_existing.id, p_request) (915) → branch: v_existing.id not null → REACTIVATE the same row in place (917-929, WHIT-07 — the correct re-link semantics); else → INSERT a brand-new members row with role='member', the request's pin_hash, claimed_at=now(), char_id, display_name (930-937). The INSERT branch is NOT differentiated by request_type: it serves 'prospect' (minting a member IS the feature) and 'member' alike. Comment (972) even says "Creates or reactivates the member" without any type distinction.
  implication: For an unknown handle + member-type request, approval mints a claimed member row — the exact duplication observed. Defense-in-depth must make the else-branch raise for request_type='member'.

- timestamp: 2026-10-21
  checked: assert_char_id_available (0014:203-244) + members_char_id_key unique index (0014:49-50)
  found: char_id uniqueness spans members (any row), pending requests, pending submissions. It passed at intake AND at approval because char_id 32980 was held by NO member row — the owner-handle row's char_id is null (owner never linked a character through claim/correction).
  implication: Same-char_id blocking did NOT and CANNOT detect this duplication class: a person reusing their own unlinked char_id under a second handle sails through. char_id uniqueness is necessary but NOT sufficient duplicate-person detection; closing the minting path is the mitigation.

- timestamp: 2026-10-21
  checked: supabase/functions/setup-pin/index.ts + claim_pin (0014:362-453) — the contrast case
  found: setup-pin looks up the members row (114-119) and 401s `!member || member.active === false` (123-131); claim_pin re-checks under a row lock and raises 'invalid' for missing/inactive rows (409-411) and 'already_set' for a claimed row (412-414). Neither path can CREATE a members row.
  implication: The first-access claim flow is the correctly-scoped precedent: the claim only ever binds to an existing row. The re-link request path is the outlier that mints rows.

- timestamp: 2026-10-21
  checked: scripts/smoke-identity.mjs §7 (lines 887-919) + fixtures H/ROLES (99-155)
  found: §7 creates a member-type request for H.memberreq ('smoke-idn-memberreq') — a handle with NO seeded members row (ROLES covers owner/officer/a/b/c/ident/inactive only) — and asserts PASS on: '7a. member-type request created without stats', '7b. member-type approval creates NO submission', '7c. member-type approved handle logs in with the request PIN'. 7c is only possible if approve_request CREATED a members row for an unknown handle.
  implication: The duplication backdoor is not merely unguarded — it is codified as the expected contract by the live smoke suite, which is why 117 probes × 2 runs shipped green and only human UAT caught it. The fix must rewrite §7 in the same change or the suite goes red.

- timestamp: 2026-10-21
  checked: src/features/request/requestFlow.ts requestErrorCopy (187-259) + src/features/admin/RequestReview.tsx
  found: requestErrorCopy maps request_pending/invalid_previous_pin/locked/duplicate_char_id/already_member/proof_too_large/network — no 'not_member' case (falls to generic default copy). RequestReview labels member-type requests "Já é membro" (line 163) and maps approve errors already_member/not_pending/invalid_function (345-356) — no not_member mapping.
  implication: Fix surface includes: new error-token case in requestErrorCopy (pt-BR copy, e.g. "Este handle não tem cadastro na guilda. Use Recrutamento."), Edge mapping in request-access rpcError block, and optionally a RequestReview approve-error mapping for the defense-in-depth raise.

- timestamp: 2026-10-21
  checked: .planning/phases/08-.../08-02-SUMMARY.md line 75 + 08-03-PLAN.md
  found: 08-02-SUMMARY documents the intent: "request-access accepts member (identity re-link for inactive/legacy handles) and prospect (56–57 stats) applications, refuses dummy- handles and active members". The 08-03-PLAN speaks of "existing members re-linking a character".
  implication: The implementation gap contradicts the documented design — this is an implementation omission, not a design decision.

## Resolution

root_cause: The "member-type request = re-link for an EXISTING handle" invariant exists only in prose and is enforced by NO layer. (1) verify-pin's enumeration-safe 401 (T-01-07) makes the client structurally incapable of distinguishing an unknown handle, and RequestAccessPage.submitIdentify routes every non-409 outcome — explicitly including unknown handles — into the member re-link form. (2) request-access intake checks only dummy_handle / already_member (requires a members row to exist) / request_pending — there is NO guard that a request_type 'member' handle corresponds to an existing members row, active OR inactive. (3) create_membership_request (0014 §6.4) validates everything EXCEPT handle existence for member-type requests — despite its own comment assuming "an inactive legacy member may re-request". (4) approve_request (0014 §6.9) therefore falls through to its prospect-oriented else-branch and INSERTs a brand-new claimed members row (role='member', request pin_hash, claimed_at=now, char_id) for an unknown handle — exactly what a re-link must never do. The path is anonymous-reachable end to end; the owner walked it with a second handle and Validações approved the request into a duplicate account (satturne, char_id 32980). char_id uniqueness could not catch it (32980 was held by no member row) and the smoke suite §7 asserts the hole as the contract (probe 7c proves member-row creation for an unknown handle), which is why it shipped green.

fix: NOT APPLIED (goal: find_root_cause_only). Fix direction for the gap-closure plan:
  1. SERVER INTAKE GUARD (primary, new append-only migration — never edit 0014): in create_membership_request, for request_type 'member' require `exists (select 1 from members m where m.discord_handle = v_handle)` — EXISTENCE, not active-ness (active is already refused with already_member upstream; inactive re-link MUST keep working) — else raise a new token `not_member`. Prospects skip the guard (unknown handles are the prospect use case).
  2. DEFENSE-IN-DEPTH at approve_request: in the else-branch (v_existing.id is null), raise `not_member` when v_req.request_type = 'member' instead of INSERTing — the INSERT branch becomes prospect-only; this also drains any member-type request that slipped intake before the guard (like the pending-satturne scenario would have been).
  3. EDGE MAPPING: request-access/index.ts rpcError block maps `msg.includes('not_member')` → 400 `{error:'not_member'}` (proof upload is purged by the existing removeUpload path).
  4. CLIENT COPY: requestErrorCopy (requestFlow.ts) gains a `not_member` case with pt-BR copy pointing unknown handles to Recrutamento; keep enumeration-safety semantics in mind (the token only fires on a WRITE attempt with proof attached, same trust level as already_member today).
  5. TESTS: rewrite smoke-identity.mjs §7 to assert the NEW contract (member-type + no members row → not_member at intake AND the approve-time raise); keep §8 (inactive re-link → reactivation, same id) green; add an Edge-level probe (request-access member-type unknown handle → 400 not_member); unit-test the new requestErrorCopy case. NOTE: 7c as written today will fail once the guard lands — intentional, must be rewritten in the same change.
  6. LIVE CLEANUP (manual/apply-seed, owner token): remove the satturne duplicate — DELETE the members row (frees char_id 32980 via members_char_id_key so the real character can be linked to the owner row); DELETE member_identity_history rows for that member_id (approve_request inserted one source='request'); DELETE pin_login_attempts rows for the satturne handle (approve cleared them at approval line 940, but the owner logging in as satturne may have recreated rows); DELETE the membership_requests row (status='approved', member_id=satturne) — otherwise request_status keeps answering 'approved' for the handle (membership_request_stats cascades; member-type has none); CHECK submissions/submission_stats for that member_id (member-type approval creates none, but any post-approval login-as-satturne submission must go too — they'd also hold char_id 32980); CHECK identity_proofs for that member_id and the storage objects (requests/pending/<uuid>.jpg proof — RequestReview purges it best-effort on approve; claims/<member_id>/* only if a claim happened); verify the storage bucket has no residue, then confirm 32980 is free and the real character links cleanly.
  7. EDGE CASES PRESERVED: inactive member re-link (verify-pin 401 → re-link form → request → approve reactivates the SAME id) keeps working because the guard checks existence, not active-ness — smoke §8 locks it; unclaimed active handles keep routing 409 → first-access (setup-pin/claim_pin already require existing rows); staff manual whitelist add_member is untouched (officer/owner-gated RPC, the sanctioned manual path stays); duplicate-person detection beyond char_id remains heuristic — the guard closes the SYSTEM minting path, so a second account can only appear through a deliberate staff action (add_member) or a staff-approved prospect application, both human-gated decisions.

verification: (diagnose-only) Root cause confirmed by direct code reading at every layer of the chain; alternatives (first-access claim, add_member, prospect path, client-only routing) eliminated with quoted evidence. No code changed, nothing to verify at runtime.
files_changed: []
