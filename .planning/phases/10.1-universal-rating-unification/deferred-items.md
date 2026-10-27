# Phase 10.1 Deferred Items

Out-of-scope discoveries logged during 10.1-02 execution (not fixed — pre-existing,
unrelated to migration 0036; reads/parity unaffected).

| # | Item | Evidence | Suggested disposition |
|---|------|----------|----------------------|
| 1 | **`set_key_stat_v2` deselect-key path can leave duplicate `selection_order` values** (0018 body, live since 2026-10-22): after promoting the oldest relevant into the vacated slot (`v_old_order`), the shift-down update (`selection_order > v_old_order`) moves the next key into the same order — e.g. keys at 1..6 + relevant at 7, deselect the order-1 key → promote relevant→1, shift 2..6→1..5 → two rows at order 1. | Traced against the 0018 body during the 10.1-02 smoke repair; invisible to every read (all key reads filter `selection_order <= 6`; counts stay correct), but it breaks 0028's contiguous-1..N invariant and confuses subsequent v2 appends (max+1 lands lower than expected). Smoke probes were written to assert counts/row-sets, never exact orders, so the batteries stay green. | A future corrective migration (0028-style data repair + one-statement body fix) when the ordered set is next touched. Not urgent — cosmetic to all current reads. |
| 2 | **`class_relevant_stats` is a vestigial table post-0018** — `set_relevant_stat` was dropped, no RPC writes it anymore, but `my_card`'s `relevant_stat_keys` still READS it (0028/0036 byte-preserved read). Member cards show `[]` unless legacy pre-0018 rows linger. | Proven live in smoke-card probes 8a-8c (service-level seeded row shows on the card; removal reflects). | Owner design call: either retire the field/table or re-wire `relevant_stat_keys` to the v2 ordered set (selection_order 7+). Out of 10.1 scope (payload shapes byte-preserved by decision). |
| 3 | `smoke-identity.mjs` rework against the 0034 first-access contract | Standing follow-up already tracked in STATE (noted 0034) | Unchanged — future plan |
