import * as React from "react"
import { cn } from "@/lib/cn"

type Tone = "neutral" | "ok" | "warn" | "err" | "accent"

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
}

const toneClass: Record<Tone, string> = {
  neutral: "bg-paper-2 text-ink-2",
  ok: "bg-[rgba(74,107,62,0.12)] text-[color:var(--ok)]",
  warn: "bg-[rgba(168,106,31,0.14)] text-[color:var(--warn)]",
  err: "bg-[rgba(138,48,48,0.12)] text-[color:var(--err)]",
  accent: "bg-accent-soft text-[#5a4711]"
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-[10px] text-xs font-medium tracking-tight",
        toneClass[tone],
        className
      )}
      {...rest}
    />
  )
}
