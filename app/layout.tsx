import type { Metadata, Viewport } from "next"
import { Source_Serif_4, Inter, JetBrains_Mono } from "next/font/google"
import { AuthProvider } from "@/components/providers/AuthProvider"
import "./globals.css"

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--serif",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap"
})

const sans = Inter({
  subsets: ["latin"],
  variable: "--sans",
  weight: ["400", "500", "600"],
  display: "swap"
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--mono",
  weight: ["400", "500"],
  display: "swap"
})

export const metadata: Metadata = {
  title: { default: "Sifriya", template: "%s — Sifriya" },
  description: "Bibliotheque privee.",
  robots: { index: false, follow: false, nocache: true }
}

export const viewport: Viewport = {
  themeColor: "#f5f1e8",
  width: "device-width",
  initialScale: 1
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="bg-paper text-ink antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
