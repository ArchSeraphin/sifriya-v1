import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ChosenCandidate = z
  .object({
    source: z.enum(["google_books", "open_library", "bnf", "manual"]),
    externalId: z.string(),
    title: z.string().min(1).max(500),
    author: z.string().nullable(),
    isbn: z.string().nullable(),
    year: z.number().nullable(),
    publisher: z.string().nullable(),
    language: z.string().nullable(),
    coverUrl: z.string().nullable(),
    description: z.string().nullable(),
    genre: z.string().nullable()
  })
  .nullable()

const FormOverrides = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    author: z.string().trim().max(300).nullable().optional(),
    isbn: z.string().trim().max(20).nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    genre: z.string().trim().max(120).nullable().optional(),
    year: z.number().int().min(0).max(2200).nullable().optional(),
    publisher: z.string().trim().max(200).nullable().optional(),
    language: z.string().trim().max(10).nullable().optional(),
    coverUrl: z.string().trim().nullable().optional()
  })
  .optional()

const PatchBody = z.object({
  decision: z.enum(["NONE", "CREATE", "MERGE", "SKIP"]),
  chosenCandidate: ChosenCandidate.optional(),
  mergeIntoBookId: z.string().nullable().optional(),
  formOverrides: FormOverrides
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id: sessionId, itemId } = await ctx.params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees invalides.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const item = await db.bulkImportItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      sessionId: true,
      committedBookId: true,
      session: { select: { ownerId: true, status: true } }
    }
  })
  if (!item || item.sessionId !== sessionId) {
    return NextResponse.json({ error: "Item introuvable." }, { status: 404 })
  }
  if (item.session.ownerId !== auth.userId) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 })
  }
  if (item.session.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Session cloturee." }, { status: 409 })
  }
  if (item.committedBookId) {
    return NextResponse.json({ error: "Item deja commite, decision verrouillee." }, { status: 409 })
  }

  // formOverrides est merge dans chosenCandidate si fourni.
  // Permet a l'admin de corriger une erreur API avant le commit,
  // ou de saisir un livre entierement a la main (flux MANUAL).
  let chosen = parsed.data.chosenCandidate ?? null
  const overrides = parsed.data.formOverrides

  if (chosen && overrides) {
    // Merge overrides sur le candidat existant
    chosen = { ...chosen, ...overrides }
  } else if (!chosen && overrides && overrides.title && overrides.title.trim().length > 0) {
    // Saisie manuelle : construire un candidat depuis les overrides seulement
    chosen = {
      source: "manual",
      externalId: "",
      title: overrides.title,
      author: overrides.author ?? null,
      isbn: overrides.isbn ?? null,
      year: overrides.year ?? null,
      publisher: overrides.publisher ?? null,
      language: overrides.language ?? "fr",
      coverUrl: overrides.coverUrl ?? null,
      description: overrides.description ?? null,
      genre: overrides.genre ?? null
    }
  }

  await db.bulkImportItem.update({
    where: { id: itemId },
    data: {
      decision: parsed.data.decision,
      // Distinguer absent (laisser inchange) de null/value (overwrite).
      // Le second spread couvre la saisie manuelle : formOverrides sans
      // chosenCandidate construit un candidat « manual » qui DOIT etre persiste.
      ...(parsed.data.chosenCandidate !== undefined ? { chosenCandidate: chosen as unknown as object } : {}),
      ...(parsed.data.formOverrides && !parsed.data.chosenCandidate ? { chosenCandidate: chosen as unknown as object } : {}),
      mergeIntoBookId:
        parsed.data.mergeIntoBookId === undefined
          ? undefined
          : parsed.data.mergeIntoBookId
    }
  })

  return NextResponse.json({ ok: true })
}
