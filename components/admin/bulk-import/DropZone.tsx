"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FolderOpen, Upload } from "lucide-react"
import { Button } from "@/components/ui/Button"
import {
  MAX_FILES_ADMIN,
  WARN_FILES_ADMIN
} from "@/lib/bulk-import-limits"

const ACCEPTED_EXT = [".epub", ".pdf"]

export function DropZone() {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [files, setFiles] = React.useState<File[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return
    setError(null)
    const filtered = Array.from(incoming).filter((f) =>
      ACCEPTED_EXT.some((ext) => f.name.toLowerCase().endsWith(ext))
    )
    if (filtered.length === 0) {
      setError("Aucun fichier EPUB ou PDF detecte.")
      return
    }
    if (filtered.length > MAX_FILES_ADMIN) {
      setError(`Maximum ${MAX_FILES_ADMIN} fichiers par session (recu ${filtered.length}).`)
      return
    }
    setFiles(filtered)
  }

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1)
  const epubCount = files.filter((f) => f.name.toLowerCase().endsWith(".epub")).length
  const pdfCount = files.length - epubCount

  const start = async () => {
    if (files.length === 0) return
    if (files.length > WARN_FILES_ADMIN) {
      const ok = window.confirm(
        `${files.length} fichiers vont etre importes — cela peut prendre plusieurs minutes. Continuer ?`
      )
      if (!ok) return
    }
    setPending(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/bulk-imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ totalFiles: files.length })
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "Echec de la creation de session.")
      }
      const { sessionId } = (await res.json()) as { sessionId: string }
      // Stash files dans une variable globale pour les recuperer cote /[id]
      ;(window as unknown as Record<string, unknown>).__bulkImportFiles = files
      router.push(`/admin/bulk-import/${sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.")
      setPending(false)
    }
  }

  return (
    <section className="space-y-3">
      <div
        onDrop={(e) => {
          e.preventDefault()
          handleFiles(e.dataTransfer.files)
        }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--rule)] bg-paper-2/40 px-6 py-12 text-center hover:border-ink-3"
      >
        <FolderOpen size={28} className="text-ink-3" />
        <p className="mt-3 font-serif text-lg text-ink">Deposez un dossier ici</p>
        <p className="mt-1 text-[13px] text-ink-3">ou cliquez pour parcourir</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          // @ts-expect-error — webkitdirectory n'est pas dans les types React
          webkitdirectory=""
          directory=""
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <div className="rounded-md border border-[var(--rule)] bg-paper p-3 text-[13px]">
          <p className="text-ink">
            <strong>{files.length}</strong> fichiers ({epubCount} EPUB + {pdfCount} PDF) —{" "}
            <span className="font-mono">{totalMb} Mo</span>
          </p>
          <div className="mt-3 flex justify-end">
            <Button onClick={start} disabled={pending}>
              <Upload size={14} />
              {pending ? "Creation de session..." : "Demarrer l'import"}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-[13px] text-[color:var(--err)]">{error}</p> : null}
    </section>
  )
}
