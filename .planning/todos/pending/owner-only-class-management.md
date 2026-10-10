---
id: owner-only-class-management
title: Restrict class creation to the owner handle only
source: 03-04 owner UAT (2026-10-10)
target_phase: 04+ (admin/registry hardening pass — planner to place)
status: pending
---

# Restrict adding new classes to the owner handle only

## Insight (owner directive, verbatim intent)

> "The personagens tab must not add new classes in the officer handle, only in
> the owner handle, since this is a structural change."

Adding a class to the registry is a **structural change** to the whole panel
(rank cohorts, key-stat config, stat cards are all per-class), not a routine
character-management action — so it must not be an officer capability.

## Context

- Discovered at the 03-04 owner browser checkpoint: while exploring the
  Personagens tab, the officer/owner accidentally created a non-existent class
  named **"Ahrya"** through the class-picker's add path (officers can insert
  into `classes` via the `staff_insert_classes` policy, migration 0005).
- The stray "Ahrya" row was deleted from the live DB as data hygiene
  (direct SQL via Management API — no dependents existed; see 03-04-SUMMARY).

## Work needed (future phase — do NOT resolve in current phase)

1. **Server-side (the real fix):** change enforcement so only
   `member_role = 'owner'` can insert into `classes` —
   `staff_insert_classes` policy (0005) must become owner-only, or a
   SECURITY DEFINER RPC with an internal owner check must replace it
   (0009 pattern). Officer JWTs must be refused server-side, not just
   UI-gated.
2. **UI side:** the Personagens tab's class add-path must render only for
   owners; officers see the existing class list read-only. Keep the
   content-level role re-check pattern (02-02 lesson).
3. Consider whether class deletion/renaming should also be owner-only
   (currently no client delete/update path exists — grants are insert+select
   only, which is correct).

## Acceptance

- Officer session attempts to insert a class → refused server-side (live probe).
- Owner session can still add classes.
- Personagens UI hides the add path from officers.
