// StatPicker — searchable stat selector for the staff explorer.
//
// A disclosure popover (not a native select): the officer can type to narrow
// the 59-stat catalog by label/key and click a grouped option. Escape and a
// click outside close it; the selected stat is shown on the trigger.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { StatCatalogEntry } from '../../lib/api'
import { GROUP_LABELS, GROUP_ORDER } from '../../lib/groups'
import { normalizeSearch } from './rankView'

interface StatPickerProps {
  entries: readonly StatCatalogEntry[]
  value: string
  onChange: (statKey: string) => void
}

export function StatPicker({ entries, value, onChange }: StatPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = entries.find((entry) => entry.stat_key === value)

  const filtered = useMemo(() => {
    const q = normalizeSearch(query)
    if (q === '') return entries
    return entries.filter(
      (entry) =>
        normalizeSearch(entry.label).includes(q) ||
        normalizeSearch(entry.stat_key).includes(q) ||
        normalizeSearch(entry.label_short ?? '').includes(q),
    )
  }, [entries, query])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function choose(statKey: string) {
    onChange(statKey)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className="relative min-w-56">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 text-left text-sm text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="min-w-0 truncate">
          {selected?.label ?? (entries.length === 0 ? 'Catálogo indisponível' : 'Selecione um stat')}
        </span>
        <span aria-hidden="true" className="text-muted">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-72 rounded-md border border-line bg-surface p-2 shadow-lg">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setOpen(false)
              }
            }}
            placeholder="Buscar stat…"
            aria-label="Buscar stat"
            className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <div role="listbox" aria-label="Stats" className="mt-2 max-h-72 overflow-y-auto">
            {GROUP_ORDER.map((group) => {
              const groupEntries = filtered.filter((entry) => entry.group_name === group)
              if (groupEntries.length === 0) return null
              return (
                <div key={group}>
                  <p className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                    {GROUP_LABELS[group]}
                  </p>
                  {groupEntries.map((entry) => (
                    <button
                      key={entry.stat_key}
                      type="button"
                      role="option"
                      aria-selected={entry.stat_key === value}
                      onClick={() => choose(entry.stat_key)}
                      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        entry.stat_key === value ? 'text-accent' : 'text-content'
                      }`}
                    >
                      <span className="truncate">{entry.label}</span>
                      <span className="text-xs text-muted">{entry.label_short}</span>
                    </button>
                  ))}
                </div>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted">Nenhum stat encontrado.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
