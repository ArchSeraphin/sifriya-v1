import Link from "next/link"
import { ArrowLeft, Download, Pencil } from "lucide-react"
import { Cover } from "@/components/ui/Cover"
import { Badge } from "@/components/ui/Badge"
import { type BookDetailDTO, digitalFormats, physicalCount } from "@/lib/books"
import { LoanRequestButton } from "@/components/books/LoanRequestButton"
import { CopyList } from "@/components/books/CopyList"
import type { ReadingStatus } from "@prisma/client"
import { ReadingStatusPicker } from "@/components/books/ReadingStatusPicker"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" })

type Props = {
  book: BookDetailDTO
  currentUser: { id: string; role: "ADMIN" | "USER" }
  // Loans actifs sur les copies physiques (key=copyId)
  activeLoansByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED"; requester: { id: string; name: string | null; email: string; avatarColor: string } }>
  // Demandes que cet user a en cours (key=copyId)
  myActiveRequestsByCopy: Record<string, { id: string; status: "PENDING" | "ACCEPTED" }>
  currentReading?: { status: ReadingStatus } | null
}

export function BookDetail({
  book,
  currentUser,
  activeLoansByCopy,
  myActiveRequestsByCopy,
  currentReading
}: Props) {
  const formats = digitalFormats(book)
  const physicalCopies = book.copies.filter((c) => c.type === "PHYSICAL")
  const physicalsCount = physicalCount(book)

  const canEditMetadata =
    currentUser.role === "ADMIN" ||
    book.copies.some((c) => c.addedBy.id === currentUser.id)

  const previewFormat = formats[0] ?? null

  return (
    <article className="mx-auto max-w-4xl">
      <Link
        href="/bibliotheque"
        className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Retour a la bibliotheque
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="mx-auto w-[180px] sm:w-[220px]">
          <Cover
            title={book.title}
            author={book.author}
            format={previewFormat}
            src={book.coverUrl}
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {formats.map((f) => (
              <Badge key={f} tone="accent">
                {f}
              </Badge>
            ))}
            {physicalsCount > 0 ? (
              <Badge tone="warn">
                {physicalsCount === 1 ? "Physique" : `Physique × ${physicalsCount}`}
              </Badge>
            ) : null}
          </div>
          <div className="mt-4">
            <ReadingStatusPicker
              bookId={book.id}
              currentStatus={currentReading?.status ?? null}
            />
          </div>
          <h1 className="mt-3 font-serif text-3xl leading-tight text-ink">{book.title}</h1>
          {book.author ? <p className="mt-1 text-base text-ink-2">{book.author}</p> : null}

          <div className="mt-6 flex flex-wrap gap-2">
            {formats.map((f) => (
              <a
                key={f}
                href={`/api/books/${book.id}/download?format=${f}`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink shadow-[var(--shadow-1)] transition hover:opacity-95"
              >
                <Download size={16} />
                Telecharger {f}
              </a>
            ))}
            {physicalCopies.length > 0 ? (
              <LoanRequestButton
                bookTitle={book.title}
                copies={physicalCopies.map((c) => ({
                  id: c.id,
                  ownerId: c.owner!.id,
                  ownerName: c.owner!.name ?? c.owner!.email.split("@")[0]!,
                  ownerEmail: c.owner!.email,
                  ownerColor: c.owner!.avatarColor,
                  isMyCopy: c.owner!.id === currentUser.id,
                  activeLoan: activeLoansByCopy[c.id] ?? null,
                  myActiveRequest: myActiveRequestsByCopy[c.id] ?? null
                }))}
              />
            ) : null}
            {canEditMetadata ? (
              <Link
                href={`/bibliotheque/${book.id}/modifier`}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--rule)] bg-paper px-4 text-sm font-medium text-ink-2 shadow-[var(--shadow-1)] transition hover:bg-paper-2 hover:text-ink"
              >
                <Pencil size={16} />
                Modifier la fiche
              </Link>
            ) : null}
          </div>

          {book.description ? (
            <section className="mt-8 border-t border-[var(--rule-2)] pt-6">
              <h2 className="font-serif text-lg text-ink">Description</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-2">
                {book.description}
              </p>
            </section>
          ) : null}

          <dl className="mt-8 grid grid-cols-1 gap-y-3 border-t border-[var(--rule-2)] pt-6 text-sm sm:grid-cols-2">
            <Item label="ISBN" value={book.isbn} mono />
            <Item label="Editeur" value={book.publisher} />
            <Item label="Annee" value={book.year ? String(book.year) : null} />
            <Item label="Langue" value={book.language?.toUpperCase()} mono />
            <Item label="Genre" value={book.genre} />
            <Item label="Ajoute le" value={dateFmt.format(book.addedAt)} />
          </dl>

          <CopyList bookId={book.id} copies={book.copies} currentUser={currentUser} />
        </div>
      </div>
    </article>
  )
}

function Item({
  label,
  value,
  mono = false
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-widest text-ink-4">{label}</dt>
      <dd className={`mt-0.5 text-ink-2 ${mono ? "font-mono text-[13px]" : ""}`}>
        {value ?? "—"}
      </dd>
    </div>
  )
}
