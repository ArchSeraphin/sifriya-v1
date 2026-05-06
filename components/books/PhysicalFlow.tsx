"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Barcode,
  Search,
  PencilLine,
  Check,
  Image as ImageIcon
} from "lucide-react"
import type { BookMetadata } from "@/lib/metadata"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { useMetadataSearch } from "@/lib/use-metadata-search"
import { MetadataResultsList } from "@/components/books/MetadataResultsList"
import { DuplicateConfirmModal } from "@/components/books/DuplicateConfirmModal"

type Step = "mode" | "isbn" | "search" | "form" | "duplicate"
type Mode = "isbn" | "search" | "manual"

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
  sourceApi: "google_books" | "open_library" | "bnf" | "manual" | ""
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

type Props = {
  onClose: () => void
  onCancel: () => void
}

export function PhysicalFlow({ onClose, onCancel }: Props) {
  const router = useRouter()
  const [step, setStep] = React.useState<Step>("mode")
  const [mode, setMode] = React.useState<Mode>("manual")
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [matchedBook, setMatchedBook] = React.useState<import("@/lib/books").BookListed | null>(null)
  const [matchedBookId, setMatchedBookId] = React.useState<string | null>(null)
  const [conflictBookId, setConflictBookId] = React.useState<string | null>(null)

  const goManual = () => {
    setMode("manual")
    setForm(EMPTY_FORM)
    setStep("form")
  }

  const goSearch = () => {
    setMode("search")
    setStep("search")
  }

  const goIsbn = () => {
    setMode("isbn")
    setStep("isbn")
  }

  const onPick = (m: BookMetadata) => {
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError("Le titre est obligatoire.")
      return
    }
    setPending(true)
    setError(null)
    // 1. Lookup match
    const matchRes = await fetch("/api/books/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        author: form.author.trim() || null,
        isbn: form.isbn.trim() || null
      })
    })
    setPending(false)
    if (matchRes.ok) {
      const body = (await matchRes.json()) as {
        match: null | {
          bookId: string
          confidence: "high" | "low"
          book: import("@/lib/books").BookListed
        }
      }
      if (body.match?.confidence === "high") {
        await submitMerge(body.match.bookId)
        return
      }
      if (body.match?.confidence === "low") {
        setMatchedBook(body.match.book)
        setMatchedBookId(body.match.bookId)
        setStep("duplicate")
        return
      }
    }
    await submitNew()
  }

  const submitNew = async () => {
    setPending(true)
    setError(null)
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        copyType: "PHYSICAL",
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
      const body = (await res
        .json()
        .catch(() => null)) as { error?: string; conflictBookId?: string | null } | null
      setError(body?.error ?? "Echec de l'enregistrement.")
      setConflictBookId(body?.conflictBookId ?? null)
      return
    }
    onClose()
    router.refresh()
  }

  const submitMerge = async (bookId: string) => {
    setPending(true)
    setError(null)
    const res = await fetch(`/api/books/${bookId}/copies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "PHYSICAL" })
    })
    setPending(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Echec de l'ajout.")
      setStep("form")
      return
    }
    onClose()
    router.refresh()
  }

  if (step === "mode") {
    return (
      <ModeChooser
        onIsbn={goIsbn}
        onSearch={goSearch}
        onManual={goManual}
        onBack={onCancel}
      />
    )
  }

  if (step === "isbn") {
    return (
      <IsbnStep
        onMatch={onPick}
        onBack={() => setStep("mode")}
      />
    )
  }

  if (step === "search") {
    return (
      <SearchStep onPick={onPick} onBack={() => setStep("mode")} />
    )
  }

  if (step === "duplicate" && matchedBook && matchedBookId) {
    return (
      <DuplicateConfirmModal
        book={matchedBook}
        intentLabel="Declarer votre exemplaire physique"
        onMerge={() => submitMerge(matchedBookId)}
        onCreateNew={() => {
          setMatchedBook(null)
          setMatchedBookId(null)
          void submitNew()
        }}
        onCancel={() => {
          setMatchedBook(null)
          setMatchedBookId(null)
          setStep("form")
        }}
        pending={pending}
      />
    )
  }

  return (
    <PhysicalForm
      form={form}
      setForm={setForm}
      onBack={() => setStep(mode === "manual" ? "mode" : mode)}
      onSubmit={submit}
      pending={pending}
      error={error}
      conflictBookId={conflictBookId}
      onConflictMerge={
        conflictBookId
          ? () => {
              const id = conflictBookId
              setConflictBookId(null)
              void submitMerge(id)
            }
          : undefined
      }
    />
  )
}

// ---------------------------------------------------------------------
// Step 1 : choose mode
// ---------------------------------------------------------------------

function ModeChooser({
  onIsbn,
  onSearch,
  onManual,
  onBack
}: {
  onIsbn: () => void
  onSearch: () => void
  onManual: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-3">Comment souhaitez-vous renseigner ce livre ?</p>
      <ul className="space-y-2">
        <ModeOption
          Icon={Barcode}
          label="Par ISBN"
          hint="Saisissez le code-barres pour pre-remplir la fiche."
          onClick={onIsbn}
        />
        <ModeOption
          Icon={Search}
          label="Par recherche"
          hint="Cherchez par titre ou auteur."
          onClick={onSearch}
        />
        <ModeOption
          Icon={PencilLine}
          label="Saisie manuelle"
          hint="Tous les champs vides, couverture optionnelle."
          onClick={onManual}
        />
      </ul>
      <div className="flex justify-start pt-1">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} />
          Retour
        </Button>
      </div>
    </div>
  )
}

function ModeOption({
  Icon,
  label,
  hint,
  onClick
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-3 rounded-xl border border-[var(--rule)] bg-paper p-3 text-left transition hover:border-ink-3 hover:bg-paper-2"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[#5a4711]">
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-[15px] text-ink">{label}</span>
          <span className="block text-[12px] text-ink-3">{hint}</span>
        </span>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------
// Step 2A : ISBN
// ---------------------------------------------------------------------

function IsbnStep({
  onMatch,
  onBack
}: {
  onMatch: (m: BookMetadata) => void
  onBack: () => void
}) {
  const [isbn, setIsbn] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [match, setMatch] = React.useState<BookMetadata | null>(null)

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMatch(null)
    setPending(true)
    const res = await fetch(`/api/metadata?isbn=${encodeURIComponent(isbn.trim())}`)
    setPending(false)
    if (!res.ok) {
      setError("Echec de la recherche.")
      return
    }
    const body = (await res.json()) as { results: BookMetadata[] }
    if (body.results.length === 0) {
      setError("Aucune fiche trouvee pour cet ISBN.")
      return
    }
    setMatch(body.results[0]!)
  }

  return (
    <div className="space-y-4">
      <form onSubmit={lookup} className="space-y-3">
        <label className="block text-[13px] text-ink-2">
          <span className="mb-1.5 block font-medium">ISBN</span>
          <Input
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            inputMode="numeric"
            placeholder="9780000000000"
            autoFocus
          />
        </label>
        <Button type="submit" variant="secondary" disabled={pending || !isbn}>
          <Search size={14} />
          {pending ? "Recherche..." : "Rechercher"}
        </Button>
      </form>
      {error ? <p className="text-[13px] text-[color:var(--err)]">{error}</p> : null}
      {match ? (
        <article className="rounded-xl border border-[var(--rule)] bg-paper p-3">
          <div className="flex items-start gap-3">
            <div className="h-24 w-16 shrink-0 overflow-hidden rounded-sm bg-paper-3">
              {match.coverUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={match.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-[15px] text-ink">{match.title}</h3>
              {match.author ? <p className="text-[13px] text-ink-2">{match.author}</p> : null}
              <p className="mt-1 text-[12px] text-ink-3">
                {match.year ? `${match.year} · ` : ""}
                {match.publisher ?? ""}
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="primary" onClick={() => onMatch(match)}>
              <Check size={14} />
              Confirmer
            </Button>
          </div>
        </article>
      ) : null}
      <div className="flex justify-start pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} />
          Retour
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Step 2B : Search by title
// ---------------------------------------------------------------------

function SearchStep({ onPick, onBack }: { onPick: (m: BookMetadata) => void; onBack: () => void }) {
  const [q, setQ] = React.useState("")
  const meta = useMetadataSearch()

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (q.trim().length < 2) return
    await meta.search(q)
  }

  return (
    <div className="space-y-4">
      <form onSubmit={lookup} className="flex items-end gap-2">
        <label className="block flex-1 text-[13px] text-ink-2">
          <span className="mb-1.5 block font-medium">Titre ou auteur</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </label>
        <Button
          type="submit"
          variant="secondary"
          disabled={meta.searching || q.trim().length < 2}
        >
          <Search size={14} />
          Rechercher
        </Button>
      </form>

      {meta.hasSearched ? (
        <MetadataResultsList
          results={meta.results}
          hasMore={meta.hasMore}
          loadingMore={meta.loadingMore}
          searching={meta.searching}
          onPick={onPick}
          onLoadMore={meta.loadMore}
        />
      ) : null}
      {meta.error ? <p className="text-[13px] text-[color:var(--err)]">{meta.error}</p> : null}

      <div className="flex justify-start pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} />
          Retour
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Step 3 : Form (with cover upload for manual mode)
// ---------------------------------------------------------------------

function PhysicalForm({
  form,
  setForm,
  onBack,
  onSubmit,
  pending,
  error,
  conflictBookId,
  onConflictMerge
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  onBack: () => void
  onSubmit: (e: React.FormEvent) => void
  pending: boolean
  error: string | null
  conflictBookId: string | null
  onConflictMerge?: () => void
}) {
  const [uploadingCover, setUploadingCover] = React.useState(false)
  const [coverError, setCoverError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }))

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

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
          rows={3}
          maxLength={5000}
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

      <div className="rounded-xl border border-[var(--rule)] bg-paper-2/40 p-3">
        <div className="flex items-start gap-3">
          <div className="h-20 w-14 shrink-0 overflow-hidden rounded-sm bg-paper-3">
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
            <p className="text-[13px] font-medium text-ink-2">Couverture</p>
            <p className="text-[12px] text-ink-3">JPG, PNG ou WEBP, 5 Mo max.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingCover}
              >
                {uploadingCover ? "Envoi..." : form.coverUrl ? "Remplacer" : "Choisir une image"}
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
              <p className="mt-1 text-[12px] text-[color:var(--err)]">{coverError}</p>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-[rgba(138,48,48,0.2)] bg-[rgba(138,48,48,0.06)] p-3">
          <p className="text-[13px] text-[color:var(--err)]">{error}</p>
          {conflictBookId && onConflictMerge ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onConflictMerge}
              disabled={pending}
              className="mt-2"
            >
              Ajouter ma copie a la fiche existante
            </Button>
          ) : null}
        </div>
      ) : null}

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
