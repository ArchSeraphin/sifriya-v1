"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/Button"

type Props = { loanId: string }

export function MarkReturnedButton({ loanId }: Props) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const onClick = async () => {
    setError(null)
    setPending(true)
    const res = await fetch(`/api/loans/${loanId}/return`, { method: "PATCH" })
    setPending(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec.")
      return
    }
    router.refresh()
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={onClick} disabled={pending}>
        <CheckCircle2 size={14} />
        {pending ? "..." : "Marquer rendu"}
      </Button>
      {error ? (
        <span className="ml-2 text-[12px] text-[color:var(--err)]">{error}</span>
      ) : null}
    </>
  )
}
