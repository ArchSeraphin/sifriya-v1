"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { ArrowLeft, FileUp, Check, Loader2, FileText } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { formatBytes } from "@/lib/books"
import { LibrarySelector } from "@/components/libraries/LibrarySelector"
import { GENERALE_LIBRARY_ID } from "@/lib/libraries"

type Step = "select" | "uploading" | "form"

type UploadResult = {
  uploadId: string
  filename: string
  format: "EPUB" | "PDF"
  size: number
  suggestedQuery: string
}

type Props = {
  onClose: () => void
  initialLibraryId?: string
}

const MAX_BYTES = 50 * 1024 * 1024

export function PlancheFlow({ onClose, initialLibraryId }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const [step, setStep] = React.useState<Step>("select")
  const [upload, setUpload] = React.useState<UploadResult | null>(null)
  const [progress, setProgress] = React.useState(0)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [title, setTitle] = React.useState("")
  const [author, setAuthor] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [year, setYear] = React.useState("")
  const [libraryId, setLibraryId] = React.useState<string>(initialLibraryId ?? GENERALE_LIBRARY_ID)

  // Default the author to the session user's name on first render of the form step,
  // but only if the user hasn't typed anything. We use a ref so we only seed once.
  const seededAuthorRef = React.useRef(false)
  React.useEffect(() => {
    if (step !== "form" || seededAuthorRef.current) return
    if (!author && session?.user?.name) {
      setAuthor(session.user.name)
    }
    seededAuthorRef.current = true
  }, [step, author, session?.user?.name])

  const startUpload = async (file: File) => {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError("Fichier trop volumineux (max 50 Mo).")
      return
    }
    // Accept only PDF for Planches (server also checks).
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Seul le format PDF est accepte pour une Planche.")
      return
    }
    setStep("uploading")
    setProgress(0)
    const data = new FormData()
    data.append("file", file)
    try {
      const result = (await uploadWithProgress("/api/uploads", data, setProgress)) as UploadResult
      if (result.format !== "PDF") {
        setError("Seul le format PDF est accepte pour une Planche.")
        setStep("select")
        return
      }
      setUpload(result)
      setTitle(result.suggestedQuery)
      setStep("form")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec de l'envoi.")
      setStep("select")
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!upload) return
    if (!title.trim()) {
      setError("Le titre est obligatoire.")
      return
    }
    setPending(true)
    setError(null)
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        copyType: "DIGITAL",
        uploadId: upload.uploadId,
        format: "PDF",
        fileSize: upload.size,
        title: title.trim(),
        author: author.trim() || null,
        description: description.trim() || null,
        year: year ? Number(year) : null,
        sourceApi: "manual",
        libraryId,
        isPersonal: true
      })
    })
    setPending(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de l'enregistrement.")
      return
    }
    onClose()
    router.refresh()
  }

  if (step === "select") {
    return <SelectStep onFile={startUpload} error={error} />
  }
  if (step === "uploading") {
    return <UploadingStep progress={progress} />
  }
  if (step === "form" && upload) {
    return (
      <form onSubmit={onSubmit} className="space-y-4">
        <UploadSummary upload={upload} />
        <Field label="Titre *">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={500}
            autoFocus
          />
        </Field>
        <Field label="Auteur">
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={300} />
        </Field>
        <Field label="Annee">
          <Input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            maxLength={4}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={4}
            className="w-full rounded-md border border-[var(--rule)] bg-paper px-3 py-2 text-sm text-ink shadow-[var(--shadow-1)] focus:border-ink-3 focus:outline-none focus:ring-[3px] focus:ring-[rgba(31,27,19,0.05)]"
          />
        </Field>
        <LibrarySelector value={libraryId} onChange={setLibraryId} label="Bibliotheque" />

        {error ? (
          <div className="rounded-md border border-[rgba(138,48,48,0.2)] bg-[rgba(138,48,48,0.06)] p-3">
            <p className="text-[13px] text-[color:var(--err)]">{error}</p>
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            <ArrowLeft size={14} />
            Annuler
          </Button>
          <Button type="submit" variant="primary" disabled={pending || !title.trim()}>
            <Check size={16} />
            {pending ? "Enregistrement..." : "Ajouter la Planche"}
          </Button>
        </div>
      </form>
    )
  }
  return null
}

function SelectStep({
  onFile,
  error
}: {
  onFile: (file: File) => void
  error: string | null
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink-3">
        Une <strong>Planche</strong> est un PDF personnel dont vous etes l&apos;auteur (ecrit,
        article, journal). Max 50 Mo.
      </p>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragOver
            ? "border-[color:var(--accent)] bg-accent-soft/40"
            : "border-[var(--rule)] bg-paper-2/40 hover:border-ink-3"
        }`}
      >
        <FileUp size={28} className="text-ink-3" />
        <p className="mt-3 font-serif text-lg text-ink">Deposez votre PDF ici</p>
        <p className="mt-1 text-[13px] text-ink-3">ou cliquez pour parcourir</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
        />
      </div>
      {error ? <p className="text-[13px] text-[color:var(--err)]">{error}</p> : null}
    </div>
  )
}

function UploadingStep({ progress }: { progress: number }) {
  const pct = Math.min(100, Math.round(progress * 100))
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <Loader2 size={28} className="animate-spin text-ink-3" />
      <p className="text-sm text-ink-2">Envoi en cours... {pct}%</p>
      <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-paper-2">
        <div
          className="h-full bg-accent transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[13px] text-ink-2">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  )
}

function UploadSummary({ upload }: { upload: UploadResult }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--rule)] bg-paper-2/40 px-3 py-2.5">
      <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[#5a4711]">
        <FileText size={18} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{upload.filename}</p>
        <p className="text-[12px] text-ink-3">
          {upload.format} - {formatBytes(upload.size)}
        </p>
      </div>
    </div>
  )
}

function uploadWithProgress(
  url: string,
  data: FormData,
  onProgress: (frac: number) => void
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error("Reponse serveur invalide."))
        }
      } else {
        let msg = "Echec de l'envoi."
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string }
          if (body.error) msg = body.error
        } catch {
          /* noop */
        }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error("Connexion interrompue."))
    xhr.send(data)
  })
}
