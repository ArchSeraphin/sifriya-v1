// Palette doree, accordee aux tokens du design system.
const PALETTE = [
  "#6b6354",
  "#8a6b1f",
  "#4a6b3e",
  "#a86a1f",
  "#8a3030",
  "#5a4711",
  "#3a342a"
] as const

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function pickAvatarColor(seed: string): string {
  return PALETTE[hash(seed) % PALETTE.length]!
}

export function initials(name: string | null | undefined, fallback: string): string {
  const source = (name && name.trim()) || fallback
  const parts = source
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
  if (parts.length === 0) return source.slice(0, 2).toUpperCase()
  return parts.map((p) => p[0]!.toUpperCase()).join("")
}
