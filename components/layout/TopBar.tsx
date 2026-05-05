import Link from "next/link"
import { SearchBar } from "@/components/layout/SearchBar"
import { MobileMenuButton } from "@/components/layout/MobileMenuButton"
import { AddBookButton } from "@/components/books/AddBookButton"

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-[var(--rule)] bg-[color:var(--paper)]/90 px-4 backdrop-blur-md md:px-6">
      <MobileMenuButton />
      <Link
        href="/bibliotheque"
        className="flex items-center gap-2 font-serif text-[20px] font-semibold tracking-tight text-ink"
      >
        <BookGlyph />
        <span>Sifriya</span>
      </Link>

      <div className="ml-2 hidden flex-1 justify-center md:flex">
        <SearchBar />
      </div>

      <div className="ml-auto hidden md:block">
        <AddBookButton />
      </div>
    </header>
  )
}

function BookGlyph() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="5" y="3" width="22" height="26" rx="2" fill="#3d2f17" />
      <rect x="5" y="3" width="3" height="26" fill="rgba(0,0,0,0.25)" />
      <path
        d="M11 9h12M11 13h12M11 17h8"
        stroke="#e8dcb8"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="22" r="1.5" fill="#8a6b1f" />
    </svg>
  )
}

