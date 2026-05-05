"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Pencil, Check, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

type Props = {
  initialName: string | null
  email: string
}

export function EditableName({ initialName, email }: Props) {
  const router = useRouter()
  const { update } = useSession()
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState(initialName ?? "")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // Si la valeur cote serveur change (apres router.refresh), on resynchronise
  // l'etat local pour qu'un nouveau clic sur Modifier reparte du bon nom.
  React.useEffect(() => {
    setValue(initialName ?? "")
  }, [initialName])

  const startEdit = () => {
    setError(null)
    setEditing(true)
  }
  const cancel = () => {
    setValue(initialName ?? "")
    setError(null)
    setEditing(false)
  }

  const save = async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setError("Le nom ne peut pas etre vide.")
      return
    }
    if (trimmed === (initialName ?? "")) {
      setEditing(false)
      return
    }
    setPending(true)
    setError(null)
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed })
    })
    setPending(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de l'enregistrement.")
      return
    }
    setEditing(false)
    // Rafraichit la page (server component lit la session) et le JWT
    // (declenche le callback jwt avec trigger=update -> resync depuis la DB).
    await update()
    router.refresh()
  }

  if (!editing) {
    const display = initialName ?? email.split("@")[0]
    return (
      <div className="flex items-center gap-2">
        <p className="truncate font-serif text-xl text-ink">{display}</p>
        <button
          type="button"
          onClick={startEdit}
          aria-label="Modifier le nom"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition hover:bg-paper-2 hover:text-ink"
        >
          <Pencil size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={120}
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void save()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              cancel()
            }
          }}
          className="max-w-xs"
        />
        <Button variant="primary" size="sm" onClick={save} disabled={pending}>
          <Check size={14} />
          {pending ? "..." : "OK"}
        </Button>
        <Button variant="ghost" size="sm" onClick={cancel} disabled={pending}>
          <X size={14} />
        </Button>
      </div>
      {error ? <p className="text-[12px] text-[color:var(--err)]">{error}</p> : null}
    </div>
  )
}
