# Milestones

## v1.0 MVP (Shipped: 2026-10-13)

**Phases:** 1–6 (6 phases, 26 plans, 60 tasks) | **Timeline:** 2026-10-07 → 2026-10-13 (6 days)
**Git range:** `3a7d5ef` → `c7f315b` (237 commits, 217 files, +39,372/−29)
**Code:** ~7,700 LOC TypeScript/React (284 tests), 1,658 LOC SQL (11 migrations), ~4,800 LOC smoke/harness scripts
**Delivered:** Hellz ("Painel Geral") — a live guild stats panel where whitelisted members log in with a 4-digit PIN, submit 57 stats via a manual or OCR-assisted wizard, and see tiered stat cards with percentile points, OVR, and improvement focus; officers keep ranks trustworthy; the best players are celebrated on an EAFC-style promotion page.
**Known deferred items at close:** 2 (see STATE.md Deferred Items)

**Key accomplishments:**

1. **Secure access foundation** — per-player bcrypt-hashed 4-digit PIN login with DB-backed lockout, custom-claim JWTs (HS256 + kid), and RLS on every table from day one; proven live end-to-end with in-browser owner approval (AUTH-01/02).
2. **Append-only ingestion with column-level security** — 57-stat pt-BR catalog, pin_hash unreachable by any client credential, guided 5-step wizard with a mandatory per-step review gate, and a discard/validate lifecycle that never deletes rows (REG-01..03, INPT-01/03/04).
3. **Postgres rank engine with hidden key stats** — rank-based percentile points (average-rank ties, 74.25/49.5 exact) and floor-51 OVR from exactly 6 admin-toggled key stats, compute-on-read in SECURITY DEFINER RPCs; 27/27 exact-value live smoke; key-stat identity never crosses the member API boundary (RNK-01..05, proven by leak-diff smokes + owner DevTools).
4. **Member dashboard delivering the core value** — mobile-first tiered stat cards (bronze→platinum), per-stat comparison vs class average/best, improvement-focus strip; owner UAT approved all 8 steps incl. the DevTools single-request/no-leak proof (CMP-01..03, SHWC-01).
5. **OCR auto-read layer, hardened by UAT** — spike GO (222/222 fields, 100.0%), then a 4-round owner-UAT defect cycle pivoted the engine to a scale/margin-invariant structural reader behind the unchanged `readScreenshot` contract, proven by a permanent exact-value harness and full owner approval (INPT-02).
6. **Officer trust tools + EAFC promotion page** — Validações queue (validate/reject with stale-row recovery), owner-only role grant/revoke with next-login JWT effect, role-differentiated removal with an instant deactivation kill-switch, and the Destaques page (top-5 EAFC cards per class, closed-list payload, zero key-stat leak); owner UAT 14/14 (AUTH-03/04/05, SHWC-02).

**Archived:** `milestones/v1.0-ROADMAP.md`, `milestones/v1.0-REQUIREMENTS.md`

---
