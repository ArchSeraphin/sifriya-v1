"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import type { Role } from "@prisma/client"

const ROLES: ReadonlyArray<{ value: Role; label: string }> = [
  { value: "USER", label: "Membre" },
  { value: "ADMIN", label: "Administrateur" }
]

type Props = { id: string; role: Role; email: string }

export function MemberRoleSelect({ id, role, email }: Props) {
  const router = useRouter()
  const session = useSession()
  const [value, setValue] = React.useState<Role>(role)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => setValue(role), [role])

  const isSelf = session.data?.user?.email === email

  const onChange = async (next: Role) => {
    if (next === value) return
    const previous = value
    setValue(next)
    setPending(true)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: next })
    })
    setPending(false)
    if (!res.ok) {
      setValue(previous)
      return
    }
    router.refresh()
  }

  return (
    <select
      value={value}
      disabled={pending || isSelf}
      onChange={(e) => onChange(e.target.value as Role)}
      title={isSelf ? "Vous ne pouvez pas modifier votre propre role." : undefined}
      className="h-8 rounded-md border border-[var(--rule)] bg-paper px-2 text-[13px] text-ink shadow-[var(--shadow-1)] focus:border-ink-3 focus:outline-none focus:ring-[3px] focus:ring-[rgba(31,27,19,0.05)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  )
}
