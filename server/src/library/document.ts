/**
 * A library kind, as a document an operator keeps in git.
 */
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

/**
 * `payload` is unchecked here and checked by the kind: the libraries sharing
 * this document have nothing in common under it, so the shape belongs to
 * `kinds.ts`, where every other write path validates it.
 */
const entrySchema = z.object({
  /** Stable inside the kind. What a case names to seed from, and what a URL carries. */
  name: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  /**
   * **Where it sits in its pane.**
   */
  position: z.number().int().min(0).max(100_000).optional(),
  payload: z.record(z.string(), z.unknown()),
})

export const libraryDocumentSchema = z.object({
  /**
   * **Named in the document as well as the URL**, so a file that has been moved
   * or renamed cannot be applied to the wrong library in silence.
   */
  kind: z.string().trim().min(1).max(64),
  entries: z.array(entrySchema).max(500),
  /**
   * Built-ins this install does not want offered.
   */
  disabledBuiltins: z.array(z.string().trim().min(1).max(64)).max(500).optional(),
})

export type LibraryDocument = z.infer<typeof libraryDocumentSchema>

export const libraryAppliedSchema = z.object({
  /** How many entries the kind holds now. */
  entries: z.number().int(),
  /** How many of the operator's own entries the apply removed. */
  deleted: z.number().int(),
  disabledBuiltins: z.number().int(),
})

export type LibraryApplied = z.infer<typeof libraryAppliedSchema>

export class LibraryDocumentDto extends createZodDto(libraryDocumentSchema) {}
export class LibraryAppliedDto extends createZodDto(libraryAppliedSchema) {}
