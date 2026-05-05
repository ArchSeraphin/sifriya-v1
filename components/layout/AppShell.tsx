import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { TopBar } from "@/components/layout/TopBar"
import { Sidebar } from "@/components/layout/Sidebar"

type AppShellProps = { children: React.ReactNode }

export async function AppShell({ children }: AppShellProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          user={{
            name: session.user.name ?? null,
            email: session.user.email ?? "",
            role: session.user.role,
            avatarColor: session.user.avatarColor
          }}
        />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
