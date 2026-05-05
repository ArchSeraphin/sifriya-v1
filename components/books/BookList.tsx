import Link from "next/link"
import { Badge } from "@/components/ui/Badge"
import { formatBytes } from "@/lib/books"
import type { BookListed } from "@/lib/books"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" })

export function BookList({ books }: { books: BookListed[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-paper-2/40">
      <table className="w-full text-sm">
        <thead className="text-left text-[12px] uppercase tracking-widest text-ink-4">
          <tr className="border-b border-[var(--rule-2)]">
            <th className="px-4 py-3 font-medium">Titre</th>
            <th className="px-4 py-3 font-medium">Auteur</th>
            <th className="px-4 py-3 font-medium">Format</th>
            <th className="px-4 py-3 font-medium">Taille</th>
            <th className="px-4 py-3 font-medium">Ajoute</th>
          </tr>
        </thead>
        <tbody>
          {books.map((book) => (
            <tr
              key={book.id}
              className="border-b border-[var(--rule-2)] transition hover:bg-paper-2/60 last:border-0"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/bibliotheque/${book.id}`}
                  className="font-serif text-[15px] text-ink hover:underline"
                >
                  {book.title}
                </Link>
                {book.type === "PHYSICAL" ? (
                  <Badge tone="warn" className="ml-2 align-middle">
                    Physique
                  </Badge>
                ) : null}
              </td>
              <td className="px-4 py-3 text-ink-2">{book.author ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-[12px] text-ink-3">{book.format ?? "—"}</td>
              <td className="px-4 py-3 text-ink-3">{formatBytes(book.fileSize)}</td>
              <td className="px-4 py-3 text-ink-3">{dateFmt.format(book.addedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
