"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

type Props = {
  library: {
    id: string
    name: string
    description: string | null
    managerId: string | null
    isDefault: boolean
    bookCount: number
  }
  users: Array<{ id: string; name: string | null; email: string }>
}

export function EditLibraryForm({ library, users }: Props) {
  const router = useRouter()
  const [name, setName] = React.useState(library.name)
  const [description, setDescription] = React.useState(library.description ?? "")
  const [managerId, setManagerId] = React.useState(library.managerId ?? "")
  const [submitting, setSubmitting] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  const mountedRef = React.useRef(true)
  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || deleting) return
    if (!name.trim()) {
      setError("Le nom est obligatoire.")
      return
    }
    setSubmitting(true)
    setError(null)
    setSaved(false)
    const res = await fetch(`/api/libraries/${library.id}`, {
      method: "PATCH",
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
      setError(body?.error ?? "Erreur lors de l'enregistrement.")
      return
    }
    setSaved(true)
    router.refresh()
  }

  const onDelete = async () => {
    if (deleting || submitting) return
    if (!confirm("Supprimer cette bibliotheque ? Cette action est irreversible.")) return
    setDeleting(true)
    setError(null)
    const res = await fetch(`/api/libraries/${library.id}`, { method: "DELETE" })
    if (!mountedRef.current) return
    setDeleting(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!mountedRef.current) return
      setError(body?.error ?? "Erreur lors de la suppression.")
      return
    }
    router.push("/admin/bibliotheques")
  }

  const canDelete = !library.isDefault && library.bookCount === 0
  const deleteTitle = library.isDefault
    ? "La bibliotheque par defaut ne peut pas etre supprimee"
    : library.bookCount > 0
    ? `Bibliotheque non vide (${library.bookCount} exemplaires)`
    : undefined

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <Field label="Nom *">
        <Input
          value={name}
          onChange={(e) => {
            setSaved(false)
            setName(e.target.value)
          }}
          required
          maxLength={100}
          disabled={library.isDefault}
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => {
            setSaved(false)
            setDescription(e.target.value)
          }}
          rows={3}
          maxLength={500}
          className="w-full rounded-md border border-[var(--rule)] bg-paper px-3 py-2 text-sm text-ink shadow-[var(--shadow-1)] focus:border-ink-3 focus:outline-none focus:ring-[3px] focus:ring-[rgba(31,27,19,0.05)]"
        />
      </Field>
      {!library.isDefault ? (
        <Field label="Gerant">
          <select
            value={managerId}
            onChange={(e) => {
              setSaved(false)
              setManagerId(e.target.value)
            }}
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
      ) : null}

      {error ? (
        <div className="rounded-md border border-[rgba(138,48,48,0.2)] bg-[rgba(138,48,48,0.06)] p-3">
          <p className="text-[13px] text-[color:var(--err)]">{error}</p>
        </div>
      ) : null}
      {saved ? <p className="text-[13px] text-[color:var(--ok)]">Modifications enregistrees.</p> : null}

      <div className="flex items-center justify-between border-t border-[var(--rule)] pt-4">
        <Button
          type="button"
          variant="danger"
          onClick={onDelete}
          disabled={!canDelete || deleting || submitting}
          title={deleteTitle}
        >
          {deleting ? "Suppression..." : "Supprimer"}
        </Button>
        <Button type="submit" variant="primary" disabled={submitting || deleting || !name.trim()}>
          {submitting ? "Enregistrement..." : "Enregistrer"}
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
