"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"

export function MembersToolbar() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [info, setInfo] = React.useState<string | null>(null)

  const reset = () => {
    setEmail("")
    setError(null)
    setInfo(null)
    setPending(false)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!email) return
    setPending(true)
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    })
    setPending(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de l'invitation.")
      return
    }
    const body = (await res.json()) as { created: boolean }
    setInfo(
      body.created
        ? "Membre cree, magic link envoye."
        : "Magic link renvoye au membre existant."
    )
    setEmail("")
    router.refresh()
  }

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        <UserPlus size={16} />
        Inviter un membre
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          reset()
        }}
        title="Inviter un membre"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false)
                reset()
              }}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="primary"
              form="invite-form"
              disabled={pending || !email}
            >
              {pending ? "Envoi..." : "Envoyer l'invitation"}
            </Button>
          </>
        }
      >
        <form id="invite-form" onSubmit={onSubmit} className="space-y-3">
          <p className="text-[13px] text-ink-3">
            Un email contenant un lien de connexion (valable 24h) sera envoye a cette
            adresse.
          </p>
          <label className="block text-[13px] text-ink-2">
            <span className="mb-1.5 block font-medium">Email</span>
            <Input
              type="email"
              autoComplete="off"
              required
              placeholder="prenom.nom@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </label>
          {error ? <p className="text-[13px] text-[color:var(--err)]">{error}</p> : null}
          {info ? <p className="text-[13px] text-[color:var(--ok)]">{info}</p> : null}
        </form>
      </Modal>
    </>
  )
}
