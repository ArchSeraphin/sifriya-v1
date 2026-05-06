import Link from "next/link"
import { ArrowRight } from "lucide-react"

type SessionRow = {
  id: string
  totalFiles: number
  createdAt: Date
  updatedAt: Date
  _count: { items: number }
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) return null
  return (
    <ul className="divide-y divide-[var(--rule-2)] rounded-md border border-[var(--rule)] bg-paper">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link
            href={`/admin/bulk-import/${s.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-paper-2/60"
          >
            <div>
              <p className="font-mono text-[12px] text-ink">#{s.id.slice(0, 8)}</p>
              <p className="text-[12px] text-ink-3">
                {s._count.items} / {s.totalFiles} fichiers · demarre le {s.createdAt.toLocaleString("fr-FR")}
              </p>
            </div>
            <ArrowRight size={16} className="text-ink-3" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
