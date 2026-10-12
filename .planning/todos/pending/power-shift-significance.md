---
created: 2026-10-12
source: Phase 5 owner UAT round 4 (D-05-UAT-11, verbatim in 05-UAT.md)
resolves_phase:
---

# Power-shift significance rule (comparing submissions)

Owner observation (verbatim): "power in the game is somewhat volatile, minor tweaks might cost hundreds in power. shifts in power are only relevant when they are in the thousands between submissions."

A gameplay-significance rule for combat_power — e.g. flagging/celebrating only thousands-scale shifts between a player's submissions — does NOT belong to the OCR layer (reads stay exact vs what's printed; only test acceptance is tolerance-based). It fits the v2 deferred delta-badges / submission-history domain, where consecutive submissions are already compared.

Candidate placement: v1.1+ delta badges (v2 deferred list in STATE.md) or the submission-history view.
