import Link from "next/link"
import { Avatar } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Cover } from "@/components/ui/Cover"
import { MarkReturnedButton } from "@/components/loans/MarkReturnedButton"
import { statusLabel, type LoanWithRefs } from "@/lib/loans"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" })

type Tone = "neutral" | "ok" | "warn" | "err" | "accent"

type Props = {
  loan: LoanWithRefs
  perspective: "sent" | "received"
}

function toneFor(status: LoanWithRefs["status"]): Tone {
  if (status === "ACCEPTED") return "ok"
  if (status === "PENDING") return "warn"
  if (status === "REFUSED") return "err"
  return "neutral"
}

export function LoanRow({ loan, perspective }: Props) {
  const counterpart = perspective === "sent" ? loan.owner : loan.requester
  const counterpartLabel = perspective === "sent" ? "Proprietaire" : "Demandeur"
  const { book, format } = loan.copy

  return (
    <li className="flex items-start gap-4 rounded-2xl border border-[var(--rule)] bg-paper-2/40 p-4">
      <Link href={`/bibliotheque/${book.id}`} className="block w-16 shrink-0">
        <Cover
          title={book.title}
          author={book.author}
          format={format}
          src={book.coverUrl}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/bibliotheque/${book.id}`}
              className="line-clamp-2 font-serif text-[15px] text-ink hover:underline"
            >
              {book.title}
            </Link>
            {book.author ? (
              <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-2">{book.author}</p>
            ) : null}
          </div>
          <Badge tone={toneFor(loan.status)}>{statusLabel(loan.status)}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-ink-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-widest text-ink-4">
              {counterpartLabel}
            </span>
            <Avatar
              name={counterpart.name}
              email={counterpart.email}
              color={counterpart.avatarColor}
              size="sm"
            />
            <span className="text-ink-2">
              {counterpart.name ?? counterpart.email.split("@")[0]}
            </span>
          </div>
          <span className="ml-auto">{dateFmt.format(loan.createdAt)}</span>
        </div>
        {perspective === "received" && loan.status === "ACCEPTED" ? (
          <div className="mt-3">
            <MarkReturnedButton loanId={loan.id} />
          </div>
        ) : null}
        {perspective === "received" && loan.status === "RETURNED" && loan.returnedAt ? (
          <p className="mt-3 text-[12px] text-ink-3">
            Rendu le {dateFmt.format(loan.returnedAt)}
          </p>
        ) : null}
      </div>
    </li>
  )
}
