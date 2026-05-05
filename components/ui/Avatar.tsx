import * as React from "react"
import { cn } from "@/lib/cn"
import { initials as makeInitials } from "@/lib/avatar"

type Size = "sm" | "md" | "lg"

type AvatarProps = {
  name?: string | null
  email?: string | null
  color?: string
  size?: Size
  className?: string
}

const sizeClass: Record<Size, string> = {
  sm: "h-[22px] w-[22px] text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-11 w-11 text-sm"
}

export function Avatar({ name, email, color, size = "md", className }: AvatarProps) {
  const fallback = email ?? "??"
  const label = makeInitials(name, fallback)
  const bg = color ?? "#6b6354"
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium text-[color:var(--accent-ink)]",
        sizeClass[size],
        className
      )}
      style={{ backgroundColor: bg }}
    >
      {label}
    </span>
  )
}
