"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, FileUp, FileText, Check, Loader2 } from "lucide-react"
import type { BookMetadata } from "@/lib/metadata"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { formatBytes } from "@/lib/books"

type Step = "select" | "uploading" | "match" | "form"

type UploadResult = {
  uploadId: string
  filename: string
  format: "EPUB" | "PDF"
  size: number
  suggestedQuery: string
}

type FormState = {
  title: string
  author: string
  isbn: string
  description: string
  genre: string
  year: string
  publisher: string
  language: string
  coverUrl: string
  sourceApi: "google_books" | "open_library" | "manual" | ""
  externalId: string
}

const EMPTY_FORM: FormState = {
  title: "",
  author: "",
  isbn: "",
  description: "",
  genre: "",
  year: "",
  publisher: "",
  language: "fr",
  coverUrl: "",
  sourceApi: "",
  externalId: ""
}

const MAX_BYTES = 50 * 1024 * 1024

type Props = {
  onClose: () => void
  onCancel: () => void
}

export function DigitalUploadFlow({ onClose, onCancel }: Props) {
  const router = useRouter()
  const [step, setStep] = React.useState<Step>("select")
  const [upload, setUpload] = React.useState<UploadResult | null>(null)
  const [progress, setProgress] = React.useState(0)
  const [matches, setMatches] = React.useState<BookMetadata[]>([])
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const startUpload = async (file: File) => {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError("Fichier trop volumineux (max 50 Mo).")
      return
    }
    setStep("uploading")
    setProgress(0)
    const data = new FormData()
    data.append("file", file)
    try {
      const result = (await uploadWithProgress("/api/uploads", data, setProgress)) as UploadResult
      setUpload(result)
      setForm((f) => ({ ...f, title: result.suggestedQuery }))
      const r = await fetch(
        `/api/metadata?q=${encodeURIComponent(result.suggestedQuery)}&limit=5`
      )
      const body = (await r.json().catch(() => ({ results: [] }))) as { results: BookMetadata[] }
      setMatches(body.results ?? [])
      setStep("match")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec de l'envoi.")
      setStep("select")
    }
  }

  const onPickMatch = (m: BookMetadata) => {
    setForm({
      title: m.title,
      author: m.author ?? "",
      isbn: m.isbn ?? "",
      description: m.description ?? "",
      genre: m.genre ?? "",
      year: m.year ? String(m.year) : "",
      publisher: m.publisher ?? "",
      language: m.language ?? "fr",
      coverUrl: m.coverUrl ?? "",
      sourceApi: m.source,
      externalId: m.externalId
    })
    setStep("form")
  }

  const onSkipMatch = () => {
    setForm((f) => ({ ...f, sourceApi: "manual" }))
    setStep("form")
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!upload) return
    if (!form.title.trim()) {
      setError("Le titre est obligatoire.")
      return
    }
    setPending(true)
    setError(null)
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "DIGITAL",
        uploadId: upload.uploadId,
        format: upload.format,
        fileSize: upload.size,
        title: form.title.trim(),
        author: form.author.trim() || null,
        isbn: form.isbn.trim() || null,
        description: form.description.trim() || null,
        genre: form.genre.trim() || null,
        year: form.year ? Number(form.year) : null,
        publisher: form.publisher.trim() || null,
        language: form.language.trim() || null,
        coverUrl: form.coverUrl.trim() || null,
        sourceApi: form.sourceApi || "manual",
        externalId: form.externalId.trim() || null
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

  if (step === "select") return <SelectStep onFile={startUpload} onBack={onCancel} error={error} />
  if (step === "uploading") return <UploadingStep progress={progress} />
  if (step === "match" && upload) {
    return (
      <MatchStep
        upload={upload}
        matches={matches}
        onPick={onPickMatch}
        onSkip={onSkipMatch}
        onBack={() => setStep("select")}
      />
    )
  }
  if (step === "form" && upload) {
    return (
      <FormStep
        form={form}
        setForm={setForm}
        upload={upload}
        pending={pending}
        error={error}
        onBack={() => setStep("match")}
        onSubmit={onSubmit}
      />
    )
  }
  return null
}

// =====================================================================

function SelectStep({
  onFile,
  onBack,
  error
}: {
  onFile: (file: File) => void
  onBack: () => void
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
        Deposez un fichier <strong>EPUB</strong> ou <strong>PDF</strong> (max 50 Mo).
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
        <p className="mt-3 font-serif text-lg text-ink">Deposez votre fichier ici</p>
        <p className="mt-1 text-[13px] text-ink-3">ou cliquez pour parcourir</p>
        <input
          ref={inputRef}
          type="file"
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
        />
      </div>
      {error ? <p className="text-[13px] text-[color:var(--err)]">{error}</p> : null}
      <div className="flex justify-start">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} />
          Retour
        </Button>
      </div>
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

function MatchStep({
  upload,
  matches,
  onPick,
  onSkip,
  onBack
}: {
  upload: UploadResult
  matches: BookMetadata[]
  onPick: (m: BookMetadata) => void
  onSkip: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <UploadSummary upload={upload} />
      {matches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--rule)] bg-paper-2/40 px-4 py-6 text-center text-[13px] text-ink-3">
          Aucune fiche trouvee. Continuez en saisie manuelle.
        </div>
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => (
            <li key={`${m.source}-${m.externalId}`}>
              <button
                type="button"
                onClick={() => onPick(m)}
                className="flex w-full items-start gap-3 rounded-xl border border-[var(--rule)] bg-paper p-3 text-left transition hover:border-ink-3 hover:bg-paper-2"
              >
                <div className="h-20 w-14 shrink-0 overflow-hidden rounded-sm bg-paper-3">
                  {m.coverUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-serif text-[15px] text-ink">{m.title}</p>
                  {m.author ? (
                    <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-2">{m.author}</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] text-ink-3">
                    {m.year ? <span>{m.year}</span> : null}
                    {m.publisher ? <span className="truncate">{m.publisher}</span> : null}
                    <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-ink-4">
                      {m.source === "google_books" ? "Google" : "Open Library"}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} />
          Renvoyer un autre fichier
        </Button>
        <Button variant="secondary" onClick={onSkip}>
          Aucune correspondance
        </Button>
      </div>
    </div>
  )
}

function FormStep({
  form,
  setForm,
  upload,
  pending,
  error,
  onBack,
  onSubmit
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  upload: UploadResult
  pending: boolean
  error: string | null
  onBack: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <UploadSummary upload={upload} />
      <Field label="Titre *">
        <Input value={form.title} onChange={set("title")} required maxLength={500} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Auteur">
          <Input value={form.author} onChange={set("author")} maxLength={300} />
        </Field>
        <Field label="ISBN">
          <Input value={form.isbn} onChange={set("isbn")} maxLength={20} inputMode="numeric" />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={form.description}
          onChange={set("description")}
          maxLength={5000}
          rows={4}
          className="w-full rounded-md border border-[var(--rule)] bg-paper px-3 py-2 text-sm text-ink shadow-[var(--shadow-1)] focus:border-ink-3 focus:outline-none focus:ring-[3px] focus:ring-[rgba(31,27,19,0.05)]"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Genre">
          <Input value={form.genre} onChange={set("genre")} maxLength={120} />
        </Field>
        <Field label="Annee">
          <Input value={form.year} onChange={set("year")} inputMode="numeric" maxLength={4} />
        </Field>
        <Field label="Langue">
          <Input value={form.language} onChange={set("language")} maxLength={10} />
        </Field>
      </div>
      <Field label="Editeur">
        <Input value={form.publisher} onChange={set("publisher")} maxLength={200} />
      </Field>
      {form.coverUrl ? (
        <div className="flex items-center gap-3 rounded-md border border-[var(--rule-2)] bg-paper-2/40 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={form.coverUrl}
            alt=""
            className="h-16 w-12 rounded-sm object-cover"
            loading="lazy"
          />
          <p className="text-[12px] text-ink-3">
            Couverture detectee depuis{" "}
            {form.sourceApi === "google_books" ? "Google Books" : "Open Library"}
          </p>
        </div>
      ) : null}
      {error ? <p className="text-[13px] text-[color:var(--err)]">{error}</p> : null}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeft size={14} />
          Retour
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          <Check size={16} />
          {pending ? "Enregistrement..." : "Ajouter a la bibliotheque"}
        </Button>
      </div>
    </form>
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
          {upload.format} · {formatBytes(upload.size)}
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
