# Phase 8: Whitelist Lifecycle, Self-Request Whitelisting, First-Login PIN Setup & Character Identity Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-21
**Phase:** 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi
**Areas discussed:** First-access entry, Membership requests, PIN reset, Identity capture, Legacy rows

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| First-access entry | How an unclaimed player reaches PIN setup; what the screen reveals | ✓ |
| Request & status | Request entry point and status check without a session | ✓ |
| PIN reset meaning | Owner reset semantics and surface | ✓ |
| Identity capture | Fields, OCR source, registry authority | ✓ |

**User's choice:** All four areas.

---

## First-access entry

### Q1 — How does an unclaimed player start first access?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit "Primeiro acesso" link | Login untouched; secondary link opens a handle-only setup screen | ✓ |
| Blank PIN on the login form | Empty PIN routes unclaimed handles to setup | |
| Check handle, then act | "Verificar" step reveals claim state | |

**User's choice:** Explicit "Primeiro acesso" link.
**Notes (verbatim):** "It asks discord, in game name, pin, confirm pin. The pin system currently allows to type in letters, so we might have to change our whole authentication to a screen that is similar to a 2 factor authentication screen, but without de 2FA process, the user inserts 4 numbers, 'one in each box'." → became D-01/D-02/D-03.

### Q2 — What role does the in-game name play?

| Option | Description | Selected |
|--------|-------------|----------|
| Proof + must match staff entry | Typed name must match display_name, generic failure | |
| Proof + refresh on success | Match then overwrite display_name | |
| Informational only | Any name accepted | |

**User's choice:** None — superseded by a new direction.
**Notes (verbatim):** "in fact, lets change it to an OCR instance, like the first sample that shows in game name and job. The print can then read the two informations and the image is seeded to a staff member that will verify the identity of the member." → replaced the typed-name idea with a basic-screen screenshot + staff verification (D-03/D-05).

### Q3 — Does identity verification block access?

| Option | Description | Selected |
|--------|-------------|----------|
| Async review, access immediate | Claim mints the session; proof goes to staff | ✓ (implied by the two-loop answer) |
| Blocking approval | Player waits for staff verification | |
| Trusted-handle fast path | Different behavior by origin | |

**User's choice:** Two approval loops, detailed under Membership requests.
**Notes (verbatim):** "the system must have two approval loops, one for members that are already in the guild ingame, they only need to submit their character identity, meaning only one screenshot is enough. The other is for members who want to join the guild. in this case they go through a full enviar stats flow, and their stats become available to an officer, who will reach them to recruit, and only then the prospect will become a member." → D-05/D-06/D-08.

### Q4 — Fields on Primeiro acesso

| Option | Description | Selected |
|--------|-------------|----------|
| Handle, PIN ×2, screenshot (ID/name/job) | OCR reads ID/nickname/job; job = class; role stays staff | ✓ |
| Also pick class + role | Player confirms class and chooses role | |
| Handle, PIN ×2 only | Identity captured later on first submission | |

### Q5 — Claim review surface

| Option | Description | Selected |
|--------|-------------|----------|
| Validações identity block | Proof thumbnail + OCR fields; Confirmar / Não confere | ✓ |
| Personagens row badge | Pending badge + inline proof review | |
| Automatic + escalation | No queue; only mismatches flagged | |

### Q6 — PIN box behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Boxes + explicit Entrar | Auto-advance, paste, backspace; submit on button | ✓ |
| Boxes + auto-submit | Submits on 4th digit | |
| Boxes + show/hide toggle | Reveal control | |

---

## Membership requests

### Q1 — How do the two loops appear at the door?

| Option | Description | Selected |
|--------|-------------|----------|
| One "Solicitar acesso" with two choices | Existing member (identity only) / prospect (full stats) | ✓ |
| Two separate links | Request + direct officer contact for prospects | |
| Single request form for everyone | Identity only; stats after approval | |

### Q2 — Where do prospect stats live before approval?

| Option | Description | Selected |
|--------|-------------|----------|
| Application tables, carried in on approval | Non-member application; approval converts stats into first validated submission | ✓ |
| Application tables, discarded on approval | Member re-submits later | |
| Provisional inactive member row | Reuses submissions directly; breaks "never a member row" | |

### Q3 — When does a self-requester choose their PIN?

| Option | Description | Selected |
|--------|-------------|----------|
| In the request itself | Approval activates the chosen PIN; immediate login | ✓ |
| At first access after approval | Reuses the approved proof | |
| Staff hands a temporary PIN | Officer relays a PIN | |

### Q4 — Status check without a session

| Option | Description | Selected |
|--------|-------------|----------|
| Handle lookup | Enter handle → pendente/aprovada/recusada | ✓ |
| Handle + PIN | Credential-gated status | |
| One-time request code | Code/link shown once | |

### Q5 — Same handle requests again

| Option | Description | Selected |
|--------|-------------|----------|
| One open request, history kept | New supersedes old, prior retained | ✓ (combined with later retention answer) |
| Rejection is final | Only staff can whitelist after rejection | |
| Overwrite previous request | No history at all | |

**User's choice:** Overwrite semantics, with the ID as the key identifier.
**Notes (verbatim):** "for the requesters, the ID is crucial - in case a potential recruit changes nickname and class, it can be still be identified by the system. The previous request is overwritten - the data of a submitter is visible in ranking like the ranking tab - ID, job, nickname, overall ... and then inline details. Since we are here, the ranking tab for the officers also must adopt the pattern of ID, job, nickname, overall, detalhes." → D-11/D-12/D-14/D-23.

### Q6 — How authoritative is the in-game ID?

| Option | Description | Selected |
|--------|-------------|----------|
| Unique identity key | DB-enforced uniqueness; clear duplicate error | ✓ |
| Soft duplicate warning | Staff judge duplicates | |
| History only | ID not used to dedupe | |

### Q7 — Applicant OVR in the review list

| Option | Description | Selected |
|--------|-------------|----------|
| Server-computed vs live cohort | Same math as members; applicant never joins cohorts | ✓ |
| Raw stats only | OVR only after joining | |
| Placeholder until approved | "—" in the list | |

### Q8 — Where staff review applicants

| Option | Description | Selected |
|--------|-------------|----------|
| New section inside Validações | Submissions queue + Solicitations block | ✓ |
| New staff tab "Candidatos" | Dedicated tab | |
| Inside Personagens | Applicants above the member register | |

### Q9 — Retention after close

| Option | Description | Selected |
|--------|-------------|----------|
| Keep text history, delete screenshots | Rows retained for audit; images purged | ✓ |
| Purge everything on close | Full removal | |
| Keep everything | Indefinite audit | |

**User's choice:** Text interpretation anchored on image deletion.
**Notes (verbatim):** "Once the overall is calculated, the images can be discarded to free disk space in the server." → D-15.

### Q10 — Pointed role → member role

| Option | Description | Selected |
|--------|-------------|----------|
| Officer confirms/adjusts at approval | Role pre-fills approval dialog; staff assignment preserved | ✓ |
| Adopt as-is | No confirmation | |
| Ignore at approval | Staff sets role later | |

### Q11 — Prospect draft resume

| Option | Description | Selected |
|--------|-------------|----------|
| One sitting, with a warning | Nothing stored before submit | ✓ |
| Server draft via handle + PIN | Unauthenticated draft storage | |
| Local browser draft | localStorage resume | |

### Q12 — Rejected requester sees

| Option | Description | Selected |
|--------|-------------|----------|
| Status only | No reason shown | ✓ |
| Optional note to requester | Officer message on status page | |
| Internal reason only | Staff audit reason | |

### Q13 — Overwriting a pending request

| Option | Description | Selected |
|--------|-------------|----------|
| Handle + pending request's PIN | Blocks hijacking a pending application | ✓ |
| Handle only | Anyone can replace | |
| Never replace while pending | Locked until decision | |

---

## PIN reset

### Q1 — Reset semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Clear the claim, player re-claims | pin_hash nulled; Primeiro acesso with proof | ✓ |
| Owner types a new PIN | PIN relayed through Discord | |
| Owner generates a random PIN | System-generated, shown once | |

### Q2 — Does an active session survive the reset?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — future logins only | Stateless JWT; deactivation is the kill switch | ✓ |
| No — revoke immediately | New session-epoch mechanism | |

### Q3 — Where claim state and reset live

| Option | Description | Selected |
|--------|-------------|----------|
| Personagens roster | PIN state badge + filter + owner-only reset | ✓ |
| Validações list | Separate "Sem PIN" block | |
| Both surfaces | Badge/action + compact list | |

---

## Identity capture

### Q1 — "Job(s)" meaning

| Option | Description | Selected |
|--------|-------------|----------|
| One class + chosen build role | Current class + pointed role | ✓ |
| All job lines on the screen | List of jobs | |
| Free-text job | Not tied to the catalog | |

### Q2 — Class change authority

| Option | Description | Selected |
|--------|-------------|----------|
| Class auto-applies, role staff-only | Validated job updates char_class; role stays staff | ✓ |
| Both auto-apply | Player controls cohort | |
| History only | Staff reconcile manually | |

### Q3 — Fixing a wrong nickname/ID

| Option | Description | Selected |
|--------|-------------|----------|
| Staff correction record | Appended correction; newest wins; stats immutable | ✓ |
| Player must resubmit | Strictly immutable submissions | |
| Direct staff edit | Overwrites submission history | |

### Q4 — Identity history surface

| Option | Description | Selected |
|--------|-------------|----------|
| Personagens row expansion | Timeline + correction action | ✓ |
| Validações review only | Current vs previous during validation | |
| Ranking detail panel | History beside the 57 stats | |

### Q5 — ID source at capture

| Option | Description | Selected |
|--------|-------------|----------|
| Same basic screenshot, OCR'd | Extend the basic grammar for ID/name/job | ✓ |
| Manual only | ID typed | |
| Separate profile screenshot | Second capture for ID | |

### Q6 — ID format

| Option | Description | Selected |
|--------|-------------|----------|
| Numeric only | Digits, bounded length, normalized uniqueness | ✓ |
| Alphanumeric | Letters + digits | |
| Free text | Accept as typed | |

---

## Legacy placeholder rows

| Option | Description | Selected |
|--------|-------------|----------|
| Owner keeps a real PIN, others convert | Placeholder rows → unclaimed; owner rotated out-of-band | ✓ |
| Convert everything | Owner also claims via Primeiro acesso | |
| Owner-only escape hatch | New privileged recovery path | |

---

## OpenCode's Discretion

- PIN-box component details (focus, paste, mobile keyboard, a11y, error copy).
- Schema/RPC/storage shape for applications, identity records, `add_member`, `setup-pin`, reset, and staff review payloads (within the locked decisions and existing discipline).
- Identity-proof bucket name/path/RLS/deletion mechanics.
- Layout of the Validações blocks and the applicant detail presentation.
- OCR basic-screen grammar extension and harness calibration.
- Where the "Novo membro" form is surfaced and reactivation copy.
- Lockout-clearing mechanics and exact ID normalization bounds.
- Smoke matrices and the migration 0014 live-apply plan.

## Deferred Ideas

- Member self-service PIN change / forgot-PIN flow (out of scope; owner reset covers it).
- Weak-PIN blocklist (out of scope).
- Second rate-limit mechanism (out of scope).
- Rejection reasons/notes shown to the requester (not selected).
- Save-and-resume drafts for prospect applications (not selected).
- First-submission evergreen CTA / stale-data nudge (Phase 10, HOME-02).
- Public visitor homepage and Destaques slider (Phase 10, owner decision 2026-10-20).
- Discord DM/push notifications for request decisions (not requested).
- `power-shift-significance` todo — reviewed, not folded (v2 delta-badge domain).
