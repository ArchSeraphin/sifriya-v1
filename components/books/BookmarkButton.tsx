"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Bookmark, BookOpen, CircleCheck } from "lucide-react"
import type { ReadingStatus } from "@prisma/client"

type Props = {
  bookId: string
  status: ReadingStatus | null
}

export function BookmarkButton({ bookId, status }: Props) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const interactive = status === null || status === "TO_READ"
  const tooltip =
    status === "READING" || status === "READ" ? "Statut gere depuis la fiche" : undefined

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!interactive || pending) return
    setPending(true)
    const res =
      status === "TO_READ"
        ? await fetch(`/api/readings/${bookId}`, { method: "DELETE" })
        : await fetch(`/api/readings/${bookId}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "TO_READ" })
          })
    setPending(false)
    if (res.ok) router.refresh()
  }

  const icon =
    status === "READING" ? (
      <BookOpen size={16} />
    ) : status === "READ" ? (
      <CircleCheck size={16} />
    ) : (
      <Bookmark size={16} fill={status === "TO_READ" ? "currentColor" : "none"} />
    )

  const label =
    status === "TO_READ"
      ? "Retirer de ma liste"
      : status === "READING"
        ? "En cours de lecture"
        : status === "READ"
          ? "Lu"
          : "Ajouter a ma liste"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive || pending}
      title={tooltip}
      aria-label={label}
      className={
        interactive
          ? "absolute right-1.5 top-1.5 z-[3] inline-flex h-7 w-7 items-center justify-center rounded-full bg-paper/85 text-accent shadow-[var(--shadow-1)] backdrop-blur-sm transition hover:bg-paper disabled:opacity-50"
          : "absolute right-1.5 top-1.5 z-[3] inline-flex h-7 w-7 cursor-default items-center justify-center rounded-full bg-paper/85 text-accent shadow-[var(--shadow-1)] backdrop-blur-sm"
      }
    >
      {icon}
    </button>
  )
}
