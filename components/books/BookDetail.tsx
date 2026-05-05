import Link from "next/link"
import { ArrowLeft, Download } from "lucide-react"
import { Cover } from "@/components/ui/Cover"
import { Badge } from "@/components/ui/Badge"
import { Avatar } from "@/components/ui/Avatar"
import { formatBytes, type BookDetailDTO } from "@/lib/books"
import { DeleteBookButton } from "@/components/books/DeleteBookButton"
import { LoanRequestButton } from "@/components/books/LoanRequestButton"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" })

export type ActiveLoanLite = {
  id: string
  status: "PENDING" | "ACCEPTED"
  requester: { id: string; name: string | null; email: string; avatarColor: string }
}

type Props = {
  book: BookDetailDTO
  currentUser: { id: string; role: "ADMIN" | "USER" }
  activeLoan: ActiveLoanLite | null
  myActiveRequest: { id: string; status: "PENDING" | "ACCEPTED" } | null
}

export function BookDetail({ book, currentUser, activeLoan, myActiveRequest }: Props) {
  const canDelete = currentUser.role === "ADMIN" || book.addedBy.id === currentUser.id
  const isOwner = book.owner?.id === currentUser.id
  const acceptedLoan = activeLoan?.status === "ACCEPTED" ? activeLoan : null

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
          <Cover title={book.title} author={book.author} format={book.format} src={book.coverUrl} />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={book.type === "PHYSICAL" ? "warn" : "neutral"}>
              {book.type === "PHYSICAL" ? "Physique" : "Numerique"}
            </Badge>
            {book.format ? (
              <span className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
                {book.format} · {formatBytes(book.fileSize)}
              </span>
            ) : null}
            {book.type === "PHYSICAL" ? (
              acceptedLoan ? (
                <Badge tone="warn">En cours de pret</Badge>
              ) : (
                <Badge tone="ok">Disponible</Badge>
              )
            ) : null}
          </div>
          <h1 className="mt-3 font-serif text-3xl leading-tight text-ink">{book.title}</h1>
          {book.author ? <p className="mt-1 text-base text-ink-2">{book.author}</p> : null}

          <div className="mt-6 flex flex-wrap gap-2">
            {book.type === "DIGITAL" ? (
              <a
                href={`/api/books/${book.id}/download`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink shadow-[var(--shadow-1)] transition hover:opacity-95"
              >
                <Download size={16} />
                Telecharger
              </a>
            ) : !isOwner && book.owner ? (
              <LoanRequestButton
                bookId={book.id}
                bookTitle={book.title}
                ownerName={book.owner.name ?? book.owner.email.split("@")[0]!}
                alreadyRequested={Boolean(myActiveRequest)}
              />
            ) : null}
            {canDelete ? <DeleteBookButton id={book.id} title={book.title} /> : null}
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

          <div className="mt-6 flex flex-wrap items-center gap-6 border-t border-[var(--rule-2)] pt-6 text-[13px] text-ink-3">
            <PersonLine label="Ajoute par" person={book.addedBy} />
            {book.owner ? <PersonLine label="Proprietaire" person={book.owner} /> : null}
            {acceptedLoan ? (
              <PersonLine label="Actuellement chez" person={acceptedLoan.requester} />
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function Item({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-widest text-ink-4">{label}</dt>
      <dd className={`mt-0.5 text-ink-2 ${mono ? "font-mono text-[13px]" : ""}`}>{value ?? "—"}</dd>
    </div>
  )
}

function PersonLine({
  label,
  person
}: {
  label: string
  person: { id: string; name: string | null; email: string; avatarColor: string }
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-widest text-ink-4">{label}</span>
      <div className="flex items-center gap-2">
        <Avatar name={person.name} email={person.email} color={person.avatarColor} size="sm" />
        <span className="text-ink-2">{person.name ?? person.email.split("@")[0]}</span>
      </div>
    </div>
  )
}
