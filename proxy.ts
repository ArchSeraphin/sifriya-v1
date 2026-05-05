import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const role = req.nextauth.token?.role

    // Garde-fou cote middleware : /admin reserve aux ADMIN.
    if (pathname.startsWith("/admin") && role !== "ADMIN") {
      const url = req.nextUrl.clone()
      url.pathname = "/bibliotheque"
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => Boolean(token)
    },
    pages: {
      signIn: "/login"
    }
  }
)

export const config = {
  // On protege les pages applicatives (et /admin). Les routes API se chargent
  // elles-memes de leur 401/403 — un middleware qui redirige vers /login pour
  // une requete fetch produit un 307 illisible cote client.
  matcher: [
    "/((?!api|login|verify|_next/static|_next/image|favicon.ico|logo.svg).*)"
  ]
}
