import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "books.google.com" },
      { protocol: "https", hostname: "covers.openlibrary.org" }
    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "55mb"
    }
  }
}

export default nextConfig
