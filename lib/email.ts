// =====================================================================
// Sifriya — abstraction email
// Ne JAMAIS importer Resend (ou tout autre fournisseur) hors de ce fichier.
// Pour changer de fournisseur (Brevo SMTP, Postmark...) :
//   1. Reecrire le corps des fonctions ci-dessous
//   2. Mettre a jour les variables d'env dans .env.example
//   3. Aucun autre fichier a toucher
// =====================================================================

import { Resend } from "resend"
import { logger } from "@/lib/logger"

type RenderedEmail = { subject: string; text: string; html: string }

let resendClient: Resend | null = null
function client(): Resend {
  if (resendClient) return resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error("RESEND_API_KEY non defini.")
  resendClient = new Resend(apiKey)
  return resendClient
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Sifriya <noreply@sifriya.fr>"
}

async function send(to: string, email: RenderedEmail): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    // Mode dev sans cle : on logge l'email plutot que d'echouer durement.
    logger.warn("RESEND_API_KEY absent — email non envoye, contenu logge", {
      to,
      subject: email.subject
    })
    logger.info(email.text)
    return
  }
  const { error } = await client().emails.send({
    from: fromAddress(),
    to,
    subject: email.subject,
    text: email.text,
    html: email.html
  })
  if (error) throw new Error(`Echec d'envoi email : ${error.message}`)
}

// =====================================================================
// Rendus (separes de l'envoi, utilisables par le flux next-auth qui passe par SMTP)
// =====================================================================

export function renderMagicLinkEmail(opts: { url: string }): RenderedEmail {
  const subject = "Votre lien de connexion a Sifriya"
  const text = `Bonjour,\n\nVoici votre lien de connexion a Sifriya :\n${opts.url}\n\nIl est valable 24 heures.\n\nSi vous n'avez pas demande ce lien, ignorez ce message.`
  const html = baseLayout(`
    <h1 style="font-family: Georgia, serif; font-size: 22px; color: #1f1b13; margin: 0 0 16px;">Connexion a Sifriya</h1>
    <p style="margin: 0 0 24px;">Cliquez sur le bouton ci-dessous pour vous connecter. Le lien est valable 24 heures.</p>
    <p style="margin: 0 0 32px;">${button(opts.url, "Se connecter")}</p>
    <p style="font-size: 13px; color: #6b6354;">Si vous n'avez pas demande ce lien, vous pouvez ignorer ce message.</p>
  `)
  return { subject, text, html }
}

export function renderLoanRequestEmail(opts: {
  ownerName: string
  requesterName: string
  bookTitle: string
  acceptUrl: string
  refuseUrl: string
}): RenderedEmail {
  const subject = `${opts.requesterName} aimerait emprunter "${opts.bookTitle}"`
  const text = `Bonjour ${opts.ownerName},\n\n${opts.requesterName} aimerait emprunter "${opts.bookTitle}".\n\nAccepter : ${opts.acceptUrl}\nRefuser : ${opts.refuseUrl}\n\nLe lien est valable 72 heures.`
  const html = baseLayout(`
    <h1 style="font-family: Georgia, serif; font-size: 22px; color: #1f1b13; margin: 0 0 16px;">Demande de pret</h1>
    <p style="margin: 0 0 8px;">Bonjour ${esc(opts.ownerName)},</p>
    <p style="margin: 0 0 24px;"><strong>${esc(opts.requesterName)}</strong> aimerait emprunter <em>${esc(opts.bookTitle)}</em>.</p>
    <p style="margin: 0 0 32px;">${button(opts.acceptUrl, "Accepter")}&nbsp;&nbsp;${buttonGhost(opts.refuseUrl, "Refuser")}</p>
    <p style="font-size: 13px; color: #6b6354;">Le lien est valable 72 heures.</p>
  `)
  return { subject, text, html }
}

export function renderLoanAcceptedEmail(opts: {
  requesterName: string
  ownerName: string
  bookTitle: string
}): RenderedEmail {
  const subject = `${opts.ownerName} a accepte votre demande pour "${opts.bookTitle}"`
  const text = `Bonjour ${opts.requesterName},\n\n${opts.ownerName} a accepte votre demande pour "${opts.bookTitle}".\n\nOrganisez l'echange directement entre vous.`
  const html = baseLayout(`
    <h1 style="font-family: Georgia, serif; font-size: 22px; color: #1f1b13; margin: 0 0 16px;">Demande acceptee</h1>
    <p style="margin: 0 0 24px;">Bonjour ${esc(opts.requesterName)}, <strong>${esc(opts.ownerName)}</strong> a accepte votre demande pour <em>${esc(opts.bookTitle)}</em>.</p>
    <p style="font-size: 13px; color: #6b6354;">Organisez l'echange directement entre vous.</p>
  `)
  return { subject, text, html }
}

export function renderLoanRefusedEmail(opts: {
  requesterName: string
  bookTitle: string
}): RenderedEmail {
  const subject = `Votre demande pour "${opts.bookTitle}" a ete refusee`
  const text = `Bonjour ${opts.requesterName},\n\nVotre demande pour "${opts.bookTitle}" a ete refusee.`
  const html = baseLayout(`
    <h1 style="font-family: Georgia, serif; font-size: 22px; color: #1f1b13; margin: 0 0 16px;">Demande refusee</h1>
    <p style="margin: 0 0 24px;">Bonjour ${esc(opts.requesterName)}, votre demande pour <em>${esc(opts.bookTitle)}</em> a ete refusee.</p>
  `)
  return { subject, text, html }
}

// =====================================================================
// Contrat public — fonctions metier
// (signatures stables, ne pas modifier sans mise a jour des appelants)
// =====================================================================

export async function sendMagicLink(to: string, url: string): Promise<void> {
  await send(to, renderMagicLinkEmail({ url }))
}

export async function sendLoanRequest(opts: {
  ownerEmail: string
  ownerName: string
  requesterName: string
  bookTitle: string
  acceptUrl: string
  refuseUrl: string
}): Promise<void> {
  await send(opts.ownerEmail, renderLoanRequestEmail(opts))
}

export async function sendLoanAccepted(opts: {
  requesterEmail: string
  requesterName: string
  bookTitle: string
  ownerName: string
}): Promise<void> {
  await send(opts.requesterEmail, renderLoanAcceptedEmail(opts))
}

export async function sendLoanRefused(opts: {
  requesterEmail: string
  requesterName: string
  bookTitle: string
}): Promise<void> {
  await send(opts.requesterEmail, renderLoanRefusedEmail(opts))
}

// =====================================================================
// Helpers de rendu (templates inline-style pour mail clients)
// =====================================================================

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function baseLayout(inner: string): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sifriya</title></head>
<body style="margin: 0; padding: 0; background: #f5f1e8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1f1b13;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f5f1e8;">
    <tr><td align="center" style="padding: 48px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(31,27,19,.08); overflow: hidden;">
        <tr><td style="padding: 32px 40px; border-bottom: 1px solid rgba(31,27,19,.08);">
          <p style="margin: 0; font-family: Georgia, serif; font-size: 18px; color: #1f1b13; letter-spacing: 0.5px;">Sifriya</p>
        </td></tr>
        <tr><td style="padding: 32px 40px; font-size: 15px; line-height: 1.6;">
          ${inner}
        </td></tr>
        <tr><td style="padding: 24px 40px; background: #ede7d8; font-size: 12px; color: #6b6354;">
          Sifriya — bibliotheque privee
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function button(url: string, label: string): string {
  return `<a href="${esc(url)}" style="display: inline-block; padding: 11px 22px; background: #8a6b1f; color: #faf7ef; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">${esc(label)}</a>`
}

function buttonGhost(url: string, label: string): string {
  return `<a href="${esc(url)}" style="display: inline-block; padding: 10px 22px; background: transparent; color: #1f1b13; text-decoration: none; border: 1px solid rgba(31,27,19,.2); border-radius: 6px; font-weight: 500; font-size: 14px;">${esc(label)}</a>`
}
