---
phase: 04
slug: member-dashboard-improvement-screen
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-11
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → PostgREST `/rpc/my_report` | The dashboard's ONLY data path. Untrusted JWT claims re-verified server-side (0009 SECURITY DEFINER: member_id claim + active check); the client sends no identity of its own — empty-body POST (T-03-11) | my_report jsonb: own values + class aggregates + opaque points/OVR; never key-stat identity |
| RPC payload → DOM | All rendered data arrives from `my_report()` (aggregates + own values only); components add no fetching of their own | MyReport/MyReportStat jsonb shapes |
| Component props → styling | Tier classes must come from the literal TIER_* maps — interpolated class names silently vanish under Tailwind v4 JIT (rendering integrity, not just cosmetic) | Literal Tailwind class strings |
| Tab UX → server enforcement | Painel is for every role; any client-side tampering still hits RLS/RPC — enforcement is unchanged server-side | None (UX only) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01 | Information disclosure (key-stat identity entering client contract) | MyReport/MyReportStat types, fetchMyReport | mitigate | Types mirror 0009 exactly, structurally incapable of representing key-stat identity (RNK-02); grep gate `is_key`/`key_stats` = 0 in the member-contract block (staff-only fetchKeyStats is a separate trust boundary, 04-01 scoped-gate decision) | closed |
| T-04-02 | Spoofing / tampering (client-supplied identity) | fetchMyReport | accept | my_report() reads identity from the JWT only (0009 T-03-11); empty-body POST — no parameter to tamper with | closed |
| T-04-03 | Information disclosure (tier/phrase logic hinting at key stats) | presentation.ts | mitigate | tierForPoints/tierForOvr/percentilePhrase consume only the caller's own opaque points/OVR; no rankMath import (grep = 0 across src/features/dashboard, re-verified live 2026-10-11); no cohort or key-stat derivation | closed |
| T-04-04 | Repudiation | read-only client wrappers | accept | No state changes exist in this phase; nothing to repudiate | closed |
| T-04-05 | Information disclosure (other individuals' values) | StatCard/OvrHero props | mitigate | Props accept ONLY MyReportStat (own value + class aggregates) — components structurally incapable of rendering another individual's row (reviewer read all five components in full, 04-REVIEW) | closed |
| T-04-06 | Information disclosure (key-stat identity via DOM/classes) | all five leaf components | mitigate | No prop, class, tooltip, or data-attribute encodes key-stat identity; grep gates = 0 (re-verified live 2026-10-11) | closed |
| T-04-07 | Tampering (client-side rank math drift) | StatCard/FocusStrip | mitigate | Components render points/OVR verbatim (badge = Math.round of the given number only); no rankMath import; no recomputation from values (04-REVIEW confirmed) | closed |
| T-04-08 | Information disclosure (small-guild aggregate approximation) | StatCard Média/Melhor | accept | Inherited server-level acceptance (0009 comment, T-03-10): avg/best can approximate the top player in a small cohort; officer validation is the real control | closed |
| T-04-09 | Elevation (component fetching beyond the sanctioned boundary) | all five leaf components | mitigate | Pure/props-only — zero fetch calls, type-only imports from lib/api (re-verified live 2026-10-11: StatCard/OvrHero/FocusStrip import types only; TierLegend/CollapsibleGroup import nothing from lib/api) | closed |
| T-04-10 | Information disclosure (other individuals' raw values) | DashboardPage | mitigate | CMP-03: page imports exactly ApiError + fetchMyReport + MyReport type (re-verified live 2026-10-11); owner DevTools proof at UAT step 6 — exactly ONE /rpc/my_report request with aggregates only | closed |
| T-04-11 | Information disclosure (key-stat identity) | DashboardPage + App wiring | mitigate | RNK-02: response rendered verbatim; no derivation, hint, or request of key-stat identity; owner inspected the payload at UAT step 6; grep gates = 0 | closed |
| T-04-12 | Tampering (client-side rank math) | DashboardPage | mitigate | No rankMath import anywhere in src/features/dashboard (grep = 0, re-verified live 2026-10-11); points/OVR opaque inputs; compute-on-read — no caching, stale-forged values never persist | closed |
| T-04-13 | Spoofing (session) | App/session plumbing | accept | Session injection unchanged from RequireAuth (01-03, hardened CR-02); every fetch re-presents the JWT which RLS re-validates | closed |
| T-04-14 | DoS (chatty client) | DashboardPage | accept | Fetch on mount only, cancelled-flag cleanup; tab switches unmount → at most one RPC per visit; no polling | closed |
| T-04-15 | Information disclosure (small-guild aggregate approximation) | Média/Melhor rendering | accept | Inherited server-level acceptance (0009 comment, T-03-10); client renders the sanctioned aggregate verbatim | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-02 | RPC identity is JWT-only (empty-body POST); no client-supplied parameter exists to tamper with | Phase plan (04-01-PLAN threat model) | 2026-10-10 |
| AR-04-02 | T-04-04 | Read-only wrappers perform no state changes — nothing to repudiate | Phase plan (04-01-PLAN threat model) | 2026-10-10 |
| AR-04-03 | T-04-08 / T-04-15 | Small-guild aggregate approximation (avg/best ≈ top player); officer validation is the real control — inherited from 0009 server acceptance (T-03-10) | Owner (ratified via 02-03 UAT lineage + 03-03 RANK smoke); re-affirmed in 04-REVIEW accepted-leak list | 2026-10-11 |
| AR-04-04 | T-04-13 | Session spoofing handled by the existing hardened RequireAuth/session contract (01-03 CR-02); JWT re-validated by RLS on every request | Phase plan (04-03-PLAN threat model) | 2026-10-10 |
| AR-04-05 | T-04-14 | At most one RPC per tab visit (fetch-on-mount, cancelled-flag cleanup, no polling) — negligible load profile for a single-guild panel | Phase plan (04-03-PLAN threat model) | 2026-10-10 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-11 | 15 | 15 | 0 | execute-phase orchestrator (evidence: 04-REVIEW.md full-file review, 04-VERIFICATION.md 15/15, 04-01/02/03-SUMMARY.md threat flags, owner DevTools UAT proof, live grep re-verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-11
