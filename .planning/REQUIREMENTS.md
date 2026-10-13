# Requirements: Hellz — Guild Stats Panel (v1.1 Home, Whitelist & Fine Ranks)

**Defined:** 2026-10-13
**Core Value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.

## v1.1 Requirements

Requirements for the v1.1 milestone. Each maps to roadmap phases.

### Whitelist Lifecycle

- [ ] **WHIT-01**: Officer or owner can add a member with handle-only registration (handle + display name; role forced `member`; no PIN set yet; rejects the dummy sentinel prefix)
- [ ] **WHIT-02**: Player logging in with an unclaimed handle is routed to a first-login PIN setup flow (choose own 4-digit PIN, double-entry confirmation, server-side `^\d{4}$` validation)
- [ ] **WHIT-03**: Successful PIN setup atomically claims the PIN (double-claim → `already_set`) and mints the standard 7-day session, landing the player directly in the panel
- [ ] **WHIT-04**: PIN-setup attempts are rate-limited by the existing lockout machinery (`pin_login_attempts` + `record_pin_failure` + `_shared/lockout.ts`) — no second rate-limit mechanism
- [ ] **WHIT-05**: Officers can see which whitelist members haven't claimed a PIN (server-derived flag, staff-only surface; never the hash)
- [ ] **WHIT-06**: Owner can reset a member's PIN via an owner-only RPC (reuses the hash-pin flow) — resolves the forgotten-PIN lockout gap left by player-picked PINs
- [ ] **WHIT-07**: Adding a removed (inactive) handle reactivates the member (history preserved) instead of erroring

### Personalized Home

- [ ] **HOME-01**: After login, members land on a new Início tab showing their own OVR card (reused OvrHero) and a top-3 best-stats strip (value + points + tier badge)
- [ ] **HOME-02**: Members with more than 7 days since their last validated submission see a stale-data CTA navigating to Enviar Status; members who never submitted see an evergreen first-submission variant; fresh data shows no banner
- [ ] **HOME-03**: `my_report` gains only `last_validated_at` — closed-payload discipline holds (zero new per-stat fields, zero key-stat hints)

### Fine Ranks

- [ ] **SCALE-01**: Per-stat points are value-proportional within class+function cohort: leader(s at max) hold 99, everyone below scales by `own/max × 99`; OVR inherits the finer scale with zero formula change (floor 51 preserved)
- [ ] **SCALE-02**: Formula updated in ONE migration across all three rank RPCs (`my_report`, `class_top5`, `get_promotion`), with `rankMath.ts` + locked test values + `smoke-rank.mjs` + `smoke-promotion.mjs` re-baselined in the same phase
- [ ] **SCALE-03**: Tier bands (D-01/D-02 in `presentation.ts`) recalibrated against realistic seeded cohorts before being locked; the improvement-screen percentile phrase ("entre os X% piores/melhores") is dropped — owner decision 2026-10-13 (points are no longer percentile positions)

### Dummy-Data Seed

- [ ] **SEED-01**: Reversible dummy seed (~5 players per class across both functions, validated submissions, realistic value shapes derived from live data or owner-supplied samples — incl. a clear leader, a ~98.5% runner-up, ties, and submitted_at spread) applied via the existing `apply-seed.mjs` tooling, files kept out of `seeds/` direct children
- [ ] **SEED-02**: Purge by sentinel prefix is FK-safe (submissions before members), idempotent, and a hard pre-release checklist gate

## v2 Requirements

Deferred to a future release. Tracked but not in the v1.1 roadmap.

### Progression

- **DELT-01**: Delta badges — track changes since the player's last submission (e.g. ▲ 5,00%)
- **HIST-01**: Submission history / progression view — OVR and key stats over time
- (owner observation) Power-shift significance rule — combat_power shifts flagged significant only at thousands scale between submissions

### Officer Tools

- **OFCR-01**: Officer guild-health dashboard — participation %, who hasn't submitted, OCR failure rate

### Platform

- **CAT-01**: Stat catalog self-service additions by admins
- **OCRX-01**: OCR confidence surfacing — auto-flag low-confidence fields for review
- **SHAR-01**: Shareable card image export — render stat card to PNG for Discord/WhatsApp

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-guild support | Single guild, one panel — deploy a second instance instead |
| Chat/announcements/events | Core loop is stats + ranks only |
| Real-time game sync | No RO Origin API; scraping violates ToS — screenshots are the source |
| PIN change / forgot-PIN self-service for members | Not requested; owner-side reset (WHIT-06) covers the lockout gap |
| Weak-PIN blocklist (0000, 1234, handle-mirror) | Adds surface for near-zero gain; the whitelist itself is the trust boundary |
| Router library for navigation | App.tsx Tab union is the established, tested pattern |
| New npm dependencies | All four features met by SQL + existing Edge Function imports + React patterns (STACK.md) |
| Second rate-limit mechanism for PIN setup | Duplicates the proven v1.0 lockout |
| Faker library for seed data | Hand-authored SQL gives full control of cohort shapes |
| Client-side points recomputation | Rank math stays in Postgres (AGENTS.md non-negotiable) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (pending roadmap) | | |

**Coverage:**
- v1.1 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15 ⚠️ (populated by roadmap creation)

## Milestone Decisions (2026-10-13, owner)

1. **Percentile phrase dropped** under the value-proportional scale (SCALE-03) — the improvement screen no longer claims percentile position.
2. **Forgotten PIN → owner RPC** (WHIT-06) shipped this milestone, not just an ops runbook.
3. **Removed-member re-add → reactivate** (WHIT-07) — add_member on an inactive handle flips `active` back on, preserving submission history.

---
*Requirements defined: 2026-10-13*
*Last updated: 2026-10-13 after initial definition*
