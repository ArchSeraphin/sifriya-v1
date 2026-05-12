"use client"
import { useLibraries } from "@/lib/hooks/useLibraries"

type Props = {
  value: string
  onChange: (libraryId: string) => void
  disabled?: boolean
  label?: string
}

export function LibrarySelector({ value, onChange, disabled, label }: Props) {
  const { libraries, isLoading } = useLibraries()

  // If only one library accessible: hide the select (value is fixed)
  if (!isLoading && libraries.length === 1) {
    return null
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[13px] text-[var(--ink-3)] font-medium">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || isLoading}
        className="h-9 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 text-[14px] text-[var(--ink)] shadow-[var(--shadow-1)]"
      >
        {libraries.map(lib => (
          <option key={lib.id} value={lib.id}>
            {lib.name}
          </option>
        ))}
      </select>
    </div>
  )
}
