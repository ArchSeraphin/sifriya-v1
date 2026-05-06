import { redirect, notFound } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ImportClient } from "@/components/admin/bulk-import/ImportClient"

export const dynamic = "force-dynamic"

export default async function BulkImportSessionPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "ADMIN") redirect("/bibliotheque")
  const { id } = await params

  const importSession = await db.bulkImportSession.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      status: true,
      totalFiles: true,
      createdAt: true
    }
  })
  if (!importSession || importSession.ownerId !== session.user.id) notFound()

  return (
    <ImportClient
      sessionId={importSession.id}
      totalFiles={importSession.totalFiles}
      initialStatus={importSession.status}
    />
  )
}
