# Phase 6: Trust & Celebration — Officer Tools & Promotion Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-11
**Phase:** 6-Trust & Celebration — Officer Tools & Promotion Page
**Areas discussed:** Todo fold (owner-only-class-management), Promotion card contents, Validation queue & reject semantics, Removal & role management UX, Promotion page shape & visibility

---

## Todo fold: owner-only-class-management

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into Phase 6 (Recommended) | Phase 6 touches officer role boundaries anyway — one server-side policy change + UI gating closes the 03-04 UAT todo | ✓ |
| Keep pending | Leave it for a future phase; Phase 6 stays strictly AUTH-03/04/05 + SHWC-02 | |

**User's choice:** Fold into Phase 6 (Recommended)

---

## Promotion card contents

| Option | Description | Selected |
|--------|-------------|----------|
| OVR + own best stats (Recommended) | OVR (tier band) + class/function + the player's top stats BY POINTS, server-computed, never labeled as key | ✓ |
| OVR only | Minimal card — safest against inference, loses EAFC feel | |
| Real key stats (breaks RNK-02) | Show the actual 6 key stats with values — violates anti-gaming | |

| Option | Description | Selected |
|--------|-------------|----------|
| 6 stats, tier-styled (Recommended) | EAFC FACET look, Phase 4 tier palette | ✓ |
| 3 stats | Less dense | |
| Custom | User specifies | |

**User's choice:** OVR + own best stats; 6 stats, tier-styled
**Notes:** Resolves the ROADMAP "featuring their key stats" vs RNK-02 tension — key-stat identity never serialized.

---

## Validation queue & reject semantics

| Option | Description | Selected |
|--------|-------------|----------|
| New 'Validações' staff tab (Recommended) | Staff tab listing all pending submissions, newest first, expand to review | ✓ |
| Section in Personagens | Fewer tabs, mixes concerns | |
| Compact list only | Who/when only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-revert via status mark (Recommended) | Reject = 'rejected' mark; compute-on-read reverts to last validated per stat (03 D-07) | ✓ |
| Player drops from ranks | Until resubmit — contradicts D-07 | |
| Other semantics | Custom | |

| Option | Description | Selected |
|--------|-------------|----------|
| All 57 read-only (Recommended) | Grouped Geral/Quasi/Especial; officers never edit values | ✓ |
| Flagged summary + expand | Sanity-flag summary first | |

| Option | Description | Selected |
|--------|-------------|----------|
| Status label in history (Recommended) | 'Rejeitada' in member history; no reason field in v1 | ✓ |
| Reason stored + shown | Officer types reason, stored and shown | |
| No member visibility | Ranks silently change | |

**User's choice:** All recommended options.

---

## Removal & role management UX

| Option | Description | Selected |
|--------|-------------|----------|
| Deactivate + leave cohort (Recommended) | active=false; sessions die (0004); submissions leave rank cohort via new active-member filter | ✓ |
| Deactivate, keep in cohort | Ex-member keeps polluting ranks | |
| Hard delete (violates rules) | DELETE row — violates append-only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Officers members, owner officers (Recommended) | Officers remove/reactivate members; owner manages officers; owner untouchable | ✓ |
| Owner-only removal | Officers only validate | |
| Custom split | — | |

| Option | Description | Selected |
|--------|-------------|----------|
| Extend Personagens (Recommended) | Owner-only role controls + owner-only add-class gate on existing page | ✓ |
| Dedicated roles tab | More separation, another tab | |

| Option | Description | Selected |
|--------|-------------|----------|
| Accept, document (Recommended) | Role changes apply at next login; deactivation is the immediate kill-switch | ✓ |
| Force re-login mechanism | token_epoch bump — extra migration for a rare op | |

**User's choice:** All recommended options.

---

## Promotion page shape & visibility

| Option | Description | Selected |
|--------|-------------|----------|
| All members see it (Recommended) | New member-visible tab; public stays Out of Scope | ✓ |
| Officers only | Defeats celebration purpose | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-class top 5 (Recommended) | One section per class, top-5-by-OVR cards; insufficient-data classes hidden | ✓ |
| Overall guild top-N | Classes with low OVR scales never appear | |
| Per-class × function | Doubles cards, thins cohorts | |

| Option | Description | Selected |
|--------|-------------|----------|
| New promotion RPC (Recommended) | Member-invocable SECURITY DEFINER RPC returning full card payload; class_top5 stays staff-only | ✓ |
| Extend class_top5 to members | Puts a staff preview RPC on the member boundary | |

**User's choice:** All recommended options.

---

## OpenCode's Discretion

Card visual treatment within tier-palette + 6-facet rule; Validações mechanics (density, expand, empty state, pt-BR copy); promotion tab label & micro-copy; promotion RPC signature (all-classes vs per-class); Personagens owner-controls interaction design (select vs buttons, confirms, reactivation affordance); migration sequencing; officer-queue convenience features; smoke-matrix probe design.

## Deferred Ideas

Rejection-reason free text; OFCR-01 guild-health dashboard; token-epoch force re-login; SHAR-01 shareable PNG export.
