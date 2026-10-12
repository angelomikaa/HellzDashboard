---
phase: 06-trust-celebration-officer-tools-promotion-page
plan: 03
subsystem: frontend-data-layer
tags: [api, rpc-wrappers, typescript, contract-first, officer-tools, promotion]

# Dependency graph
requires:
  - phase: 06-01
    provides: migration 0011 RPCs live (officer_queue, set_submission_status, set_member_role, set_member_active, get_promotion) with locked payload shapes
provides:
  - fetchOfficerQueue/setSubmissionStatus/setMemberRole/setMemberActive/fetchPromotion typed RPC wrappers in src/lib/api.ts
  - QueueStat/OfficerQueueRow/PromotionHighlight/PromotionCardRow/PromotionSection types pinning the exact server shapes
  - MemberRow.active projected in fetchMe/fetchMembers for owner Remover/Reativar controls
affects: [06-04 officer queue UI, 06-05 member management UI, 06-06 promotion page UI, phase verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-arg {} POST + ?? [] guard for list-returning RPCs (officer_queue/get_promotion, fetchMyReport shape)"
    - "Closed-list TS interface as the review-time leak gate: a server-side field addition to PromotionHighlight is a type error (T-06-10)"
    - "Void wrappers with no parseBody for null-returning RPCs (setMemberRole/setMemberActive, updateCharacter shape)"

key-files:
  created: []
  modified:
    - src/lib/api.ts

key-decisions:
  - "Additive-only change: no existing wrapper touched except the two member projections (explicit extension, never select=*) — 0005 column-grant backstop untouched"
  - "PromotionHighlight typed CLOSED (stat_key/label/value_type/value/points only) per RNK-02/T-06-10 — the client cannot render a key-stat identity field without an intentional contract change"
  - "Comment discipline kept: every wrapper states its gate + exception tokens (staff-only vs member-invocable, not_pending two-officer race, D-08 target matrix, D-13 omitted classes)"

requirements-completed: [] # AUTH-03/04/05 + SHWC-02 complete via traceability at phase verification (UI surfaces 06-04/05/06 finish the walks)

# Metrics
duration: 4min
completed: 2026-10-12
---

# Phase 6 Plan 03: Contract-First Data Layer Summary

**All five Phase 6 server surfaces (0011) wrapped as typed RPC clients in src/lib/api.ts with closed-list promotion/queue types and the MemberRow.active projection — the contract layer for 06-04/05/06 is complete in one file, typecheck + 284/284 tests green.**

## Performance

- **Duration:** 4min
- **Started:** 2026-10-12T22:53:56Z
- **Completed:** 2026-10-12T22:57:28Z
- **Tasks:** 1/1
- **Files modified:** 1 (src/lib/api.ts, +113/−2)

## Accomplishments

- 5 exported RPC wrappers: fetchOfficerQueue (staff-only queue read, `?? []` guard), setSubmissionStatus (returns affected count; not_pending/invalid_status documented), setMemberRole (owner-only, no 'owner' value ever sent), setMemberActive (role-differentiated target rules documented), fetchPromotion (member-invocable CMP-03 exception, D-13 omitted classes documented)
- 5 exported payload types: QueueStat + OfficerQueueRow (57-stat queue rows), PromotionHighlight + PromotionCardRow + PromotionSection (closed-list highlights, top-6-by-points, top-5-by-OVR cards)
- MemberRow gains `active: boolean`; both explicit projections extended to `id,discord_handle,display_name,role,active,char_class,char_function`; comment block above fetchMe/fetchMembers notes the Phase 6 addition
- All wrappers are additive — restFetch/parseBody/setKeyStat/fetchMyReport patterns reused verbatim, zero new imports

## Task Commits

Each task was committed atomically:

1. **task 1: Add Phase 6 RPC wrappers + types + MemberRow.active to api.ts** - `6202f91` (feat)

**Plan metadata:** *(this commit)* (docs: complete plan)

## Files Created/Modified

- `src/lib/api.ts` (modified) — 5 wrappers + 5 interfaces appended, MemberRow + both projections extended, comment discipline preserved (every wrapper states its gate + exception tokens)

## Verification

- `npx tsc -b` — exit 0
- `npm test` — 17 files / 284 tests, all green (no existing test broken)
- Grep gates: 5 wrappers, 5 interfaces, 2 projections with `active`, 0 `select=*`, `active: boolean` in MemberRow

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — every wrapper is fully implemented against the live 0011 contracts; no placeholder/TODO patterns.

## Threat Flags

None — no new trust surface introduced; wrappers render payloads verbatim (mitigate-by-consumption per the plan's threat register), projections stay explicit, PromotionHighlight is closed-list (T-06-10 mitigated by typing).

## Self-Check: PASSED

- `src/lib/api.ts` modified on disk with all 5 wrappers + 5 interfaces — FOUND
- Commit `6202f91` present in git log — FOUND
- tsc -b green, 284/284 tests green — VERIFIED
