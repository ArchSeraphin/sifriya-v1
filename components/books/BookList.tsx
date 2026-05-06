import Link from "next/link"
import { digitalFormats, physicalCount } from "@/lib/books"
import type { BookListed } from "@/lib/books"

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" })

function FormatsCell({ book }: { book: BookListed }) {
  const formats = digitalFormats(book)
  const physicals = physicalCount(book)
  const parts: string[] = [...formats]
  if (physicals > 0) parts.push(physicals === 1 ? "Physique" : `Physique x ${physicals}`)
  if (parts.length === 0) return <span className="text-ink-4">—</span>
  return (
    <span className="font-mono text-[12px] uppercase tracking-widest text-ink-2">
      {parts.join(" · ")}
    </span>
  )
}

export function BookList({ books }: { books: BookListed[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-paper-2/40">
      <table className="w-full text-sm">
        <thead className="text-left text-[12px] uppercase tracking-widest text-ink-4">
          <tr className="border-b border-[var(--rule-2)]">
            <th className="px-4 py-3 font-medium">Titre</th>
            <th className="px-4 py-3 font-medium">Auteur</th>
            <th className="px-4 py-3 font-medium">Formats</th>
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
              </td>
              <td className="px-4 py-3 text-ink-2">{book.author ?? "—"}</td>
              <td className="px-4 py-3">
                <FormatsCell book={book} />
              </td>
              <td className="px-4 py-3 text-ink-3">{dateFmt.format(book.addedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
