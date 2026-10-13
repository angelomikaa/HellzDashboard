# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-10-13
**Phases:** 6 | **Plans:** 26 | **Tasks:** 60 | **Timeline:** 6 days (2026-10-07 → 2026-10-13) | **Commits:** 237

### What Was Built

- Secure per-player PIN auth (bcrypt hashes, DB-backed lockout, custom-claim HS256 JWTs) on a 6-table append-only Supabase schema with RLS on every table from day one
- 57-stat pt-BR catalog with column-level security (pin_hash unreachable by any client credential) and a guided manual submit wizard with a mandatory per-step review gate
- Postgres rank engine: rank-based percentile points (average-rank ties) and floor-51 OVR from exactly 6 admin-toggled key stats, compute-on-read in SECURITY DEFINER RPCs — key-stat identity never crosses the member API boundary (leak-diff smokes + owner DevTools proofs)
- Member dashboard delivering the core value: tiered stat cards (bronze→platinum), class average/best comparisons, improvement-focus strip
- OCR auto-read hardened through a 4-round owner-UAT cycle into a scale/margin-invariant structural reader behind an unchanged contract, with a permanent exact-value harness (284/284 tests)
- Officer trust tools (Validações queue, owner-only role management, instant deactivation kill-switch) + Destaques EAFC-style promotion page (owner UAT 14/14)

### What Worked

- **Manual-before-OCR phasing** — the panel was launchable at Phase 2 with zero OCR; the OCR layer bolted on later never blocked the critical path, and the UAT defect cycle stayed contained
- **Live smoke matrices as the enforcement proof** — RLS/rank/lifecycle/officer/promotion probes run against the LIVE project (twice consecutively, zero residue) caught real defects static tests can't (0006 role-claim mismatch, 42P17 RLS recursion, PostgREST zero-row-update semantics)
- **TDD with literal-gate discipline** — locked copy strings and grep gates (render-unique UI copy, no rankMath import, no FormData) made security constraints mechanically checkable
- **Owner UAT as a hard gate** — every phase ended with a real-browser walk; the owner's verbatim approvals are the acceptance record, and the 05 five-round OCR cycle proved the value of refusing to close INPT-02 without the owner
- **Traceability-pending pattern** — requirements stayed Pending until the completing plan/verification landed (INPT-02 across 05-01..05-05), keeping REQUIREMENTS.md honest without hand-edits

### What Was Inefficient

- **The pixel-fraction OCR region maps never had a chance** — spike calibration was frame-exact, but real players upload full-screen shots of arbitrary size; 3 UAT rounds were spent hardening a premise the owner then killed with one directive ("screenshots will vary in size inevitably") — a cheaper discovery would have been asking earlier how players actually capture
- **Stale dist during UAT** — `npm run preview` served a pre-Phase-6 build on the first owner walk (wasted walk + confusion); the build-before-preview rule now exists
- **Auth-gated live ops accumulated** — the catalog re-seed for the 6 flat damage stats was deferred as auth-gated and is still pending at close
- **Token juggling** — deploys repeatedly paused on SUPABASE_ACCESS_TOKEN session-env handoffs (03-02, 05-02); the misspelled `.env` key (SUPABASE_ACESS_TOKEN) was only found by inspection in 06-02

### Patterns Established

- Enforcement lives in SECURITY DEFINER RPCs + column grants + RLS reading `auth.jwt()->>'member_role'`; UI gating is UX-only with content re-checks — never the security boundary
- Same-table policy lookups go through SECURITY DEFINER helpers (42P17 recursion guard)
- Append-only everywhere: status/active marks, never deletes or overwrites (validate/reject/discard/remove are all marks)
- Explicit projections only — `select=*` fails by design under column grants
- OCR recalibration = recalibrate the visual grammar in structure.ts + re-run the harness grid — never pixel fractions
- Plan literal-gates must be satisfiable against their own constraints (unsatisfiable grep criteria documented and replaced with equivalent proof)

### Key Lessons

1. Spike on the REAL input distribution, not the ideal one — 100% on calibrated crops collapsed to ~0% on real full-screen uploads; the harness now permanently includes rescale/margin/full-frame variants
2. Run UAT on a fresh production build (`npm run build` immediately before `npm run preview`) — stale dist silently serves the previous phase
3. RLS `using` zero-row updates answer 204/200-empty, not 403 — probe with `Prefer: return=representation` and assert 0 rows
4. Refuse to close a requirement on code-complete alone when the acceptance contract is owner-witnessed (INPT-02 held 5 plans until the walk)
5. GSD traceability: a requirement completes when its final completing plan verifies, not when the first plan ships — the "Pending by traceability" discipline prevented premature closes

### Cost Observations

- Model mix: primarily smart-profile single-model sessions (no opus/haiku mix configured)
- Sessions: ~7 working sessions across 6 days; avg plan ~36min active (wall time inflated by deliberate owner-UAT checkpoints)
- Total execution time: ~9h active; Phase 5's 4-round UAT cycle was ~40% of milestone effort for ~10% of the requirements
- Notable: the owner's asynchronous UAT availability was the pacing constraint, not execution speed

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~7 | 6 | Baseline: live smoke matrices, owner-UAT gates, traceability-pending discipline, literal-gate TDD |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 284 | core paths (auth, rank math, OCR harness, validation) | n/a (first milestone) |

### Top Lessons (Verified Across Milestones)

1. *(first milestone — lessons above are single-milestone observations; re-verify in v1.1)*
