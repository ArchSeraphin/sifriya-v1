import * as React from "react"
import { cn } from "@/lib/cn"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-[var(--shadow-1)] hover:opacity-95 active:opacity-90",
  secondary:
    "bg-paper text-ink-2 border border-[var(--rule)] shadow-[var(--shadow-1)] hover:bg-paper-2",
  ghost: "bg-transparent text-ink-2 hover:bg-paper-2",
  danger:
    "bg-transparent text-[color:var(--err)] border border-[rgba(138,48,48,0.3)] hover:bg-[rgba(138,48,48,0.06)]"
}

const sizeClass: Record<Size, string> = {
  sm: "h-7 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-[22px] text-[15px] gap-2"
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-[background-color,opacity,box-shadow,color] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--paper)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variantClass[variant],
        sizeClass[size],
        className
      )}
      {...rest}
    />
  )
})
