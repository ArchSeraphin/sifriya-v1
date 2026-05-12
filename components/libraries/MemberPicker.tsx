"use client"

import * as React from "react"
import { Button } from "@/components/ui/Button"
import { Avatar } from "@/components/ui/Avatar"

type Member = {
  id: string
  name: string | null
  email: string
  avatarColor: string
}

type Props = {
  libraryId: string
  allUsers: Member[]
  initialMemberIds: string[]
  managerId: string | null
  currentUserId: string
}

export function MemberPicker({ libraryId, allUsers, initialMemberIds, managerId, currentUserId }: Props) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set(initialMemberIds))
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  const mountedRef = React.useRef(true)
  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const isManagerLocked = (userId: string) => userId === managerId

  const toggle = (userId: string) => {
    if (isManagerLocked(userId)) return
    setSuccess(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const onSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    const res = await fetch(`/api/libraries/${libraryId}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [...selected] })
    })
    if (!mountedRef.current) return
    setSubmitting(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!mountedRef.current) return
      setError(body?.error ?? "Erreur lors de l'enregistrement.")
      return
    }
    setSuccess(true)
  }

  const totalCount = [...selected].length + (managerId && !selected.has(managerId) ? 1 : 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[480px] divide-y divide-[var(--rule-2)] overflow-y-auto rounded-md border border-[var(--rule)] bg-paper">
        {allUsers.map((user) => {
          const isManager = isManagerLocked(user.id)
          const isCurrent = user.id === currentUserId
          const checked = selected.has(user.id) || isManager
          return (
            <label
              key={user.id}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition hover:bg-paper-2 ${
                isManager ? "cursor-not-allowed opacity-70" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isManager || submitting}
                onChange={() => toggle(user.id)}
                className="h-4 w-4"
              />
              <Avatar name={user.name} email={user.email} color={user.avatarColor} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {user.name ?? user.email.split("@")[0]}
                  {isManager ? (
                    <span className="ml-2 text-[11px] text-[var(--accent)]">(gerant)</span>
                  ) : null}
                  {isCurrent && !isManager ? (
                    <span className="ml-2 text-[11px] text-ink-3">(vous)</span>
                  ) : null}
                </p>
                <p className="truncate text-[12px] text-ink-3">{user.email}</p>
              </div>
            </label>
          )
        })}
      </div>

      {error ? <p className="text-[13px] text-[color:var(--err)]">{error}</p> : null}
      {success ? <p className="text-[13px] text-[color:var(--ok)]">Membres mis a jour.</p> : null}

      <div className="flex justify-end">
        <Button variant="primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Enregistrement..." : `Enregistrer (${totalCount} membres)`}
        </Button>
      </div>
    </div>
  )
}
