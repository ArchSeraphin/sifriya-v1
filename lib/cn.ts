// Petit helper de concatenation de classes — evite la dependance a clsx/tailwind-merge.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}
