"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

type Props = {
  users: Array<{ id: string; name: string | null; email: string }>
}

export function CreateLibraryForm({ users }: Props) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [managerId, setManagerId] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const mountedRef = React.useRef(true)
  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!name.trim()) {
      setError("Le nom est obligatoire.")
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await fetch("/api/libraries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        managerId: managerId || null
      })
    })
    if (!mountedRef.current) return
    setSubmitting(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!mountedRef.current) return
      setError(body?.error ?? "Erreur lors de la creation.")
      return
    }
    const { library } = (await res.json()) as { library: { id: string } }
    router.push(`/admin/bibliotheques/${library.id}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Nom *">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          autoFocus
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-md border border-[var(--rule)] bg-paper px-3 py-2 text-sm text-ink shadow-[var(--shadow-1)] focus:border-ink-3 focus:outline-none focus:ring-[3px] focus:ring-[rgba(31,27,19,0.05)]"
        />
      </Field>
      <Field label="Gerant (optionnel)">
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          className="h-9 w-full rounded-md border border-[var(--rule)] bg-paper px-3 text-sm text-ink shadow-[var(--shadow-1)] focus:border-ink-3 focus:outline-none"
        >
          <option value="">Aucun (admin seulement)</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
      </Field>

      {error ? (
        <div className="rounded-md border border-[rgba(138,48,48,0.2)] bg-[rgba(138,48,48,0.06)] p-3">
          <p className="text-[13px] text-[color:var(--err)]">{error}</p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary" disabled={submitting || !name.trim()}>
          {submitting ? "Creation..." : "Creer"}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[13px] text-ink-2">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  )
}
