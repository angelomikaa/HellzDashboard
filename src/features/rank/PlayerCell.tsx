// Shared player cell for the staff ranking tables: name + optional char ID.
export function PlayerCell({
  name,
  charId,
}: {
  name: string
  charId: string | null | undefined
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-content">{name}</div>
      {charId !== null && charId !== undefined && charId !== '' && (
        <div className="font-mono text-xs text-muted">{charId}</div>
      )}
    </div>
  )
}
