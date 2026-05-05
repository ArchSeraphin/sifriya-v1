"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  size?: "sm" | "md" | "lg"
  footer?: React.ReactNode
  className?: string
}

const sizeClass = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl"
} as const

export function Modal({ open, onClose, title, children, size = "md", footer, className }: ModalProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(31,27,19,0.42)] p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative flex w-full flex-col rounded-2xl bg-paper shadow-[var(--shadow-2)] animate-fade-in",
          "max-h-[calc(100dvh-2rem)] overflow-hidden",
          sizeClass[size],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--rule)] px-5">
          <h2 className="font-serif text-lg text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 transition hover:bg-paper-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule)] px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
