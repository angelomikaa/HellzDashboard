# Phase 8: Whitelist Lifecycle, Self-Request Whitelisting, First-Login PIN Setup & Character Identity Capture - Context

**Gathered:** 2026-10-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Staff control exactly who can access the panel, players claim their own access, and every submission records the in-game identity. Phase 8 delivers:

- **Whitelist lifecycle (WHIT-01..07):** staff add a player handle-only (no PIN), the player claims it through a first-access flow that sets their own 4-digit PIN, officers see who has not claimed, the owner resets a PIN, and re-adding an inactive handle reactivates it with history intact.
- **Self-request whitelisting (WHIT-08..10):** a person can request access without staff help through TWO loops — an existing guild member proves identity with one screenshot; a prospect submits a full stat application so an officer can evaluate and recruit them — with an officer decision queue and a self-service status check. A pending request never grants data access.
- **Character identity capture (IDEN-01..03):** every submission captures in-game character ID, nickname, class and pointed build role (OCR pre-fill + mandatory manual correction), stored per submission; the latest validated identity supplies the card nickname; staff see identity history, members never see others'.

**Not in this phase:** personalized Início tab / stale-data CTA (Phase 10), Destaques slider (Phase 10), value-proportional scale and per-(class, role) key stats (Phase 9), member self-service PIN change, weak-PIN blocklist, a second rate-limit mechanism, notifications/Discord DMs, public visitor homepage.

</domain>

<decisions>
## Implementation Decisions

### First-access entry & PIN entry UI
- **D-01:** First access starts from an explicit **"Primeiro acesso"** link/secondary action on the login card. The normal login form (handle + PIN) stays unchanged; a blank PIN never triggers setup.
- **D-02:** PIN entry becomes a **2FA-style 4-box numeric field** everywhere a PIN is entered (login, first-access PIN, confirmation): auto-advance, paste of 4 digits fills all boxes, backspace navigates back, and submission happens only on the explicit button (Entrar / Definir PIN). No auto-submit on the 4th digit, no reveal toggle. Letters must be impossible to enter.
- **D-03:** First-access fields are **Discord handle, PIN (4 boxes), PIN confirmation (4 boxes), and one basic-screen screenshot**. OCR reads character ID, in-game nickname and job from that screenshot; the job becomes the member's class. There is no separate typed "in-game name" field — the screenshot's OCR'd name is the identity evidence. Role is NOT chosen at claim (stays staff-assigned).
- **D-04:** A successful claim atomically sets the PIN, activates access and mints the standard 7-day session, landing directly in the panel. A second claim on an already-claimed handle returns `already_set` (no last-writer-wins). Claim attempts are rate-limited by the existing `pin_login_attempts` + `record_pin_failure` + `_shared/lockout.ts` machinery — no parallel mechanism.
- **D-05:** Claim-time identity proof is verified **asynchronously**: the screenshot lands in a staff-only **"Identidade"** review block inside Validações (proof thumbnail + OCR'd ID/name/job beside the member, pending count). Actions: **Confirmar** (clears the pending state) and **Não confere** (deactivates the member through the existing path and clears the claim so the handle is unclaimed again). Access is never blocked waiting for this review.

### Membership requests (self-request)
- **D-06:** One **"Solicitar acesso"** entry on the login screen opens a chooser with two loops:
  1. **"Já sou da guilda"** — identity-only request: handle, PIN, basic screenshot (OCR ID/nickname/job), class from the job, pointed build role. No stats.
  2. **"Quero entrar na guilda"** — prospect request: the full **Enviar Status** stats flow (all 57 stats, same wizard/OCR discipline) plus identity (handle, PIN, screenshot, class, pointed role).
- **D-07:** Request fields are **handle + PIN + identity** (ID, nickname, class, pointed role), with stats additionally for prospects. The applicant **points their build role** — needed for a meaningful applicant OVR.
- **D-08:** Applications live in **separate application tables** (application + its stats, append-only); a pending request is **never a member row**. On approval the member is created and the application's stats are **carried in as the member's first validated submission** — they appear in ranks immediately, with no re-submission.
- **D-09:** Approval runs the handle-only member creation with the **request's PIN already active** (player logs straight in; no first-access step for self-requesters). The pointed role **pre-fills the approval dialog and the officer confirms or adjusts it**; class comes from the submitted identity. Staff-only role assignment (ROLE-07) is preserved because approval IS the staff action.
- **D-10:** Status is checked by **handle lookup on the request screen** ("Consultar solicitação"): pendente / aprovada / recusada + type + date. A rejected requester sees **status only** (no reason), plus the reminder that an officer must whitelist them.
- **D-11:** Exactly **one current request per handle**. A new request supersedes the previous one (previous row retained as staff-only history, proof image purged). **Overwriting a still-pending request requires handle + the pending request's PIN**; after a rejection a fresh request needs only the handle. An approved member cannot request again (they log in).
- **D-12:** The **in-game character ID is the unique identity key** — normalized numeric, unique across members and open applications (DB-enforced). Duplicate IDs are refused with a clear "ID já cadastrado"; nickname/class/role may change freely.
- **D-13:** The prospect stats flow is **one sitting**; the chooser warns that it must be completed in one go (nothing is stored before final submit — same as today's member wizard).
- **D-14:** Staff review applicants in a **"Solicitações" section inside Validações**, rendered as a ranking-style board: **ID, job, nickname, OVR**, plus inline details (full stats/proof). The applicant OVR is **server-computed against the live class+role cohort** using the same key-stat math; applicant data never joins rank cohorts before approval.
- **D-15:** Screenshots are transient: they are **discarded once the OVR/decision is produced** (after review) to free server space; identity/stats text is retained as staff-only history.

### PIN reset & claim state
- **D-16:** "Redefinir PIN" **clears the claim** (`pin_hash` nulled) and clears that handle's lockout rows; the member re-claims through **Primeiro acesso** with a fresh identity screenshot vs their stored identity. No PIN is ever passed through Discord.
- **D-17:** Reset is **owner-only** and lives as a row action in **Personagens**, with a confirmation explaining that the player must re-claim. Outstanding 7-day JWTs **survive the reset** (stateless custom JWT; deactivation remains the immediate kill switch) — accepted and documented.
- **D-18:** Personagens shows a **server-derived PIN state per member** ("PIN pendente" / "PIN ativo") with a filter for unclaimed members; the hash is never exposed. The same roster carries the owner-only reset action.

### Character identity capture
- **D-19:** Every submission captures **in-game character ID, nickname, class (from the screenshot's job) and the pointed build role**, read from the basic screen by OCR with mandatory manual correction (same discipline as stat fields). ID is **numeric only**, trimmed, length-bounded and validated client + server.
- **D-20:** On validation, a changed class/job **auto-applies to the member registry** (`members.char_class`) and therefore to cards/cohorts. The **build role stays staff-only** — never auto-applied from a submission.
- **D-21:** Identity is **append-only per submission**. The latest validated identity supplies the card nickname. A staff correction is an **appended identity correction record** (no overwrite); the newest identity record wins for display. Stats remain immutable.
- **D-22:** Staff see a member's **identity history in the Personagens row expansion** (date, ID, nickname, class, role) together with the correction action. Members never see other members' identity history.
- **D-23:** The officers' **Ranking tab adopts the same pattern**: ID, job, nickname, OVR, and inline details (existing detail panel extended; server order preserved).

### Legacy placeholder conversion
- **D-24:** All legacy placeholder-PIN whitelist rows become **unclaimed** (next login routes to Primeiro acesso; their lockout rows are cleared). The **owner row is excluded** — its PIN is rotated out-of-band (`scripts/hash-pin.mjs` + `scripts/apply-seed.mjs`) so the only admin account is never locked out.

### OpenCode's Discretion
- PIN-box component implementation (focus management, paste handling, mobile numeric keyboards, accessibility labels, error copy) within D-02.
- Schema/RPC shape for applications, application stats, identity records, ID uniqueness, `add_member`, `setup-pin`, reset, and the staff review payloads — provided the DECISIONS above and the closed-payload/append-only discipline hold.
- Storage bucket name, path scheme, RLS policies and deletion mechanics for identity proofs (model on the live private `card-photos` bucket).
- Exact layout of the Validações blocks (Solicitações / Identidade / submissions queue), inline detail expansion, and the applicant OVR presentation.
- OCR grammar extension for ID/nickname/job on the basic capture (structural, never pixel fractions) and its calibration/harness coverage.
- How the "Novo membro" handle-only form is surfaced (Personagens vs a Validações action) and the exact reactivation copy.
- Lockout-clearing mechanics on reset/reactivation/claim, and the exact normalization bounds for numeric IDs.
- Smoke matrices and live-apply plan for migration 0014 (apply-seed.mjs path).

</decisions>

<specifics>
## Specific Ideas

- Owner verbatim (entry): "explicit primeiro acesso link - It asks discord, in game name, pin, confirm pin... we might have to change our whole authentication to a screen that is similar to a 2 factor authentication screen, but without de 2FA process, the user inserts 4 numbers, one in each box."
- Owner verbatim (identity proof at claim): "in fact, lets change it to an OCR instance, like the first sample that shows in game name and job. The print can then read the two informations and the image is seeded to a staff member that will verify the identity of the member."
- Owner verbatim (two loops): "the system must have two approval loops, one for members that are already in the guild ingame, they only need to submit their character identity, meaning only one screenshot is enough. The other is for members who want to join the guild. in this case they go through a full enviar stats flow, and their stats become available to an officer, who will reach them to recruit, and only then the prospect will become a member."
- Owner verbatim (ID authority + review pattern): "for the requesters, the ID is crucial - in case a potential recruit changes nickname and class, it can be still be identified by the system. The previous request is overwritten - the data of a submitter is visible in ranking like the ranking tab - ID, job, nickname, overall ... and then inline details. Since we are here, the ranking tab for the officers also must adopt the pattern of ID, job, nickname, overall, detalhes."
- Owner verbatim (retention): "Once the overall is calculated, the images can be discarded to free disk space in the server."
- Trust model: the whitelist is the trust boundary; a status/handle lookup is acceptable, but a pending request never grants any member data.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirement source
- `.planning/ROADMAP.md` § Phase 8 — goal, WHIT-01..10 + IDEN-01..03 success criteria and the cross-cutting deploy-order constraints
- `.planning/REQUIREMENTS.md` § Whitelist Lifecycle / § Character Identity Capture — authoritative requirement text (WHIT-01..10, IDEN-01..03)
- `.planning/PROJECT.md` — v1.1 goal, anti-gaming rationale, append-only and access-control constraints

### Project invariants
- `AGENTS.md` — submissions append-only; access control in RLS/SECURITY DEFINER RPCs; ranks in Postgres; PIN hashed + server-side rate limiting; members see aggregates only
- `.planning/STATE.md` — open pre-release gates (dummy purge, placeholder credential rotation, JWT key must never be revoked)

### Prior phase contexts (do not re-open)
- `.planning/phases/07.2-premium-showcase-game-grounding-inserted/07.2-CONTEXT.md` — card payload discipline (D-03), member photo/storage pattern, UI register
- `.planning/phases/07.1-visual-id-implementation/07.1-CONTEXT.md` — visual system, static-only neon, single accent

### Auth stack (ground truth to extend)
- `supabase/functions/verify-pin/index.ts` — login contract, uniform 401, dummy-hash timing equalization, JWT minting, lockout gate; the template for `setup-pin` and the null-`pin_hash` branch
- `supabase/functions/_shared/lockout.ts` + `supabase/migrations/0003_lockout_rpc.sql` — the ONLY rate-limit mechanism (`MAX_ATTEMPTS`/`LOCKOUT_MINUTES`, atomic `record_pin_failure`)
- `supabase/migrations/0001_schema.sql` — `members` (note `pin_hash not null` must become nullable), `submissions`/`submission_stats` append-only EAV, `pin_login_attempts`
- `supabase/migrations/0005_registry_catalog.sql` — column-level grants/revokes on `members`, staff RLS, `create_submission`, `char_class`/`char_function`
- `supabase/migrations/0011_officer_tools_promotion.sql` — `is_active_owner`, `set_member_active` (reactivation), `set_member_role`, `officer_queue`, staff-gate pattern
- `supabase/migrations/0013_card_relevant_rank.sql` — `my_card`/`get_promotion`/`role_rank` (where display_name/class are read today; identity sourcing must be reconciled), closed-payload discipline

### Client contracts & surfaces
- `src/lib/api.ts` — raw-fetch REST layer, closed payload interfaces, `MemberRow`, `updateCharacter`, officer/staff wrappers
- `src/features/auth/LoginPage.tsx` + `src/features/auth/session.ts` + `src/features/auth/RequireAuth.tsx` — login UI/error states, 4-digit validation, session shape
- `src/App.tsx` — Tab union, staff UX-only gating with content re-check, no router
- `src/features/admin/CharactersPage.tsx` — member register, staff action set, confirm flow (where PIN state/reset/identity history land)
- `src/features/admin/ValidacoesPage.tsx` + `src/features/admin/ConfirmDialog.tsx` — staff queue surface (where Solicitations/Identity blocks land)
- `src/features/rank/RankPage.tsx` + `src/features/rank/rankView.ts` — officers' ranking boards/detail (D-23 pattern)
- `src/features/submit/SubmitPage.tsx`, `src/features/submit/ReviewStep.tsx`, `src/features/submit/wizard.ts` — the 5-step wizard reused for prospects
- `src/features/submit/OcrCapture.tsx`, `src/features/submit/ocr/regions.ts`, `src/features/submit/ocr/structure.ts` — capture grammar (basic screen is currently pills → `combat_power` only; extend for ID/nickname/job)
- `src/features/dashboard/CardPhotoUpload.tsx` + `supabase/seeds/live/card-photos-storage.sql` — private-bucket + per-path RLS pattern to reuse for identity proofs
- `supabase/seeds/whitelist.sql` — the legacy placeholder rows to convert (owner excluded)
- `scripts/apply-seed.mjs` — sanctioned live-write path (no supabase CLI/Docker here); `scripts/hash-pin.mjs` — PIN hashing for owner rotation
- `scripts/smoke-lifecycle.mjs`, `scripts/smoke-officer.mjs`, `scripts/smoke-rls.mjs` — existing smoke patterns to extend for claim/request/reset probes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `verify-pin` Edge Function — copy its shape for `setup-pin` (validation, uniform errors, timing equalization, JWT mint, lockout) and add the null-hash branch BEFORE `bcrypt.compare`.
- `_shared/lockout.ts` + `record_pin_failure` — setup/reset/claim attempts reuse it verbatim (WHIT-04).
- `OcrCapture` + `CAPTURES`/`SCREENS` — the basic capture already targets the character screen; extend its grammar to read ID/nickname/job rather than adding a capture type.
- `card-photos` storage precedent — private bucket, path pinned to the JWT member claim, RLS on `storage.objects`; reuse the pattern for proof images with staff-only read.
- `CharactersPage` — already renders the member register with role-differentiated actions and `ConfirmDialog`; PIN state, reset, and identity history slot in.
- `ValidacoesPage` — already a staff queue with status transitions; add Solicitations/Identity blocks in the same page.
- `RankPage`/`role_rank` — role-primary boards with server order; add ID/job columns and inline details without client re-sorting.
- `SubmitPage` + `ReviewStep` — step 1 (Personagem) is the natural home for identity fields; the same wizard serves prospects.
- `scripts/hash-pin.mjs` + `apply-seed.mjs` — owner PIN rotation and the 0014 live apply.

### Established Patterns
- SECURITY DEFINER RPCs with internal `auth.jwt()->>'member_role'` + active-row gates; column grants make RPCs the only write path (`members` has no client INSERT).
- Closed-payload discipline: typed `api.ts` interfaces, verbatim rendering, no client rank math.
- Append-only + status marks only; no deletes of submissions.
- UX-only tab gating in `App.tsx` with content re-check; enforcement always server-side.
- No new npm dependencies; one migration per phase; `apply-seed.mjs` for live DDL/DML.
- Migration numbering: Phase 8 owns **0014** (Phase 7 = 0012, Phase 07.2 = 0013, Phase 9 = 0015).

### Integration Points
- Migration 0014: nullable `pin_hash`; identity columns/records; application + application_stats tables; ID uniqueness; proof-image storage; `add_member`, `setup-pin` support, reset/claim RPCs; staff review payloads.
- `verify-pin` patch: unclaimed branch returns the setup signal; inactive members must NEVER receive it (uniform 401, branch ordering is a smoke-probed must-have).
- `create_submission` / application submit path: identity fields alongside the 57 stats.
- Card/promotion nickname sourcing: `my_card` and `get_promotion` currently read `members.display_name` — must consume the latest validated identity/correction.
- `App.tsx` nav: staff additions only (no member-facing tab changes in this phase).
- **Gap to resolve in planning:** the roadmap assumes an existing `add_member` path, but no `add_member` RPC exists in 0001–0013 — Phase 8 must create it (handle + display name, role forced `member`, no PIN, dummy-sentinel rejection, reactivation branch).

</code_context>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **power-shift-significance** (`.planning/todos/pending/power-shift-significance.md`) — keyword-matched (score 0.6, generic "phase"/"owner" terms only); v2 delta-badge domain, out of Phase 8 scope.

- **Member self-service PIN change / forgot-PIN flow** — out of scope (REQUIREMENTS.md); owner reset + re-claim covers recovery.
- **Weak-PIN blocklist** — out of scope (REQUIREMENTS.md); the whitelist is the trust boundary.
- **Second rate-limit mechanism** — explicitly out of scope; the v1.0 lockout is reused.
- **Rejection reasons / notes to the requester** — not selected; status-only was chosen.
- **Save-and-resume drafts for the prospect application** — not selected; one sitting with a warning.
- **First-submission evergreen CTA / stale-data nudge** — Phase 10 (HOME-02).
- **Public visitor homepage + Destaques slider** — Phase 10 (owner decision 2026-10-20).
- **Discord DM / push notifications for request decisions** — not requested; officers reach prospects out-of-band via the Discord handle.

</deferred>

---

*Phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi*
*Context gathered: 2026-10-21*
