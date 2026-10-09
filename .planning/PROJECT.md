# Hellz — Guild Stats Panel (Painel Geral)

## What This Is

A web panel for a single guild in Ragnarok Origin that stores all status data of the guild's players. Players submit their stats via screenshots (OCR auto-read with manual fix-up), and the panel compares them against guild standards, generates ranks, and points out where each player must improve to catch up. It uses an EAFC Ultimate Team feel — percentile-based points, tiered stat cards, and a promotion page celebrating the best players in the guild.

## Core Value

Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.

## Requirements

### Validated

- [x] 4-digit PIN set and used to access the panel — Validated in Phase 1: hashed bcrypt PINs, login/reload/logout owner-verified, server-side lockout, RLS blocking proven live (AUTH-01, AUTH-02)
- [x] Backend connection to a free-tier storage like Supabase or a superior alternative — Validated in Phase 1: live Supabase project with 6-table append-only schema and RLS on every table

### Active

- [ ] Stat data input: screenshots per character (Basic header + General Stats + Quasi-Stats + Special) with example shots shown beside input boxes — Phase 1 OCR spike added the "basic" character header screen (job, nickname, combat power) as the first capture; reconcile capture count in Phase 2 planning
- [ ] OCR auto-reads screenshots; failed OCR captures are manually fixed before a successful registration
- [ ] Store all player status data (flat and percentage values across General, Quasi, and Special stat groups)
- [ ] Per-stat percentile ranking within the guild (top 1% = 99 points)
- [ ] Overall rating based on 6 key stats per class, with a normalization floor of 51 OVR (never falls below 51)
- [ ] Key stats are admin-tweakable: an admin can toggle a stat to make it key; each class has an independent set of exactly 6 key stats
- [ ] Key stats are NOT explicit to members (prevents stat skewing to artificially improve ranks)
- [ ] Improvement screen: per-stat cards showing player's value, guild average, best in guild, and percentile position (e.g. "you're in the bottom 30% of Assassins for CRIT")
- [ ] Tiered stat cards: bronze for mediocre stats, silver for mildly elevated, gold for highly elevated, platinum for top of the class (own improved version of the reference model, not a copy)
- [ ] Delta badges: track changes since the player's last submission (e.g. ▲ 5,00%)
- [ ] Separate promotion page showing key stats as "EAFC cards" to promote the best players in the guild
- [ ] Members see aggregates only on their own improvement screen (never individual players' values)
- [ ] 4-digit PIN set and used to access the panel
- [ ] Officers have elevated role: validate and remove players and registers, blocking access to players from other guilds
- [ ] Officer role granted manually by the owner
- [ ] Fully functional dashboard for all members
- [ ] Frontend written in TypeScript using React
- [ ] Backend connection to a free-tier storage like Supabase or a superior alternative

### Out of Scope

- Multi-guild support — single guild, one panel
- Chat/announcements/events for the guild — core loop is stats + ranks only
- Real-time sync with the game — data comes from screenshots, not game APIs

## Context

- Game: Ragnarok Origin (mobile, Ragnarok-family stat layout)
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
| 3 screenshots per character (General, Quasi, Special) | Example shots beside input boxes; repeat 3x + fix failed OCR | — Phase 1: header "basic" screen added as 4th capture (job, nickname, combat power); reconcile in Phase 2 |
| Per-stat percentile points (top 1% = 99 pts) | EAFC Ultimate Team feel based on tops | — Pending |
| Overall from 6 key stats, floor of 51 OVR | Normalization; overall never below 51 | — Pending |
| Key stats admin-tweakable, exactly 6 per class | Flexibility; independent set per class | — Pending |
| Key stats hidden from members | Avoid stat skewing for artificial rank gains | — Pending |
| Card tiers: bronze/silver/gold/platinum | Own improved pattern instead of reference's orange/green borders | — Pending |
| Members see aggregates only; promotion page shows top players as EAFC cards | Promote best players; protect individual data | — Pending |
| 4-digit PIN auth with officer elevation by owner | Simple access; officers validate/remove players and registers | — Phase 1: live (verify-pin + lockout + 7-day custom-claim JWT); follow-up hardening tracked in 01-REVIEW.md |
| Dedicated HS256 signing key for custom-claim JWTs (NEFOOT_JWT_SECRET) | Platform redacts the legacy JWT secret; key 6f7657c3 must never be revoked | — Phase 1 |
| Panel branded "Hellz" (subtitle "Painel Geral") | "NeoFoot" was an abandoned folder name reused for the repo; UI shows Hellz — internal identifiers (repo, storage key, JWT issuer) unchanged | — Phase 1 |
| Delta badges track changes since last submission | Show progress over time | — Pending |
| TypeScript + React frontend | User requirement | — Pending |
| Free-tier backend (Supabase or superior) | User requirement | — Pending |

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
*Last updated: 2026-10-08 — Phase 1 (Foundation — Secure Access & Data Model) complete: live Supabase schema with RLS, verify-pin auth with lockout and 7-day custom-claim JWT, PIN Gate UI, OCR spike GO.*
