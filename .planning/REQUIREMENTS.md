# Requirements: NeoFoot — Guild Stats Panel

**Defined:** 2026-10-07
**Core Value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.

## v1 Requirements

Requirements for initial release (MVP — will be escalated later). Each maps to roadmap phases.

### Access & Auth

- [ ] **AUTH-01**: Player can access the panel with their personal 4-digit PIN (stored hashed)
- [ ] **AUTH-02**: Only whitelisted guild members can access; players from other guilds are blocked
- [ ] **AUTH-03**: Owner can grant or revoke the officer (admin) role manually
- [ ] **AUTH-04**: Officers can remove players, revoking their panel access
- [ ] **AUTH-05**: Officers can validate or reject submitted registers before they count toward ranks

### Registry & Catalog

- [ ] **REG-01**: Admin can register a character with name, class, and function/role (e.g. tank vs DPS)
- [ ] **REG-02**: Class list is extensible by an admin (Ragnarok Origin adds classes over time)
- [ ] **REG-03**: Stat catalog covers all 3 groups (General Stats, Quasi-Stats, Special) with flat and percent value types (~50+ stats, labeled FLAT/PERCENTUAL)

### Data Input

- [ ] **INPT-01**: Player can submit stats via guided 3-screenshot upload (General, Quasi, Special) with example shots shown beside input boxes
- [ ] **INPT-02**: OCR auto-reads screenshots (client-side, region-based) and pre-fills values
- [ ] **INPT-03**: Player must review and fix OCR results before submission is accepted (mandatory fix-up gate)
- [ ] **INPT-04**: Submissions are stored immutably (append-only) as the source of truth for ranks and future deltas

### Ranking & Rating

- [ ] **RNK-01**: Admin can select exactly 6 key stats per class via toggle (independent set per class)
- [ ] **RNK-02**: Key stats are hidden from members server-side (not just UI-hidden — DevTools must not leak them)
- [ ] **RNK-03**: Panel computes the overall (OVR) from the 6 key stats of the player's class, with a normalization floor of 51 (never below 51)
- [ ] **RNK-04**: Panel computes per-stat percentile rank within same class+function (rank-based points: `(count_below / (n-1)) × 99`, preserving EAFC feel at guild scale)
- [ ] **RNK-05**: Ranks display an "insufficient data" state when too few validated players exist per class

### Comparison & Dashboard

- [ ] **CMP-01**: Player sees their own dashboard with stat cards (mobile-first responsive)
- [ ] **CMP-02**: Player sees per-stat comparison: their value, guild average for their class, best in guild, and percentile position (e.g. "you're in the bottom 30% of Assassins for CRIT")
- [ ] **CMP-03**: Members see aggregates only — never other individual players' values

### Showcase

- [ ] **SHWC-01**: Stat cards are tiered: bronze for mediocre stats, silver for mildly elevated, gold for highly elevated, platinum for top of the class (own visual identity, not a copy of the reference model)
- [ ] **SHWC-02**: Promotion page shows top players as EAFC-style cards to promote the best players in the guild

## v2 Requirements

Deferred to future release (escalation after MVP). Tracked but not in current roadmap.

### Progress

- **DELT-01**: Delta badges show change since the player's last submission (e.g. ▲ 5,00%), with an explicit "first submission" state
- **HIST-01**: Submission history / progression view (OVR and key stats over time)

### Officer Tools

- **OFCR-01**: Officer guild-health dashboard (participation %, who hasn't submitted, OCR failure rate)
- **CAT-01**: Stat catalog self-service additions by admins (no dev help needed)

### OCR Enhancements

- **OCRX-01**: OCR confidence surfacing — auto-flag low-confidence fields for review

### Shareability

- **SHAR-01**: Shareable card image export (render stat card to PNG for Discord/WhatsApp)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-guild support | Single guild, one panel — if demand appears, deploy a second instance instead of building tenancy |
| Chat / announcements / events | Discord/WhatsApp already do this better; panel is stats-only (core loop) |
| Real-time sync with the game / game API | Ragnarok Origin has no public API; scraping violates ToS — the screenshot+OCR pipeline IS the sync mechanism |
| Fully automatic OCR with zero manual review | Game UI fonts/backgrounds cause silent misreads that poison every rank built on them — mandatory fix-up gate is non-negotiable |
| Full account system (email/password, verification, reset) | Massive friction for a mobile guild community; per-player 4-digit PIN + whitelist is the boundary |
| Members viewing other individual players' raw stats | Destroys trust and privacy; members see aggregates only; promotion page is the sanctioned view of top players |
| Exposing which stats are "key" to members | Defeats anti-gaming design: members would min-max exactly the 6 key stats to inflate OVR |
| Complex ranking formula builder (weight sliders, pluggable math) | Exactly 6 key stats per class with admin toggles; formula builders create non-comparable historical ranks |
| Public (outside-guild) leaderboards | Exposes members' data beyond the trust boundary; no consent model exists |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (pending roadmap creation) | — | — |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 0
- Unmapped: 20 ⚠️

---
*Requirements defined: 2026-10-07*
*Last updated: 2026-10-07 after initial definition*
