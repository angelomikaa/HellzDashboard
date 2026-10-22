---
status: complete
phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md, 08-06-SUMMARY.md]
started: 2026-10-21T17:05:00Z
updated: 2026-10-22T01:20:00Z
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
  artifacts: []
  missing: []

- truth: "The Enviar Status title shows the member's current identity — nickname, class and function (e.g. 'Ahrya — High Priest (Suporte)') — not the stale registry row ('Officer Nickname — Gypsy (Suporte)')"
  status: failed
  reason: "User reported: logged as owner, the title should be 'Ahrya - High Priest (Support)' but the currently 'Officer Nickname — Gypsy (Suporte)' (SubmitPage.tsx:572 renders me.display_name/me.char_class from the registry row)"
  severity: major
  test: 4
  artifacts: []
  missing: []

- truth: "Identificação is only for EXISTING handles: an unknown handle must never reach the member re-link path, and a member-type request must never create a second account for a person who already has one"
  status: failed
  reason: "User reported: doing this with the owner account resulted in a duplication - ahrya is now both a member and the owner - two handles for the same person. DB confirms: owner-handle (role owner, 'Ahrya') AND satturne (role member, 'Ahrya', char_id 32980, created 2026-10-22 01:00) — an unknown handle entered Identificação, was routed to the member re-link form (401 probe cannot distinguish unknown from claimed), the request was approved and approve_request created a new member row"
  severity: major
  test: 7
  artifacts: []
  missing: []
