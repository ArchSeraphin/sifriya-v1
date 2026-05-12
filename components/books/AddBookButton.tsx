"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { AddBookFlow } from "@/components/books/AddBookFlow"

type Props = { variant?: "primary" | "secondary"; size?: "sm" | "md" | "lg" }

const LIBRARY_PATH_RE = /^\/bibliotheques\/([^/]+)/

export function AddBookButton({ variant = "primary", size = "md" }: Props) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  const initialLibraryId = pathname?.match(LIBRARY_PATH_RE)?.[1]
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus size={16} />
        Ajouter un livre
      </Button>
      <AddBookFlow open={open} onClose={() => setOpen(false)} initialLibraryId={initialLibraryId} />
    </>
  )
}
