// lib/readings.ts
// DTO et selects partages pour les Readings (statut de lecture par user).
// Cascade onDelete: Cascade sur user et book deja en place (V1.3).

import type { ReadingStatus } from "@prisma/client"

export type ReadingDTO = {
  id: string
  status: ReadingStatus
  addedAt: Date
  updatedAt: Date
}

export const PUBLIC_READING_SELECT = {
  id: true,
  status: true,
  addedAt: true,
  updatedAt: true
} as const
