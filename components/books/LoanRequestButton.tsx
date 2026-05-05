"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { HandHelping } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"

type Props = {
  bookId: string
  bookTitle: string
  ownerName: string
  alreadyRequested: boolean
}

export function LoanRequestButton({ bookId, bookTitle, ownerName, alreadyRequested }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (alreadyRequested) {
    return (
      <Button
        variant="secondary"
        disabled
        title="Vous avez deja une demande active pour ce livre."
      >
        <HandHelping size={16} />
        Demande envoyee
      </Button>
    )
  }

  const submit = async () => {
    setError(null)
    setPending(true)
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookId })
    })
    setPending(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de la demande.")
      return
    }
    setOpen(false)
    router.refresh()
    router.push("/pret")
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <HandHelping size={16} />
        Demander en pret
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Demander en pret"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Envoi..." : "Envoyer la demande"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          {ownerName} recevra un email pour accepter ou refuser. Vous serez notifie de la
          reponse.
        </p>
        <p className="mt-3 text-[13px] text-ink-3">
          Livre : <strong className="font-serif">{bookTitle}</strong>
        </p>
        {error ? <p className="mt-3 text-[13px] text-[color:var(--err)]">{error}</p> : null}
      </Modal>
    </>
  )
}
