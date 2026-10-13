# Hellz — Guild Stats Panel (Painel Geral)

## What This Is

A live web panel ("Hellz — Painel Geral") for a single guild in Ragnarok Origin that stores all status data of the guild's players. Players submit their stats via screenshots (OCR auto-read with mandatory manual fix-up), and the panel compares them against guild standards, generates ranks, and points out where each player must improve to catch up. It uses an EAFC Ultimate Team feel — percentile-based points, tiered stat cards, and a promotion page celebrating the best players in the guild. Shipped as v1.0 MVP on 2026-10-13: PIN login, manual+OCR ingestion, Postgres rank engine, member dashboard, officer trust tools, and the Destaques promotion page are all live and owner-approved.

## Core Value

Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.

## Current Milestone: v1.1 Home, Whitelist & Fine Ranks

**Goal:** Give staff full control over who can access the panel, make login land on a personalized home with the player's own status, and make the 99 scale differentiate the top end by real stat gaps.

**Target features:**
- Whitelist lifecycle: officers + owner add players (handle registration only); player picks own 4-digit PIN on first login; removal stays role-differentiated as today
- Personalized home ("fake home"): new landing tab after login — own OVR card + best stats, and a stale-data CTA (>7 days since last validated submission); Destaques keeps the guild-wide EAFC cards
- Value-proportional 99 scale: leader holds 99 per stat, everyone below scales by value relative to the best (OVR inherits the finer scale)
- Dummy-data workflow: reversible seed of ~5 players per class to mold displays around realistic cohorts, deleted before release

## Requirements

### Validated

- [x] 4-digit PIN set and used to access the panel — Validated in Phase 1: hashed bcrypt PINs, login/reload/logout owner-verified, server-side lockout, RLS blocking proven live (AUTH-01, AUTH-02)
- [x] Backend connection to a free-tier storage like Supabase or a superior alternative — Validated in Phase 1: live Supabase project with 6-table append-only schema and RLS on every table
- [x] Store all player status data (flat and percentage values across General, Quasi, and Special stat groups) — Validated in Phase 2: manual ingestion wizard live with 57-stat catalog, owner UAT-approved
- [x] Per-stat percentile ranking within the guild (top 1% = 99 points) — Validated in Phase 3: live in my_report RPC (0009, 27/27 exact-value rank smoke); member-visible since Phase 4 (RNK-03/04/05)
- [x] Overall rating based on 6 key stats per class, with a normalization floor of 51 OVR (never falls below 51) — Validated in Phase 3: live in my_report (51 + mean(6 key-stat points) × 48/99, all-6-or-nothing); member-visible since Phase 4
- [x] Key stats are admin-tweakable: an admin can toggle a stat to make it key; each class has an independent set of exactly 6 key stats — Validated in Phase 3: set_key_stat RPC live (advisory-lock block-at-7), Stats-Chave admin page owner-UAT-approved (RNK-01)
- [x] Key stats are NOT explicit to members (prevents stat skewing to artificially improve ranks) — Validated in Phase 3: member contract structurally key-stat-free, RANK smoke leak-probes green (RNK-02); Phase 4 DevTools-verified by owner (single /rpc/my_report response, no is_key/key_stats)
- [x] Improvement screen: per-stat cards showing player's value, guild average, best in guild, and percentile position (e.g. "you're in the bottom 30% of Assassins for CRIT") — Validated in Phase 4: CMP-02 owner browser-verified (UAT step 4)
- [x] Tiered stat cards: bronze for mediocre stats, silver for mildly elevated, gold for highly elevated, platinum for top of the class (own improved version of the reference model, not a copy) — Validated in Phase 4: SHWC-01 owner browser-verified (D-01/D-02 bands, legend + colored badges)
- [x] Members see aggregates only on their own improvement screen (never individual players' values) — Validated in Phase 4: CMP-03 owner DevTools-verified (one /rpc/my_report request, aggregates only)
- [x] Fully functional dashboard for all members — Validated in Phase 4: CMP-01 owner browser-verified (Painel tab, mobile-first 1→2→3 column grid)
- [x] Frontend written in TypeScript using React — Validated in Phases 1–4: React 19 + TypeScript, live and owner-used
- [x] Stat data input: screenshots per character (Basic header + General Stats + Quasi-Stats + Special) with example shots shown beside input boxes — Validated in Phase 5: capture count reconciled in Phase 2 (combat_power manual on intro step), example shots beside inputs, no screenshot storage (D-10)
- [x] OCR auto-reads screenshots; failed OCR captures are manually fixed before a successful registration — Validated in Phase 5: structural reader (owner-directed pivot), INPT-02's 3 success criteria verified 10/10, owner UAT APPROVED after a 4-round defect cycle
- [x] Separate promotion page showing key stats as "EAFC cards" to promote the best players in the guild — Validated in Phase 6: get_promotion RPC (member-invocable, closed payload, zero key-stat leak-diff) + Destaques page with tier-styled cards, owner UAT step 6–8 (SHWC-02)
- [x] Officers have elevated role: validate and remove players and registers, blocking access to players from other guilds — Validated in Phase 6: officer queue + status transitions + role-differentiated removal (0011 RPCs live smoke-proven; owner UAT steps 1–5, 11–12) (AUTH-05, AUTH-04)
- [x] Officer role granted manually by the owner — Validated in Phase 6: owner-only set_member_role RPC (no path grants owner; next-login JWT claim), owner UAT steps 9–10 (AUTH-03)

### Active

v1.1 milestone scope (defined 2026-10-13):

- [ ] Whitelist control: officers and owner can add players to the whitelist (handle-only registration); player picks own PIN on first login
- [ ] Personalized home: player's own status (OVR + best stats) as the landing view, with a stale-data CTA after 7 days without a validated submission
- [ ] Value-proportional 99 scale: top-end cuts at 98/97/96/95 based on value distance to the best, per stat
- [ ] Dummy-data seed workflow: ~5 seeded players per class to calibrate displays, removed before release

### Future (deferred, not this milestone)

- Delta badges: track changes since the player's last submission (e.g. ▲ 5,00%) (DELT-01)
- Submission history / progression view — OVR and key stats over time (HIST-01)
- Officer guild-health dashboard — participation %, who hasn't submitted, OCR failure rate (OFCR-01)
- Stat catalog self-service additions by admins (CAT-01)
- OCR confidence surfacing — auto-flag low-confidence fields for review (OCRX-01)
- Shareable card image export — render stat card to PNG for Discord/WhatsApp (SHAR-01)
- Power-shift significance rule — combat_power shifts flagged significant only at thousands scale between submissions (owner observation from Phase 5 UAT)

### Out of Scope

- Multi-guild support — single guild, one panel
- Chat/announcements/events for the guild — core loop is stats + ranks only
- Real-time sync with the game — data comes from screenshots, not game APIs

## Context

- Game: Ragnarok Origin (mobile, Ragnarok-family stat layout)
- **Current state (v1.0 shipped 2026-10-13):** ~7,700 LOC TypeScript/React 19 + Tailwind v4 (284 tests green), 11 Supabase migrations (1,658 LOC SQL), 5 live smoke matrices (RLS, rank, lifecycle, officer 39-check, promotion 21-check incl. leak-diff), live on Supabase free tier; OCR is a structural reader (scale/margin-invariant) with a permanent exact-value harness
- **Known tech debt / advisories:** 06-REVIEW WR-01..04 (misleading "Salvo." feedback, Shift+Tab trap in ConfirmDialog, non-unique React key on HighlightsPage, one duplicate officer smoke probe) — advisory only, no must-have impacted; pre-launch owner actions: rotate Supabase deploy token + placeholder whitelist PINs, replace `public/examples/*.svg` with real screenshots before inviting real members
- Stat structure from screenshots:
  - **General Stats**: HP, SP, PATK, PDEF, MATK, MDEF, Refine PATK/PDEF/MATK/MDEF, HP recover, SP Recovery, HIT, FLEE
  - **Quasi-Stats**: ASPD, MSPD, Variable CT (flat + %), Fixed CT (flat + %), Healing Done/Taken, CRIT, CRIT RES, CRIT DMG, CRIT DMG RES, PDMG, PDMG.R, MDMG, MDMG.R, Ignore PDEF (flat + %), Ignore MDEF (flat + %), PDMG Bonus, MDMG Bonus, PvE DMG Reduction, PvE DMG Bonus, PvP DMG Reduction, PvP DMG Bonus
  - **Special** (cropped in some screenshots — the panel's capture flow takes a wider shot to capture more key statuses and reduce screenshot count): Max SP %, Equipment PATK/MATK/PDEF/MDEF %, Global CD %, DMG vs/DMG Reduction vs Small/Medium/Large Enemies, Brute, Demi-Human, etc.
- Values mix flat numbers and percentages — cards are labeled FLAT or PERCENTUAL
- Reference card model exists (Portuguese-language dashboard) showing: stat name, description, value type, player's value, class average, Top X of 15, top value, delta badges. We build our own improved version, not a copy
- The ranking model is inspired by EAFC Ultimate Team: per-stat percentile points and an overall from key stats
- Class/function distinctions matter: comparisons and guidelines are always against players of the same class and function (e.g. tank vs DPS have different bars)
- Reference image: user-annexed screenshots of stat screens and card model (captured during questioning)

## Constraints

- **Tech stack**: TypeScript + React (frontend) — user requirement
- **Backend**: Free-tier storage (Supabase or superior alternative) — user requirement
- **Access**: 4-digit PIN (not full account system) — keeps friction low for guild members
- **Anti-gaming**: Key stats hidden from members — ranks must reflect genuine improvement
- **OCR accuracy**: Game is on mobile; screenshots must be readable by OCR — example shots guide members

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OCR auto-read + manual fix-up (not pure manual typing) | Reduces input friction; screenshots are the source of truth | — Phase 1 spike: GO (222/222 fields, 100.0% on 11 real samples; device-fragmentation caveats documented) |
| 3 screenshots per character (General, Quasi, Special) | Example shots beside input boxes; repeat 3x + fix failed OCR | — Phase 2: reconciled — combat_power entered manually on the wizard intro step (catalog stat), example shots rendered beside inputs, no screenshot storage at all (D-10 ratified); Phase 5 will OCR-fill on top |
| Per-stat percentile points (top 1% = 99 pts) | EAFC Ultimate Team feel based on tops | — Live (Phase 3: my_report RPC, 27/27 exact-value smoke; Phase 4: member-visible, owner UAT) |
| Overall from 6 key stats, floor of 51 OVR | Normalization; overall never below 51 | — Live (Phase 3 RPC; Phase 4 OvrHero member-visible, owner UAT) |
| Key stats admin-tweakable, exactly 6 per class | Flexibility; independent set per class | — Live (Phase 3: set_key_stat block-at-7 + Stats-Chave owner-UAT) |
| Key stats hidden from members | Avoid stat skewing for artificial rank gains | — Live (Phase 3 leak-probes; Phase 4 DevTools-verified by owner) |
| Card tiers: bronze/silver/gold/platinum | Own improved pattern instead of reference's orange/green borders | — Live (Phase 4: D-01/D-02 bands + legend, owner UAT) |
| Members see aggregates only; promotion page shows top players as EAFC cards | Promote best players; protect individual data | — Live: aggregates-only (Phase 4, CMP-03 owner-verified) + promotion page (Phase 6, SHWC-02 owner-verified) |
| 4-digit PIN auth with officer elevation by owner | Simple access; officers validate/remove players and registers | — Phase 1: live (verify-pin + lockout + 7-day custom-claim JWT); follow-up hardening applied 2026-10-09 via code-review-fix (CR-01 atomic lockout RPC, CR-02 session hardening, WR-01..09) — see 01-REVIEW-FIX.md |
| Dedicated HS256 signing key for custom-claim JWTs (NEFOOT_JWT_SECRET) | Platform redacts the legacy JWT secret; key 6f7657c3 must never be revoked | — Phase 1 |
| Panel branded "Hellz" (subtitle "Painel Geral") | "NeoFoot" was an abandoned folder name reused for the repo; UI shows Hellz — internal identifiers (repo, storage key, JWT issuer) unchanged | — Phase 1 |
| Delta badges track changes since last submission | Show progress over time | — Deferred to v2 (DELT-01) |
| TypeScript + React frontend | User requirement | — ✓ Good: live, owner-used daily (v1.0) |
| Free-tier backend (Supabase or superior) | User requirement | — ✓ Good: Supabase free tier, 11 migrations live (v1.0) |
| Structural OCR reader (color-pill/label-anchor based), not pixel-fraction region maps | Owner directive 2026-10-12: "screenshots will vary in size inevitably... we need a reading model that actually can read data from an image without relying on a pixel map" — invariant to crop size, translation, margins | — ✓ Good: harness grid exact on native/rescale/margin/crop variants; recalibration = visual grammar, not pixel fractions |
| All rank/role math in Postgres SECURITY DEFINER RPCs reading `auth.jwt()->>'member_role'` | Enforcement never UI-only; RLS policies on every table; append-only submissions (status marks, never deletes) | — ✓ Good: held across 6 phases, proven by live smoke matrices + owner DevTools leak proofs |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-13 — v1.1 milestone started (Home, Whitelist & Fine Ranks): whitelist lifecycle with player-picked PINs, personalized home with stale-data CTA, value-proportional 99 scale, dummy-data seed workflow. Deferred v2 candidates moved to Future section.*
