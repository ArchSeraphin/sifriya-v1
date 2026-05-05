"use client"

import * as React from "react"
import { Menu } from "lucide-react"

// Le sidebar mobile est un detail simple : on s'appuie sur un evenement custom
// pour ouvrir le drawer (defini dans SidebarMobile). Evite de descendre du state
// jusqu'a la racine pour un layout server component.
export function MobileMenuButton() {
  return (
    <button
      type="button"
      aria-label="Ouvrir le menu"
      onClick={() => window.dispatchEvent(new CustomEvent("sifriya:open-sidebar"))}
      className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 transition hover:bg-paper-2 md:hidden"
    >
      <Menu size={20} />
    </button>
  )
}
