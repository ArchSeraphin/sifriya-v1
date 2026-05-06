import crypto from "node:crypto"
import { SignJWT, jwtVerify } from "jose"
import type { Loan, Prisma } from "@prisma/client"

const ISSUER = "sifriya"
const AUDIENCE = "sifriya:loan-respond"

export const LOAN_TOKEN_TTL_S = 72 * 60 * 60 // 72h

function secretKey(): Uint8Array {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET non defini.")
  return new TextEncoder().encode(s)
}

export async function signLoanToken(loanId: string): Promise<{ jwt: string; hash: string }> {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(loanId)
    .setIssuedAt()
    .setExpirationTime(`${LOAN_TOKEN_TTL_S}s`)
    .sign(secretKey())
  const hash = hashJwt(jwt)
  return { jwt, hash }
}

export async function verifyLoanToken(jwt: string): Promise<{ loanId: string } | null> {
  try {
    const { payload } = await jwtVerify(jwt, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE
    })
    if (typeof payload.sub !== "string") return null
    return { loanId: payload.sub }
  } catch {
    return null
  }
}

export function hashJwt(jwt: string): string {
  return crypto.createHash("sha256").update(jwt).digest("hex")
}

export function buildRespondUrl(opts: {
  baseUrl: string
  loanId: string
  jwt: string
  action: "accept" | "refuse"
}): string {
  const params = new URLSearchParams({ action: opts.action, token: opts.jwt })
  return `${opts.baseUrl.replace(/\/$/, "")}/api/loans/${opts.loanId}/respond?${params.toString()}`
}

// =====================================================================
// DTO pour la page /pret
// LoanWithRefs derive du shape exact de LOAN_INCLUDE via Prisma.LoanGetPayload
// pour eviter les casts `as unknown as` cote appelants.
// =====================================================================

export const LOAN_INCLUDE = {
  copy: {
    select: {
      id: true,
      type: true,
      format: true,
      book: { select: { id: true, title: true, author: true, coverUrl: true } },
      owner: { select: { id: true, name: true, email: true, avatarColor: true } }
    }
  },
  requester: { select: { id: true, name: true, email: true, avatarColor: true } },
  owner: { select: { id: true, name: true, email: true, avatarColor: true } }
} as const satisfies Prisma.LoanInclude

export type LoanWithRefs = Prisma.LoanGetPayload<{ include: typeof LOAN_INCLUDE }>

export function statusLabel(status: Loan["status"]): string {
  switch (status) {
    case "PENDING":
      return "En attente"
    case "ACCEPTED":
      return "Accepte"
    case "REFUSED":
      return "Refuse"
    case "RETURNED":
      return "Rendu"
  }
}
