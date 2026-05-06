// lib/bulk-import-limits.ts
// =====================================================================
// Sifriya — limites et constantes du bulk import
// V1.5+ : MAX_FILES_USER ajoutera un cap pour les non-admin (10-20).
// =====================================================================

export const MAX_FILES_ADMIN = 500
export const WARN_FILES_ADMIN = 200

// Concurrence d'upload cote client (evite de saturer le reseau)
export const CONCURRENT_UPLOADS = 3

// Throttle entre 2 calls API metadata (evite de hammer Google Books)
export const METADATA_CALL_DELAY_MS = 100

// Polling client de l'etat de la session (ms)
export const SESSION_POLL_INTERVAL_MS = 3000

// Cleanup
export const SESSION_ABANDON_AFTER_DAYS = 7
export const SESSION_PURGE_AFTER_DAYS = 30
