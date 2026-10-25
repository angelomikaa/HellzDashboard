# Phase 10: Personalized Home Landing Tab - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md ‚Äî this log preserves the alternatives considered.

**Date:** 2026-10-24T00:00:00.000Z
**Phase:** 10-first-access-by-print
**Areas discussed:** Default tab on login, In√≠cio page layout, Destaques slider card width, Animations & skeletons

---

## Animations & skeletons

| Option | Description | Selected |
|--------|-------------|----------|
| Static-only (07.1 D-05) | Zero animations, `prefers-reduced-motion` respected app-wide | |
| Soft animations + skeletons | Smooth, low-complexity animations + skeleton loaders allowed in Phase 10 only | ‚úì |

**User's choice:** Overrule 07.1 D-05 for Phase 10 ‚Äî allow soft animations and skeleton loaders, keep smooth and complexity low. The existing `neon-ring` animation (rotating red conic-gradient frame, `prefers-reduced-motion` safe) is the accepted reference bar for acceptable animation complexity in this project.

**Notes:** rockhall.com is the aesthetic reference (bold, premium). Skeleton loaders replace the static "Carregando‚Ä¶" pattern. Existing pt-BR error/session copy strings preserved.

---

## Default tab on login

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 'painel' default | 'inicio' added to nav but login stays on 'painel' | |
| Default to 'inicio' | Login lands on the new In√≠cio tab | ‚úì |

**User's choice:** Implicitly roadmap HOME-01 ("members land on a new In√≠cio tab") ‚Äî capture as decision D-04; confirm at planning if intent differs.

---

## In√≠cio page layout

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical stack | OvrHero + stale-data CTA + top-3 strip stacked (per plan 10-02) | ‚úì |
| Side-by-side desktop | OVR + strip side-by-side, CTA as top banner | |

**User's choice:** Vertical stack per plan 10-02, mirroring DashboardPage mount-fetch pattern.

---

## Destaques slider card width

| Option | Description | Selected |
|--------|-------------|----------|
| Plan 10-03 spec | 1-up mobile full width minus gutter; 3-up desktop ~1/3 width each | ‚úì |

**User's choice:** Plan 10-03 spec stands ‚Äî 1-up mobile, 3-up desktop at `lg`.

---

## OpenCode's Discretion

- Exact soft-animation implementation (CSS transitions/keyframes only, no new npm dependencies)
- Skeleton loader visual design within low-complexity bar
- Exact stale-data CTA pt-BR copy strings (enumeration-safe fixed strings)

---

## Deferred Ideas

- Public visitor homepage ‚Äî explicitly deferred (owner decision 2026-10-20)
- Animation/skeleton work outside Phase 10 ‚Äî 07.1 D-05 static-only remains in force for all other phases

---

## Owner correction ‚Äî 2026-10-24 (UAT round 2): In√≠cio IS the landing page

**User:** "the original planning messed up things. Destaques and Inicio were supposed to be the same page - a page that can be seen when a visitor arrives and also visible to logged in users - this is why its called inicio, its a landing page. the tab destaques is follow the right direction, the current tab inicio is pointless"

| Question | Choice |
|----------|--------|
| Who sees the landing page? | **Yes ‚Äî full public showcase**: name, class, OVR, 6 key stats and photo visible to anonymous visitors; Entrar CTA for personal data. Requires an anon-callable server read path. |
| Tab structure | **One tab**: In√≠cio absorbs Destaques (personal blocks for members + showcase for everyone); the Destaques tab is removed. |

**Decisions captured:**
- D-10-04-1: In√≠cio is the single landing page and the app's default tab; `'destaques'` leaves the `Tab` union and the nav.
- D-10-04-2: the showcase is public ‚Äî migration 0029 adds `get_promotion_public()` (same body as `get_promotion`, member gate removed, anon grant) and a storage predicate (`is_public_card_photo`) granting anon read of ACTIVE members' `card-photos` objects. Key-stat config remains unserialised.
- D-10-04-3: logout / expired session / first visit all land on the public In√≠cio, not the login card.
- D-10-04-4: 0026 regression fixed ‚Äî `photo_path` restored on both showcase RPCs, so cards show the member's submitted screenshot again (fallback: class portrait).
- D-10-04-5: `HighlightsPage` is deleted; `PromotionShowcase` is the one showcase tree rendered in both states.

**Supersedes:** the 2026-10-20 "public visitor homepage deferred" decision (recorded above under Deferred Ideas).

---

## Owner correction ‚Äî 2026-10-24 (UAT round 2, showcase): the carousel must loop

**User:** "lets make it round - the current carousel is like a straight line, if im in the first card, i can see empty space to the left. the behavior should look like a loop, currently it has a beggining and an end"

**Decisions captured:**
- D-10-04-6: the showcase row is an endless loop, not a bounded strip. It renders the server-ordered list three times, starts on the middle copy and silently re-centres there after the scroll settles, so the first card always shows the last one peeking in from the left and the last shows the first on the right. Outer copies are `inert`/`aria-hidden` duplicates; the spotlight is keyed by logical index so the seam jump is invisible (no class/transition change).
- D-10-04-7: arrows and ‚Üê ‚Üí/Home/End never disable and never reach a physical end (except a single-card section); manual flings to either end normalise back into the middle copy. No autoplay ‚Äî 07.1 D-05 still holds.
- D-10-04-8: the public photo fetch is memoised per storage path (one network request per member) because the loop renders each card three times.

---

## Owner correction ‚Äî 2026-10-24 (UAT round 3): float the cards + the Phase 10 motion plan

**User:** "i believe that removing the box and let the cards float in space wil give a even more modern edge to our landing - also the plan was supposed to include light animations, like the neon ring we already have, but the model seem to have completed ignored this part of the plan"

**Decisions captured:**
- D-10-04-9: the showcase is panel-less ‚Äî the class header (crest + name + fading accent rule) and the cards float directly on the neon-grid backdrop; sections are separated by space, never borders.
- D-10-04-10: the Phase 10 soft-motion layer (D-01/D-02) is now on the landing: the existing `neon-ring` on the "Os Impec√°veis da Hellz" badge, a staggered card reveal (`showcase-card-in`), and a breathing spotlight halo (`spotlight-breathe`). CSS-only, no new dependencies, all removed by `prefers-reduced-motion`.
- D-10-04-11: D-03 skeletons replace both Phase 10 "Carregando‚Ä¶" states ‚Äî card-shaped slots for the showcase and OVR/top-3 shapes for the member blocks, with an sr-only status. Error and empty states are floating copy, not panels.

---

## Owner correction ‚Äî 2026-10-24 (UAT round 4): 3-up row + "Os Impec√°veis da Hellz" as the title

**User:** "lets scale the cards to keep only 3 cards in the screen, and also remove the nome destaques, and make 'Os impec√°veis da hellz' the title of the landing"

**Decisions captured:**
- D-10-04-12: at lg the carousel is exactly 3-up. The card width is derived from the showcase container (`--carousel-card: calc((100cqw - 2rem) / 3)` on `.showcase-inner`, with `.showcase-root` as the size container), so three cards fill the row and no fourth card peeks in; the skeleton reads the same variable. Mobile keeps the 1-up spotlight with peeking neighbours.
- D-10-04-13: "Destaques" is gone. "Os Impec√°veis da Hellz" is the landing title (`h1`; the pill keeps the neon ring), and the class names move from h3 to h2. The title is 20/30/36px across mobile/sm/lg so it stays on one line at 375px.

---

## Owner correction ó 2026-10-25 (UAT round 5): the class identity joins the carousel

**User:** "move the icon, the name 'sumo sacedorte' and the carousel controls to inside the carousel box"

**Decisions captured:**
- D-10-04-14: the class crest, the class name and the arrows are ONE bar inside HighlightsCarousel ([crest] Class name -------- [ã][õ]) directly above the cards; PromotionShowcase no longer renders a class header. The fading rule is hidden below sm so the name and the arrows share one line on phones.

---

## Owner correction ó 2026-10-25 (UAT round 6): one class at a time, rotating (rebuilt from a failed draft)

**User:** "these files were made by another model that failed, lets review them and proceed with the work" ó the draft showed one Impec·vel class at a time with auto-advance, a progress bar and a class switcher; the review found a never-advancing timer (classIndex ?? 0 + 1 precedence), a 100ms progress interval, no pause control, silent class swaps, an unclamped index that could blank the showcase, an overflowing token and a layout-bobbing download button.

**Decisions captured:**
- D-10-04-15: the showcase renders ONE class at a time and rotates to the next every AUTO_ADVANCE_MS (30s, owner-requested), wrapping at the ends. The machine lives in PromotionShowcase/ClassRotation ABOVE the keyed per-class carousel remount so pause state survives class switches; the index is clamped when sections shrink after a refetch.
- D-10-04-16: rotation is pausable three ways (WCAG 2.2.2): an explicit ?/? toggle, pointer hover, and keyboard focus within the showcase; reasons stack and the remaining wall-clock time is captured at the pause instant so resume CONTINUES the window. Card navigation (arrows, keyboard, wheel, touch) re-arms the window ó browsing a class defers the rotation. A persistent sr-only live region announces "Classe n de N: <classe>" on every change.
- D-10-04-17: the window indicator is a CSS drain bar (class-drain in index.css) frozen via nimation-play-state under [data-paused] ó zero interval re-renders, covered by the global prefers-reduced-motion kill-switch (the rotation itself is a discrete remount, not motion). The class stepper is ã n/N õ (wrap-around, distinct guillemet glyphs vs the card arrows' ?/?); the count is aria-hidden decoration ó the live region is the accessible channel.
- D-10-04-18: "Baixar card" renders on every slot but visibility-hidden off-spotlight (the failed draft unmounted it, bobbing the items-center row): neighbours stay decluttered AND the row height is constant during spotlight moves.
- D-10-04-19: rotation helpers are pure and unit-locked in carousel.ts (AUTO_ADVANCE_MS = 30_000, clampClassIndex, wrapClassIndex; 18/18 tests). Card-level autoplay remains forbidden (07.1 D-05 holds) ó only the CLASS slot rotates.

---

## Owner correction ó 2026-10-25 (card polish round 7): the photo frame must not crop the head

**User:** "one last polishment in the cards - the head of the placeholders are often cut off, we must adjust the frame of the placeholders to be a shot from the tighs and above, meaning we can hidden most of the legs instead of the head"

**Decisions captured:**
- D-10-04-20: the card photo fit is HEAD-SAFE TOP-ANCHORED on both surfaces ó SVG xMidYMin slice and a canvas drawImage pinned to the crop window's top edge. Vertical-center cover-fit beheaded the full-body class portraits (and tall phone screenshots); the top anchor hides the legs instead, per the owner's "thighs and above" framing. Wide/landscape images fit by height and are untouched by the anchor.
- D-10-04-21: the card-render-check render-diff now uses a PORTRAIT test photo (360◊480 ó taller than the crop window's 1.089 ratio), so the 0-diff gate LOCKS the anchor contract across the on-page SVG, the canvas export and the file-side reference; the old wide test photo made center vs top anchoring indistinguishable to the diff. A follow-up tighter crop (mid-thigh instead of knee) would need the image's measured aspect on the SVG side ó recorded as an offered follow-up, not shipped.

---

## Owner correction ó 2026-10-25 (card polish round 8): measured framing + the H mark ruling

**User:** "we need to go down further - heads are still too close to the border, enough to cause visual imbalance with the card info below. the H symbol alignment must be a planned exception to the card layout, not a rule"

**Decisions captured:**
- D-10-04-22: the card photo fit is now MEASURED, not anchor-based. One pure contract (cardAssets.photoDestRect + measurePhotoSubject, a downscaled alpha scan) frames subject art head-to-thigh: the opaque figure expanded by head/side margins (PHOTO_FRAME 0.10/0.05 of figure height), cut at 0.58 of the figure, cover-fit so the body fills the crop window. The High Priest head now sits ~11.6% of the window below the top border (was ~6.7% with the round-7 anchor) and the crop lands at mid-thigh (was ~knee) ó the composition balances against the name/stat bands below. Opaque member screenshots keep the round-7 top-anchored cover verbatim. The on-page SVG measures through a cache-hot probe HTMLImageElement (SVGImageElement exposes no natural size); all three paint sites (on-page SVG, canvas export, harness reference) share the one function, and the render-diff is 0/0 on every tier with a new subject-style test photo that actually exercises the measured path.
- D-10-04-23: the Hellz brand mark ({y: 1408, size: 54}, centered in the plate tip) is a PLANNED EXCEPTION to the card layout ó position and size are never derived from the parsed slots, the photo frame, or any layout rule, and no other element aligns to it; it stays byte-identical across card layout changes ("not a rule").
