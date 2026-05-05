import * as React from "react"
import { cn } from "@/lib/cn"

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-9 w-full rounded-md border border-[var(--rule)] bg-paper px-3 text-sm text-ink",
        "placeholder:text-ink-4 shadow-[var(--shadow-1)]",
        "focus:outline-none focus:border-ink-3 focus:ring-[3px] focus:ring-[rgba(31,27,19,0.05)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...rest}
    />
  )
})
