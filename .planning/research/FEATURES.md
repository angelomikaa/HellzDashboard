# Feature Research

**Domain:** Guild stat-tracking web panel for a single Ragnarok Origin guild (screenshot OCR input, percentile/EAFC-style rating)
**Researched:** 2026-10-07
**Confidence:** HIGH for project-internal features (from PROJECT.md + verified tooling); LOW/MEDIUM for ecosystem comparisons (no websearch tool available in this environment — competitor claims come from training data only and are flagged per-row)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken and members stop submitting.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Character registry (create/edit/delete character: name, class, function/role e.g. tank vs DPS) | Every comparison feature depends on knowing who you are and what class/function you play | LOW | Single table + form; class/function enum must be extensible by admins (RO Origin adds classes over time) |
| Guided screenshot upload (3 shots per character: General, Quasi, Special) with example shots beside input boxes | Without examples, members submit unreadable/wrongly-cropped screenshots and abandon the flow | LOW–MEDIUM | Static example images + file upload per slot; validate image type/size; wider shot option for the cropped "Special" screen |
| OCR auto-read + manual fix-up before submission is accepted | Screenshot is the source of truth; raw OCR is never trusted (Tesseract.js explicitly does not improve recognition accuracy — MEDIUM, verified via official repo) | HIGH | This is the hardest table-stakes item. Tesseract.js v5+ runs in-browser (WebAssembly), supports 100+ languages incl. `chi_sim`/`por`; v4+ adds grayscale/binarize/rotate preprocessing. Expect heavy per-screen position tuning (region-of-interest extraction + label anchoring by known stat names) rather than whole-image OCR |
| Stat storage across all 3 groups (flat AND percentage values, labeled FLAT/PERCENTUAL) | The panel's entire value is "store all status data" | MEDIUM | ~50+ stats per character, mixed types; need a stat-catalog config table (id, group, label, value_type) so new stats don't require migrations; store submissions immutably for deltas/history |
| Own dashboard ("my stat cards") | Members come to see their own data; without it there's no reason to log in | MEDIUM | Renders stored stats as cards; must work on mobile — RO Origin players will browse from their phones |
| Per-stat percentile rank within class (top 1% = 99 pts) | Core EAFC feel; members expect a 0–99 number per stat | MEDIUM | Percentile within same class + function; needs enough submissions per class to be meaningful (show "insufficient data" state early on) |
| Overall rating (OVR) from 6 key stats per class, floor of 51 | EAFC-style headline number; gives one-glance standing | MEDIUM | OVR = derived percentile from the 6 key stats; floor 51 is a normalization rule; recompute OVR on key-stat changes (see Differentiators) |
| Delta badges vs last submission (e.g. ▲ 5.00%) | Players expect to see progress over time after resubmitting | LOW | Diff current submission vs previous per stat; format flat vs percent separately |
| Officer validation/moderation (approve/reject registers, remove players, block non-guild members) | Any community tool needs moderation; officers are the trust layer | MEDIUM | Role elevation on top of PIN auth; officer queue of pending submissions; only validated members/registers count toward ranks |
| 4-digit PIN auth + guild-member whitelist | Friction must be near zero for mobile guild members; accounts would kill adoption | LOW | PIN + character-name pairing; whitelist enforced at registration (officer-approved); no email/password |
| Mobile-first responsive UI | The guild lives on mobile (game is mobile; comms via WhatsApp/Discord mobile) | MEDIUM | Design cards and upload flow thumb-first; OCR happens client-side so phone cameras are first-class input |
| Per-class/function comparison scoping everywhere | "How do I compare to Assassins" only makes sense within class+function | LOW | Cross-cutting rule: every aggregate/rank query filters by class + function |

### Differentiators (Competitive Advantage)

Features that set NeoFoot apart from generic guild trackers and spreadsheet-based stat sheets.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Admin-tweakable key stats per class (exactly 6, toggleable, hidden from members) | No mainstream guild tracker lets admins redefine what "good" means per class; hidden keys prevent stat gaming | MEDIUM | Admin UI: toggle any stat to key per class, enforce exactly 6; key-stat set must NOT be exposed in member-facing API responses (server-side filtering, not just UI hiding) |
| Improvement guidelines screen ("you're in the bottom 30% of Assassins for CRIT" + guild average + best-in-guild) | This is NeoFoot's core value: tells each player exactly what to fix | MEDIUM | Per-stat card: player value, class average, top value, percentile position; aggregates only — never other individuals' values |
| Tiered stat cards (bronze/silver/gold/platinum) | Gamified visual status that members want to show off; drives resubmission loops | LOW–MEDIUM | Tier thresholds derived from percentile points; own visual identity, not a copy of the reference model |
| Promotion page: top players as EAFC-style cards | Celebrates the best players; gives officers a recruitment/retention talking point | MEDIUM | Public within guild; shows key stats as big cards; needs OVR + tiers + rank ordering |
| Shareable card image export (render stat card to PNG for Discord/WhatsApp) | Guild tools live and die by shareability; a card image spreads the panel virally inside the guild | LOW | html2canvas or server-side SVG render; high engagement return for tiny cost |
| Submission history / progression view (line of OVR and key stats over time) | "Am I improving?" answered with a trend, not just a delta | MEDIUM | Immutable submissions make this nearly free to add later; defer to v1.x |
| Officer guild-health dashboard (participation %, who hasn't submitted, OCR failure rate) | Officers need to know who's not engaging without chasing manually | MEDIUM | Aggregate-only; natural v1.x addition once submission data accumulates |
| OCR confidence surfacing (highlight low-confidence fields for review) | Turns OCR from a black box into a trustworthy assist; officers trust the data | MEDIUM | Tesseract.js word-level confidence via `blocks` output (MEDIUM, official repo); auto-flag fields below threshold for manual fix-up |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build. These are already mostly in PROJECT.md Out of Scope — documented here with reasoning to prevent scope creep.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-guild support | "Other guilds will want this" | Multi-tenancy multiplies auth, data isolation, and admin complexity for a tool with one real user community; kills the simple PIN model | Single guild; if demand appears, deploy a second instance instead of building tenancy |
| Chat / announcements / events | "Put everything in one place" | Discord/WhatsApp already do this infinitely better; chat is a maintenance and moderation burden | Link out to the guild's Discord/WhatsApp; keep the panel stats-only (core loop) |
| Real-time sync with the game / game API | "Manual screenshots are tedious" | RO Origin has no public API; scraping/automation violates ToS and breaks constantly | The screenshot + OCR pipeline IS the sync mechanism; reduce friction instead (guided flow, OCR confidence) |
| Fully automatic OCR with zero manual review | "Manual fix-up is tedious" | Tesseract.js does not modify the recognition model; game UI fonts/backgrounds cause silent misreads (8→3, 5→6); a silently wrong stat poisons every rank built on it | OCR auto-fills + mandatory review/fix-up gate before a register is accepted; confidence-based field highlighting |
| Members viewing other individual players' raw stats | "I want to see the top player's build" | Destroys trust and privacy; invites comparison toxicity; enables copying instead of improvement | Members see aggregates (average, best value, percentile) only; promotion page is the sanctioned way to see top players |
| Full account system (email/password, email verification, password reset) | "PIN is insecure" | Massive friction for a mobile guild community; nobody completes email verification to view a stat card | 4-digit PIN + character name + officer validation; whitelist is the real security boundary |
| Exposing which stats are "key" to members | "Players deserve to know what counts" | Defeats the anti-gaming design: members would min-max exactly the 6 key stats to inflate OVR | Keys visible to admins/officers only; server-side response filtering |
| Complex ranking formula builder (pluggable math, weight sliders) | "Admins will want full control" | Formula builders are a UI/config nightmare and create non-comparable historical ranks when tweaked | Exactly 6 key stats per class, equal treatment, admin toggles stat in/out; version the key-stat config so historical OVR is recomputable |
| Public (outside-guild) leaderboards | "Show off the guild" | Exposes members' data beyond the trust boundary; no consent model exists | Guild-internal promotion page only |

## Feature Dependencies

```
[Class/function definitions]
    └──requires─?> [Character registry]
                      └──requires─?> [PIN auth + whitelist]
                                        └──requires─?> [Officer validation] ──enhances─?> [Data trust for all ranks]

[Screenshot upload + example shots]
    └──requires─?> [OCR auto-read]
                      └──requires─?> [Manual fix-up gate]
                                        └──requires─?> [Stat storage (submissions, immutable)]

[Stat storage]
    ├──requires─?> [Per-stat percentile ranking]
    │                 └──requires─?> [Overall rating (OVR, floor 51)]
    │                                   └──requires─?> [Tiered stat cards]
    │                                                 └──requires─?> [Promotion page]
    ├──requires─?> [Improvement guidelines screen] ──enhances─?> [Core value: "what to fix"]
    └──requires─?> [Delta badges] (needs ≥2 submissions)

[Key-stat admin config (6 per class, hidden)]
    └──requires─?> [Stat catalog config]
                      └──requires─?> [Overall rating (OVR)]

[Shareable card image] ──enhances─?> [Tiered stat cards / Promotion page]
[Submission history]   ──enhances─?> [Delta badges]
[Officer health dashboard] ──requires─?> [Stat storage + officer validation]
```

### Dependency Notes

- **All ranking features require Stat storage with immutable submissions:** percentile, OVR, deltas, and history all read from a submission log; design the submissions table append-only from day one — retrofitting immutability is painful.
- **OVR requires Key-stat admin config, which requires the stat catalog:** the stat catalog (stat id, group, label, value_type) is the foundation; key-stat toggles and OCR label-anchoring both hang off it. Build the catalog first.
- **Promotion page requires OVR + tiers + percentile:** it's the most downstream feature; never schedule it before ranking exists.
- **Delta badges require ≥2 submissions per player:** early users see no deltas — ship an explicit "no previous submission" state rather than a broken badge.
- **Percentile requires multiple validated players per class:** with 2 Assassins, percentiles are meaningless; need an "insufficient data" state and possibly seeding by officers first.
- **Officer validation enhances every rank:** ranks computed from unvalidated submissions are gameable (anyone can join with fake stats); validation is what makes the data trustworthy.
- **Hidden key stats conflict with any member-facing API that returns the full stat config:** enforce key hiding server-side, or UI hiding leaks it.

## MVP Definition

### Launch With (v1)

The core loop: register → submit → see standing → improve → resubmit. Everything here is required for the loop to close.

- [ ] PIN auth + guild-member whitelist + officer elevation (owner grants) — trust boundary
- [ ] Class/function definitions + character registry — foundation for all comparisons
- [ ] Stat catalog (all 3 groups, flat/percent value types) — foundation for OCR + config
- [ ] Guided 3-screenshot upload with example shots + wider "Special" shot option — the input pipeline
- [ ] OCR auto-read (Tesseract.js, region-based) + mandatory manual fix-up gate before acceptance — the friction reducer
- [ ] Immutable stat storage per submission — the source of truth
- [ ] Per-stat percentile within class+function (top 1% = 99 pts, with insufficient-data state) — the EAFC feel
- [ ] OVR from 6 admin-tweakable key stats per class, floor of 51, keys hidden server-side — the headline number
- [ ] Own dashboard with stat cards (mobile-first) — the reason to come back
- [ ] Improvement screen (player value vs class average vs best, percentile position, aggregates only) — the core value
- [ ] Delta badges vs last submission (with "first submission" state) — the progress signal
- [ ] Tiered stat cards (bronze/silver/gold/platinum) — the gamification
- [ ] Officer validation queue (approve/reject registers, remove players) — the moderation layer
- [ ] Promotion page with top players as EAFC-style cards — the celebration

### Add After Validation (v1.x)

Features to add once the core loop is proven and data has accumulated.

- [ ] Shareable card image export (PNG/SVG) — trigger: members ask "can I post my card?"; tiny cost, big spread
- [ ] Submission history / progression trends (OVR over time) — trigger: ≥3 submissions per player become common
- [ ] Officer guild-health dashboard (participation, non-submitters, OCR failure rate) — trigger: officers complain about chasing members manually
- [ ] OCR confidence surfacing + auto-flag low-confidence fields — trigger: real-world OCR error patterns known from actual guild screenshots
- [ ] Stat catalog self-service additions by admins — trigger: game update adds stats not in the catalog

### Future Consideration (v2+)

Features to defer until the concept is validated with the guild.

- [ ] Second-instance tooling (export/import to clone the panel for another guild) — why defer: only if demand is real; avoids building multi-tenancy
- [ ] Recommended-build hints (compare against top-quartile composite profile) — why defer: depends on rich data and is adjacent to "advice" content the guild may prefer to author itself
- [ ] PWA/offline mode — why defer: panel is a quick-check tool, not a daily driver

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| PIN auth + whitelist + officer elevation | HIGH | LOW | P1 |
| Class/function definitions + character registry | HIGH | LOW | P1 |
| Stat catalog (3 groups, flat/percent) | HIGH | MEDIUM | P1 |
| Guided 3-screenshot upload + examples | HIGH | LOW–MEDIUM | P1 |
| OCR auto-read + manual fix-up gate | HIGH | HIGH | P1 |
| Immutable stat storage | HIGH | MEDIUM | P1 |
| Per-stat percentile (99-pt scale) | HIGH | MEDIUM | P1 |
| OVR from 6 hidden key stats, floor 51 | HIGH | MEDIUM | P1 |
| Own dashboard (mobile-first stat cards) | HIGH | MEDIUM | P1 |
| Improvement screen (vs average/best/percentile) | HIGH | MEDIUM | P1 |
| Delta badges | MEDIUM | LOW | P1 |
| Tiered stat cards | MEDIUM | LOW–MEDIUM | P1 |
| Officer validation queue | HIGH | MEDIUM | P1 |
| Promotion page (EAFC cards) | MEDIUM | MEDIUM | P2 |
| Shareable card image export | MEDIUM | LOW | P2 |
| Submission history / trends | MEDIUM | MEDIUM | P2 |
| Officer guild-health dashboard | MEDIUM | MEDIUM | P2 |
| OCR confidence surfacing | MEDIUM | MEDIUM | P2 |
| Multi-guild / chat / real-time sync / accounts | LOW (for this product) | HIGH | P3 (anti-features — do not build) |

**Priority key:**
- P1: Must have for launch (core loop closes without it)
- P2: Should have, add after validation
- P3: Deliberately out of scope

## Competitor Feature Analysis

⚠️ **Confidence note:** No websearch tool was available in this environment; competitor rows below come from training data (6–18 months stale) and are LOW confidence unless marked. They establish the landscape shape, not exact feature parity. Verify during phase research if a direct comparison matters.

| Feature | Generic guild trackers (Enjin/Shivtr class) | Stat/gear trackers (Raider.IO, poe.ninja class) | FUTBIN/PvPoke class (rating sites) | Our Approach |
|---------|---------------------------------------------|--------------------------------------------------|-------------------------------------|--------------|
| Data input | Manual forms, forum posts | Automatic API ingestion from the game | Manual + crowdsourced database | Screenshot OCR + manual fix-up (no API exists for RO Origin) |
| Percentile/rating | Rare; simple leaderboards | Core feature (Raider.IO score, poe.ninja percentiles) | Core feature (FUT ratings, PvPoke rankings) | Per-stat 99-pt percentile + OVR from 6 key stats |
| Tiered visual cards | No | No | Yes — this is their signature look | Yes: bronze→platinum, own visual identity |
| Improvement advice | No | Partial (build guides, but not personalized) | No (they rate, they don't coach) | Yes: personalized "bottom 30% of Assassins for CRIT" vs average/best — **our strongest differentiator** |
| Admin-configurable rating math | No | No (fixed formulas) | No | Yes: 6 toggleable key stats per class, hidden from members |
| Privacy model | Public everything | Public by design | Public by design | Guild-internal, aggregates for members, promotion page for tops |
| Moderation/roles | Yes (their strength) | Minimal | No | Yes: officer validation + whitelist, PIN-based |
| Progress over time | No | Partial | No | Delta badges at launch; trends in v1.x |
| Shareability | Forum-dependent | URL sharing | Card image sharing (signature feature) | Card image export in v1.x |

**Landscape takeaway:** No existing product combines (a) personalized improvement coaching, (b) admin-tweakable rating math, and (c) a privacy-respecting guild-internal model. NeoFoot's moat is the improvement screen + hidden key stats; the EAFC cards and shareable exports are the spread mechanism. The riskiest table-stakes item is the OCR pipeline — everything downstream inherits its accuracy.

## MVP Recommendation

Prioritize in order:
1. **Stat catalog + character registry + auth/whitelist** — the foundation everything hangs off
2. **Screenshot upload → OCR → manual fix-up → immutable storage** — the input pipeline; the highest-risk, highest-friction table-stakes item
3. **Percentile + OVR + own dashboard + improvement screen** — the core value loop
4. **Delta badges + tier cards + officer queue + promotion page** — the gamification and trust layers that close the loop

Defer:
- **Card image export:** trivial to add later, not needed to validate the loop
- **Trends/history views:** deltas already answer "am I improving?" at launch
- **Guild-health dashboard:** only valuable once submission data accumulates

De-risking note (for roadmap): the OCR pipeline is the only HIGH-cost table-stakes feature. Consider shipping the manual fix-up gate fully first (upload + review form), then layering OCR auto-fill into the same form — the data model and flow are identical, and the panel is usable even on days OCR fails. This matches PROJECT.md's decision (OCR auto-read + fix-up) without betting the launch on OCR accuracy.

## Sources

- PROJECT.md — NeoFoot project context, requirements, decisions (HIGH, project-internal)
- Tesseract.js official repository (github.com/naptha/tesseract.js) — browser/Node OCR via WebAssembly, 100+ languages incl. `chi_sim`/`por`, v4+ preprocessing (grayscale/binarize/rotate), v5+ worker API and smaller models, word-level `blocks` output, explicit statement that it does not modify recognition accuracy (MEDIUM–HIGH, verified 2026-10-07)
- Scribe.js (github.com/scribeocr/scribe.js) — referenced by Tesseract.js as the alternative with improved recognition model, relevant if OCR accuracy proves insufficient (LOW, unverified here)
- Competitor landscape (Enjin/Shivtr, Raider.IO, poe.ninja, FUTBIN, PvPoke patterns) — LOW confidence, training data only, no websearch tool available in this environment

---
*Feature research for: Ragnarok Origin guild stat-tracking web panel (NeoFoot)*
*Researched: 2026-10-07*
