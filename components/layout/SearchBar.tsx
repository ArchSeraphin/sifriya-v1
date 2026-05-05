"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

export function SearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initial = searchParams.get("q") ?? ""
  const [value, setValue] = React.useState(initial)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    setValue(searchParams.get("q") ?? "")
  }, [searchParams])

  const push = React.useCallback(
    (next: string) => {
      const target = pathname.startsWith("/bibliotheque") ? pathname : "/bibliotheque"
      const params = new URLSearchParams(searchParams.toString())
      if (next) params.set("q", next)
      else params.delete("q")
      params.delete("page")
      const qs = params.toString()
      router.push(qs ? `${target}?${qs}` : target)
    },
    [pathname, router, searchParams]
  )

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => push(next), 300)
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        if (debounceRef.current) clearTimeout(debounceRef.current)
        push(value)
      }}
      className="relative w-full max-w-xl"
    >
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"
      />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder="Rechercher un livre, un auteur..."
        aria-label="Rechercher dans la bibliotheque"
        className="h-9 w-full rounded-md border border-[var(--rule)] bg-paper pl-9 pr-3 text-sm text-ink placeholder:text-ink-4 shadow-[var(--shadow-1)] focus:border-ink-3 focus:outline-none focus:ring-[3px] focus:ring-[rgba(31,27,19,0.05)]"
      />
    </form>
  )
}
