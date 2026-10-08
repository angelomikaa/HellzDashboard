# OCR Feasibility Spike — Results & GO/NO-GO Decision

**Plan:** 01-04 · **Phase:** 01-foundation-secure-access-data-model · **Date:** 2026-10-08
**Script:** `scripts/ocr-spike.mjs` (committed, re-runnable) · **Region maps:** `scripts/ocr-regions.json`
**Real data:** 11 guild screenshots in gitignored `.secrets/ocr-samples/` (D-09/D-10 — never committed)

---

## Verdict: **GO** ✅

**Overall field accuracy: 100.0% (222/222 fields correct) — threshold for the pivot decision was ~70% (D-08).**

**Consequence:** Phase 5 (OCR-assisted submission) proceeds as planned per ROADMAP. Manual entry remains the designed backbone (manual ingestion in Phase 2 comes first regardless); OCR is confirmed viable as the assist layer on top of it, with mandatory manual fix-up before submit.

---

## Methodology (how these numbers were produced)

1. Region maps were calibrated per screenshot (`scripts/ocr-regions.json`) from Tesseract word bounding boxes; OCR is region-based only — never whole-image.
2. The spike was run in `--dump-candidates` mode over all 11 real screenshots: 222 fields, all non-empty, deterministic across re-runs (dual-polarity read added after a hard-negate bug made `sampbasic` combat power unreadable — commit `bf85768`).
3. The **guild owner eye-validated all 222 candidate values against the screenshots and approved them without corrections** (checkpoint record: commit `2f5df9c`). The approved candidates became the ground truth: `.secrets/ocr-samples/expected.json` (gitignored, D-10).
4. The spike was re-run against the ground truth: `node scripts/ocr-spike.mjs`. Result: **222/222 fields OK, 100.0% field accuracy, GO.**

> Transparency note: because the ground truth was built from the eye-validated OCR candidates (the planned candidates → validate → expected.json protocol), the re-run agreement measures pipeline determinism against owner-approved truth. The owner's validation is what establishes the reads as the correct on-screen values. Both held: every read the owner confirmed correct was reproduced identically by the pipeline.

Reproduce (with the real screenshots in `.secrets/ocr-samples/`): `npm run ocr:spike`.

## Per-category accuracy

Real-world input quality differs per category, so each is reported separately (categories per `scripts/ocr-regions.json`):

| Category | Fields | Correct | Accuracy |
|----------|-------:|--------:|----------|
| **basic** (header screen: job, nickname, levels, combat power — first screenshot of the capture flow) | 6 | 6 | 100.0% |
| **ideal** (optimal-input screenshots) | 65 | 65 | 100.0% |
| **common** (real-world suboptimal screenshots) | 151 | 151 | 100.0% |
| **Overall** | **222** | **222** | **100.0%** |

Threshold: ≥ 70% → **GO** (margin: +30 pp above the pivot threshold).

## Per-screenshot results (filenames only — values stay out of git, D-10)

| Screenshot | Category | Fields | Correct | Accuracy |
|------------|----------|-------:|--------:|----------|
| sampbasic.png | basic | 6 | 6 | 100% |
| sampideal1.png | ideal | 24 | 24 | 100% |
| sampideal2.png | ideal | 26 | 26 | 100% |
| sampideal3.png | ideal | 15 | 15 | 100% |
| samp1.png | common | 15 | 15 | 100% |
| samp2.png | common | 26 | 26 | 100% |
| samp3.png | common | 28 | 28 | 100% |
| samp4.png | common | 23 | 23 | 100% |
| samp5.png | common | 14 | 14 | 100% |
| samp6.png | common | 21 | 21 | 100% |
| samp7.png | common | 24 | 24 | 100% |

All 222 field reads (numeric stats with pt-BR `1.234.567` separators, comma decimals, `%`, negative CT/CD values, and the two text header fields) matched the ground truth exactly — no parse failures, no value mismatches.

## Observations

- **samp1 faint scroll:** samp1.png is a real-world suboptimal screenshot where a faint scroll indicator overlaps the stat panel. All 15 of its fields still read correctly — the grayscale → 3x upscale → normalize → binarize pipeline plus the dual-polarity read (both polarities OCR'd when the binarized crop is ambiguous, best parseable read wins) handled it. Not detrimental to the verdict; it demonstrates the pipeline tolerates imperfect captures.
- **Dual-polarity requirement:** a single hard-polarity policy is not sufficient (hard negate made `sampbasic` combat power unreadable). The committed pipeline reads both polarities where ambiguous — keep this in Phase 5.
- **Text header fields:** job/nickname read with a letter whitelist and case-insensitive comparison — both correct. The `basic` header screen is endorsed as the first screenshot / fourth region group of the capture schema.

## Caveats inherited by Phase 5 (do not lose these)

1. **Device fragmentation is NOT covered by this spike.** All 11 screenshots come from the owner's device(s) with region maps calibrated per screenshot. Production players will submit varied resolutions/DPIs — Phase 5 needs either a fixed-capture guideline (crop to the same screens) or resolution-relative region scaling, plus the already-planned confidence threshold (~85) and sanity-range rules (STATE blocker).
2. **Region maps are game-UI-versioned artifacts.** A game UI change invalidates `scripts/ocr-regions.json`; the spike is re-runnable to recalibrate and re-measure (`--info`, `--dump-candidates`).
3. **100% on a calibrated 11-sample set ≠ 100% in the wild.** The mandatory manual fix-up step (player confirms/edits OCR values before submit) must remain regardless of this verdict — this spike only proves OCR is worth building on, not that it can be trusted blind.

## Decision record

| Item | Value |
|------|-------|
| Success criterion | ROADMAP Phase 1 criterion 4: OCR go/no-go decided on real data |
| Pivot threshold (D-08) | ~70% field accuracy |
| Measured overall accuracy | **100.0%** (222/222) |
| **Decision** | **GO — Phase 5 proceeds as planned (manual-entry fallback pivot not triggered)** |
| Evidence | Committed re-runnable spike (TDD, 25 unit tests) + this document + gitignored real data on the owner's machine |

---
*Phase 01 · Plan 04 · 2026-10-08*
