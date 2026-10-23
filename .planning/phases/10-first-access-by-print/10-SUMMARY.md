# Phase 10 — First access by print, login by nickname

Owner decision 2026-10-23, superseding the handle-first claim of 08-03.

## Goal

A new player opens "Primeiro acesso", sends the Discord handle **and** the Basic
print. The print is read (char_id / nickname / class) and matched against the
guild registry by nickname. A match without a PIN opens the PIN setter; no match
becomes an officer-approved registration; a claimed character can never re-enter
the flow. Login itself becomes **character nickname + PIN**.

## Flow

| Registry answer | Screen |
|---|---|
| `ready` (active row, `pin_hash IS NULL`) | PIN setter → `setup-pin` → session |
| `unknown` | "Enviar print para aprovação" → `registration` request → officer queue |
| `pending` | "Cadastre enviado. Aguarde a aprovação." |
| `pin_set` | "Já tem PIN. Entre com o nick e o PIN." |
| `handle_claimed` | the typed Discord handle belongs to a claimed account → PIN system refused |
| `handle_registered` | the handle exists without a PIN but the print nickname does not match → officer |
| `identity_mismatch` | printed char_id ≠ registered char_id → officer |
| `ambiguous_identity` | more than one active row shares the nickname → officer |

A Discord handle that already belongs to an ACTIVE member refuses the whole
PIN/registration system (owner rule 2026-10-23): no PIN setter, no registration
request, no queue spam. Login also accepts the handle as a fallback for the
nickname field, and a claimed account can only be reached through its PIN.

Approval (`approve_request` v3) creates/reactivates the member **unclaimed**
(`pin_hash NULL`, `claimed_at NULL`). The next attempt answers `ready` and the
player sets the PIN.

## Data model (migration 0020)

- `members.login_key` — generated `lower(btrim(display_name))`, indexed. Login and
  claim resolve through it.
- `membership_requests.request_type` gains `'registration'`; `pin_hash` becomes
  nullable (a registration request carries no PIN).
- `create_registration_request()` — service-role, idempotent per pending
  handle/char_id, refuses `already_member`.
- `claim_pin_by_nickname()` — resolves the active row by `login_key`, refuses
  `not_registered` / `ambiguous_identity` / `already_set` / `identity_mismatch`,
  then delegates to `claim_pin` (single conditional UPDATE).
- `approve_request` v3 — registration branch + `duplicate_nickname` guard
  (nicknames are the login key).
- `reset_member_pin` / `review_identity` v2 — also clear the member-id lockout key.

## Lockout

`pin_login_attempts` rows are keyed by **member id** for known accounts (36 chars,
fits the existing 64-char constraint), so switching between nickname and the
legacy handle cannot dodge the 5-in-15-minutes window. Unknown names are never
counted (uniform 401, timing-equalized with the dummy hash).

## Edge Functions

- `verify-pin` — `{ nickname, pin }`; legacy `{ discord_handle }` still accepted.
- `setup-pin` — `{ nickname, pin, confirm_pin, char_id, char_class, proof_data_url }`;
  legacy handle payloads resolve to the same row.
- `first-access` (new) — `{ action: 'lookup' | 'request', ... }`; the lookup
  mints/stores nothing.

## Client

- `FirstAccessPage` — handle + Basic print (same optimal-example capture as the
  stats wizard), automatic OCR + lookup, PIN boxes only on `ready`, registration
  button only on `unknown`.
- `LoginPage` — "Nick do personagem" + PIN.
- `firstAccess.ts` — pure orchestration: `canSetPin`, `canRequestRegistration`,
  `statusMessage`, `firstAccessProblem`, `registrationProblem`,
  `submitFirstAccess`, `submitRegistration`, error copy.
- Staff board: `registration` badge ("Cadastro") + approval note (no stat table).

## Deploy order

1. `npx supabase db push` (0020)
2. `npx supabase functions deploy setup-pin verify-pin first-access request-access`
3. Vercel redeploy

The migration and the four functions must land together: the new client posts
`nickname`, while cached bundles keep posting `discord_handle` and are still
served by the legacy fallback.

## Verification

- `tsc -b` clean.
- `vitest run src/features/auth src/lib src/features/admin src/features/request`
  → 241 tests green (includes lookup/registration contracts and the status gate).
