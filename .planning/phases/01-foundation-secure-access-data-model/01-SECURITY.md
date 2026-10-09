---
phase: 1
slug: foundation-secure-access-data-model
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-08
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client bundle → env | Only VITE_* vars reach the client; service-role key / signing secret never cross | Public URL + anon key (public by design); secrets must never leak |
| SPA → verify-pin Edge Function | Untrusted {discord_handle, pin} input | 4-digit PIN (secret, transient), Discord handle (identifier) |
| JWT → PostgREST/RLS | Signed custom claims cross the data-access boundary | HS256 JWT with member_id/member_role claims (7-day expiry) |
| Edge Function → DB | Service-role access (bypasses RLS) — must only serve the PIN gate | Service-role DB writes to pin_login_attempts, member reads |
| SPA → PostgREST | All data access crosses RLS here | Stat data, member's own row only |
| Seed script → members table | PIN hashes enter the DB; plaintext PINs never do | bcrypt hashes ($2b$) |
| .secrets/ocr-samples/ → git/Storage | Member data must never enter git or Supabase Storage | Real screenshots + expected values (member PII) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-01 | Spoofing | JWT forgery | mitigate | HS256 signed with dedicated platform signing key (NEFOOT_JWT_SECRET + kid header, server-only env); 7-day expiry; role claim fixed to 'authenticated'. Verified live: minted JWT accepted by PostgREST, own-row-only via RLS. Auditor empirically confirmed fail-closed behavior if the secret is unset (0-byte key → WebCrypto throws → no token minted; review claim WR-05 "signs with 'undefined'" disproved) | closed |
| T-01-02 | Brute force | PIN lockout | mitigate | DB-backed lockout 5→15 min per handle (D-07), enforced in the Edge Function, 6/6 lockout tests, live 401 countdown → 429. KNOWN WEAKNESS: failed-count increment is a non-atomic read-modify-write — concurrent requests defeat the 5-attempt limit (see Accepted Risks AR-01) | closed* |
| T-01-03 | Information disclosure | RLS bypass | mitigate | RLS on every table (0002_rls.sql); identity from auth.jwt()->>'member_id'; class_key_stats + pin_login_attempts deny-all (zero policies). Verified live: anon → [], no-auth → 401 | closed |
| T-01-04 | Tampering | Submissions mutation | mitigate | No UPDATE/DELETE policies for authenticated — append-only at the server; EAV unique constraint prevents duplicate stat rows | closed |
| T-01-05 | Elevation of privilege | Role claims | mitigate | members not API-writable (single SELECT policy); member_role read from the members row at login (server truth), never from client input | closed |
| T-01-06 | DoS | verify-pin flood | accept | Free-tier invocation limits + per-handle lockout bound damage; low-value single-guild target | closed |
| T-01-07 | Information disclosure | User enumeration | mitigate | Identical 401 bodies for missing handle / inactive / wrong PIN. KNOWN WEAKNESS: bcrypt compare runs only on the wrong-PIN path → ~100-300 ms timing delta is a handle-existence oracle (see Accepted Risks AR-02) | closed* |
| T-01-08 | Tampering | Client-side guard bypass | accept | Route guards are UX only by design — real enforcement is RLS, proven live in plan 01-02 | closed |
| T-01-09 | Information disclosure | Real screenshots / member data | mitigate | Screenshots + expected.json live only in gitignored .secrets/ocr-samples/ (D-10); spike script refuses to run without samples; nothing tracked under .secrets/ or .env in git | closed |
| T-01-10 | Tampering | Spike results | mitigate | Results cite the committed, re-runnable script's raw output (deterministic given samples) | closed |

*Status: open · closed — `closed*` = mitigation implemented but with an accepted weakness documented in the Accepted Risks Log.*

*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-02 | Lockout counter race: concurrent failures each read the same failed_count, so the 5-attempt/15-min limit degrades under parallelism (~K guesses per increment; 10⁴ PIN space exhaustible in hours at modest concurrency). ACCEPTED AS FOLLOW-UP ONLY because no real members exist yet — all seeded PINs are the placeholder 1234. **Fix precondition: must land before real members are invited or placeholder PINs rotate to real ones.** Fix: atomic `SECURITY DEFINER` RPC `record_pin_failure()` (`INSERT … ON CONFLICT DO UPDATE … RETURNING`); Edge Function consumes returned values as the only truth (migration + function change in supabase/functions/verify-pin/index.ts + a new migration). Recorded in 01-REVIEW.md as CR-01. | Owner (via /gsd-secure-phase decision; consistent with 01-HUMAN-UAT.md accept-as-follow-up) | 2026-10-08 |
| AR-02 | T-01-07 | Enumeration timing oracle: missing-handle/inactive path skips bcrypt (~100-300 ms delta) → handle-existence oracle despite identical 401 bodies. ACCEPTED AS FOLLOW-UP for the same reason (no real members; handles in the committed seed are placeholders). **Fix precondition: same as AR-01 — before real members.** Fix: dummy `bcrypt.compareSync(pin, DUMMY_HASH)` on the missing/inactive branch to equalize timing. Recorded in 01-REVIEW.md as WR-01. | Owner (same decision) | 2026-10-08 |

*Accepted risks do not resurface in future audit runs — provided their documented preconditions hold. AR-01/AR-02 preconditions are NOT yet met: the fixes have not landed. Any audit run after real members are invited must re-check these.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-08 | 10 | 10 | 0 | gsd-security-auditor (verified vs source; orchestrator classification reviewed: T-01-01 re-classified CLOSED after empirical disproof of WR-05; T-01-02/T-01-07 closed via owner-accepted risks AR-01/AR-02) |

### Audit notes (2026-10-08)

- 8/10 closed by mitigation verification (6 mitigated + 2 plan-accepted: T-01-06, T-01-08); 2 closed via owner-accepted risks (AR-01, AR-02) with explicit fix preconditions.
- Auditor hygiene recommendations (non-register): fail-fast guard for NEFOOT_JWT_SECRET / NEFOOT_JWT_KEY_ID at handler top (converts misconfiguration into explicit 500 server_misconfigured); add `active` check to RLS policies so deactivating a member revokes data access (WR-02 — minted 7-day tokens otherwise remain valid).
- Related review findings outside this register: CR-02 (session JSON.parse white-screen — availability, not security), WR-06 (placeholder PIN 1234 disclosed in committed seed comment — rotate before real members).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-08 (owner accepted AR-01/AR-02 as follow-ups via /gsd-secure-phase checkpoint)
