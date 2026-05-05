import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/cn"

type PaginationProps = {
  page: number
  totalPages: number
  hrefForPage: (page: number) => string
}

export function Pagination({ page, totalPages, hrefForPage }: PaginationProps) {
  if (totalPages <= 1) return null

  const pages: number[] = []
  const window = 1
  const start = Math.max(1, page - window)
  const end = Math.min(totalPages, page + window)
  if (start > 1) pages.push(1)
  if (start > 2) pages.push(-1)
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < totalPages - 1) pages.push(-1)
  if (end < totalPages) pages.push(totalPages)

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
      <PageLink
        href={hrefForPage(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Page precedente"
      >
        <ChevronLeft size={15} />
      </PageLink>
      {pages.map((p, i) =>
        p === -1 ? (
          <span key={`gap-${i}`} className="px-1 text-ink-4">
            ...
          </span>
        ) : (
          <PageLink key={p} href={hrefForPage(p)} active={p === page}>
            {p}
          </PageLink>
        )
      )}
      <PageLink
        href={hrefForPage(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        aria-label="Page suivante"
      >
        <ChevronRight size={15} />
      </PageLink>
    </nav>
  )
}

function PageLink({
  href,
  children,
  active = false,
  disabled = false,
  ...rest
}: {
  href: string
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  "aria-label"?: string
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex h-8 min-w-8 cursor-not-allowed items-center justify-center rounded-md border border-[var(--rule)] bg-paper px-2 text-[13px] text-ink-4"
        {...rest}
      >
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[var(--rule)] bg-paper px-2 text-[13px] transition",
        active ? "bg-paper-2 font-medium text-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
      )}
      {...rest}
    >
      {children}
    </Link>
  )
}
