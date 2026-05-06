"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Image as ImageIcon } from "lucide-react"
import type { BookDetailDTO } from "@/lib/books"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

type Props = { book: BookDetailDTO }

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
}

function fromBook(book: BookDetailDTO): FormState {
  return {
    title: book.title,
    author: book.author ?? "",
    isbn: book.isbn ?? "",
    description: book.description ?? "",
    genre: book.genre ?? "",
    year: book.year ? String(book.year) : "",
    publisher: book.publisher ?? "",
    language: book.language ?? "",
    coverUrl: book.coverUrl ?? ""
  }
}

export function EditBookForm({ book }: Props) {
  const router = useRouter()
  const [form, setForm] = React.useState<FormState>(() => fromBook(book))
  const initial = React.useMemo(() => fromBook(book), [book])
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = React.useState(false)
  const [coverError, setCoverError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const dirty = React.useMemo(() => {
    return (Object.keys(form) as Array<keyof FormState>).some((k) => form[k] !== initial[k])
  }, [form, initial])

  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverError(null)
    setUploadingCover(true)
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/covers", { method: "POST", body: fd })
    setUploadingCover(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setCoverError(body?.error ?? "Echec de l'envoi de la couverture.")
      return
    }
    const body = (await res.json()) as { coverUrl: string }
    setForm((f) => ({ ...f, coverUrl: body.coverUrl }))
  }

  // Construit un patch minimal : seuls les champs reellement modifies partent.
  const buildPatch = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {}
    if (form.title !== initial.title) patch.title = form.title.trim()
    if (form.author !== initial.author) patch.author = form.author.trim() || null
    if (form.isbn !== initial.isbn) patch.isbn = form.isbn.trim() || null
    if (form.description !== initial.description)
      patch.description = form.description.trim() || null
    if (form.genre !== initial.genre) patch.genre = form.genre.trim() || null
    if (form.year !== initial.year) patch.year = form.year ? Number(form.year) : null
    if (form.publisher !== initial.publisher) patch.publisher = form.publisher.trim() || null
    if (form.language !== initial.language) patch.language = form.language.trim() || null
    if (form.coverUrl !== initial.coverUrl) patch.coverUrl = form.coverUrl.trim() || null
    return patch
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError("Le titre est obligatoire.")
      return
    }
    const patch = buildPatch()
    if (Object.keys(patch).length === 0) {
      router.push(`/bibliotheque/${book.id}`)
      return
    }
    setError(null)
    setPending(true)
    const res = await fetch(`/api/books/${book.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    })
    setPending(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de l'enregistrement.")
      return
    }
    router.push(`/bibliotheque/${book.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Titre *">
        <Input value={form.title} onChange={set("title")} required maxLength={500} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
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
          rows={5}
          className="w-full rounded-md border border-[var(--rule)] bg-paper px-3 py-2 text-sm text-ink shadow-[var(--shadow-1)] focus:border-ink-3 focus:outline-none focus:ring-[3px] focus:ring-[rgba(31,27,19,0.05)]"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
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

      <div className="rounded-xl border border-[var(--rule)] bg-paper-2/40 p-4">
        <p className="text-[13px] font-medium text-ink-2">Couverture</p>
        <p className="text-[12px] text-ink-3">
          Detectee depuis Google Books / Open Library lors de l&apos;ajout, ou
          telechargee manuellement. Vous pouvez la remplacer par une image (JPG, PNG ou WEBP, 5 Mo max).
        </p>
        <div className="mt-3 flex items-start gap-3">
          <div className="h-24 w-16 shrink-0 overflow-hidden rounded-sm bg-paper-3">
            {form.coverUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={form.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-ink-4">
                <ImageIcon size={18} />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Field label="URL de couverture">
              <Input
                value={form.coverUrl}
                onChange={set("coverUrl")}
                placeholder="https://... ou /api/covers/..."
              />
            </Field>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingCover}
              >
                {uploadingCover ? "Envoi..." : "Televerser une image"}
              </Button>
              {form.coverUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, coverUrl: "" }))}
                  disabled={uploadingCover}
                >
                  Retirer
                </Button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onCoverChange}
                className="hidden"
              />
            </div>
            {coverError ? (
              <p className="mt-2 text-[12px] text-[color:var(--err)]">{coverError}</p>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className="text-[13px] text-[color:var(--err)]">{error}</p> : null}

      <div className="flex items-center justify-between border-t border-[var(--rule-2)] pt-5">
        <Button
          variant="ghost"
          onClick={() => router.push(`/bibliotheque/${book.id}`)}
          disabled={pending}
        >
          <ArrowLeft size={14} />
          Annuler
        </Button>
        <Button type="submit" variant="primary" disabled={pending || !dirty}>
          <Check size={16} />
          {pending ? "Enregistrement..." : "Enregistrer"}
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
