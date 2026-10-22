// Pure tooltip line parser (Phase 9.1, DEF-02).
//
// A tooltip line carries both label and value on one line, e.g.
// "Equipment PDEF:4913" or "Equipment PDEF:4.913". The label itself is
// confirmed separately in recognize.ts (scoreLabelPair + an "equipment"
// containment check to avoid matching "Base PDEF" / "PDEF gained..."), so this
// parser only needs to locate the numeric value.
//
// PURE: no React, no DOM, no worker. Testable in isolation.

/**
 * Extract the numeric value from one OCR'd tooltip label line.
 * Returns the last numeric token (the value follows the label), or null when
 * no numeric token exists.
 *
 * Handles:
 *  - "Equipment PDEF:4913"        -> "4913"
 *  - "Equipment PDEF:4.913"       -> "4.913"   (pt-BR thousands dot)
 *  - "Equipment PDEF: 4913"       -> "4913"    (space after colon)
 *  - "Base PDEF:134"              -> null      (no numeric... actually has 134;
 *                                            label confirmation excludes this line)
 */
export function parseTooltipValue(line: string): string | null {
  if (!line) return null
  const tokens = line.match(/[\d][\d.,]*/g)
  if (!tokens || tokens.length === 0) return null
  return tokens[tokens.length - 1] ?? null
}
