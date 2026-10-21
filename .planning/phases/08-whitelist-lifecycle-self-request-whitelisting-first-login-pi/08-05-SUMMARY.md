---
phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi
plan: 05
subsystem: ui
tags: [react, staff-admin, identity, membership-requests, pin-lifecycle, supabase-rpc]
requires:
  - phase: 08-01
    provides: migration 0014 (staff_members, staff_identity_queue, staff_requests, staff_identity_history, add_member, reset_member_pin, review_identity, approve_request, reject_request, correct_identity, get_promotion identity patches)
  - phase: 08-02
    provides: deployed Edge functions (verify-pin 409, setup-pin, request-access) + identity-proofs bucket
  - phase: 08-03
    provides: unauthenticated client surface (FirstAccessPage, RequestAccessPage, PinBoxes, ProofField, typed Edge wrappers)
  - phase: 08-04
    provides: identity capture on submissions + session-less ProspectApplicationPage
provides:
  - Typed staff API census (StaffMember, IdentityQueueRow, IdentityHistoryRow, StaffRequestRow, staff identity-proof storage helpers)
  - Personagens lifecycle: add handle, PIN state badges/filter, owner-only PIN reset, identity correction with history
  - Validações tabs (Envios | Solicitações | Identidades) with ranking-style request review and identity proof review
  - Rank/officer queue identity display (char_id under display_name)
affects: [08-06, phase-9, phase-10]
tech-stack:
  added: []
  patterns: [rpc-only-staff-gating, best-effort-proof-purge, segmented-tab-review-panels]
key-files:
  created:
    - src/features/admin/IdentityReview.tsx
    - src/features/admin/RequestReview.tsx
  modified:
    - src/lib/api.ts
    - src/lib/api.test.ts
    - src/features/admin/CharactersPage.tsx
    - src/features/admin/CharactersPage.test.tsx
    - src/features/admin/ValidacoesPage.tsx
    - src/features/admin/ValidacoesPage.test.tsx
    - src/features/rank/RankPage.tsx
    - src/features/rank/RankPage.test.tsx
    - src/features/rank/rankView.test.ts
key-decisions:
  - "PIN state is a boolean (pin_set) from the server census; UI never touches pin_hash"
  - "Owner-only reset PIN gated in UI and re-checked by reset_member_pin RPC (owner + active)"
  - "Proof purge is best-effort client-side after the decision RPC already nulled proof_path"
  - "Request approval requires an officer-chosen function (dps/mdps/suporte) — the only role-assignment point for self-requesters"
  - "Rank rows render char_id verbatim from the server payload; no client-side recompute"
requirements-completed: [WHIT-02, WHIT-03, WHIT-04, WHIT-05, WHIT-06, WHIT-07, IDEN-02, IDEN-03]
# Metrics
duration: ~40min
completed: 2026-10-21
---

# Phase 8: Whitelist Lifecycle — Summary (Plan 05)

**Staff operating surface for the Phase 8 lifecycle: handle-only members, PIN state, reset, identity proof review, membership request adjudication with server-computed OVR, and identity display in rank/queue.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 4 (task 1 API census, task 2 Personagens, task 3 Validações reviews, task 4 rank identity)
- **Files modified:** 10 (2 created)
- **Tests:** 520 passing (34 files), build green, lint 0 errors

## Accomplishments

- Typed staff API layer on migration 0014: StaffMember, IdentityQueueRow, IdentityHistoryRow, StaffRequestRow, plus identity-proof storage helpers (fetchIdentityProof/deleteIdentityProof with path safety and 404-as-success)
- OfficerQueueRow and RoleRankRow extended with nullable identity fields (char_id, nickname, char_class)
- Personagens: add handle-only member, PIN pendente/ativo badges, segmented PIN filter, owner-only Redefinir PIN with double confirmation, inline identity correction with append-only history
- Validações: Envios | Solicitações | Identidades tabs; ranking-style request rows (OVR block, ID/nick, class/function, type badge, date) with details/proof expansion; approve requires function selection; reject confirms; both purge the proof; identity confirm/reject with access-loss copy
- RankPage renders char_id under display_name; officer queue renders identity line only when present; server order preserved verbatim

## Task Commits

1. **task 1: API census** - `f7cd224` (feat)
2. **task 2: Personagens lifecycle** - `101e47e` (feat)
3. **task 3: staff reviews** - `e1e76f5` (feat)
4. **task 4: rank identity** - `ff50d27` (feat)

## Files Created/Modified

- `src/lib/api.ts` - staff types + wrappers + identity-proof storage helpers; OfficerQueueRow/RoleRankRow identity fields
- `src/lib/api.test.ts` - coverage for the new wrappers/storage helpers
- `src/features/admin/CharactersPage.tsx` - handle lifecycle, PIN state, reset, identity correction
- `src/features/admin/CharactersPage.test.tsx` - lifecycle tests
- `src/features/admin/ValidacoesPage.tsx` - three tabs + Envios identity line
- `src/features/admin/ValidacoesPage.test.tsx` - tab/review tests
- `src/features/admin/IdentityReview.tsx` - pending proof review panel
- `src/features/admin/RequestReview.tsx` - membership request review panel
- `src/features/rank/RankPage.tsx` - char_id under display_name
- `src/features/rank/RankPage.test.tsx` - identity render tests
- `src/features/rank/rankView.test.ts` - char_id default in test fixture

## Decisions Made

- PIN state flows only as `pin_set` boolean; no hash ever selected or rendered (T-08-31/T-08-32)
- Reset PIN is owner-only in UI and re-checked server-side; member re-claims via Primeiro acesso
- Proof purge is best-effort client-side after the decision RPC (D-15)
- Request approval requires an officer-chosen function — the only role-assignment point for self-requesters (D-09)
- Rank identity is verbatim server data; no client-side rank/OVR recomputation

## Deviations from Plan

None — plan executed as specified (task 1 split into its own commit before resuming after an interrupted run).

## Issues Encountered

- The interrupted 08-05 run left task 1 uncommitted; resumed by committing f7cd224 then spawning tasks 2–4 sequentially.
- rankView.test.ts fixture needed `char_id: null` default after RoleRankRow gained the required field (adaptation, not a test weakening).

## Next Phase Readiness

- All Phase 8 client surfaces are in place; 08-06 remains (legacy claim conversion + end-to-end live verification + phase truth).
- Staff can run the full lifecycle from the panel; identity visible in review and rank surfaces.

---
*Phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi*
*Completed: 2026-10-21*
