import { NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { signLoanToken, buildRespondUrl } from "@/lib/loans"
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
      select: loanSelect
    }),
    db.loan.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      select: loanSelect
    })
  ])

  return NextResponse.json({ sent, received })
}

// =====================================================================
// POST /api/loans — cree une demande de pret pour une copie physique
// =====================================================================

const CreateBody = z.object({
  copyId: z.string().min(1)
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }
  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "copyId requis." }, { status: 400 })
  }

  const copy = await db.bookCopy.findUnique({
    where: { id: parsed.data.copyId },
    select: {
      id: true,
      type: true,
      ownerId: true,
      bookId: true,
      book: { select: { title: true } },
      owner: { select: { id: true, name: true, email: true } }
    }
  })
  if (!copy) return NextResponse.json({ error: "Copie introuvable." }, { status: 404 })
  if (copy.type !== "PHYSICAL" || !copy.ownerId || !copy.owner) {
    return NextResponse.json(
      { error: "Cette copie ne peut pas etre pretee." },
      { status: 400 }
    )
  }
  if (copy.ownerId === session.user.id) {
    return NextResponse.json(
      { error: "Vous etes deja proprietaire de cette copie." },
      { status: 400 }
    )
  }

  // Une seule demande active (PENDING ou ACCEPTED) par requester+copie.
  const existing = await db.loan.findFirst({
    where: {
      copyId: copy.id,
      requesterId: session.user.id,
      status: { in: ["PENDING", "ACCEPTED"] }
    },
    select: { id: true }
  })
  if (existing) {
    return NextResponse.json(
      { error: "Vous avez deja une demande active sur cette copie." },
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
      copyId: copy.id,
      requesterId: session.user.id,
      ownerId: copy.ownerId,
      status: "PENDING"
    },
    select: { id: true }
  })

  const { jwt, hash } = await signLoanToken(loan.id)
  const expiry = new Date(Date.now() + 72 * 60 * 60 * 1000)
  await db.loan.update({
    where: { id: loan.id },
    data: { token: hash, tokenExpiry: expiry }
  })

  const requesterName =
    session.user.name ?? session.user.email!.split("@")[0]!
  try {
    await sendLoanRequest({
      ownerEmail: copy.owner.email,
      ownerName: copy.owner.name ?? copy.owner.email.split("@")[0]!,
      requesterName,
      bookTitle: copy.book.title,
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

// =====================================================================
// Select partagé pour les requetes GET
// =====================================================================

const loanSelect = {
  id: true,
  status: true,
  createdAt: true,
  returnedAt: true,
  copy: {
    select: {
      id: true,
      type: true,
      book: {
        select: { id: true, title: true, author: true, coverUrl: true }
      },
      owner: { select: { id: true, name: true, email: true, avatarColor: true } }
    }
  },
  requester: { select: { id: true, name: true, email: true, avatarColor: true } },
  owner: { select: { id: true, name: true, email: true, avatarColor: true } }
} as const
