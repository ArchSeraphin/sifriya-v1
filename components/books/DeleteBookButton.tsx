"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"

type Props = { id: string; title: string }

export function DeleteBookButton({ id, title }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const onConfirm = async () => {
    setPending(true)
    setError(null)
    const res = await fetch(`/api/books/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de la suppression.")
      setPending(false)
      return
    }
    setOpen(false)
    setPending(false)
    router.push("/bibliotheque")
    router.refresh()
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 size={16} />
        Supprimer
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Supprimer ce livre ?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={pending}>
              {pending ? "Suppression..." : "Supprimer definitivement"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Vous allez supprimer{" "}
          <strong className="font-serif">{title}</strong> de la bibliotheque. Le fichier sera
          aussi efface du serveur. Cette action est irreversible.
        </p>
        {error ? <p className="mt-3 text-[13px] text-[color:var(--err)]">{error}</p> : null}
      </Modal>
    </>
  )
}
