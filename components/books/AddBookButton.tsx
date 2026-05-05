"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { UploadFlow } from "@/components/books/UploadFlow"

type Props = { variant?: "primary" | "secondary"; size?: "sm" | "md" | "lg" }

export function AddBookButton({ variant = "primary", size = "md" }: Props) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus size={16} />
        Ajouter un livre
      </Button>
      <UploadFlow open={open} onClose={() => setOpen(false)} />
    </>
  )
}
