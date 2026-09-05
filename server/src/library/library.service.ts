/**
 * Reading and writing the library, and seeding what ships with the app.
 */
import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { BUILTIN_CASE_TEMPLATES } from './builtins/case-templates.js'
import { BUILTIN_REPORT_LAYOUTS } from './builtins/report-layouts.js'
import { BUILTIN_REPORT_SNIPPETS } from './builtins/report-snippets.js'
import { kindOf, LIBRARY_KINDS } from './kinds.js'
import { DATABASE, SEED_DATABASE, seedRoleMissing } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { library } from '../db/schema/library.js'
import type { LibraryApplied, LibraryDocument } from './document.js'
import { z } from 'zod'

export const libraryRowSchema = z.object({
  name: z.string().describe('The stable identifier a create names to seed from.'),
  label: z.string(),
  /**
   * **On the listing, so a second endpoint is not needed to read it.**
   */
  description: z.string(),
  origin: z
    .enum(['yours', 'built-in'])
    .describe('A built-in ships with the app and is duplicated rather than edited.'),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canDuplicate: z.boolean(),
  /**
   * **On the listing because the pane has to draw it.** A disabled entry stays
   * visible - an operator who cannot see what they switched off cannot switch
   * it back on - so the row has to carry which it is. Only a built-in is ever
   * true here; the column's own docstring has the reason.
   */
  disabled: z.boolean(),
})

export type LibraryRow = z.infer<typeof libraryRowSchema>

@Injectable()
export class LibraryService {
  private readonly log = new Logger(LibraryService.name)

  /**
   * **`Database | null`, because the seed role is optional and the injection
   * used to lie about it.**
   */
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SEED_DATABASE) private readonly seed: Database | null,
  ) {}

  /**
   * Write what ships, once, on boot.
   */
  async seedBuiltIns(): Promise<void> {
    if (!this.seed) throw new Error(seedRoleMissing('the library built-ins'))
    for (const entry of BUILTIN_CASE_TEMPLATES) {
      await this.seed
        .insert(library)
        .values({
          kind: 'templates',
          name: entry.name,
          label: entry.label,
          description: entry.description,
          position: entry.position,
          builtin: true,
          payload: entry.payload as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [library.kind, library.name],
          set: {
            label: entry.label,
            description: entry.description,
            position: entry.position,
            payload: entry.payload as Record<string, unknown>,
            updatedAt: new Date(),
          },
        })
    }
    /**
     * **The report layouts, by the same upsert.**
     */
    for (const layout of BUILTIN_REPORT_LAYOUTS) {
      await this.seed
        .insert(library)
        .values({
          kind: 'report-layouts',
          name: layout.name,
          label: layout.label,
          // The row's own column rather than a payload field: it is already
          // here, and an analyst's drop-in sets it the same way.
          description: layout.summary,
          position: layout.position,
          builtin: true,
          payload: {
            blocks: layout.blocks,
            ...(layout.requiresFeature ? { requiresFeature: layout.requiresFeature } : {}),
          },
        })
        .onConflictDoUpdate({
          target: [library.kind, library.name],
          set: {
            label: layout.label,
            description: layout.summary,
            position: layout.position,
            payload: {
              blocks: layout.blocks,
              ...(layout.requiresFeature ? { requiresFeature: layout.requiresFeature } : {}),
            },
            updatedAt: new Date(),
          },
        })
    }

    /**
     * **The snippets, by the same upsert.**
     */
    for (const snippet of BUILTIN_REPORT_SNIPPETS) {
      await this.seed
        .insert(library)
        .values({
          kind: 'report-snippets',
          name: snippet.name,
          label: snippet.label,
          description: snippet.payload.hint,
          position: snippet.position,
          builtin: true,
          payload: snippet.payload,
        })
        .onConflictDoUpdate({
          target: [library.kind, library.name],
          set: {
            label: snippet.label,
            description: snippet.payload.hint,
            position: snippet.position,
            payload: snippet.payload,
            updatedAt: new Date(),
          },
        })
    }

    this.log.log(
      `Library built-ins: ${String(BUILTIN_CASE_TEMPLATES.length)} case templates, ` +
        `${String(BUILTIN_REPORT_LAYOUTS.length)} report layouts, ` +
        `${String(BUILTIN_REPORT_SNIPPETS.length)} snippets`,
    )
  }

  /**
   * Every *offered* row of a kind, payload included - disabled rows are out,
   * so this is a menu's route and not a pane's.
   */
  async listWithPayload(slug: string): Promise<(LibraryRow & { payload: unknown })[]> {
    const rows = await this.db
      .select()
      .from(library)
      .where(eq(library.kind, slug))
      .orderBy(asc(library.position), asc(library.label))
    const listed = await this.listOffered(slug)
    const payloads = new Map(rows.map((row) => [row.name, row.payload]))
    return listed.map((row) => ({ ...row, payload: payloads.get(row.name) ?? null }))
  }

  async list(slug: string): Promise<LibraryRow[]> {
    const kind = kindOf(slug)
    const rows = await this.db
      .select()
      .from(library)
      .where(eq(library.kind, slug))
      .orderBy(asc(library.position), asc(library.label))

    return rows.map((row) => ({
      name: row.name,
      label: row.label,
      description: row.description,
      origin: row.builtin ? ('built-in' as const) : ('yours' as const),
      /**
       * **A built-in is duplicated, never edited.**
       */
      canEdit: !row.builtin && kind?.payload !== null,
      canDelete: !row.builtin,
      canDuplicate: kind?.payload !== null,
      disabled: row.disabled,
    }))
  }

  /**
   * The rows this install still *offers*, which is not the rows it holds: the
   * pane lists everything and every menu lists this.
   */
  async listOffered(slug: string): Promise<LibraryRow[]> {
    return (await this.list(slug)).filter((row) => !row.disabled)
  }

  async entry(slug: string, name: string) {
    const [row] = await this.db
      .select()
      .from(library)
      .where(and(eq(library.kind, slug), eq(library.name, name)))
    return row
  }

  async create(
    slug: string,
    values: { name: string; label: string; description?: string; payload: Record<string, unknown> },
  ): Promise<void> {
    await this.db.insert(library).values({
      kind: slug,
      name: values.name,
      label: values.label,
      description: values.description ?? '',
      builtin: false,
      payload: values.payload,
      // After everything shipped, so a new entry lands at the end of the list
      // rather than in the middle of the built-ins.
      position: 1000,
    })
  }

  /**
   * Replace an entry's payload.
   */
  async update(slug: string, name: string, payload: Record<string, unknown>): Promise<boolean> {
    const written = await this.db
      .update(library)
      .set({ payload })
      .where(and(eq(library.kind, slug), eq(library.name, name), eq(library.builtin, false)))
      .returning({ name: library.name })
    return written.length > 0
  }

  async remove(slug: string, name: string): Promise<boolean> {
    const removed = await this.db
      .delete(library)
      .where(and(eq(library.kind, slug), eq(library.name, name), eq(library.builtin, false)))
      .returning({ name: library.name })
    return removed.length > 0
  }

  /**
   * A library kind as a document that can live in git - the shape `PUT` takes
   * back, so export, apply and export again are equal.
   */
  async exportKind(slug: string): Promise<LibraryDocument> {
    const rows = await this.db
      .select()
      .from(library)
      .where(eq(library.kind, slug))
      .orderBy(library.position, library.name)

    return {
      kind: slug,
      entries: rows
        .filter((row) => !row.builtin)
        .map((row) => ({
          name: row.name,
          label: row.label,
          description: row.description,
          position: row.position,
          payload: row.payload,
        })),
      disabledBuiltins: rows
        .filter((row) => row.builtin && row.disabled)
        .map((row) => row.name)
        .sort(),
    }
  }

  /**
   * Make a kind match the document, and answer what moved.
   */
  async applyKind(slug: string, doc: LibraryDocument): Promise<LibraryApplied> {
    return this.db.transaction(async (tx) => {
      const before = await tx.select().from(library).where(eq(library.kind, slug))
      const mine = new Set(before.filter((row) => !row.builtin).map((row) => row.name))
      const wanted = new Set(doc.entries.map((entry) => entry.name))

      /**
       * **A built-in's name may not be reused by an entry.**
       */
      const builtins = new Set(before.filter((row) => row.builtin).map((row) => row.name))
      const clashing = [...wanted].filter((name) => builtins.has(name))
      if (clashing.length > 0) {
        throw new UnprocessableEntityException(
          `These names are built in and cannot be redefined: ${clashing.join(', ')}.`,
        )
      }

      for (const entry of doc.entries) {
        await tx
          .insert(library)
          .values({
            kind: slug,
            name: entry.name,
            label: entry.label,
            description: entry.description ?? '',
            position: entry.position ?? 1000,
            builtin: false,
            disabled: false,
            payload: entry.payload,
          })
          .onConflictDoUpdate({
            target: [library.kind, library.name],
            set: {
              label: entry.label,
              description: entry.description ?? '',
              position: entry.position ?? 1000,
              payload: entry.payload,
              updatedAt: new Date(),
            },
          })
      }

      const removed = [...mine].filter((name) => !wanted.has(name))
      if (removed.length > 0) {
        await tx
          .delete(library)
          .where(
            and(eq(library.kind, slug), eq(library.builtin, false), inArray(library.name, removed)),
          )
      }

      const off = new Set(doc.disabledBuiltins ?? [])
      for (const row of before.filter((entry) => entry.builtin)) {
        const shouldBe = off.has(row.name)
        if (row.disabled !== shouldBe) {
          await tx
            .update(library)
            .set({ disabled: shouldBe, updatedAt: new Date() })
            .where(and(eq(library.kind, slug), eq(library.name, row.name)))
        }
      }

      return {
        entries: doc.entries.length,
        deleted: removed.length,
        disabledBuiltins: [...off].filter((name) => builtins.has(name)).length,
      }
    })
  }

  /** Every slug this server serves, for the route's own refusal message. */
  slugs(): readonly string[] {
    return LIBRARY_KINDS.map((kind) => kind.slug)
  }
}
