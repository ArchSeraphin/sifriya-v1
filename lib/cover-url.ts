// =====================================================================
// Sifriya — normalisation des URL de couverture
// Sert deux endroits : `lib/metadata.ts` (avant stockage en DB) et
// `components/ui/Cover.tsx` (au rendu, pour rattraper les URL deja
// stockees avec une basse resolution).
// =====================================================================

// Google Books renvoie par defaut une URL `zoom=1&edge=curl` qui sort
// une miniature ~128px avec un effet de page cornee. On force `zoom=0`
// (taille native, generalement 600-800px) et on retire l'effet curl.
function upgradeGoogleBooks(url: string): string {
  let out = url
  out = out.replace(/&edge=curl/g, "")
  out = out.replace(/([?&])zoom=\d+/g, "$1zoom=0")
  return out
}

// Open Library expose -S/-M/-L. On force -L au cas ou une URL en -S ou
// -M trainerait. Format : https://covers.openlibrary.org/b/id/{id}-{S|M|L}.jpg
function upgradeOpenLibrary(url: string): string {
  return url.replace(
    /(\/b\/(?:id|olid|isbn)\/[^/]+)-[SM](\.jpg)/i,
    "$1-L$2"
  )
}

export function upscaleCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let out = url.replace(/^http:\/\//, "https://")
  if (out.includes("books.google.com") || out.includes("googleusercontent.com")) {
    out = upgradeGoogleBooks(out)
  } else if (out.includes("covers.openlibrary.org")) {
    out = upgradeOpenLibrary(out)
  }
  return out
}
