import { db } from "@/lib/db"
import { hashJwt, verifyLoanToken } from "@/lib/loans"
import { sendLoanAccepted, sendLoanRefused } from "@/lib/email"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// =====================================================================
// GET /api/loans/[id]/respond?action=accept|refuse&token=<jwt>
// Endpoint public (atterrissage depuis email). Verifie le JWT, verifie que
// le pret est encore PENDING (idempotence), met a jour le statut, envoie un
// email de confirmation au demandeur, et rend une page HTML simple.
// =====================================================================

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url)
  const action = url.searchParams.get("action")
  const token = url.searchParams.get("token")
  const { id } = await ctx.params

  if (!token) return renderResult({ ok: false, message: "Lien invalide." })
  if (action !== "accept" && action !== "refuse") {
    return renderResult({ ok: false, message: "Action invalide." })
  }

  const verified = await verifyLoanToken(token)
  if (!verified || verified.loanId !== id) {
    return renderResult({ ok: false, message: "Lien invalide ou expire." })
  }

  const loan = await db.loan.findUnique({
    where: { id },
    include: {
      copy: { select: { book: { select: { id: true, title: true } } } },
      requester: { select: { id: true, email: true, name: true } },
      owner: { select: { id: true, name: true } }
    }
  })
  if (!loan) return renderResult({ ok: false, message: "Demande introuvable." })

  if (loan.token !== hashJwt(token)) {
    return renderResult({ ok: false, message: "Lien invalide ou deja utilise." })
  }
  if (loan.status !== "PENDING") {
    return renderResult({
      ok: true,
      message: `Cette demande a deja ete traitee (${labelStatus(loan.status)}).`
    })
  }
  if (loan.tokenExpiry && loan.tokenExpiry < new Date()) {
    return renderResult({ ok: false, message: "Le lien a expire." })
  }

  const newStatus = action === "accept" ? "ACCEPTED" : "REFUSED"
  await db.loan.update({
    where: { id: loan.id },
    data: { status: newStatus, token: null, tokenExpiry: null }
  })

  try {
    if (action === "accept") {
      await sendLoanAccepted({
        requesterEmail: loan.requester.email,
        requesterName: loan.requester.name ?? loan.requester.email.split("@")[0]!,
        bookTitle: loan.copy.book.title,
        ownerName: loan.owner.name ?? "Le proprietaire"
      })
    } else {
      await sendLoanRefused({
        requesterEmail: loan.requester.email,
        requesterName: loan.requester.name ?? loan.requester.email.split("@")[0]!,
        bookTitle: loan.copy.book.title
      })
    }
  } catch (err) {
    logger.error("loan response email failed", { err: String(err) })
  }

  return renderResult({
    ok: true,
    message:
      action === "accept"
        ? `Demande acceptee. Un email a ete envoye a ${loan.requester.name ?? loan.requester.email} pour confirmer.`
        : "Demande refusee. Le demandeur a ete informe."
  })
}

function labelStatus(s: string): string {
  if (s === "ACCEPTED") return "deja acceptee"
  if (s === "REFUSED") return "deja refusee"
  if (s === "RETURNED") return "deja rendue"
  return s
}

function renderResult(opts: { ok: boolean; message: string }): Response {
  const accent = opts.ok ? "#4a6b3e" : "#8a3030"
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sifriya — pret</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f5f1e8;color:#1f1b13;display:flex;min-height:100dvh;align-items:center;justify-content:center;padding:24px}
.card{max-width:440px;width:100%;background:#ede7d8;border-radius:16px;padding:32px;box-shadow:0 6px 24px rgba(31,27,19,.10);text-align:center}
.tag{font-family:Georgia,serif;font-size:18px;color:#1f1b13;letter-spacing:.5px;margin:0 0 16px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:${accent};margin-right:8px;vertical-align:middle}
h1{font-family:Georgia,serif;font-size:22px;margin:0 0 12px;color:#1f1b13}
p{font-size:15px;line-height:1.6;color:#3a342a;margin:0 0 16px}
a{display:inline-block;margin-top:8px;padding:10px 18px;background:#8a6b1f;color:#faf7ef;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500}
</style></head>
<body><main class="card">
  <p class="tag">Sifriya</p>
  <h1><span class="dot" aria-hidden="true"></span>${escapeHtml(opts.ok ? "Action confirmee" : "Action impossible")}</h1>
  <p>${escapeHtml(opts.message)}</p>
  <a href="/pret">Voir mes prets</a>
</main></body></html>`
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
