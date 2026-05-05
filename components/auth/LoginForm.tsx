"use client"

import * as React from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Mail } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

type LoginFormProps = {
  callbackUrl?: string
  initialError?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Cet email n'est pas autorise. Demandez une invitation a l'administrateur.",
  Verification: "Le lien est expire ou invalide. Demandez un nouveau lien.",
  default: "Impossible d'envoyer le lien pour le moment."
}

export function LoginForm({ callbackUrl, initialError }: LoginFormProps) {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(
    initialError ? (ERROR_MESSAGES[initialError] ?? ERROR_MESSAGES.default ?? null) : null
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email) return
    setPending(true)
    const res = await signIn("email", {
      email: email.trim().toLowerCase(),
      callbackUrl: callbackUrl ?? "/bibliotheque",
      redirect: false
    })
    setPending(false)
    if (!res || res.error) {
      const code = res?.error ?? "default"
      setError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.default ?? null)
      return
    }
    router.push("/verify")
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-[13px] text-ink-2">
        <span className="mb-1.5 block font-medium">Email</span>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="vous@exemple.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      {error ? (
        <p role="alert" className="text-[13px] text-[color:var(--err)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="md" disabled={pending} className="w-full">
        <Mail size={16} />
        {pending ? "Envoi..." : "Recevoir mon lien"}
      </Button>
    </form>
  )
}
