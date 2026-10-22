# Phase 9 — Plan 09-03 SUMMARY (all 3 tasks)

## Task 1 — rankMath.ts re-baseline (DONE)
- `percentilePoints(ownValue, others, direction)` → value-proportional `round(own/best*99,2)` clamped [0,99]
- `ovrFromPoints` unchanged (51 + mean × 48/99, exactly 6, floor 51)
- 22 locked test vectors re-baselined — all pass

## Task 2 — smoke-rank.mjs re-baseline (DONE)
- `set_key_stat_v2` with `p_function: 'dps'` instead of old `set_key_stat`
- KEYU ordered-set tests: 7th selection succeeds (no key_stat_limit), deselect key promotes oldest relevant
- Old block-at-7 (`key_stat_limit`) test replaced
- Clean value-proportional fixtures: OVR a=75, b=91, c=99
- Added `last_validated_at` presence check
- `node --check` passes; build + full test suite green

## Task 3 — smoke-promotion.mjs re-baseline (DONE)
- Key-stat config via `set_key_stat_v2` RPC calls (officer token, p_function='dps') instead of direct `INSERT INTO class_key_stats`
- SPARE_CLASS left without keys → OVR null → section hidden (D-13)
- `node --check` passes; build + full test suite green

## All 548 tests pass, build green.

## Next
Plan 09-04 (Dashboard UI: remove percentilePhrase from presentation.ts + StatCard.tsx).
