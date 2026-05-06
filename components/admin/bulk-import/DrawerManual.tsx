"use client"

import * as React from "react"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import type { ItemForUI } from "./ImportClient"

type Props = { item: ItemForUI; sessionId: string; onUpdated: () => void; onAdvance: () => void }

export function DrawerManual({ item, sessionId, onUpdated, onAdvance }: Props) {
  const [title, setTitle] = React.useState(item.extractedTitle ?? item.filename.replace(/\.(epub|pdf)$/i, ""))
  const [author, setAuthor] = React.useState(item.extractedAuthor ?? "")
  const [isbn, setIsbn] = React.useState(item.extractedIsbn ?? "")
  const [pending, setPending] = React.useState(false)

  // Reset le formulaire quand on change d'item (auto-advance).
  React.useEffect(() => {
    setTitle(item.extractedTitle ?? item.filename.replace(/\.(epub|pdf)$/i, ""))
    setAuthor(item.extractedAuthor ?? "")
    setIsbn(item.extractedIsbn ?? "")
  }, [item.id, item.extractedTitle, item.extractedAuthor, item.extractedIsbn, item.filename])

  const submit = async () => {
    setPending(true)
    const res = await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "CREATE",
        formOverrides: {
          title,
          author: author || null,
          isbn: isbn || null
        }
      })
    })
    setPending(false)
    if (res.ok) {
      onUpdated()
      onAdvance()
    }
  }

  const skip = async () => {
    setPending(true)
    const res = await fetch(`/api/admin/bulk-imports/${sessionId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "SKIP" })
    })
    setPending(false)
    if (res.ok) {
      onUpdated()
      onAdvance()
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-[12px] text-ink-2">
        Titre *
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
      </label>
      <label className="block text-[12px] text-ink-2">
        Auteur
        <Input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={300} />
      </label>
      <label className="block text-[12px] text-ink-2">
        ISBN
        <Input value={isbn} onChange={(e) => setIsbn(e.target.value)} maxLength={20} inputMode="numeric" />
      </label>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="primary" onClick={submit} disabled={!title.trim() || pending}>Valider</Button>
        <Button variant="ghost" onClick={skip} disabled={pending}>Ignorer</Button>
      </div>
    </div>
  )
}
