export function ImportProgressBar({
  processed,
  total
}: {
  processed: number
  total: number
}) {
  const pct = total === 0 ? 0 : Math.round((processed / total) * 100)
  return (
    <div className="rounded-md bg-paper-2/60 p-3">
      <div className="mb-1 flex justify-between text-[11px] text-ink-3">
        <span>Processing</span>
        <span>
          {processed} / {total}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-paper-3">
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
