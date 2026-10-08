// Unit tests for the OCR spike's pure math (plan 01-04, task 1 — TDD RED).
// Behaviors from the plan:
//   Test 1: 7 of 10 fields correct -> accuracy 0.7 -> verdict GO (threshold is >= 0.7)
//   Test 2: 6 of 10 fields correct -> accuracy 0.6 -> verdict NO-GO
//   Test 3: parse failures count as misses (a field that fails to parse is never counted correct)
//   Test 4: parseValue handles `1.234.567` thousand separators (-> 1234567),
//           `12.34%` (-> 12.34), and plain digits
import { describe, expect, it } from 'vitest';
import { compareField, computeAccuracy, parseValue, verdict } from './ocr-spike.mjs';

// Helper: build a results array where `correctCount` fields match expected.
function results(correctCount, total = 10) {
  const results = [];
  for (let i = 0; i < total; i++) {
    const ok = i < correctCount;
    results.push({
      field: `stat_${i}`,
      expected: 1000 + i,
      parsed: ok ? 1000 + i : 999999, // mismatch when incorrect
      ok: true, // OCR produced a value; it's just wrong
    });
  }
  return results;
}

describe('computeAccuracy + verdict (plan behaviors 1-3)', () => {
  it('test 1: 7 of 10 correct -> accuracy 0.7 -> GO (threshold is >= 0.7)', () => {
    const accuracy = computeAccuracy(results(7));
    expect(accuracy).toBe(0.7);
    expect(verdict(accuracy)).toBe('GO');
  });

  it('test 2: 6 of 10 correct -> accuracy 0.6 -> NO-GO', () => {
    const accuracy = computeAccuracy(results(6));
    expect(accuracy).toBe(0.6);
    expect(verdict(accuracy)).toBe('NO-GO');
  });

  it('test 3: parse failures count as misses — a failed parse is never correct', () => {
    // 7 fields "match" expected, but 2 of those 7 failed to parse -> only 5 correct.
    const rows = results(7);
    rows[0].ok = false; // parse failure on a would-be-correct field
    rows[1].ok = false; // another parse failure
    const accuracy = computeAccuracy(rows);
    expect(accuracy).toBe(0.5);
    expect(verdict(accuracy)).toBe('NO-GO');
    // A failed parse with a coincidentally-matching parsed value still misses.
    const sneaky = [{ field: 'hp', expected: 123, parsed: 123, ok: false }];
    expect(computeAccuracy(sneaky)).toBe(0);
  });

  it('accuracy of an empty result set is 0 (never NaN) and NO-GO', () => {
    expect(computeAccuracy([])).toBe(0);
    expect(verdict(computeAccuracy([]))).toBe('NO-GO');
  });

  it('verdict honors a custom threshold', () => {
    expect(verdict(0.5, 0.5)).toBe('GO');
    expect(verdict(0.49, 0.5)).toBe('NO-GO');
  });
});

describe('parseValue (plan behavior 4 — Portuguese locale separators)', () => {
  it('parses `1.234.567` thousand separators -> 1234567', () => {
    const r = parseValue('1.234.567');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(1234567);
    expect(r.isPercentual).toBe(false);
  });

  it('parses `12.34%` -> 12.34 (records percentual)', () => {
    const r = parseValue('12.34%');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(12.34);
    expect(r.isPercentual).toBe(true);
  });

  it('parses `12,34` comma decimal -> 12.34', () => {
    const r = parseValue('12,34');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(12.34);
    expect(r.isPercentual).toBe(false);
  });

  it('parses `12,34%` comma decimal percent -> 12.34 percentual', () => {
    const r = parseValue('12,34%');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(12.34);
    expect(r.isPercentual).toBe(true);
  });

  it('parses plain digits', () => {
    const r = parseValue('  12345  ');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(12345);
    expect(r.isPercentual).toBe(false);
  });

  it('parses pt-BR mixed form `1.234.567,89` -> 1234567.89', () => {
    const r = parseValue('1.234.567,89');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(1234567.89);
  });

  it('fails on empty / non-numeric garbage', () => {
    expect(parseValue('').ok).toBe(false);
    expect(parseValue('   ').ok).toBe(false);
    expect(parseValue('abc').ok).toBe(false);
    expect(parseValue('%').ok).toBe(false);
    expect(parseValue(null).ok).toBe(false);
  });

  it('fails on a lone minus or minus without digits', () => {
    expect(parseValue('-').ok).toBe(false);
    expect(parseValue('-%').ok).toBe(false);
    expect(parseValue('-abc').ok).toBe(false);
  });
});

describe('parseValue — negative values (real screenshots: Variable CT, Fixed CT, Global CD are negative)', () => {
  it('parses `-33.38%` -> -33.38 percentual', () => {
    const r = parseValue('-33.38%');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(-33.38);
    expect(r.isPercentual).toBe(true);
  });

  it('parses `-60.00%` -> -60 percentual', () => {
    const r = parseValue('-60.00%');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(-60);
    expect(r.isPercentual).toBe(true);
  });

  it('parses `-10.00%` -> -10 percentual', () => {
    const r = parseValue('-10.00%');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(-10);
    expect(r.isPercentual).toBe(true);
  });

  it('parses plain negative `-5` -> -5 (not percentual)', () => {
    const r = parseValue('-5');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(-5);
    expect(r.isPercentual).toBe(false);
  });
});

describe('compareField — field comparison by type (numeric stats vs text header fields)', () => {
  it('numeric: OCR read matches expected written in pt-BR display form (`1.234` == `1234`)', () => {
    const r = compareField('1234', '1.234');
    expect(r.ok).toBe(true);
    expect(r.parsed).toBe(1234);
    expect(r.expected).toBe(1234);
  });

  it('numeric: percentual flag must match (`12,34` vs `12,34%` is a miss)', () => {
    expect(compareField('12,34', '12,34%').ok).toBe(false);
    expect(compareField('12,34%', '12,34%').ok).toBe(true);
  });

  it('numeric: different values are a miss; unparseable OCR read is a miss', () => {
    expect(compareField('123', '456').ok).toBe(false);
    expect(compareField('123', '').ok).toBe(false);
    expect(compareField('123', 'garbage').ok).toBe(false);
  });

  it('numeric: negative values compare correctly (`-33.38%` == `-33.38%`)', () => {
    expect(compareField('-33.38%', '-33.38%').ok).toBe(true);
    expect(compareField('-33.38%', '33.38%').ok).toBe(false);
  });

  it('text: case-insensitive, whitespace-normalized string equality (job/nickname)', () => {
    expect(compareField('Gypsy', ' GYPSY ').ok).toBe(true);
    expect(compareField('Ahrya', 'ahrya').ok).toBe(true);
  });

  it('text: different strings are a miss; empty OCR read is a miss', () => {
    expect(compareField('Gypsy', 'Dancer', 'text').ok).toBe(false);
    expect(compareField('Ahrya', '', 'text').ok).toBe(false);
  });

  it('text: expected/arsed carried as trimmed strings', () => {
    const r = compareField('Gypsy', ' gypsy ', 'text');
    expect(r.expected).toBe('Gypsy');
    expect(r.parsed).toBe('gypsy');
  });
});
