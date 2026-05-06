"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Send, Check } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"
import { Avatar } from "@/components/ui/Avatar"

export type CopyForLoan = {
  id: string
  ownerId: string
  ownerName: string
  ownerEmail: string
  ownerColor: string
  isMyCopy: boolean
  activeLoan: { id: string; status: "PENDING" | "ACCEPTED" } | null
  myActiveRequest: { id: string; status: "PENDING" | "ACCEPTED" } | null
}

type Props = {
  bookTitle: string
  copies: CopyForLoan[]
}

export function LoanRequestButton({ bookTitle, copies }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)

  const requestLoan = async (copyId: string) => {
    setPending(copyId)
    setError(null)
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ copyId })
    })
    setPending(null)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de la demande.")
      return
    }
    setDone(copyId)
    router.refresh()
  }

  const requestable = copies.filter(
    (c) => !c.isMyCopy && !c.myActiveRequest && c.activeLoan?.status !== "ACCEPTED"
  )
  if (requestable.length === 0) {
    return null
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="primary">
        <Send size={16} />
        Demander en pret
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Demander en pret">
        <p className="text-[13px] text-ink-3">
          Choisissez l'exemplaire physique de <strong>{bookTitle}</strong> que vous souhaitez emprunter.
        </p>
        <ul className="mt-3 space-y-2">
          {copies.map((c) => {
            const isOwn = c.isMyCopy
            const lent = c.activeLoan?.status === "ACCEPTED"
            const requested = !!c.myActiveRequest
            const disabled = isOwn || lent || requested || pending !== null
            const succeeded = done === c.id
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-md border border-[var(--rule-2)] bg-paper-2/30 px-3 py-2"
              >
                <Avatar
                  name={c.ownerName}
                  email={c.ownerEmail}
                  color={c.ownerColor}
                  size="sm"
                />
                <div className="flex-1 min-w-0 text-[13px]">
                  <p className="text-ink">{c.ownerName}</p>
                  {isOwn ? (
                    <p className="text-[12px] text-ink-3">Vous etes proprietaire</p>
                  ) : lent ? (
                    <p className="text-[12px] text-ink-3">Deja prete a quelqu'un d'autre</p>
                  ) : requested ? (
                    <p className="text-[12px] text-ink-3">Demande deja envoyee</p>
                  ) : null}
                </div>
                {succeeded ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-[color:var(--ok)]">
                    <Check size={14} />
                    Envoyee
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => requestLoan(c.id)}
                    disabled={disabled}
                  >
                    Demander
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {error ? <p className="mt-2 text-[12px] text-[color:var(--err)]">{error}</p> : null}
      </Modal>
    </>
  )
}
