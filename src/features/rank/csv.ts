// CSV export helpers (pure, no React). Officers analyze the ranking in a
// spreadsheet; the values exported are the server payload verbatim — this
// module never derives points or re-ranks anything.

/** One CSV cell for the pt-BR Excel dialect (`;` separator, UTF-8 BOM). */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Header + rows -> a BOM-prefixed CRLF document Excel opens correctly. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(';'))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** `hellz-<slug>-YYYY-MM-DD.csv` — accents stripped, whitespace collapsed. */
export function csvFilename(parts: readonly string[], now: Date = new Date()): string {
  const slug = parts
    .join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const date = now.toISOString().slice(0, 10)
  return `hellz-${slug === '' ? 'export' : slug}-${date}.csv`
}

/** Trigger a browser download for an in-memory CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
