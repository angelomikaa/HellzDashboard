---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Home, Whitelist & Fine Ranks
status: executing
stopped_at: Phase 07.2 plan 07.2-02 complete
last_updated: "2026-10-17T02:27:12.151Z"
last_activity: 2026-10-17 -- 07.2-02 complete (0013 clients typed, D-07 foco rule unit-locked)
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 12
  completed_plans: 8
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-13, after v1.0 milestone)

**Core value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.
**Current focus:** Phase 07.2 — premium-showcase-game-grounding-inserted

## Current Position

Phase: 07.2 (premium-showcase-game-grounding-inserted) — EXECUTING
Plan: 3 of 6 (07.2-01, 07.2-02 complete)
Status: Ready to execute
Last activity: 2026-10-17 -- 07.2-02 complete (0013 clients typed, D-07 foco rule unit-locked)

## Accumulated Context

### Roadmap Evolution

- Phase 07.1 inserted after Phase 7: Visual ID implementation (h-logo reference: sharp, modern, red neon, dark, city, futuristic, sci-fi look) (URGENT)

### Decisions

Full decision log lives in PROJECT.md Key Decisions and the archived phase documents (`.planning/milestones/v1.0-ROADMAP.md`, phase SUMMARY/VERIFICATION files kept in `.planning/phases/`).

- [Phase 07]: Hunter line catalog entry = Sniper (not Ranger): live-API verification 2026-10-13 confirmed the Archer line's released top job is Sniper (second_advanced_transfer); Ranger is third_transfer/unreleased, same rule as Grand Summoner/Nightwatch. Surfaced at the D-12 review gate.
- [Phase 07]: Migration 0012 ships catalog alignment (11 renames, guarded Dancer/Super Novice removals, Summoner/Rebellion additions) + char_function CHECK widen (tank->suporte, mdps added) in one append-only corrective migration. Local rehearsal ran against real Postgres 18.4 via embedded binaries (no supabase CLI/Docker in this environment); live key-stat count parity re-check owned by 07-04.
- [Phase 07]: Client role vocabulary lives in ONE shared map (src/lib/groups.ts FUNCTION_LABELS, dps/mdps/suporte with locked pt-BR copy); the staff form renders its three options from the map so options can never drift from the vocabulary
- [Phase 07]: Dummy seed roster splits authored per D-08 (LK/Paladin 3/1 dps:suporte, Biochemist 2/1/1, Mastersmith 1/2/1, Summoner 3/3/2, Sniper+Rebellion 4+4, Stalker wildcard n=1) — CONFIRMED by owner at the D-12 gate 2026-10-14; uniform dummy PIN is hash-only in the repo, plaintext handed off out-of-band (never committed)
- [Phase 07]: Dummy seed value bases REBUILT from live medians (D-11 honest, owner D-12 decision): base = live median from value-bases.json (n=3, Assassin/tank + Priest/tank), 53/57 bases changed; the 4 degenerate all-zero live stats (refine_mdef, crit_dmg, fixed_ct, variable_ct) keep owner samples; negative live ranges (fixed_ct_pct -49.4, global_cd_pct -10, variable_ct_pct -60) preserved unclamped across the whole ladder; 3 further live-zero stats (ignore_pdef_pct, ignore_mdef_pct, dmg_vs_demi_human) take base 0.0
- [Phase 07]: D-12 gate CLOSED (owner, 2026-10-14): Sniper (not Ranger) confirmed, authored splits as rehearsed, Stalker wildcard x1, live residency (D-13) approved; ZERO live writes in 07-03 - plan 07-04 owns the live apply via apply-seed.mjs and the SEED-02 pre-release gate
- [Phase 07]: 07-04 live-push path adapted (no supabase CLI/Docker in this environment, 07-01 precedent): migration 0012 applies via scripts/apply-seed.mjs (legacy Management API /database/query - the sanctioned live-write path), replacing the unavailable `supabase db push`; gates preserved as live-query equivalents (pre-push parity snapshot, pending-migration check against supabase_migrations, post-push parity + vocabulary checks); a schema_migrations bookkeeping row for 0012 is recorded post-apply so a future CLI push never re-runs it
- [Phase 07]: smoke fixture vocabulary update includes one plan-external line (Rule 3): smoke-rls.mjs classes-read probe checked `classList.includes('Assassin')` - post-rename that class no longer exists, so the probe now asserts 'Assassin Cross'; without it the battery would sit red after the push
- [Phase 07]: 07-04 task-2 starvation probes adapted (Rule 3): the uniform dummy PIN is hash-only in the repo (T-07-08) and was handed off out-of-band to the OWNER only, so the server-side n<3 contract was probed with self-cleaning throwaway members placed in the starved cohorts (Stalker/dps -> n=2, Biochemist/mdps -> n=2) - my_report returned HTTP 200 with OVR null/data_sufficient false and all 57 stats points null (never a 500); the real dummy logins (dummy-wild-01, dummy-hp-01) are covered by the owner observation pass (attempting them with an unknown PIN would burn rate-limited login attempts)
- [Phase 07]: 07-04 took Phase 7 LIVE (owner-approved D-12 gate): 0012 applied via apply-seed.mjs with pre/post parity exact (11 classes x 6 key stats) and suporte-only vocabulary + schema_migrations bookkeeping row; 73 dummies resident on the LIVE panel (cohort matrix exact, 57-stats invariant, age spread 32/40, starvation probes HTTP 200 data-insufficient); smoke battery 5/5 green on the new vocabulary; owner observation pass APPROVED 2026-10-14; SEED-02 purge recorded as a HARD pre-release gate in STATE.md

- [Phase 07.2]: 07.2-01 took the server foundation LIVE: migration 0013 applied via apply-seed.mjs (fresh owner token after the old one was rotated — token value never stored in any file; referenced as rotated), schema_migrations bookkeeping row recorded (0012 pattern), smoke-card.mjs PASSED 54/54 TWICE consecutively with zero residue, smoke-rank green standalone (no rank-engine regression)
- [Phase 07.2]: D-11 gate CLOSED (owner, 2026-10-16): the 57-stat 3-letter pt-BR label mapping LOCKED AS DRAFTED — owner supplied NO corrections; live stat_catalog.label_short verified populated for all 57 rows, unique, zero empty strings; downstream 07.2 plans may consume label_short
- [Phase 07.2]: my_card() carries the closed field list {stat_key,label,label_short,value_type,own_value,points} per key stat + relevant_stat_keys + ovr; config (weights/toggles) has no representation in any payload; my_report() untouched (existing leak probes stay green)
- [Phase 07.2]: 07.2-02: plan behavior text had the two lower-is-better test arrows inverted vs the owner-locked D-07 rule + RESEARCH 3.4 formula + the plan's own implementation spec — resolved in favor of the authoritative sources (lower-than-average negative stat is BETTER, not behind)
- [Phase 07.2]: 07.2-02: focusCandidates kept with @deprecated 07.2 D-07 (FocusStrip.tsx still imports it until plan 03 rewires and deletes); fetchMyCard guards malformed bodies per the fetchMyReport precedent
- [Phase 07.2]: 07.2-05 owner feedback pass 1 FAILED with 3 items (2026-10-17): (1) Destaques spacing rhythm uneven, (2) downloaded JPEG extremely distorted, (3) SUPERSEDING DESIGN DECISION — rectangular card frames replaced by SHIELD-like cards with tier-complexity borders (bronze/silver SIMPLE clean borders, gold/Impecável ORNATE double-outline scrollwork per the owner's annexed reference), drawn in code (parametric SVG on-page + same path strings on canvas via scalePath — never raster frame images); D-09 content contract unchanged. **[SUPERSEDED 2026-10-17, round 3]** the owner REJECTED the code-drawn shields ("chaotic in the interface, generic when downloaded") — the shield approach was deleted (shieldFrame.ts removed) and replaced by the crest decision below; the round-2 hardening lessons survive (fail-fast aspect gate, fonts.ready await, scalePath design-space→backing-store mapping, stat-grid gutters)
- [Phase 07.2]: 07.2-05 round 3 SUPERSEDING DESIGN (owner, 2026-10-17): cards are the owner's FOUR hand-designed crest SVGs (src/assets/{bronze,silver,gold,pristine}-crest.svg, viewBox 1000x1000 — Plate + photo-crop + Guidelines layers); the card is a "fake rectangle" laid over the crest frame; ALL content placement derives from the guideline rects parsed out of the SVGs (crestAssets.ts — selector map normalizes per-file id drift incl. the id-less crop path inside g#photo-crop); ONE pure plan (buildCardPlan) feeds BOTH the on-page SVG (shared CrestCard component, consumed by plan 07.2-03) and the canvas JPEG export — same artifact by construction. The owner updated the pristine crest mid-session (Magenta_to_Orange gradient + stroked photo window #e6e6e6 w20) — parser + both surfaces handle it
- [Phase 07.2]: 07.2-05 upload decisions (owner, 2026-10-17, locked via question): (1) member SELF-upload of the character screenshot on their Painel own-card area (CardPhotoUpload; live CrestCard preview from my_card; client-side compression <=1200px JPEG before upload); (2) storage = Supabase Storage PRIVATE bucket `card-photos` + storage.objects RLS — member writes ONLY `<member_id>/card.jpg` (top-level folder pinned to the JWT member_id claim + active-membership subquery, 0004 discipline), all active members read (showcase visibility IS the feature); applied UNNUMBERED via apply-seed.mjs (migration 0014 reservation untouched); screenshots cross to the client as BLOBS (object URLs) so the JPEG export can never be canvas-tainted. **LIVE APPLY COMPLETE (2026-10-18, fresh owner token — value held in session env only, never stored): bucket `card-photos` live (private, 2 MB cap, image/jpeg-only) with all 4 storage.objects RLS policies verified from pg_policies (own-folder pin to JWT member_id claim + active-membership subquery on insert/update/delete, active-members read); negative smoke probes through the live Storage API — anon INSERT correctly RLS-denied, non-JPEG MIME rejected (415 invalid_mime_type), public read of the private bucket blocked, zero probe residue; a real member upload (`<uuid>/card.jpg`, 23 KB JPEG) confirmed the E2E write path works — Painel photo upload is LIVE**
- [Phase 07.2]: 07.2-05 round 3 render gate: scripts/card-render-check (vite harness + Edge headless) draws all 4 tier cards via drawCard at 2000x2000 and pixel-probes frame/photo/OVR/name/chips + toBlob taint — ALL PASS after the crest swap; full suite 315 green; build green
- [Phase 07.2]: 07.2-05 round 4 SUPERSEDING DESIGN (owner, 2026-10-18 — readability redesign after round-3 rejection "all the info was small and unreadable"): the four crest SVGs RE-EXPORTED at 1080×1600 (27:40 portrait, tier-keyed filenames bronze/silver/gold/pristine.svg — the root group id is "Pristine" in ALL FOUR, a copy-paste artifact code must never rely on); NEW layout rules implemented on both surfaces (parser crestAssets.ts retargeted, ONE buildCardPlan feeds on-page CrestCard + canvas JPEG as before): (1) the photo area IS the Content-safezone rect (the round-3 dedicated photo-crop path is gone); (2) Name-only + six-key-stats are SOLID tier-fill bands laid OVER the photo — text contrast guaranteed on any screenshot (per-tier BAND_TEXT_HEX: dark #241A10 on bronze #d1a972 / silver #e6e6e6 / gold #f9b745, white on pristine #cf1a87); (3) the OVR box has NO "OVR" tag — big number + JOB NAME below, backed by a top legibility scrim; type sized for readability (value type ~40% larger than round 3, ratio locked ≥3.5% of card width in tests); canvas aspect gate now 27:40 with 2160×3200 backing; committed 05b89f8 (asset drop) + e6f493e (code) — task 4 re-presented for approval 2026-10-18
- [Phase 07.2]: 07.2-05 round 5 SUPERSEDING DESIGN (owner, 2026-10-18 — round-4 rejected "i couldnt get my idea through"): ONE new `src/assets/card.svg` (viewBox 1080×1600) is the SINGLE SOURCE OF TRUTH for the card design — it carries placeholder TEXTS (OVR / Job Class / PLAYERNAME / KEY1..KEY6 in 'Bebas Neue' #e6e6e6, positions+sizes parsed as slots) and the crop-path photo area is BACK (no safe-area guideline rects anymore); TIER COLORS APPLIED BY CODE (TIER_PALETTE: plate fill, border gradient stops, text fill — the retired round-4 per-tier SVG palettes moved into cardAssets.ts; pristine keeps card.svg's own Blue_to_Magenta #6e9aff→#ff12f7 verbatim — bright end reads clearly on the #cf1a87 plate); the four per-tier crest SVGs DELETED from the app (.ai design sources kept, pristine.ai owner-update committed); Bebas Neue placeholder swapped to the site's Orbitron on both surfaces (OVR 900 ~256px — the file's 12.093×21.169 matrix hack resolved ONCE in the parser — job/name/points 700, values 600; Orbitron is wider than Bebas so every slot carries a fitText/textLength bound to its ~141px column; PLAYERNAME re-centered horizontally — the file's x anchors a left-aligned Bebas string, recorded decision); round-4 readability locks carried (points type ≥8% of card width); no chips in this design — the per-stat tier field left the export contract; chips/TIER_CHIP_HEX removed; round-3/r4 fallbacks kept (screenshot → class portrait → ASST-01 monogram; photo clipped to the crop path); headless gate rebuilt for Edge 155 (dump-dom broken → harness POSTs to scripts/card-render-check/collect.mjs) and passes ALL 4 palettes at 2160×3200 (frame/crop-photo/border/name/stat glyphs/Orbitron check/aspect gate/taint); full suite 328 green; build green; committed 06dceca + b56dbed + 55e7065 — task 4 re-presented for approval 2026-10-18
- [Phase 07.2]: 07.2-05 round 6 OVERFLOW FIX (owner, 2026-10-18 — round-5 rejected "the card is overflowing, it looks like the shape was reduced but the letters were not. We need to keep a matching proportion and readabilty"): ROOT CAUSE PROVEN IN THE HEADLESS HARNESS — the on-page SVG decided its textLength squeeze with a 0.62em advance ESTIMATE while real Orbitron 700 advances are ~0.834em: a 2-digit points number rendered 213.5px into its 161px column, 52px PAST the plate silhouette ("letters outside the card shape"); the canvas export always measured real metrics, so ONLY the page overflowed (scale tracking was already 2.0002 — text lives in the svg viewBox space). FIX: ONE shared fit contract (cardExport.fitCardText + measureOrbitron) for BOTH surfaces — per slot, measure the string at design size with the REAL loaded font; fits → untouched; else SHRINK THE FONT SIZE proportionally (glyph shape preserved = the owner's proportion/readability rule) down to a 0.55 readability floor; past the floor, emergency horizontal glyph-squeeze (SVG textLength+spacingAndGlyphs / canvas x-scale); CardSvg gates the measurer on document.fonts.ready (conservative 0.8em estimate only during the load flash); plan gains ovr.maxW (insurance, mirrors the job bound). COVERAGE: 6 vitest fit locks incl. the exact regression case + points ≥8% under real widths; the harness gained an ON-PAGE SVG AUDIT (mounts the real CardSvg via React at 360px and 720px, showcase + long-name stress; getComputedTextLength real-font slot bounds + plate containment + scale-tracking name-box-exactly-2× assertion) — RED 13 violations before, GREEN 0 after; canvas tier probes + taint still pass at 2160×3200; full suite 334 green; build green; committed a8f16e8 — task 4 re-presented for approval 2026-10-18

### Blockers/Concerns (open — carry to next milestone)

- **[Pre-release] HARD GATE (SEED-02): run the dummy purge before ANY release** — `node scripts/apply-seed.mjs supabase/seeds/dummy/purge-dummies.sql` then the zero-dummy verification query (four zeros across members/submissions/submission_stats/pin_login_attempts). Dummies are LIVE and resident by owner decision 7; shipping without the purge exposes dummy names on Destaques and distorts every real member's ranks.
- **[Operational] Do NOT revoke JWT signing key 6f7657c3** (standby) — revoking it kills every member session instantly
- **[Pre-launch] Rotate placeholder whitelist rows/PINs before inviting real members** (credentials/hashes recoverable from git history, WR-06; standing action since 03-02). Supabase access token rotation DONE 2026-10-16 (old token was revoked; owner issued a fresh one — value held in session env only, never stored)
- **[Pre-launch] Owner must replace `public/examples/*.svg`** placeholder example shots with real game screenshots before inviting real members (acknowledged 02-03 UAT step 8)
- **[Pending live op] Catalog re-seed of the 6 reclassified flat damage stats** (pve_dmg_bonus, pvp_dmg_bonus, mdmg_bonus, pdmg_bonus, pve_dmg_reduction, pvp_dmg_reduction → 'flat', D-05-UAT-10) via apply-seed.mjs was auth-gated and never run — live catalog still shows the superseded value_type for those six
- **[OCR calibration] Structural reader thresholds need production-data calibration** — spike GO was 100.0% on 11 owner-device samples but device fragmentation is not covered; after a game-UI change, recalibrate the visual grammar in structure.ts (GAME_LABELS, SCREENS row order, probe thresholds) and re-run the harness grid — never pixel fractions

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-10-13:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| todo | power-shift-significance | pending — v2 domain (delta badges / submission history); owner wants combat_power shifts flagged as significant only at thousands scale between submissions |
| uat | 05-UAT.md / 06-UAT.md "unknown" audit flags | false positive — both files carry `status: complete` with owner verbatim approvals recorded; parser artifact, no action needed |

## Session Continuity

Last session: 2026-10-18T23:10:00.000Z
Stopped at: 07.2-05 task 4 re-presented at human-verify (round 6 — measured fit contract overflow fix; owner approval pending, preview live at :4173)
Resume file: .planning/phases/07.2-premium-showcase-game-grounding-inserted/07.2-05-PLAN.md (task 4, checkpoint round 6)

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 07 | 07-01 | ~62 min | 2 | 2 | 2026-10-14 |
| 07 | 07-02 | ~15 min | 2 | 6 | 2026-10-14 |
| 07 | 07-03 | ~96 min (tasks 1-2 + gate close) | 3 | 5 | 2026-10-14 |
| 07 | 07-04 | ~3h (incl. observation window) | 4 | 3 | 2026-10-14 |
| 07.2 | 07.2-01 | ~55 min (across 2 sessions, incl. token rotation) | 3 | 3 | 2026-10-16 |
| 07.2 | 07.2-02 | ~103 min (RED→GREEN TDD) | 2 | 5 | 2026-10-16 |

---
*v1.0 shipped 2026-10-13. v2 deferred items: delta badges (DELT-01), history view (HIST-01), officer guild-health dashboard (OFCR-01), catalog self-service (CAT-01), OCR confidence surfacing (OCRX-01), shareable PNG export (SHAR-01), power-shift significance rule.*
