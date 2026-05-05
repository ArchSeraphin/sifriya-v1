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
  // Tout est protege sauf : auth API, login/verify, healthcheck, assets statiques.
  matcher: [
    "/((?!api/auth|api/health|login|verify|_next/static|_next/image|favicon.ico|logo.svg).*)"
  ]
}
