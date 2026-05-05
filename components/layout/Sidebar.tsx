"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  Library,
  HandHelping,
  BookMarked,
  BookOpen,
  Settings,
  LogOut
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Role } from "@prisma/client"
import { cn } from "@/lib/cn"
import { Avatar } from "@/components/ui/Avatar"
import { SearchBar } from "@/components/layout/SearchBar"

type NavLink = {
  href: string
  label: string
  Icon: LucideIcon
  disabled?: boolean
  hint?: string
}

const PRIMARY_LINKS: NavLink[] = [
  { href: "/bibliotheque", label: "Bibliotheque", Icon: Library },
  {
    href: "/pret",
    label: "Pret",
    Icon: HandHelping,
    disabled: true,
    hint: "Bientot disponible"
  }
]

const PERSONAL_LINKS: NavLink[] = [
  { href: "/mes-livres", label: "Mes livres", Icon: BookMarked },
  { href: "/mes-lectures", label: "Mes lectures", Icon: BookOpen }
]

type SidebarUser = {
  name: string | null
  email: string
  role: Role
  avatarColor: string
}

type SidebarProps = { user: SidebarUser }

export function Sidebar({ user }: SidebarProps) {
  const [openMobile, setOpenMobile] = React.useState(false)

  React.useEffect(() => {
    const onOpen = () => setOpenMobile(true)
    window.addEventListener("sifriya:open-sidebar", onOpen)
    return () => window.removeEventListener("sifriya:open-sidebar", onOpen)
  }, [])

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-[var(--rule)] bg-paper md:flex md:flex-col">
        <SidebarBody user={user} />
      </aside>

      {openMobile ? (
        <div
          className="fixed inset-0 z-40 bg-[rgba(31,27,19,0.42)] md:hidden"
          onClick={() => setOpenMobile(false)}
        >
          <aside
            className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-[var(--rule)] bg-paper shadow-[var(--shadow-2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pb-2 pt-4">
              <SearchBar />
            </div>
            <SidebarBody user={user} onNavigate={() => setOpenMobile(false)} />
          </aside>
        </div>
      ) : null}
    </>
  )
}

function SidebarBody({ user, onNavigate }: { user: SidebarUser; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <>
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-0.5">
          {PRIMARY_LINKS.map((link) => (
            <li key={link.href}>
              <NavItem link={link} pathname={pathname} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        <SectionDivider label="Ma bibliotheque" />
        <ul className="space-y-0.5">
          {PERSONAL_LINKS.map((link) => (
            <li key={link.href}>
              <NavItem link={link} pathname={pathname} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        {user.role === "ADMIN" ? (
          <>
            <SectionDivider label="Administration" />
            <ul className="space-y-0.5">
              <li>
                <NavItem
                  link={{ href: "/admin/membres", label: "Membres", Icon: Settings }}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              </li>
            </ul>
          </>
        ) : null}
      </nav>

      <div className="shrink-0 border-t border-[var(--rule)] p-3">
        <Link
          href="/profil"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-md p-2 transition hover:bg-paper-2"
        >
          <Avatar name={user.name} email={user.email} color={user.avatarColor} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {user.name ?? user.email.split("@")[0]}
            </p>
            <p className="truncate text-[11px] text-ink-3">{user.email}</p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-1 inline-flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-ink-3 transition hover:bg-paper-2 hover:text-ink"
        >
          <LogOut size={14} />
          Se deconnecter
        </button>
      </div>
    </>
  )
}

function NavItem({
  link,
  pathname,
  onNavigate
}: {
  link: NavLink
  pathname: string
  onNavigate?: () => void
}) {
  const isActive =
    pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href + "/"))
  const Icon = link.Icon

  if (link.disabled) {
    return (
      <span
        title={link.hint}
        aria-disabled="true"
        className="flex h-9 cursor-not-allowed items-center gap-2.5 rounded-md px-3 text-sm text-ink-4"
      >
        <Icon size={16} aria-hidden="true" />
        <span>{link.label}</span>
      </span>
    )
  }

  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition",
        isActive ? "bg-paper-2 font-medium text-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
      )}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{link.label}</span>
    </Link>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <p className="mt-5 px-3 pb-1 text-[11px] font-medium uppercase tracking-widest text-ink-4">
      {label}
    </p>
  )
}
