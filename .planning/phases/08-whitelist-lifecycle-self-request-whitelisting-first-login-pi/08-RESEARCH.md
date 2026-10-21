# Phase 8 Research — Whitelist Lifecycle, Self-Request Whitelisting, First-Login PIN Setup & Character Identity Capture

**Researched:** 2026-10-21
**Mode:** inline research pass (gsd-phase-researcher subagent unavailable — endpoint failure)
**Downstream:** gsd-planner → 08-PLAN.md files

---

## 1. Executive Summary

Phase 8 extends the shipped v1.0 auth stack in three directions that share one trust boundary:

1. **Unclaimed handles** — `members.pin_hash` becomes nullable. `pin_hash is null` is the ONLY representation of "not claimed"; a claim is an atomic `UPDATE … WHERE pin_hash is null` performed through a service-role RPC called by a new `setup-pin` Edge Function.
2. **Applications** — a NEW pair of tables (`membership_requests`, `membership_request_stats`) written only by the service role (anon-facing `request-access` Edge Function). A pending request is never a member row and grants zero data access.
3. **Identity** — in-game ID / nickname / class / pointed role are captured per submission, plus an append-only identity history (`member_identity_history`) fed by claims, validated submissions, and staff corrections. `members.char_id` is the denormalized unique identity pointer; the latest history record supplies card nicknames.

**No supabase CLI/Docker in this environment** (07-01/07-04 precedent): the numbered migration (0014) is applied live with `node scripts/apply-seed.mjs`, and a `schema_migrations` bookkeeping row is recorded post-apply. Edge Functions are deployed with `npx supabase functions deploy` when the CLI is authenticated; otherwise the plan must raise a `checkpoint:human-action` for the owner (documented precedent: 01-02).

**Requirement-text supersession:** `REQUIREMENTS.md` WHIT-08/09 still describe the older one-screen request ("handle + display name + optional message"). `08-CONTEXT.md` D-06/D-07/D-08 supersede that with TWO loops (existing-member identity request; prospect full-stat application) and separate application tables. Plans implement CONTEXT; the coverage gate still cites WHIT-08/09/10.

---

## 2. Ground Truth (verified in repo)

### 2.1 Members & PIN state

- `members` (0001): `id`, `discord_handle unique`, `display_name`, `pin_hash not null`, `role member|officer|owner`, `active`, `created_at`. 0005 adds `char_class` (FK `classes`) and `char_function` (`dps|mdps|suporte` after 0012).
- Column grants (0005:30-33): `authenticated` may SELECT `id,discord_handle,display_name,role,active,char_class,char_function,created_at`; may UPDATE only `display_name,char_class,char_function`. `pin_hash`, `role`, `active` are unreachable directly — every staff RPC is the write path.
- `pin_login_attempts` (0001) is deny-all for clients; `record_pin_failure` (0003) is the only atomic counter. `_shared/lockout.ts`: 5 attempts / 15 minutes.
- Dummy sentinel namespace: handles `dummy-%` (seed-dummies.sql:33-41,205-218). `add_member` and `request-access` must reject it case-insensitively.
- Legacy placeholder rows: `supabase/seeds/whitelist.sql` (owner/officer/member handles, hashes only). D-24 converts every non-owner row to unclaimed; the owner row is rotated out-of-band with `scripts/hash-pin.mjs` + `apply-seed.mjs`.

### 2.2 verify-pin contract (functions/verify-pin/index.ts)

- POST `{ discord_handle, pin }`; trims/bounds handle ≤64; PIN `^\d{4}$`.
- Order today: method → body validation → env fail-fast → lockout read/gate → `members` read → missing/inactive burn a dummy bcrypt compare then `invalid_credentials` 401 (enumeration-safe) → wrong PIN 401 → clear attempts → mint 7-day HS256 JWT (`role:'authenticated'`, `member_id`, `member_role`, `kid`, issuer `nefoot-verify-pin`) → `{session:{access_token,member_id,display_name,member_role,expires_at}}`.
- **Phase 8 insertion point:** after the active check, BEFORE `bcrypt.compare`: if `member.pin_hash === null`, we need a setup signal. Because D-01 keeps the normal login form unchanged, the branch is only a safety net for a direct login attempt; the first-access flow is the sanctioned entry. It must NOT fire for inactive members (inactive returns 401 first), and it must burn a dummy compare so unclaimed vs missing timing stays uniform.
- The JWT minting block is duplicated by `setup-pin`; extract a shared helper (`_shared/session.ts`) rather than copy-pasting the signing code.

### 2.3 create_submission & validation

- `create_submission(p_stats jsonb)` (0005, replaced in 0010): member from JWT, validates non-empty array + known `stat_key`s, inserts `submissions` then `submission_stats`. 0010 also enforces the one-pending rule (previous pending → `discarded`).
- `set_submission_status(p_submission, p_status)` (0011) is status-mark only; `validated|rejected` whitelist; `not_pending` on races.
- **Phase 8 hook:** identity fields ride on the submission row (columns) and are promoted to `member_identity_history` + the member pointer at validation time inside `set_submission_status` (full-body copy of 0011:131-163 plus the identity promotion branch). `create_submission` gains a `p_identity jsonb DEFAULT NULL` argument so the old client signature still works during deploy.

### 2.4 Existing read payloads that surface names

- `my_card()` (0013:281-409) reads `members.char_class/char_function` and returns no name (the client uses `session.display_name` for the Painel).
- `get_promotion()` (0013:598+) reads `m.display_name` for Destaques cards.
- `role_rank(p_function,p_class)` (0013:426+) reads `m.display_name, m.char_class, m.char_function` and returns server-ordered rows.
- `officer_queue()` (0011:66) returns `m.display_name, m.discord_handle, m.char_class, m.char_function` + stats for pending submissions.
- **Phase 8:** add a small stable helper `identity_display_name(uuid)` (SQL, SECURITY DEFINER, search_path='') that returns the newest `member_identity_history.nickname` falling back to `members.display_name`; patch `get_promotion`/`role_rank`/`officer_queue` and the session/`fetchMe` display path. `my_card` does not carry a name; the Painel/header name must be refreshed after re-login/identity change — simplest is to return the resolved nickname in `my_card`? NO — 07.2 locked `my_card`'s closed payload. Instead, login/`setup-pin` mint the session with the resolved nickname, and `fetchMe` reads a staff-safe projection? `display_name` on `members` is updated at validation/claim, so `fetchMe`'s `display_name` is already current for the member themselves. Cards on Destaques use `get_promotion` (patched).
- **Do not** rewrite `my_report`/`class_top5` — Phase 9 owns the rank-RPC rewrite. Identity only affects display names and the officials board.

### 2.5 Storage precedent

`supabase/seeds/live/card-photos-storage.sql`: private bucket, 2 MB, `image/jpeg`; `storage.objects` RLS pins the top folder to the JWT `member_id`, active membership re-checked on every policy. Identity proofs use the same mechanics but a **different trust model**:
- writes happen **only** in Edge Functions with the service role (no anon/authenticated INSERT policy);
- reads/deletes are **staff-only** (`member_role in (officer,owner)` + `is_active_staff_member()`);
- bucket `identity-proofs`, paths `claims/<member_id>/<uuid>.jpg` and `requests/<request_id>/<uuid>.jpg`.

### 2.6 OCR basic screen (public/examples/basic.png verified)

The basic screenshot is 691×416 and contains, above the HP/SP pills:
- character nickname (e.g. `Ahrya`) on its own band;
- `Job  Gypsy` (label + value) on one row;
- `ID 32980` (label + value) right-aligned on the same row;
- `Power  288115` as the bottom pill (already read today).

`SCREENS.basic = { kind: 'pills' }` and `readBasicScreen` only reads pills (`fieldKeysFor('basic') === ['combat_power']`). Extension approach:
- add a `kind: 'profile'` grammar (or extend `pills` with a header section) whose `fieldKeysFor` returns `['combat_power','char_id','nickname','char_class']`;
- locate the header text bands with the existing `rowProfile`/`findTextBands` primitives in the top ~45% of the image, OCR the label area with `LABELS_WHITELIST` and fuzzy-match `Job`/`ID` via `GAME_LABELS`, read the value crop to the right;
- nickname = the band immediately above the Job row, left column; whitelist must allow letters, digits, spaces and common accents (a new `NICKNAME_WHITELIST`; do not reuse the digits-only or a-z-only sets);
- `char_class` is derived client-side from the OCR'd job via the `classes` catalog (case-insensitive, trimmed); an unknown job leaves the field `failed` and the member must correct it manually;
- `char_id` sanity: `/^\d{1,12}$/` after trimming spaces/commas;
- keep structural detection (no pixel fractions) and update `structure.test.ts` expectations (`fieldKeysFor('basic')`, grammar shape) plus a new profile-parser unit test with synthetic band data. Real-image calibration is a manual check against `public/examples/basic.png` (the sample is already the wizard's example shot).

### 2.7 Frontend conventions

- `api.ts` raw-fetch wrappers; closed interfaces; errors as `ApiError`; no supabase-js session handling.
- `App.tsx` Tab union (`painel|submit|validacoes|destaques|characters|keystats|ranking`); staff gating is UX-only, content re-checked.
- `LoginPage.tsx` is a single card; `session.ts` stores `{access_token,member_id,display_name,member_role,expires_at}` with shape validation.
- `CharactersPage` roster + inline edit + role/active RPC actions + `ConfirmDialog`; `ValidacoesPage` queue with expandable rows.
- `SubmitPage` is a 5-step wizard; step 1 (Personagem) owns `combat_power` + basic capture. Screenshots currently stay on-device — Phase 8 is the FIRST flow that uploads an image (identity proof/application), so the upload must be an explicit, disclosed action.
- No new npm dependencies; tests are Vitest; design system is the 07.1 red-accent token set (inputs `h-11`, `border-line`, `focus-visible:ring-accent`).

---

## 3. Proposed Schema (migration 0014 — ONE file)

> Append-only: 0014 only ADDS columns/tables/functions; prior migration files stay byte-untouched. Full-body copies of any replaced function (0011/0013 lesson).

### 3.1 Members

```sql
alter table members alter column pin_hash drop not null;
alter table members
  add column char_id text,
  add column claimed_at timestamptz;
alter table members
  add constraint members_char_id_format check (char_id is null or char_id ~ '^[0-9]{1,12}$');
create unique index members_char_id_key on members (char_id) where char_id is not null;
```

- `pin_hash is null` ⇔ unclaimed. `claimed_at` is evidence for the Identidade review block.
- `char_id` is the current identity pointer (latest validated/claim/correction). It is NOT client-writable (column grants unchanged).

### 3.2 Identity per submission + history

```sql
alter table submissions
  add column char_id text,
  add column nickname text,
  add column char_class text references classes(class_name),
  add column char_function text check (char_function in ('dps','mdps','suporte'));
alter table submissions
  add constraint submissions_char_id_format check (char_id is null or char_id ~ '^[0-9]{1,12}$');

create table member_identity_history (
  id bigserial primary key,
  member_id uuid not null references members(id),
  submission_id uuid references submissions(id),
  char_id text not null check (char_id ~ '^[0-9]{1,12}$'),
  nickname text not null check (char_length(nickname) between 1 and 80),
  char_class text references classes(class_name),
  char_function text check (char_function in ('dps','mdps','suporte')),
  source text not null check (source in ('submission','correction','claim')),
  created_at timestamptz not null default now(),
  created_by uuid references members(id)
);
create index idx_identity_history_member on member_identity_history(member_id, created_at desc);
alter table member_identity_history enable row level security; -- no policies: RPC-only
```

- Append-only; no UPDATE/DELETE path. Newest row wins for display.
- `char_function` records the POINTED role at submit/claim (history only). `members.char_function` stays staff-only (D-20): validation NEVER copies it; only `correct_identity` / staff roster edit may.

### 3.3 Membership requests

```sql
create table membership_requests (
  id uuid primary key default gen_random_uuid(),
  discord_handle text not null check (char_length(discord_handle) <= 64),
  pin_hash text not null,
  request_type text not null check (request_type in ('member','prospect')),
  char_id text not null check (char_id ~ '^[0-9]{1,12}$'),
  nickname text not null check (char_length(nickname) between 1 and 80),
  char_class text not null references classes(class_name),
  char_function text not null check (char_function in ('dps','mdps','suporte')),
  proof_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references members(id),
  member_id uuid references members(id)
);
create unique index membership_requests_one_pending_handle
  on membership_requests (lower(discord_handle)) where status = 'pending';
create unique index membership_requests_one_pending_id
  on membership_requests (char_id) where status = 'pending';
create index idx_membership_requests_status on membership_requests(status, created_at);

create table membership_request_stats (
  request_id uuid not null references membership_requests(id) on delete cascade,
  stat_key text not null references stat_catalog(stat_key),
  value numeric not null,
  primary key (request_id, stat_key)
);
alter table membership_requests enable row level security;      -- no policies
alter table membership_request_stats enable row level security; -- no policies
```

- Cross-table ID uniqueness (members ↔ open applications) is enforced in RPCs + a shared check function (a plain UNIQUE cannot span tables). Also check pending requests at `create_submission` time.
- `on delete cascade` is only used if a request row is ever deleted (it is not; supersede/reject keep history). Safe.

### 3.4 Identity proofs

```sql
create table identity_proofs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  storage_path text not null,
  char_id text not null,
  nickname text not null,
  char_class text references classes(class_name),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references members(id)
);
alter table identity_proofs enable row level security; -- no policies
```

Storage bucket + policies are applied as an UNNUMBERED live seed (storage-only, 07.2 precedent) so the numbered migration reservation is respected:
`supabase/seeds/live/identity-proofs-storage.sql` — bucket `identity-proofs` (private, 2 MB, jpeg) + staff SELECT/DELETE policies. No client INSERT/UPDATE policies.

### 3.5 Function inventory (0014)

| Function | Gate | Purpose / exceptions |
|---|---|---|
| `add_member(p_handle text, p_display_name text) returns uuid` | staff (`member_role in (officer,owner)` + live active row) | trim/bound handle/name; reject `dummy-%` → `dummy_handle`; existing active → `already_member`; existing inactive → reactivate, keep `pin_hash`/role, update display_name; else INSERT with `pin_hash null`, role `member` |
| `reset_member_pin(p_member uuid) returns void` | owner only (`is_active_owner`) | target must exist and not be `owner` → `forbidden`; `pin_hash=null, claimed_at=null`; delete `pin_login_attempts` for target handle (D-16) |
| `staff_members() returns jsonb` | staff | roster + `pin_set` boolean (`pin_hash is not null`), `char_id`, latest identity, pending proof flag; NEVER hash |
| `staff_identity_queue() returns jsonb` | staff | pending `identity_proofs` + member identity + `proof_path` |
| `review_identity(p_proof uuid, p_confirm boolean) returns void` | staff | confirm → `confirmed`; reject → `rejected`, `set_member_active`-equivalent deactivation (no self/owner path needed: target is a member), clear pin claim + lockout rows, free `char_id`; status guard `not_pending` |
| `staff_requests() returns jsonb` | staff | pending applications, applicant identity, server-computed `ovr` (live class+function cohort; never joins cohorts), `proof_path`, type |
| `approve_request(p_request uuid, p_function text) returns uuid` | staff | pending-only; `p_function` whitelist; handle must not exist active; create member with request `pin_hash` + `claimed_at` + identity (class from request), role `member`; append identity history; for prospects insert a `validated` submission + `submission_stats`; mark request `approved` + `member_id`; return new member id |
| `reject_request(p_request uuid) returns void` | staff | pending-only; mark `rejected`, `decided_at/by` |
| `request_status(p_handle text) returns jsonb` | anon + authenticated execute | trimmed handle lookup; returns ONLY `{status, request_type, created_at, decided_at}` of the latest non-superseded request (or null). No PII/PIN |
| `create_membership_request(...) returns uuid` | service role only (revoke from anon/authenticated) | validates fields + stats keys; supersede logic is done by the Edge Function (needs bcrypt) |
| `claim_pin(p_handle,p_pin_hash,p_char_id,p_nickname,p_char_class,p_proof_path) returns jsonb` | service role only | atomic: member exists + active + `pin_hash is null` else `already_set`/`invalid`; cross-table ID check; UPDATE member (pin hash, claimed_at, char_id, display_name, char_class); INSERT identity history (`claim`) + identity_proof pending; clear lockout; return member id/display_name/role |
| `correct_identity(p_member,p_char_id,p_nickname,p_char_class,p_char_function) returns void` | staff | append history (`correction`), update member pointer incl. `char_function` (staff-only), uniqueness check |
| `staff_identity_history(p_member uuid) returns jsonb` | staff | newest-first history rows (date, id, nickname, class, role, source) |
| `identity_display_name(p_member uuid) returns text` | internal (revoked from public/anon/authenticated; used by definer functions) | newest nickname else `members.display_name` |
| `create_submission(p_stats jsonb, p_identity jsonb default null)` | member (JWT) | full-body copy of 0010 + identity validation/storage + duplicate-ID check |
| `set_submission_status(p_submission,p_status)` | staff | full-body copy of 0011 + on `validated` promote identity (history + member pointer, NOT role) |
| `get_promotion()` / `role_rank(...)` / `officer_queue()` | unchanged gates | full-body copies replacing `m.display_name` with `identity_display_name(m.id)`; `role_rank` rows gain `char_id`; `officer_queue` rows gain `char_id,nickname,char_class,char_function` (submission identity) |

**Uniqueness helper:** `assert_char_id_available(p_char_id text, p_member uuid default null, p_request uuid default null)` — checks `members`, `membership_requests (pending)`, and pending `submissions` (for create_submission), raising `duplicate_char_id` with a clear token the client maps to "ID já cadastrado".

### 3.6 EXECUTE hygiene

Every new function needs `revoke execute ... from public, anon;` + explicit grant:
- staff RPCs → `authenticated` (internal gate does the rest);
- service-role RPCs (`claim_pin`, `create_membership_request`) → NOT granted to anon/authenticated at all (service_role bypasses EXECUTE checks? — service_role has BYPASSRLS but still needs EXECUTE; grant to `service_role` explicitly);
- `request_status` → `anon, authenticated`;
- `identity_display_name` → no client grant (definer callers only).
- `comment on function` states gate + exception tokens (house discipline).

---

## 4. Edge Functions

### 4.1 `verify-pin` patch

- Select adds no new column needed (`pin_hash` already selected).
- After `if (!member || member.active === false) …401`, insert:
  ```ts
  if (member.pin_hash === null) {
    bcrypt.compareSync(pin, DUMMY_HASH) // keep timing uniform
    return json({ error: 'pin_setup_required' }, 409)
  }
  ```
- No attempt is recorded on this branch (it is not a credential failure); the lockout gate still applies before it.
- Deploy `verify-pin` AFTER 0014 (nullable column) and BEFORE the client build is promoted.

### 4.2 `setup-pin` (new)

`POST multipart/form-data`:
`discord_handle, pin, pin_confirm, char_id, nickname, char_class, char_function?, proof` (JPEG blob ≤2 MB).

Order: method → parse form → validate (`^\d{4}$`, pin===pin_confirm, char_id `^\d{1,12}$`, nickname 1-80, char_class must exist — check via service client) → env fail-fast → lockout gate → member read (`id, display_name, role, pin_hash, active`) → missing/inactive burn dummy compare → 401 invalid_credentials (uniform) → `pin_hash !== null` → 409 `already_set` → bcrypt hash → upload proof to `identity-proofs/claims/<member_id>/<uuid>.jpg` (service role) → call `claim_pin` → on RPC failure delete the uploaded object and map `already_set`/`duplicate_char_id` → clear lockout → mint JWT (shared helper) → 200 `{session}`.

Rate limiting: call `record_pin_failure` on `already_set`/invalid-credential paths (never on 400 validation), clear on success. `claim_pin` itself is atomic; the Edge Function is the only caller.

### 4.3 `request-access` (new, anon)

`POST multipart/form-data`:
`discord_handle, pin, pin_confirm, request_type ('member'|'prospect'), char_id, nickname, char_class, char_function, stats? (JSON string), proof`.

Order: method → parse → validate → existing member check (any row) → 409 `already_member`; pending request for handle:
- exists → require `bcrypt.compare(pin, pending.pin_hash)` → mismatch 409 `request_exists`; match → mark old `superseded`, delete old proof, continue;
- none → continue (a previously rejected request needs only the handle, D-11).
Cross-table ID check (excluding this handle's pending) → 409 `duplicate_char_id`.
Prospect stats: parse JSON array, require ≥56 known unique keys and every value finite; duplicate keys rejected. Member type must have no stats.
Hash PIN → upload proof `requests/<request_id>/<uuid>.jpg` → call `create_membership_request` (service role) → 201 `{status:'pending'}`. On failure delete proof.

No session is returned. No rate-limit mechanism is invented (whitelist + PIN match on overwrite + staff review are the controls).

### 4.4 Deployment notes

- `setup-pin` and `request-access` need the same env secrets as verify-pin (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEFOOT_JWT_SECRET`, `NEFOOT_JWT_KEY_ID`).
- Shared modules: `_shared/session.ts` (mint JWT + SESSION_SECONDS), `_shared/cors.ts` optional.
- Deploy with `npx supabase functions deploy setup-pin request-access verify-pin --project-ref <ref>` using `SUPABASE_ACCESS_TOKEN` from session env (never written). If the CLI is unavailable/auth fails → `checkpoint:human-action` with exact dashboard/CLI steps.

---

## 5. Client Workstreams

### 5.1 PIN boxes (D-02)

New `src/features/auth/PinBoxes.tsx`: 4 controlled `<input inputMode="numeric" pattern="[0-9]*" maxLength={1}>`; auto-advance on digit; paste of 4 digits distributes; Backspace moves back; ArrowLeft/Right navigate; `aria-label="Dígito N de 4"`; parent owns the string value. Replace the login PIN input with it; reuse in first-access and confirmation. No auto-submit. Letters impossible (strip non-digits on change/input).

### 5.2 Login entry points (D-01/D-06)

`LoginPage` gains two secondary actions under the card:
- **Primeiro acesso** → `FirstAccessPage` (Discord handle, PinBoxes, confirm PinBoxes, basic screenshot picker with OCR preview of ID/nickname/job, explicit "Definir PIN" button).
- **Solicitar acesso** → `RequestAccessPage` chooser: "Já sou da guilda" (identity-only) / "Quero entrar na guilda" (prospect wizard) + "Consultar solicitação" (handle lookup → status line).

The app shell (`RequireAuth`) must allow these screens without a session. Prefer a small `authView` state in `App`/`RequireAuth` (`'login'|'first-access'|'request'`) rather than introducing a router (no new deps).

### 5.3 First access

- Client compresses the screenshot to ≤1200 px JPEG (same discipline as `CardPhotoUpload`), runs the extended basic OCR, shows editable ID/nickname/class fields (mandatory manual confirmation checkbox — same per-step verify discipline as the wizard).
- Submits `multipart/form-data` to `setup-pin`; handles `already_set` (copy: "Este acesso já foi definido. Faça login."), `duplicate_char_id` ("ID já cadastrado"), 401 uniform, 429 lockout copy.
- On success: `saveSession`, `onLogin` → panel (7-day session).
- The screenshot is uploaded ONLY at submit (explicit disclosure line: it is sent to staff for identity confirmation).

### 5.4 Membership requests

- `RequestAccessPage` reuses the identity block; prospect additionally reuses `SubmitPage`'s wizard. Because the wizard currently depends on `fetchMe`/`session`, extract a session-less `StatsWizard` core (catalog + inputs + OCR + verification) OR add a `mode:'application'` prop. The pure pieces (`wizard.ts`, `OcrCapture`, `StatGroupStep`, `ReviewStep`) are already session-free; `SubmitPage` is the only session-bound wrapper.
- Prospect submit: one sitting; chooser warns; no drafts (D-13).
- Status check calls anon `request_status` RPC (or a thin Edge Function if PostgREST anon execute is awkward) and renders pendente/aprovada/recusada + date + "é preciso ser liberado por um oficial".
- PIN boxes reused. Show/hide proof preview; never store the image beyond submit.

### 5.5 Identity capture in normal submissions (IDEN-01/02)

- Step 1 (Personagem) gains: character ID (numeric), in-game nickname, class (select from catalog; pre-filled by OCR job), pointed build role (dps/mdps/suporte chips). All mandatory + per-step verification; OCR pre-fill via the extended basic parser; manual correction always possible.
- `api.createSubmission(session, stats, identity)` sends `p_identity`.
- Success copy notes that class changes apply to the registry after validation.
- Screenshot itself is NOT uploaded for ordinary submissions (privacy stance unchanged); only ID/name/class/role text.

### 5.6 Staff surfaces

- **Personagens** (`CharactersPage`): switch roster read to `staff_members()`; add "PIN pendente/PIN ativo" badge + filter (D-18); owner-only "Redefinir PIN" row action with confirm copy (D-17); "Novo membro" handle-only form (handle + display name) calling `add_member`; row expansion gains identity history (`staff_identity_history`) + correction form (`correct_identity`). Keep the existing class/function edit and role/active matrix untouched.
- **Validações** (`ValidacoesPage`): three blocks — existing submissions queue, **Solicitações** (`staff_requests` board: ID, job, nickname, OVR, proof thumbnail, inline full stats; approve dialog prefilled with pointed role + officer adjustment; reject confirm), **Identidade** (`staff_identity_queue`: thumbnail + OCR fields beside the member; Confirmar / Não confere destructive confirm). After approve/reject/confirm/reject-proof, call a client `deleteProof(path)` storage wrapper (staff RLS) and refetch.
- **Ranking** (`RankPage`): rows show ID, job, nickname, OVR and keep inline details (D-23); `role_rank` now returns `char_id`; server order preserved.

### 5.7 API wrappers to add (`src/lib/api.ts`)

Closed interfaces + wrappers:
`addMember`, `resetMemberPin`, `fetchStaffMembers`, `fetchStaffIdentityQueue`, `confirmIdentity`, `rejectIdentity`, `fetchStaffRequests`, `approveRequest`, `rejectRequest`, `fetchIdentityHistory`, `correctIdentity`, `createMembershipRequest` (Edge Function fetch), `fetchRequestStatus` (anon), `setupPin` (Edge Function), `uploadIdentityProof`/`deleteIdentityProof` (storage helpers), plus `createSubmission` identity arg.

---

## 6. Risks / Pitfalls

1. **Branch ordering in verify-pin** — inactive members must never receive `pin_setup_required` (uniform 401). Smoke-probe both an inactive unclaimed row and an active unclaimed row.
2. **Timing oracle** — the unclaimed branch must burn the dummy bcrypt compare; missing/inactive/unclaimed/wrong-PIN latencies must be indistinguishable.
3. **Null pin_hash in bcrypt** — `bcrypt.compareSync(pin, null)` throws/returns false inconsistently; the null check MUST precede the compare (roadmap cross-cutting constraint).
4. **Double-claim race** — the claim must be a single conditional UPDATE (`where pin_hash is null`) returning rows; never read-then-write.
5. **Owner lockout** — legacy conversion excludes the owner row; `reset_member_pin` refuses owner targets; owner rotation is out-of-band.
6. **Anon request surface** — `membership_requests` must have RLS enabled with NO policies; only the Edge Function (service role) and staff RPCs may touch it. `request_status` returns status only.
7. **ID uniqueness across tables** — partial unique indexes per table + RPC-level cross-table check; a raw index cannot span `members`/`membership_requests`/pending submissions.
8. **Storage proof privacy** — no anon/authenticated INSERT; staff-only SELECT/DELETE; paths server-composed; never expose another member's proof path to members. Purge on decision (client-side staff delete + orphan cleanup script).
9. **Identity display drift** — `session.display_name` is minted at login; a validated class/nickname change appears on next login for the header, but Destaques/Ranking must use the patched RPCs immediately. State this in the plan/UI copy.
10. **Full-body RPC copies** — `get_promotion`, `role_rank`, `officer_queue`, `set_submission_status`, `create_submission` must be copied from 0011/0013 verbatim plus the minimal change; never paraphrase rank math (Phase 9 will rewrite rank RPCs again — do NOT touch `my_report`/`class_top5`).
11. **Migration 0014 is the only numbered file** — storage changes go in `supabase/seeds/live/identity-proofs-storage.sql`; any hotfix after apply gets a new appended file/seed (append-only).
12. **Deploy order** — 0014 → verify-pin patch + new functions deployed → client. Old client + new backend is safe (`p_identity` defaults null); new client + old backend is NOT (no setup-pin endpoint).
13. **OCR grammar regression** — `structure.test.ts` pins `fieldKeysFor('basic') === ['combat_power']`; that test must change deliberately, and the existing pill reader must still find `combat_power` on `basic.png`.
14. **Dummy sentinel** — `add_member`/`request-access` reject `dummy-` prefix case-insensitively; the purge script remains a pre-release gate.
15. **No new rate-limit mechanism** — reuse `record_pin_failure` + `pin_login_attempts`; never add a second counter.

---

## 7. Validation Architecture

**Framework:** Vitest (existing), Node live-smoke scripts (existing pattern), manual owner walkthrough for visual/staff UX.

### 7.1 Test layers

| Layer | Command | What it proves |
|---|---|---|
| Unit (client) | `npm test` | PIN-box behavior, identity parsing/validation, OCR profile fields, request form validation, identity display fallbacks, `api.ts` closed payloads |
| Build/type | `npm run build` | TS contracts, no dependency drift |
| Lint | `npm run lint` | oxlint clean |
| Migration syntax | apply 0014 to a scratch schema via the local Postgres rehearsal path (07-01 precedent, embedded binaries) OR `apply-seed` on live after a dry parse | DDL/DML validity + idempotent guards |
| Live smoke (new) | `node scripts/smoke-identity.mjs` | claim flow (unclaimed → setup-pin → session), double-claim `already_set`, inactive never `pin_setup_required`, reset flow, add/reactivate, dummy rejection, request submit/status/approve/reject, ID uniqueness, no member data leakage, identity validation promotion + role stays staff-only, card/get_promotion nickname sourcing |
| Existing live smokes | `smoke-lifecycle`, `smoke-officer`, `smoke-rls`, `smoke-rank`, `smoke-card`, `smoke-promotion` | zero regression (all must stay green after 0014) |
| Manual | owner walkthrough | PIN boxes on desktop/mobile, first-access OCR on `public/examples/basic.png`, staff Solicitations/Identidade boards, Personagens PIN filter/reset, Ranking ID column |

### 7.2 Dimension coverage (Nyquist)

| Dimension | Covered by |
|---|---|
| Requirement behavior | unit tests per pure module + smoke-identity RPC/Edge probes |
| Edge cases | already_set race, inactive branch, duplicate char_id across all three tables, missing proof, already-member request, superseded pending request, rejected-then-new request, missing identity on old-client submission |
| Error paths | uniform 401/429, `duplicate_char_id`, `request_exists`, `already_member`, `not_pending`, RLS denials |
| Security | anon cannot read requests/proofs; member cannot call staff RPCs; hash never in payloads; proofs staff-only; no client write path to `members`/requests |
| Integration | live E2E: request → approve → login; claim → staff confirm; submit identity → validate → card nickname; reset → re-claim |
| Regression | all existing smokes + full Vitest suite |
| Accessibility | PIN boxes keyboard/paste/labels, request forms labels/errors, confirm dialogs |
| Performance | guild-scale payloads only (staff boards), no new heavy client work |
