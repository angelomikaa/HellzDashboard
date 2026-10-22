# Phase 9: Fine Ranks — Value-Proportional Scale & Role-Differentiated Key Stats - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 delivers two features in ONE migration (0017) with ONE tripod re-lock (rankMath.ts + smoke-rank.mjs + smoke-promotion.mjs):

- **Value-proportional scale (SCALE-01/02/03):** Per-stat points = `round(own / best × 99, 2)` where best = max (higher-is-better) or min (lower-is-better). Leader holds exactly 99; everyone below scales proportionally. OVR inherits with zero formula change (51 + mean × 48/99, floor 51). Tier bands D-01/D-02 recalibrated against seeded cohorts. Percentile phrase dropped from improvement screen.
- **Role-differentiated key stats (ROLE-01/02/03/04/06/07/08/10/11 + KEYU-01/02/03):** `class_key_stats` re-keyed to (class_name, char_function, stat_key) with backfill of each class's 6 stats into all 3 build roles. `set_key_stat` v2 replaces `set_key_stat` + `set_relevant_stat` with ONE ordered selection set (first 6 = keys, 7th+ = relevants; deselect promotes oldest relevant). OVR in `my_report`/`class_top5`/`get_promotion` reads the member's own (class, build-role) config; cohorts become class+build-role. Members with no configured combo get OVR = null.

**Not in this phase:** personalized Início tab / stale-data CTA (Phase 10), Destaques slider (Phase 10), whitelist/self-request (Phase 8 — complete), member self-service PIN change, weak-PIN blocklist, second rate-limit mechanism, catalog self-service, OCR confidence surfacing, PNG export, delta badges, submission history, officer guild-health dashboard, public visitor homepage.

</domain>

<decisions>
## Implementation Decisions

### Migration & numbering
- **D-01:** Phase 9 migration is **0017** (`0017_fine_ranks_role_key_stats.sql`). Migrations 0012–0016 are all consumed (0012=Phase 7, 0013=Phase 07.2, 0014=Phase 8, 0015=Phase 8 gap closure, 0016=Phase 08.1 step-up PIN). ROADMAP.md updated to 0017.
- **D-02:** One migration covers both features (scale swap + role re-keying), matching owner decision #8 (never rewrite the same three RPC bodies twice in one milestone).

### Value-proportional scale (SCALE-01/02/03)
- **D-03:** Formula per stat: `higher-is-better` → `round(own / nullif(max_v, 0) × 99, 2)`; `lower-is-better` → `round(own / nullif(min_v, 0) × 99, 2)` where min_v = most negative = best. Best value is the divisor in both cases.
- **D-04:** `stat_direction` column added to `stat_catalog` (CHECK `'higher' | 'lower'`, default `'higher'`). `fixed_ct_pct`, `global_cd_pct`, `variable_ct_pct` marked `'lower'` (the 3 known negative stats where lower = better).
- **D-05:** All points clamped to `[0, 99]` so OVR math never breaks from negative or >99 intermediate values.
- **D-06:** OVR formula unchanged: `51 + mean(exactly 6 key-stat points) × 48.0/99`, all-6-or-nothing, floor 51 preserved. Unrounded output; rounding is display concern.
- **D-07:** Tier bands D-01/D-02 (points: <35 bronze, <60 silver, <85 gold, else platinum; OVR: <65 bronze, <75 silver, <85 gold, else platinum) recalibrated by owner against resident seeded dummy cohorts, then **locked**. Dummy purge (SEED-02) happens after lock as pre-release gate. Re-calibration on real data is post-release (v1.2).
- **D-08:** Percentile phrase ("entre os X% piores/melhores") removed from improvement screen. No replacement text. Stat card shows: value + class_average + best + points (raw 0-99) + tier badge.

### Role-differentiated key stats (ROLE-01/02/03/04/06/07/08/10/11 + KEYU-01/02/03)
- **D-09:** `class_key_stats` PK rebuilt to `(class_name, char_function, stat_key)`. `selection_order` integer column added (preserves original 1-6 order from backfill). `selected_at` timestamptz added for deterministic ordering.
- **D-10:** Backfill (ROLE-04): every existing class's 6 key stats copied into all 3 build roles (dps, mdps, suporte) at migration time — 18 rows/class, same selection_order 1-6 for each copy. Runs regardless of member role distribution; staff differentiates later (ROLE-10).
- **D-11:** `set_key_stat` v2 single RPC replaces BOTH `set_key_stat` and `set_relevant_stat`. Old signatures dropped in same migration. Signature: `set_key_stat_v2(p_class text, p_function text, p_stat_key text, p_enabled boolean) returns int`.
- **D-12:** `p_enabled=true`: appends stat to end of ordered set (highest selection_order). Items at positions 7+ are relevants automatically; no block at 7 (unlimited relevants).
- **D-13:** `p_enabled=false`: removes stat from ordered set. If it was a key (order ≤ 6), the oldest relevant (lowest order > 6) is promoted into the vacated slot; remaining rows shift down. Key set stays at 6 whenever ≥6 stats are selected.
- **D-14:** Advisory lock key scopes to (class, function): `pg_advisory_xact_lock(hashtext('cks:' || p_class || ':' || p_function))`.
- **D-15:** OVR in all three RPCs reads member's own (class, build-role) config. Per-stat cohorts become class+build-role. Member with no configured combo (char_function null or role not yet assigned) gets OVR = null via existing data-insufficient rendering — never a silent class-defaults fallback (ROLE-06).
- **D-16:** OVR parity on deploy day (ROLE-04): numeric parity where the role cohort equals the old class cohort (all members of a class share one role); null where member has no role or role cohort n<3. Changed OVR accepted for classes split across roles. ROLE-10 staff audit pass re-assigns build roles before per-role differentiation matters.
- **D-17:** Build-role assignment stays staff-only (Personagens path). Officers see per-(class, role) config coverage indicator on Stats-Chave (staff-only, never member-visible) (ROLE-08/11).
- **D-18:** `class_top5` uses per-(class, function) cohort. `get_promotion` stays class-wide across roles (OVR is cross-role comparable currency). RNK-02 closed-payload discipline holds: key-stat config (weights/toggles/management data) never serialised to members.
- **D-19:** `my_report` gains only `last_validated_at` = `max(submitted_at) filter (status='validated')` over caller's own submissions (HOME-03). Zero new per-stat fields, zero key-stat hints. Closed-payload discipline holds.

### Error vocabulary
- `set_key_stat v2` errors: `forbidden`, `unknown_class`, `unknown_function` (invalid build-role). `key_stat_limit` (block-at-7) is removed — replaced by KEYU ordered set (no cap on relevants).
- `set_relevant_stat` eliminated; its errors (`already_key`, `key_set_incomplete`) no longer apply.

</decisions>

<specifics>
## Specific Ideas

- Owner verbatim (scale): "top-end cuts at 98/97/96/95 based on value distance to the best" — proportional gaps emerge naturally from own/best × 99.
- Owner verbatim (negative stats): "Fixed CT %, Global CD %, Variable CT % are negative in real submissions (lower-is-better); the scale formula must invert these."
- Owner verbatim (KEYU): "first 6 selected stats are the keys, the 7th and beyond are relevants"; "deselecting a key promotes the oldest still-selected relevant into the key set."
- Owner verbatim (OVR parity): "zero OVR change or null on deploy day" — interpreted as numeric parity where cohort unchanged, null where no role/n<3.
- Owner verbatim (percentile): percentile phrase dropped; points are no longer percentile positions.
- Trust model: key-stat config hidden from members; rank math in Postgres SECURITY DEFINER RPCs; append-only submissions; whitelist is trust boundary.

</specifics>

<canonical_refs>
## Canonical References

### Requirement source
- `.planning/ROADMAP.md` § Phase 9 — goal, SCALE-01/02/03 + ROLE-01/02/03/04/06/07/08/10/11 + KEYU-01/02/03 + HOME-03 success criteria; migration 0017; ONE tripod re-lock
- `.planning/REQUIREMENTS.md` § Fine Ranks / § Role-Differentiated Key Stats / § Unified Key/Relevant Selection — authoritative requirement text
- `.planning/PROJECT.md` — v1.1 goal, anti-gaming rationale, append-only and access-control constraints; Key Decisions table (AGENTS.md non-negotiables)

### Project invariants
- `AGENTS.md` — submissions append-only; access control in RLS/SECURITY DEFINER RPCs; ranks in Postgres; PIN hashed + server-side rate limiting; members see aggregates only
- `.planning/STATE.md` — open pre-release gates (dummy purge SEED-02, JWT key 6f7657c3 must never be revoked, placeholder credential rotation)

### Prior phase contexts (do not re-open)
- `.planning/phases/07-dummy-data-seed-catalog-alignment/` — dummy seed roster, build-role vocabulary, catalog alignment
- `.planning/phases/07.2-premium-showcase-game-grounding-inserted/` — card payload discipline (D-03), my_card/get_promotion closed payloads, label_short, relevant tier
- `.planning/phases/08-whitelist-lifecycle-self-request-whitelisting-first-login-pi/` — add_member, setup-pin, identity capture, staff surfaces

### Rank engine ground truth (to be rewritten in 0017)
- `supabase/migrations/0009_rank_engine.sql` — set_key_stat, my_report, class_top5 (current byte-faithful bodies; 0017 copies them with formula swap + role re-keying)
- `supabase/migrations/0013_card_relevant_rank.sql` — my_card, role_rank, get_promotion, set_relevant_stat supersession (0017 folds set_relevant_stat into set_key_stat v2)
- `src/lib/rankMath.ts` — executable spec; percentilePoints + ovrFromPoints; test values to be re-baselined for value-proportional formula
- `scripts/smoke-rank.mjs` — exact-value rank smoke matrix to be re-baselined
- `scripts/smoke-promotion.mjs` — promotion ordering smoke to be re-baselined (fixtures carry build roles + per-combo 6-row key-stat inserts)

### Client contracts & surfaces
- `src/lib/api.ts` — `fetchKeyStats`, `setKeyStat`, `fetchMyReport`, `fetchClassTop5`, `fetchPromotion`, `fetchRoleRank`, `setRelevantStat`, `fetchKeyRelevantStats`; all wrapper signatures to be updated for set_key_stat v2
- `src/lib/presentation.ts` — tierForPoints (D-01), tierForOvr (D-02); band edges to be recalibrated and locked
- `src/features/admin/` — Stats-Chave page gains role selector (class → role → stat chips, per-combo count, block-at-7 copy removed)
- `src/features/dashboard/` — improvement screen drops percentile phrase; points shown as raw number + tier badge
- `src/App.tsx` — Tab union unchanged; no new tabs in Phase 9 (Início is Phase 10)
- `scripts/apply-seed.mjs` — sanctioned live-write path for 0017 migration + backfill DML
- `scripts/smoke-rank.mjs` + `scripts/smoke-promotion.mjs` — re-baselined in same phase as migration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `0009_rank_engine.sql` set_key_stat body — copy byte-faithful into 0017, add p_function param, advisory lock key with function, replace block-at-7 with ordered-set logic
- `0009_rank_engine.sql` my_report body — copy byte-faithful, swap points formula to own/best × 99 with stat_direction, add last_validated_at to output
- `0009_rank_engine.sql` class_top5 body — copy byte-faithful, scope key_stats join to (class, function) cohort
- `0013_card_relevant_rank.sql` get_promotion body — copy byte-faithful, scope key_stats to (class, function), keep class-wide OVR
- `0013_card_relevant_rank.sql` set_relevant_stat body — eliminated; its D-05 gating replaced by KEYU ordered set
- `_shared/lockout.ts` + `record_pin_failure` — unchanged (not touched by Phase 9)
- `src/lib/groups.ts` FUNCTION_LABELS — single source for dps/mdps/suporte vocabulary; reused in Stats-Chave role selector
- `src/lib/rankMath.ts` percentilePoints — spec target for re-baseline (average-rank ties preserved; only the best-value divisor changes to stat_direction-aware)

### Established Patterns
- SECURITY DEFINER RPCs with internal `auth.jwt()->>'member_role'` + active-row gate; execute hygiene (revoke from public/anon, grant to authenticated)
- Full byte-faithful `create or replace` copies for superseded functions (0011/0013 precedent — copy, don't paraphrase)
- Advisory-lock race-proof pattern (hashtext key) from 0009 CR-01
- Closed-payload discipline: typed api.ts interfaces, verbatim rendering, no client rank math
- Append-only + status marks only; no deletes of submissions
- One migration per phase; `apply-seed.mjs` for live DDL/DML; no supabase CLI/Docker in this environment

### Integration Points
- Migration 0017: `stat_direction` column on stat_catalog; `class_key_stats` PK rebuild + `selection_order`/`selected_at` columns; backfill DML; set_key_stat v2 + my_report + class_top5 + get_promotion rewrites; `last_validated_at` scalar on my_report; drop set_relevant_stat + class_relevant_stats (or keep table unused — decision: keep table for backward compat but stop writing via RPC)
- `setKeyStat` api.ts wrapper: add p_function param; update call sites (Stats-Chave admin page)
- `fetchKeyStats` / `fetchKeyRelevantStats`: may be merged into a single ordered-read RPC; member-facing `my_report` payload unchanged shape (+ last_validated_at only)
- Stats-Chave UI: role selector (class → role → stat chips), per-combo count display; block-at-7 copy replaced by KEYU semantics
- rankMath.test.ts: locked test values re-baselined for value-proportional formula (74.25/49.5 → new exact values)
- smoke-rank.mjs + smoke-promotion.mjs: expected values re-baselined; fixtures carry build roles and per-(class, function) 6-row key-stat inserts

### Gap to resolve in planning
- `class_relevant_stats` table: keep (unused by RPCs) or drop? Keeping is safer for rollback; dropping is cleaner. Decide in plan.
- `setKeyStat` client wrapper: all call sites updated to pass p_function; Stats-Chave is the only admin caller.
- Backfill DML must run in 0017 itself (not a separate seed) so OVR parity is established on deploy day.

</code_context>

<deferred>
## Deferred Ideas

- **power-shift-significance** (DELT-01) — v2 delta-badge domain; combat_power shifts flagged at thousands scale only. Out of Phase 9.
- **submission history / progression view** (HIST-01) — OVR and key stats over time. v2.
- **officer guild-health dashboard** (OFCR-01) — participation %, non-submitters, OCR failure rate. v2.
- **catalog self-service additions** (CAT-01) — admin adds stats to catalog. v2.
- **OCR confidence surfacing** (OCRX-01) — auto-flag low-confidence fields. v2.
- **shareable card PNG export** (SHAR-01) — already in 07.2 as JPEG export; PNG variant deferred.
- **member self-service PIN change / forgot-PIN** — out of scope; owner reset (WHIT-06) + re-claim covers recovery.
- **weak-PIN blocklist** — out of scope; whitelist is trust boundary.
- **second rate-limit mechanism** — out of scope; v1.0 lockout reused.
- **public visitor homepage** — explicitly deferred (owner decision 2026-10-20).
- **Re-calibrating tier bands on real data** — post-release (v1.2); Phase 9 locks bands from dummy calibration.

</deferred>

---

*Phase: 09-fine-ranks-value-proportional-scale-role-key-stats*
*Context gathered: 2026-10-22*