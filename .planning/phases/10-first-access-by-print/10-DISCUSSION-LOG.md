# Phase 10: Personalized Home Landing Tab - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24T00:00:00.000Z
**Phase:** 10-first-access-by-print
**Areas discussed:** Default tab on login, Início page layout, Destaques slider card width, Animations & skeletons

---

## Animations & skeletons

| Option | Description | Selected |
|--------|-------------|----------|
| Static-only (07.1 D-05) | Zero animations, `prefers-reduced-motion` respected app-wide | |
| Soft animations + skeletons | Smooth, low-complexity animations + skeleton loaders allowed in Phase 10 only | ✓ |

**User's choice:** Overrule 07.1 D-05 for Phase 10 — allow soft animations and skeleton loaders, keep smooth and complexity low. The existing `neon-ring` animation (rotating red conic-gradient frame, `prefers-reduced-motion` safe) is the accepted reference bar for acceptable animation complexity in this project.

**Notes:** rockhall.com is the aesthetic reference (bold, premium). Skeleton loaders replace the static "Carregando…" pattern. Existing pt-BR error/session copy strings preserved.

---

## Default tab on login

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 'painel' default | 'inicio' added to nav but login stays on 'painel' | |
| Default to 'inicio' | Login lands on the new Início tab | ✓ |

**User's choice:** Implicitly roadmap HOME-01 ("members land on a new Início tab") — capture as decision D-04; confirm at planning if intent differs.

---

## Início page layout

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical stack | OvrHero + stale-data CTA + top-3 strip stacked (per plan 10-02) | ✓ |
| Side-by-side desktop | OVR + strip side-by-side, CTA as top banner | |

**User's choice:** Vertical stack per plan 10-02, mirroring DashboardPage mount-fetch pattern.

---

## Destaques slider card width

| Option | Description | Selected |
|--------|-------------|----------|
| Plan 10-03 spec | 1-up mobile full width minus gutter; 3-up desktop ~1/3 width each | ✓ |

**User's choice:** Plan 10-03 spec stands — 1-up mobile, 3-up desktop at `lg`.

---

## OpenCode's Discretion

- Exact soft-animation implementation (CSS transitions/keyframes only, no new npm dependencies)
- Skeleton loader visual design within low-complexity bar
- Exact stale-data CTA pt-BR copy strings (enumeration-safe fixed strings)

---

## Deferred Ideas

- Public visitor homepage — explicitly deferred (owner decision 2026-10-20)
- Animation/skeleton work outside Phase 10 — 07.1 D-05 static-only remains in force for all other phases

---

## Owner correction — 2026-10-24 (UAT round 2): Início IS the landing page

**User:** "the original planning messed up things. Destaques and Inicio were supposed to be the same page - a page that can be seen when a visitor arrives and also visible to logged in users - this is why its called inicio, its a landing page. the tab destaques is follow the right direction, the current tab inicio is pointless"

| Question | Choice |
|----------|--------|
| Who sees the landing page? | **Yes — full public showcase**: name, class, OVR, 6 key stats and photo visible to anonymous visitors; Entrar CTA for personal data. Requires an anon-callable server read path. |
| Tab structure | **One tab**: Início absorbs Destaques (personal blocks for members + showcase for everyone); the Destaques tab is removed. |

**Decisions captured:**
- D-10-04-1: Início is the single landing page and the app's default tab; `'destaques'` leaves the `Tab` union and the nav.
- D-10-04-2: the showcase is public — migration 0029 adds `get_promotion_public()` (same body as `get_promotion`, member gate removed, anon grant) and a storage predicate (`is_public_card_photo`) granting anon read of ACTIVE members' `card-photos` objects. Key-stat config remains unserialised.
- D-10-04-3: logout / expired session / first visit all land on the public Início, not the login card.
- D-10-04-4: 0026 regression fixed — `photo_path` restored on both showcase RPCs, so cards show the member's submitted screenshot again (fallback: class portrait).
- D-10-04-5: `HighlightsPage` is deleted; `PromotionShowcase` is the one showcase tree rendered in both states.

**Supersedes:** the 2026-10-20 "public visitor homepage deferred" decision (recorded above under Deferred Ideas).

---

## Owner correction — 2026-10-24 (UAT round 2, showcase): the carousel must loop

**User:** "lets make it round - the current carousel is like a straight line, if im in the first card, i can see empty space to the left. the behavior should look like a loop, currently it has a beggining and an end"

**Decisions captured:**
- D-10-04-6: the showcase row is an endless loop, not a bounded strip. It renders the server-ordered list three times, starts on the middle copy and silently re-centres there after the scroll settles, so the first card always shows the last one peeking in from the left and the last shows the first on the right. Outer copies are `inert`/`aria-hidden` duplicates; the spotlight is keyed by logical index so the seam jump is invisible (no class/transition change).
- D-10-04-7: arrows and ← →/Home/End never disable and never reach a physical end (except a single-card section); manual flings to either end normalise back into the middle copy. No autoplay — 07.1 D-05 still holds.
- D-10-04-8: the public photo fetch is memoised per storage path (one network request per member) because the loop renders each card three times.

---

## Owner correction — 2026-10-24 (UAT round 3): float the cards + the Phase 10 motion plan

**User:** "i believe that removing the box and let the cards float in space wil give a even more modern edge to our landing - also the plan was supposed to include light animations, like the neon ring we already have, but the model seem to have completed ignored this part of the plan"

**Decisions captured:**
- D-10-04-9: the showcase is panel-less — the class header (crest + name + fading accent rule) and the cards float directly on the neon-grid backdrop; sections are separated by space, never borders.
- D-10-04-10: the Phase 10 soft-motion layer (D-01/D-02) is now on the landing: the existing `neon-ring` on the "Os Impecáveis da Hellz" badge, a staggered card reveal (`showcase-card-in`), and a breathing spotlight halo (`spotlight-breathe`). CSS-only, no new dependencies, all removed by `prefers-reduced-motion`.
- D-10-04-11: D-03 skeletons replace both Phase 10 "Carregando…" states — card-shaped slots for the showcase and OVR/top-3 shapes for the member blocks, with an sr-only status. Error and empty states are floating copy, not panels.

---

## Owner correction — 2026-10-24 (UAT round 4): 3-up row + "Os Impecáveis da Hellz" as the title

**User:** "lets scale the cards to keep only 3 cards in the screen, and also remove the nome destaques, and make 'Os impecáveis da hellz' the title of the landing"

**Decisions captured:**
- D-10-04-12: at lg the carousel is exactly 3-up. The card width is derived from the showcase container (`--carousel-card: calc((100cqw - 2rem) / 3)` on `.showcase-inner`, with `.showcase-root` as the size container), so three cards fill the row and no fourth card peeks in; the skeleton reads the same variable. Mobile keeps the 1-up spotlight with peeking neighbours.
- D-10-04-13: "Destaques" is gone. "Os Impecáveis da Hellz" is the landing title (`h1`; the pill keeps the neon ring), and the class names move from h3 to h2. The title is 20/30/36px across mobile/sm/lg so it stays on one line at 375px.
