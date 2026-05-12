"use client"

import * as React from "react"
import { Cloud, BookOpenText, FileText } from "lucide-react"
import { Modal } from "@/components/ui/Modal"
import { DigitalUploadFlow } from "@/components/books/DigitalUploadFlow"
import { PhysicalFlow } from "@/components/books/PhysicalFlow"
import { PlancheFlow } from "@/components/books/PlancheFlow"

type Mode = "choose" | "digital" | "physical" | "planche"

type Props = { open: boolean; onClose: () => void; initialLibraryId?: string }

export function AddBookFlow({ open, onClose, initialLibraryId }: Props) {
  const [mode, setMode] = React.useState<Mode>("choose")

  React.useEffect(() => {
    if (!open) setMode("choose")
  }, [open])

  const close = () => {
    onClose()
  }

  const title =
    mode === "choose"
      ? "Ajouter un livre"
      : mode === "digital"
        ? "Ajouter un livre numerique"
        : mode === "physical"
          ? "Ajouter un livre physique"
          : "Ajouter une planche"

  return (
    <Modal open={open} onClose={close} title={title} size="lg">
      {mode === "choose" ? (
        <TypeChooser
          onDigital={() => setMode("digital")}
          onPhysical={() => setMode("physical")}
          onPlanche={() => setMode("planche")}
        />
      ) : null}
      {mode === "digital" ? (
        <DigitalUploadFlow
          onClose={close}
          onCancel={() => setMode("choose")}
          initialLibraryId={initialLibraryId}
        />
      ) : null}
      {mode === "physical" ? (
        <PhysicalFlow
          onClose={close}
          onCancel={() => setMode("choose")}
          initialLibraryId={initialLibraryId}
        />
      ) : null}
      {mode === "planche" ? (
        <PlancheFlow onClose={close} initialLibraryId={initialLibraryId} />
      ) : null}
    </Modal>
  )
}

function TypeChooser({
  onDigital,
  onPhysical,
  onPlanche
}: {
  onDigital: () => void
  onPhysical: () => void
  onPlanche: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-3">Quel type de livre souhaitez-vous ajouter ?</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Choice
          Icon={Cloud}
          label="Numerique"
          hint="Deposez un fichier EPUB ou PDF (50 Mo max)."
          onClick={onDigital}
        />
        <Choice
          Icon={BookOpenText}
          label="Physique"
          hint="Un livre papier que vous mettez a disposition pour le pret."
          onClick={onPhysical}
        />
        <Choice
          Icon={FileText}
          label="Planche"
          hint="Un PDF personnel dont vous etes l'auteur (ecrit, article, journal)."
          onClick={onPlanche}
        />
      </div>
    </div>
  )
}

function Choice({
  Icon,
  label,
  hint,
  onClick
}: {
  Icon: React.ComponentType<{ size?: number }>
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-2xl border border-[var(--rule)] bg-paper p-5 text-left transition hover:-translate-y-0.5 hover:border-ink-3 hover:bg-paper-2 hover:shadow-[var(--shadow-2)]"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-[#5a4711]">
        <Icon size={22} />
      </span>
      <span>
        <span className="block font-serif text-lg text-ink">{label}</span>
        <span className="mt-1 block text-[13px] text-ink-3">{hint}</span>
      </span>
    </button>
  )
}
