---
status: diagnosed
phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md, 08-06-SUMMARY.md]
started: 2026-10-21T17:05:00Z
updated: 2026-10-22T01:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Login screen & app background
expected: Open the panel fresh. Login screen shows Hellz mark, Discord handle field, 4 PIN boxes, Entrar button, red neon grid background, and a single "Solicitar acesso" link (no "Primeiro acesso" button).
result: pass

### 2. Owner login → Painel
expected: Log in with your owner handle + PIN. You land on Painel; the neon grid background is now visible across the whole app (not only login); header shows "Olá, <nome>" + "Proprietário"; dashboard loads with your stats.
result: pass

### 3. Enviar Status — identity step
expected: Open Enviar Status. Step 1 (Personagem) shows: ID do personagem, Nick, Função (options "DPS Físico", "DPS Mágico", "Suporte"), Poder de Combate. There is NO "Classe" selector anymore. Uploading the Basic screenshot prefills ID/Nick (green hint "Preenchido pela leitura — confira.").
result: issue
reported: "the function selector must be empty by default, but saved after the first fill. once the user signals his function, his function will be that one, unless he changes it, or a staff member changes it for him"
severity: major

### 4. Enviar Status — submission with identity
expected: Complete a submission through the steps (values can be dummy). Review shows identity (ID/Nick/Função). After sending, you see "Envio registrado!" and the submission appears in history.
result: issue
reported: "logged as owner, the title should be 'Ahrya - High Priest (Support)' but the currently 'Officer Nickname — Gypsy (Suporte)'"
severity: major

### 5. Solicitar acesso — chooser
expected: From the login screen click "Solicitar acesso". You see the chooser with exactly two options: "Identificação" (Já sou da guilda) and "Recrutamento" (Quero entrar na guilda), plus "Consultar solicitação" and "Voltar".
result: pass

### 6. Identificação — claimed vs unclaimed handle
expected: Choose "Identificação", type a claimed handle (e.g. member-handle) and click Continuar: you reach the identity re-link form (PIN + proof + identity). Going back and typing an UNCLAIMED handle (e.g. .lieno) and clicking Continuar routes you to the first-access claim page ("Criar meu PIN" flow) instead.
result: pass

### 7. First-access claim → panel
expected: On the claim page for an unclaimed handle: fill your own 4-digit PIN twice, ID do personagem, Nick, Classe, upload a JPEG proof, submit. You land directly in the panel logged in as that member. Logging out and back in with the new PIN works; the OLD PIN no longer works.
result: issue
reported: "doing this with the owner account resulted in a duplication - ahrya is now both a member and the owner - two handles for the same person"
severity: major

### 8. Recrutamento — prospect application + status
expected: Choose "Recrutamento" and complete the full application (identity + 56 stats + proof). You get a request protocol (id). "Consultar solicitação" with the handle shows status "pending" and nothing else. No member account is created until staff approves.
result: pass

### 9. Personagens — staff lifecycle
expected: As owner: "Adicionar membro" works (handle + name → "Membro adicionado..."). Each member card shows "PIN pendente"/"PIN ativo" badge. The PIN/Classe/Função filters are collapsible dividers (collapsed by default, header shows current selection). "Identidade" on a card expands the identity form + history INLINE under that card (not at page bottom). "Redefinir PIN" is visible to you (owner) only, with confirmation.
result: pass

### 10. Validações — Solicitações & Identidades
expected: Validações has three tabs (Envios / Solicitações / Identidades). In Solicitações a pending request shows the ranking-style row (OVR or "Dados insuficientes", #ID · nick, class + function, type badge). Approve asks for the final function and the applicant becomes a member (role "Membro", PIN from the request works on login). Reject confirms and the requester can reapply. In Identidades a pending proof can be confirmed/rejected; after either decision the proof image is gone.
result: pass

### 11. Ranking identity display
expected: Open Ranking (staff tab). Rows show the member nickname with the character ID in monospace under it, in the server-provided order.
result: pass

### 12. Destaques — single grid background
expected: Open Destaques. The neon grid background appears ONCE (no doubled/darker grid pattern behind the cards); hero "Destaques" + "Os Impecáveis da Hellz" render normally.
result: pass

## Summary

total: 12
passed: 9
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "The Função selector on Enviar Status starts EMPTY (no default assumption); the member's choice is saved on first submission and prefilled from then on; the function only changes when the member or a staff member changes it"
  status: failed
  reason: "User reported: the function selector must be empty by default, but saved after the first fill. once the user signals his function, his function will be that one, unless he changes it, or a staff member changes it for him"
  severity: major
  test: 3
  root_cause: "Three stacked working-as-designed decisions contradict the owner's truth: (1) SubmitPage.tsx:190 hardcodes char_function:'dps' init + registry prefill (258-261) + a select with no empty option (695-699); (2) members.char_function is NOT NULL DEFAULT 'dps' (0005:26) so the schema cannot represent 'unchosen'; (3) D-20 deliberately excludes char_function from set_submission_status's validated promotion (0014:1302-1306) — the member's choice is recorded per-submission + history but never becomes members.char_function, all consumers (my_card/role_rank/get_promotion) read the registry value, and members have no sanctioned write path to their own function (UPDATE RLS is staff-only)"
  artifacts:
    - path: "src/features/submit/SubmitPage.tsx"
      issue: "hardcoded 'dps' init (190), registry prefill (252-262), select without empty option (683-700)"
    - path: "src/features/submit/identity.ts"
      issue: "CharFunction/SubmissionIdentity types cannot model an empty draft choice (11, 48); the empty-rejection copy exists (215-218) but is unreachable"
    - path: "supabase/migrations/0014_whitelist_requests_identity.sql"
      issue: "set_submission_status promotion block (1302-1306) deliberately excludes char_function (D-20)"
    - path: "supabase/migrations/0005_registry_catalog.sql"
      issue: "members.char_function NOT NULL DEFAULT 'dps' — no unchosen representation"
    - path: "scripts/smoke-identity.mjs"
      issue: "probe 11c smoke-locks the non-promotion (1127-1129)"
  missing:
    - "Draft type CharFunction | '' in the submit wizard (mirror requestFlow.ts:56), initial state '', placeholder option 'Selecione a função', validateIdentityDraft empty-rejection as the Enviar gate"
    - "Reverse D-20 for member-originated choices: promote char_function in set_submission_status's validated update (append-only migration 0015) so a validated submission saves the member's function"
    - "Staff override paths stay (correct_identity, approve_request); backfill/plan decision for members whose function is only the 0005 schema default (provenance marker vs treat staff-registered as valid prefills)"
    - "Flip smoke 11c + plan-test expectations; add client unit tests (selector starts empty, empty blocks Enviar, prefill only after a persisted choice, member choice overrides staff-set on next validated submission)"
  debug_session: ".planning/debug/function-selector-empty-default.md"

- truth: "The Enviar Status title shows the member's current identity — nickname, class and function (e.g. 'Ahrya — High Priest (Suporte)') — not the stale registry row ('Officer Nickname — Gypsy (Suporte)')"
  status: failed
  reason: "User reported: logged as owner, the title should be 'Ahrya - High Priest (Support)' but the currently 'Officer Nickname — Gypsy (Suporte)' (SubmitPage.tsx:572 renders me.display_name/me.char_class from the registry row)"
  severity: major
  test: 4
  root_cause: "The step-1 title renders `me` from fetchMe() — the raw members registry self-read (api.ts:142-152, PostgREST select under member_select_own RLS). Migration 0014 identity-patched only the payloads rendering OTHER members (officer_queue §8.1, role_rank §8.2, get_promotion §8.3, staff_members §6.5) and its scope guard (0014:21-24) explicitly left the member self-read untouched. The denormalized members row is a partial stale projection (live: owner row display_name='Ahrya'/char_id=null/char_class='Gypsy' — the current identity lives in member_identity_history). The same stale me.char_class also seeds the identity-form prefill (SubmitPage:252-262). Client-side fix is impossible: member_identity_history is RLS-no-policies (RPC-only) and members.char_id is not in the client grants"
  artifacts:
    - path: "src/features/submit/SubmitPage.tsx"
      issue: "step-1 <h2> (571-573) and identity prefill (252-262) source identity from the raw registry row me (fetchMe, line 247)"
    - path: "src/lib/api.ts"
      issue: "fetchMe (142-152) — the unpatched member self-read; never got the 0014 identity patch set"
    - path: "supabase/migrations/0014_whitelist_requests_identity.sql"
      issue: "scope guard (21-24) excluded the member self-read from the identity patches; the D-21 coalesce helpers (identity_display_name/identity_char_id) exist but are RPC-EXECUTE-only"
  missing:
    - "New member-invocable SECURITY DEFINER self-identity RPC (migration 0015, house style) returning the caller's current identity via the D-21 coalesce: identity_display_name, identity_char_id, newest-history char_class with members.char_class fallback, function from the registry pointer"
    - "SubmitPage consumes it for BOTH the title and the identity-form class prefill; legacy fallback (no identity history) renders exactly today's registry row — zero regression for pre-phase-8 members"
    - "Explicit plan decision (not silent bundle): adopt the same fresh read for the App header 'Olá' and Painel own-card name (session snapshot staleness); login-JWT display_name stays OUT of scope (not a JWT claim, and mint-time coalesce would go stale mid-session)"
  debug_session: ".planning/debug/submit-title-identity.md"

- truth: "Identificação is only for EXISTING handles: an unknown handle must never reach the member re-link path, and a member-type request must never create a second account for a person who already has one"
  status: failed
  reason: "User reported: doing this with the owner account resulted in a duplication - ahrya is now both a member and the owner - two handles for the same person. DB confirms: owner-handle (role owner, 'Ahrya') AND satturne (role member, 'Ahrya', char_id 32980, created 2026-10-22 01:00) — an unknown handle entered Identificação, was routed to the member re-link form (401 probe cannot distinguish unknown from claimed), the request was approved and approve_request created a new member row"
  severity: major
  test: 7
  root_cause: "The invariant 'member-type request = re-link for an EXISTING handle' is enforced by NO layer: (1) RequestAccessPage.submitIdentify (122-135) routes every non-409 outcome to the re-link form because verify-pin's enumeration-safe 401 (verify-pin:113-116, T-01-07) makes unknown vs claimed indistinguishable client-side; (2) request-access intake (index.ts:121-128) has no handle-existence guard for request_type 'member' — already_member fires only when a row EXISTS, so unknown handles pass vacuously, and create_membership_request (0014:459-592) validates everything EXCEPT handle existence; (3) approve_request's else-branch (0014:930-937) INSERTs a brand-new claimed member row for any handle without a members row, regardless of request_type — the prospect minting feature doubles as the duplication backdoor (live: satturne). char_id uniqueness couldn't catch it: the owner row's char_id was null so 32980 was free"
  artifacts:
    - path: "supabase/migrations/0014_whitelist_requests_identity.sql"
      issue: "create_membership_request §6.4 (459-592): missing not_member intake guard for request_type 'member'; approve_request §6.9 (908-937): prospect-oriented else-INSERT branch reachable by member-type requests"
    - path: "supabase/functions/request-access/index.ts"
      issue: "intake has no handle-existence check for member-type requests (121-128); rpcError mapping (228-239) has no not_member branch"
    - path: "src/features/request/RequestAccessPage.tsx"
      issue: "submitIdentify (122-135) routes all non-409 outcomes to the re-link form — the UX surface where the new not_member copy surfaces"
    - path: "src/features/request/requestFlow.ts"
      issue: "requestErrorCopy (187-259) lacks a not_member case"
    - path: "scripts/smoke-identity.mjs"
      issue: "§7 probes (887-919) assert the buggy behavior as the contract (7c passes only because a member row is created)"
  missing:
    - "Server intake guard (append-only migration 0015): create_membership_request raises new token 'not_member' for request_type 'member' when the handle has NO members row (existence, not active-ness — inactive re-link keeps working)"
    - "Defense-in-depth at approve_request: else-branch raises not_member for member-type requests with no existing row; INSERT becomes prospect-only"
    - "Edge mapping: request-access rpcError maps 'not_member' → 400 {error:'not_member'} (purges the uploaded proof); requestErrorCopy gains a pt-BR case pointing unknown handles to Recrutamento"
    - "Rewrite smoke §7 for the new contract (probe 7c intentionally goes red once the guard lands); keep §8 inactive-re-link green; add Edge-level probe + unit copy test"
    - "LIVE CLEANUP: delete the satturne members row (frees char_id 32980 via members_char_id_key), its member_identity_history rows (source='request'), pin_login_attempts, the approved membership_requests row (else request_status keeps answering for satturne); check submissions/submission_stats/identity_proofs for that member_id and purge storage residue"
  debug_session: ".planning/debug/identificacao-duplicate-member.md"
