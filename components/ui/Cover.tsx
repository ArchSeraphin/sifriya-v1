import * as React from "react"
import { cn } from "@/lib/cn"

type CoverProps = {
  title: string
  author?: string | null
  format?: "EPUB" | "PDF" | null
  src?: string | null
  className?: string
}

// Palette douce pour les couvertures sans image, derivee du titre.
const COVER_PALETTE = [
  "#3d2f17",
  "#4d3a1a",
  "#5a4715",
  "#3a3a2a",
  "#2f3a30",
  "#3d2c2c",
  "#4a3520"
] as const

function hashToColor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return COVER_PALETTE[Math.abs(h) % COVER_PALETTE.length]!
}

export function Cover({ title, author, format, src, className }: CoverProps) {
  const bg = hashToColor(title)
  return (
    <div
      className={cn("cover relative aspect-[2/3] w-full text-[color:var(--accent-ink)]", className)}
      style={src ? undefined : { background: bg }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : null}
      {!src ? (
        <div className="absolute inset-x-0 bottom-0 z-[2] p-3">
          <p
            className="line-clamp-3 font-serif text-[13px] leading-snug"
            style={{ color: "rgba(255,255,255,0.95)" }}
          >
            {title}
          </p>
          {author ? (
            <p className="mt-1 truncate text-[10px] opacity-75" style={{ color: "rgba(255,255,255,0.85)" }}>
              {author}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
