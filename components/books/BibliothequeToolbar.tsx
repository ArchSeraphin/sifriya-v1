"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { LayoutGrid, List as ListIcon } from "lucide-react"
import { cn } from "@/lib/cn"

type View = "grid" | "list"

const SORTS = [
  { value: "recent", label: "Recents" },
  { value: "title-asc", label: "Titre A-Z" },
  { value: "author-asc", label: "Auteur A-Z" }
] as const

const FORMATS = [
  { value: "", label: "Tous formats" },
  { value: "EPUB", label: "EPUB" },
  { value: "PDF", label: "PDF" }
] as const

const TYPES = [
  { value: "", label: "Tous types" },
  { value: "DIGITAL", label: "Numerique" },
  { value: "PHYSICAL", label: "Physique" }
] as const

type Props = {
  total: number
  showTypeFilter?: boolean
}

export function BibliothequeToolbar({ total, showTypeFilter = true }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const view: View = (searchParams.get("view") === "list" ? "list" : "grid") as View
  const sort = searchParams.get("sort") ?? "recent"
  const format = searchParams.get("format") ?? ""
  const type = searchParams.get("type") ?? ""

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    if (key !== "view") params.delete("page")
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] text-ink-3">
        {total} {total > 1 ? "livres" : "livre"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SelectField
          label="Trier"
          value={sort}
          onChange={(v) => update("sort", v === "recent" ? "" : v)}
          options={SORTS as unknown as ReadonlyArray<{ value: string; label: string }>}
        />
        <SelectField
          label="Format"
          value={format}
          onChange={(v) => update("format", v)}
          options={FORMATS as unknown as ReadonlyArray<{ value: string; label: string }>}
        />
        {showTypeFilter ? (
          <SelectField
            label="Type"
            value={type}
            onChange={(v) => update("type", v)}
            options={TYPES as unknown as ReadonlyArray<{ value: string; label: string }>}
          />
        ) : null}
        <div className="ml-auto flex items-center rounded-md border border-[var(--rule)] bg-paper p-0.5 shadow-[var(--shadow-1)]">
          <ViewButton active={view === "grid"} onClick={() => update("view", "")}>
            <LayoutGrid size={15} />
            <span className="sr-only">Vue grille</span>
          </ViewButton>
          <ViewButton active={view === "list"} onClick={() => update("view", "list")}>
            <ListIcon size={15} />
            <span className="sr-only">Vue liste</span>
          </ViewButton>
        </div>
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-[var(--rule)] bg-paper px-2 text-[13px] text-ink shadow-[var(--shadow-1)] focus:border-ink-3 focus:outline-none focus:ring-[3px] focus:ring-[rgba(31,27,19,0.05)]"
      >
        {options.map((o) => (
          <option key={o.value || "_"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ViewButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded transition",
        active ? "bg-paper-2 text-ink" : "text-ink-3 hover:text-ink"
      )}
    >
      {children}
    </button>
  )
}
