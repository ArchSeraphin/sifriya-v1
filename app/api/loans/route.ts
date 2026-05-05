import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { LOAN_INCLUDE, signLoanToken, buildRespondUrl } from "@/lib/loans"
import { sendLoanRequest } from "@/lib/email"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// =====================================================================
// GET /api/loans — listes "envoyees" et "recues" pour le user courant
// =====================================================================

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  const userId = session.user.id
  const [sent, received] = await Promise.all([
    db.loan.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: "desc" },
      include: LOAN_INCLUDE
    }),
    db.loan.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      include: LOAN_INCLUDE
    })
  ])

  return NextResponse.json({ sent, received })
}

// =====================================================================
// POST /api/loans — cree une demande de pret pour un livre physique
// =====================================================================

const Body = z.object({ bookId: z.string().min(1) })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Donnees invalides." }, { status: 400 })

  const book = await db.book.findUnique({
    where: { id: parsed.data.bookId },
    include: {
      owner: { select: { id: true, name: true, email: true } }
    }
  })
  if (!book) return NextResponse.json({ error: "Livre introuvable." }, { status: 404 })
  if (book.type !== "PHYSICAL") {
    return NextResponse.json({ error: "Seuls les livres physiques peuvent etre pretes." }, { status: 400 })
  }
  if (!book.owner) {
    return NextResponse.json({ error: "Ce livre n'a pas de proprietaire." }, { status: 400 })
  }
  if (book.owner.id === session.user.id) {
    return NextResponse.json({ error: "Vous etes deja le proprietaire de ce livre." }, { status: 400 })
  }

  // Une seule demande active (PENDING ou ACCEPTED) par requester+book.
  const existing = await db.loan.findFirst({
    where: {
      bookId: book.id,
      requesterId: session.user.id,
      status: { in: ["PENDING", "ACCEPTED"] }
    }
  })
  if (existing) {
    return NextResponse.json(
      { error: "Vous avez deja une demande active pour ce livre." },
      { status: 409 }
    )
  }

  const baseUrl = process.env.NEXTAUTH_URL
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXTAUTH_URL manquant." }, { status: 500 })
  }

  // Cree le pret puis genere le token, hash, met a jour.
  const loan = await db.loan.create({
    data: {
      bookId: book.id,
      requesterId: session.user.id,
      ownerId: book.owner.id,
      status: "PENDING"
    }
  })
  const { jwt, hash } = await signLoanToken(loan.id)
  const expiry = new Date(Date.now() + 72 * 60 * 60 * 1000)
  await db.loan.update({
    where: { id: loan.id },
    data: { token: hash, tokenExpiry: expiry }
  })

  try {
    await sendLoanRequest({
      ownerEmail: book.owner.email,
      ownerName: book.owner.name ?? book.owner.email.split("@")[0]!,
      requesterName: session.user.name ?? session.user.email!.split("@")[0]!,
      bookTitle: book.title,
      acceptUrl: buildRespondUrl({ baseUrl, loanId: loan.id, jwt, action: "accept" }),
      refuseUrl: buildRespondUrl({ baseUrl, loanId: loan.id, jwt, action: "refuse" })
    })
  } catch (err) {
    logger.error("loan request email failed", { err: String(err) })
    // On garde le pret en base meme si l'email echoue — le proprietaire
    // verra la demande en se connectant.
  }

  return NextResponse.json({ ok: true, loanId: loan.id }, { status: 201 })
}
