---
phase: 06
slug: trust-celebration-officer-tools-promotion-page
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-13
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

**Scope:** Phase 6 surfaces — migration 0011 (officer_queue, set_submission_status, set_member_role, set_member_active, get_promotion, my_report v3, class_top5 v3, owner-only classes policy), typed RPC wrappers (api.ts), Validações officer queue UI, Destaques promotion page UI, Personagens Controles column, consolidated gate + owner UAT.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| member JWT → officer RPCs | A member-crafted/tampered JWT hitting officer_queue/set_submission_status/set_member_active/set_member_role — must be refused server-side | Guild member identity (JWT claims) → privileged adjudication/management writes |
| officer JWT → owner/role surfaces | An officer escalating to role grants, officer removal, or class creation | Officer identity → owner-only surfaces (role/active on officers, classes) |
| member JWT → get_promotion | The ONE sanctioned view of other players' individual values — key-stat identity must not leak | Per-class top-5 OVR cards + top-6 highlights (individual values, no key-stat config) |
| anon → any new RPC | No unauthenticated access to any Phase 6 surface (no public leaderboard) | None — refused |
| officer → submissions | Officers must never mutate stat values — read-only review is absolute | 57-stat payload, read-only |
| payload → DOM | The RPC payload is opaque data; the client must not derive or display key-stat identity | Closed-list highlight fields |
| stale elevated JWT | A demoted officer's 7-day token still carries the old member_role claim until next login | D-10 accepted window |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01 | Elevation of Privilege | officer_queue | mitigate | Staff gate INSIDE the SECURITY DEFINER RPC (member_role in officer/owner + active row), `0011:75,141`; no staff SELECT policy on submissions/submission_stats — the RPC is the only narrow read surface. UI: UX-only tab gate + `showValidacoes` content re-check. Evidence: smoke-officer probes 1–3 (39/39), UAT steps 1–5 | closed |
| T-06-02 | Tampering | set_submission_status | mitigate | Staff gate + status whitelist (validated/rejected) + UPDATE scoped to `status='pending'` + not_pending raise on 0 rows (`0011:141-166`); status mark only — append-only preserved. UI: zero edit affordances in ValidacoesPage (grep-proven: no inputs). Evidence: smoke-officer probes 4–8, lifecycle 11/11, UAT steps 3–5 | closed |
| T-06-03 | Elevation of Privilege | set_member_role | mitigate | Owner-only caller gate (`0011:188`); p_role whitelisted to member/officer — no self-promotion path to owner; owner rows immutable; role column ungranted (0005) so the RPC is the only write path. UI: owner-only render + ConfirmDialog. Evidence: smoke-officer probes 10a–10f incl. D-10 JWT claim, UAT steps 9–10 | closed |
| T-06-04 | Elevation of Privilege | set_member_active | mitigate | Imperative role-differentiated target rules in one RPC (officers→member rows only, owner→member+officer, owner rows untouchable, self-deactivation blocked, `0011:241-281`); deactivation kills minted tokens instantly via 0004/0008 active checks. UI: D-08 visibility matrix (no control rendered the viewer may not use). Evidence: smoke-officer probes 12–13 (instant token kill 12c), UAT steps 11–12 | closed |
| T-06-05 | Information Disclosure | get_promotion | mitigate | Top-6-by-points selection provably key-stat-uncorrelated (identical points formula for all 57 stats; class_key_stats read only inside the OVR lateral); serialized fields closed-list stat_key/label/value_type/value/points (`0011:388-395`); client renders verbatim — no rank math, no key-stat tokens (grep-proven in src/features/highlights). Evidence: leak-diff smoke zero intersection + payload-wide marker grep (21/21), owner-witnessed DevTools proof (single get_promotion call, no key-stat fields — UAT step 8, T-06-05 closure) | closed |
| T-06-06 | Information Disclosure | get_promotion (anon) | mitigate | Member gate (member_id claim + active); EXECUTE revoked from public/anon (`0011:702`); page renders only inside RequireAuth — no public route. Evidence: smoke-promotion probe 1 (anon denied), UAT step 6 login-gated | closed |
| T-06-07 | Repudiation/Tampering | officer status writes vs append-only | mitigate | No deletes/updates outside `set status`; member_id/submitted_at untouched; 0010 discarded own-row policy untouched. Evidence: lifecycle smoke 11/11 twice, UAT steps 3–5 (rejection status label + rank revert) | closed |
| T-06-08 | Elevation of Privilege | staff_insert_classes | mitigate | Policy recreated owner-only (`0011:679` with check on owner claim) — structural change never officer-reachable (03-04 owner directive). UI: Nova classe section inside `{isOwner && ...}`. Evidence: smoke-rls check 7 flip (officer 403, owner 201), UAT steps 12–13 | closed |
| T-06-09 | Elevation of Privilege (stale claims) | demoted officer's 7-day JWT | accept | D-10: role changes effective at next login (verify-pin mints member_role at login); deactivation is the immediate kill-switch (0004/0008 active checks — smoke 12c); UI copy states "Efetivo no próximo login."; server gates enforce on the true role row. No token epoch in v1 | closed (accepted risk) |
| T-06-10 | Information Disclosure | promotion payload typing | mitigate | PromotionHighlight typed closed-list exactly {stat_key,label,value_type,value,points} (api.ts:332) — an is_key-like field cannot be typed or rendered without an intentional contract change (type error at review). Evidence: 06-03 grep gates + tsc | closed |
| T-06-11 | Repudiation (two-officer race) | stale queue row | mitigate | not_pending mapped to stale-row copy + queue refetch in ValidacoesPage — no silent double-adjudication. Evidence: 06-04 grep gates + smoke-officer not_pending probe, UAT step 3 path | closed |
| T-06-12 | Information Disclosure | queue rows to members | mitigate | Data flows only from fetchOfficerQueue (server refuses members); page never falls back to a REST select (grep-proven: no restFetch/from('submissions') in ValidacoesPage). Evidence: 06-04 gates + smoke-officer probe 2 | closed |
| T-06-13 | Tampering (client-side rank math) | HighlightsPage / PromotionCard | mitigate | No rank computation in TS — tier banding via the unit-locked tierForOvr/tierForPoints presentation functions with literal TIER_* maps only; server-ordered rendering. Evidence: 06-05 grep gates, 284/284 tests | closed |
| T-06-14 | Tampering (direct PATCH) | members.role/active via REST | mitigate | No PATCH path added — role/active ungranted columns (0005); UI exclusively uses setMemberRole/setMemberActive wrappers (grep-proven in CharactersPage: zero .update(, zero role:/active: payloads). Evidence: 06-06 grep gates + smoke | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-09 | Demoted officer's 7-day JWT retains the old member_role claim until next login. Accepted because: server gates enforce on the true role row for every privileged RPC (a stale officer claim still cannot reach owner-only surfaces); deactivation is the immediate kill-switch; UI copy ("Efetivo no próximo login.") sets the operator expectation; no token epoch mechanism in v1. | Owner (via plan 06-01/06-06 threat models + UAT step 10 walk) | 2026-10-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-13 | 14 | 14 | 0 | opencode (secure-phase, from artifacts) |

**Audit method (State B — from artifacts):** register consolidated from all 7 PLAN.md `<threat_model>` blocks; zero SUMMARY threat flags raised; every mitigation spot-verified against the live code (0011 gates + EXECUTE hygiene at `0011:690-702`, owner-only classes policy at `0011:679`, closed-list PromotionHighlight at `api.ts:332`, zero `select=*`, zero inputs/REST-fallback in ValidacoesPage, zero rank-math/key-stat tokens in src/features/highlights, RPC-only writes in CharactersPage) and cross-checked against live smoke evidence (officer 39/39, promotion 21/21 incl. zero-intersection leak-diff, RLS check-7 flip, rank 27/27, lifecycle 11/11 — all twice-consecutive, zero residue) and the owner UAT walk (14/14 PASS, DevTools leak proof step 8).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-13
