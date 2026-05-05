"use client"

import { LogOut } from "lucide-react"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/Button"

export function SignOutButton() {
  return (
    <Button
      variant="secondary"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut size={16} />
      Se deconnecter
    </Button>
  )
}
