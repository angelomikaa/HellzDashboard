---
status: diagnosed
trigger: "Diagnose ONE UAT gap (Test 4, phase 08-UAT): Enviar Status step-1 title must show member's CURRENT identity (nickname, class, function) not stale registry row. find_root_cause_only."
created: 2026-10-22T01:30:00Z
updated: 2026-10-22T02:05:00Z
---

## Current Focus

hypothesis: CONFIRMED — SubmitPage's step-1 title renders `me` from fetchMe(), the raw `members` registry self-read (PostgREST + member_select_own RLS), which migration 0014 deliberately left identity-unpatched (scope guard: only role_rank/get_promotion/officer_queue/staff payloads got the D-21 identity coalesce). The promoted identity lives in member_identity_history and never reaches this surface.
test: Traced SubmitPage.tsx:571-573 → api.ts fetchMe:142-152 → migration 0014 §1/§2/§5/§8 + verify-pin/_shared session minting; cross-checked live DB state from the UAT note.
expecting: n/a — investigation complete (find_root_cause_only).
next_action: None — root cause returned to caller for gap-closure planning.

## Symptoms

expected: The Enviar Status title (step 1 heading) must show the member's CURRENT IDENTITY — nickname, class and function (e.g. "Ahrya — High Priest (Suporte)") — not the stale registry row.
actual: "logged as owner, the title should be 'Ahrya - High Priest (Support)' but the currently 'Officer Nickname — Gypsy (Suporte)'". Live DB note: owner-handle.display_name has since become 'Ahrya' (identity promotion) but char_id is null and members.char_class still 'Gypsy' — so parts of the identity do not reach this surface.
errors: None reported.
reproduction: Test 4 in .planning/phases/08-whitelist-lifecycle-self-request-whitelisting-first-login-pi/08-UAT.md
started: Observed during phase 08 UAT (2026-10-21/22); identity promotion feature introduced in phase 08 / migration 0014.

## Eliminated

- hypothesis: The title renders the login-session display_name (JWT/session staleness at the SubmitPage surface).
  evidence: SubmitPage.tsx:247 loads `me` via `fetchMe(session)` and line 572 renders `${me.display_name} — ${me.char_class} (...)` from that row, not from `session.display_name`. The session snapshot staleness affects App.tsx:81 and the dashboard card name, but NOT this title.
  timestamp: 2026-10-22T01:45:00Z

- hypothesis: Client rendering bug (wrong fields interpolated / data shape mismatch).
  evidence: The template renders exactly the fields fetchMe returns; the rendered values match the live members registry row byte-for-byte ('Officer Nickname', 'Gypsy', 'suporte' at UAT time). The render is faithful — the source row is stale.
  timestamp: 2026-10-22T01:45:00Z

- hypothesis: The registry row was supposed to be updated by identity promotion and a write-path bug prevented it (display fix = fix the members-row write).
  evidence: set_submission_status v2 (0014:1302-1306) DOES write members.char_id/display_name/char_class on validation-with-identity, yet 0014's own D-21 contract (identity_display_name, 0014:159-174) makes member_identity_history win OVER the row — the patched rank payloads coalesce history-first precisely because the row is not the display truth (pending-but-unvalidated submissions never touch the row; the owner-handle row was demonstrably never promoted: char_id null, char_class 'Gypsy' while the identity is 'Ahrya'/'High Priest'). Relying on the row is architecturally wrong for display even where the write path works.
  timestamp: 2026-10-22T01:55:00Z

## Evidence

- timestamp: 2026-10-22T01:35:00Z
  checked: src/features/submit/SubmitPage.tsx (step 1 render + identity prefill)
  found: Line 571-573: `<h2>{`${me.display_name} — ${me.char_class} (${FUNCTION_LABELS[me.char_function]})`}</h2>` where `me: MemberRow` comes from `fetchMe(session)` (line 247). Lines 252-262 prefill the mandatory identity form's char_class/char_function from the SAME `me` row — the stale class ('Gypsy') is seeded into every new submission's identity as well.
  implication: The title's identity fields and the identity-form prefill share one stale source: the raw members registry self-read.

- timestamp: 2026-10-22T01:38:00Z
  checked: src/lib/api.ts — fetchMe (line 142-152) and the 0014-patched payload types
  found: fetchMe = `GET /rest/v1/members?select=id,discord_handle,display_name,role,active,char_class,char_function&limit=1` — a plain PostgREST read of the caller's own row under the member_select_own RLS policy. NO identity join, no RPC. Meanwhile OfficerQueueRow (309-322), RoleRankRow (464-474) and StaffMember (940-946) all document 0014 identity patches ("display_name is the newest identity nickname and char_id the newest identity ID (D-21/D-23)").
  implication: The member self-read is the one member-facing read that 0014 did not touch.

- timestamp: 2026-10-22T01:42:00Z
  checked: supabase/migrations/0014_whitelist_requests_identity.sql — scope guard, helpers, read patches
  found: (a) Lines 21-24 SCOPE GUARD: "my_report() and class_top5() are deliberately NOT rewritten — Phase 9 owns the rank-RPC rewrite. Only the display-name sourcing of role_rank/get_promotion/officer_queue is touched". (b) §1 lines 33-35: members.char_id/claimed_at stay RPC-only — 0005 column grants unchanged, "no client credential can read or write them directly". (c) §2 line 87: member_identity_history is RLS-enabled with NO policies (RPC-only). (d) §5: identity_display_name/identity_char_id helpers coalesce newest-history-first with members-row fallback; EXECUTE revoked from public/anon/authenticated (1736-1737) — usable only inside SECURITY DEFINER bodies. (e) §8.2 role_rank role_members CTE (1430-1432) and §8.3 get_promotion class_members (1587-1588) select identity_display_name(m.id); §8.1 officer_queue uses the submission's captured identity; §6.5 staff_members embeds the newest identity row.
  implication: 0014's design made member_identity_history the display source of truth (D-21) and patched every surface that renders OTHER members — the member's OWN identity surface (fetchMe, consumed by SubmitPage) was left on the denormalized registry row, and is unpatchable client-side without new grants (identity table is RPC-only).

- timestamp: 2026-10-22T01:46:00Z
  checked: Live DB state per UAT note + members-row write paths (0014)
  found: owner-handle members row: display_name='Ahrya', char_id=NULL, char_class='Gypsy'. No UPDATE-members path produces this combination via identity promotion — set_submission_status (1302-1306), correct_identity (1101-1106), claim_pin (418-425) and approve_request (917-936) all write char_id and char_class together with display_name; only display-name-only writes (staff PATCH updateCharacter — 0005 grants update on display_name/char_class/char_function and char_id is ungrantable — or add_member reactivation 305-308) match. The current identity ('Ahrya', 'High Priest') lives in member_identity_history / the submission identity, NOT on the owner's registry row.
  implication: Even post-promotion, a title sourced from the registry row cannot show the current identity — the row is a partial, stale projection by design.

- timestamp: 2026-10-22T01:50:00Z
  checked: supabase/functions/verify-pin/index.ts + supabase/functions/_shared/session.ts (login display_name minting)
  found: verify-pin selects the raw row `id, display_name, role, pin_hash, active` (lines 102-106) and mintSession puts ONLY role/member_id/member_role in the JWT (lines 80-90); display_name is returned in the session BODY (line 95) and persisted client-side (localStorage, src/features/auth/session.ts) — a login-time snapshot of the raw registry column, stale until re-login. The JWT itself carries no display_name, so no server contract depends on it.
  implication: The App header "Olá, {session.display_name}" (App.tsx:81) and the Painel own-card name (DashboardPage.tsx:154/181/260, CardPhotoUpload.tsx:238) are related-but-distinct stale consumers (login snapshot), separate from this gap's fetchMe-sourced title.

- timestamp: 2026-10-22T01:52:00Z
  checked: Full consumer map of stale display_name/char_class (grep across src/)
  found: Stale-identity consumers: (1) SubmitPage title :572 + identity prefill :252-262 (fetchMe — raw row); (2) App header :81 (session snapshot); (3) Painel own-card name (DashboardPage/CardPhotoUpload — session snapshot) — the exact surface the owner's re-plan decision (a) meant to fix, but 0014 only patched get_promotion (Destaques showcase) + staff views; (4) Painel own-card job name via my_card.char_class — my_card (0013:302) reads m.char_class raw, explicitly deferred to Phase 9 by 0014's scope guard. NOT stale: Ranking/RankPage, Validações, Destaques, Personagens, Solicitações — all consume the 0014-patched payloads (role_rank, officer_queue, get_promotion, staff_members, staff_identity_queue, staff_identity_history); CharactersPage even co-displays member.identity?.nickname vs display_name (line 765).
  implication: The member-facing own-identity surfaces (title, header, own card) form the unpatched remainder; staff-facing surfaces are current.

- timestamp: 2026-10-22T01:58:00Z
  checked: Migration inventory (supabase/migrations/)
  found: 0014 is the latest migration — no later patch already fixed the self-read.
  implication: The gap is open on live; fix requires a new migration (or Phase 9 rank rewrite, too coarse for this gap).

## Resolution

root_cause: The Enviar Status step-1 title renders identity from `fetchMe()` — the raw `members` registry self-read (`GET /rest/v1/members` under the `member_select_own` RLS policy, projection id/discord_handle/display_name/role/active/char_class/char_function). Phase 08's identity system (migration 0014) made `member_identity_history` the source of truth for display identity (D-21) and added identity coalescing to every payload that renders OTHER members — officer_queue (§8.1), role_rank (§8.2), get_promotion (§8.3), staff_members (§6.5) — but deliberately left the member self-read untouched (scope guard, 0014:21-24). The denormalized members row is a partial, stale projection of identity: for the owner it still carries the legacy seed ('Officer Nickname', char_class 'Gypsy', char_id null), while the current identity ('Ahrya', 'High Priest') lives only in member_identity_history. Therefore the title shows the stale registry row, and the same stale `me.char_class` also seeds the mandatory identity form prefill on every new submission. The self-read cannot be fixed client-side: member_identity_history is RLS-with-no-policies (RPC-only) and members.char_id is not in the client column grants.
fix: NOT APPLIED (find_root_cause_only). Direction for the gap-closure plan: a new member-invocable SECURITY DEFINER self-identity RPC (0015-pattern, house style) returning the caller's current identity with the D-21 coalesce — identity_display_name(member_id), identity_char_id(member_id), newest-history char_class with members.char_class fallback, and function per D-20 semantics (registry pointer, staff-managed) — consumed by SubmitPage for both the title and the identity-form class prefill; fallback for members with no identity history = the legacy registry row (identical to today's behavior, no regression). Do NOT fix by tightening the members-row promotion writes: 0014's own contract is history-wins-over-row (identity_display_name coalesces history FIRST), and pending submissions don't touch the row at all.
verification: Root cause triangulated from three independent sources: (1) client code path SubmitPage:572 → api.ts fetchMe:142-152 (raw PostgREST members read, no identity join); (2) migration 0014 scope guard + patched-vs-unpatched payload census; (3) live DB state (owner row: display_name 'Ahrya' / char_id null / char_class 'Gypsy' — the identity demonstrably absent from the row the title reads). Not fixed/verified at runtime per find_root_cause_only.
files_changed: []
