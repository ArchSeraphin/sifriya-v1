import * as React from "react"
import type { CopyType, FileFormat } from "@prisma/client"
import { cn } from "@/lib/cn"

// Pills compactes pour la grille / les listes : meme metrique que Badge mais
// hauteur reduite et code couleur dedie aux formats. La palette reste dans le
// design system (paper / accent / warn).

const PILL_BASE =
  "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-wider"

const FORMAT_CLASSES: Record<FileFormat, string> = {
  // EPUB → accent dore : format natif "ebook", chaud, clin d'oeil au livre.
  EPUB: "bg-accent-soft text-[#5a4711]",
  // PDF  → neutre : format documentaire plus universel.
  PDF: "bg-paper-3 text-ink-2"
}

export function FormatBadge({ format, className }: { format: FileFormat; className?: string }) {
  return (
    <span className={cn(PILL_BASE, "font-mono", FORMAT_CLASSES[format], className)}>{format}</span>
  )
}

const TYPE_CLASSES: Record<CopyType, string> = {
  DIGITAL: "bg-paper-2 text-ink-2",
  PHYSICAL: "bg-[rgba(168,106,31,0.14)] text-[color:var(--warn)]"
}

const TYPE_LABEL: Record<CopyType, string> = {
  DIGITAL: "Numerique",
  PHYSICAL: "Physique"
}

export function TypeBadge({ type, className }: { type: CopyType; className?: string }) {
  return <span className={cn(PILL_BASE, TYPE_CLASSES[type], className)}>{TYPE_LABEL[type]}</span>
}

const LIBRARY_PILL_CLASSES = "bg-paper-2 text-ink-2"

export function LibraryBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        PILL_BASE,
        LIBRARY_PILL_CLASSES,
        "normal-case tracking-normal max-w-[120px] truncate",
        className
      )}
      title={name}
    >
      {name}
    </span>
  )
}
