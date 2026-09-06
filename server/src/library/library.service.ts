/**
 * Reading and writing the library, and seeding what ships with the app.
 *
 * **Install-level, so no case is opened and nothing is scoped.** A template is
 * what a *new* case starts from; there is no case to scope it to, which is why
 * these rows carry no `caseId` and no row-level security policy.
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
   * **On the listing, so a second endpoint is not needed to read it.** The
   * new-case form shows the chosen template's description; Python served that
   * from `/api/case-templates`, a second route over the same four rows.
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
   * **`Database | null`, because the seed role is optional.** `SEED_DATABASE`
   * resolves to null when `SEED_DATABASE_URL` is unset -- which `config/env.ts`
   * documents as "the seeder is off" -- and a non-nullable type boots straight
   * into `Cannot read properties of null (reading 'insert')` inside
   * `app.listen()`, which reads as a hang rather than a missing variable.
   */
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SEED_DATABASE) private readonly seed: Database | null,
  ) {}

  /**
   * Write what ships, once, on boot. Upserts on `(kind, name)` and names only
   * built-in rows, so a restart neither duplicates them nor touches an
   * analyst's own. Needs the seed role.
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
     * **The report layouts, by the same upsert.** Without them the layout list
     * held only Blank, so every report started empty and the restore, the
     * required-section derivation and the New report form were all built and
     * inert.
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
     * **The snippets, by the same upsert.** The `/` menu in a written block is
     * wired from this table to the caret -- search, slots, keyboard, insert --
     * and served an empty list, so the whole feature read as unbuilt. These are
     * lifted from the Python drop-in directory; an install's own entries are
     * ordinary rows beside them.
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
   *
   * Separate from `list` so a listing does not carry payloads nobody asked
   * for. A caller that wants a disabled row's payload wants `entry`.
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
       * **A built-in is duplicated, never edited.** Editing one would mean the
       * next release either overwrites the analyst's change or stops updating
       * a template they think is the shipped one; duplicating makes which is
       * which a fact about the row.
       *
       * And nothing is editable in a library that cannot be authored at all -
       * the report three have no payload schema to validate a write against.
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
   *
   * **A built-in is excluded in the `where`, not checked in the route.** The
   * route refuses one too and says why, but the reason a built-in may not be
   * edited is a property of the row rather than of one caller - the next write
   * path would otherwise have to remember it. Answers whether anything moved,
   * so a refusal and a missing row are one branch at the caller.
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
   *
   * A built-in is named but not carried, and `id`, `createdAt` and
   * `updatedAt` are left out.
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
   *
   * Replaces rather than merges, scoped to the one kind, in one transaction.
   * A built-in is disabled rather than deleted, and absent from
   * `disabledBuiltins` means enabled - so applying the same file twice is
   * idempotent.
   */
  async applyKind(slug: string, doc: LibraryDocument): Promise<LibraryApplied> {
    return this.db.transaction(async (tx) => {
      const before = await tx.select().from(library).where(eq(library.kind, slug))
      const mine = new Set(before.filter((row) => !row.builtin).map((row) => row.name))
      const wanted = new Set(doc.entries.map((entry) => entry.name))

      /**
       * **A built-in's name may not be reused by an entry.** The unique index
       * is on `(kind, name)`, so the upsert below would rewrite the built-in's
       * own row - turning a shipped entry into the operator's, invisibly,
       * until the next boot put it back and their edit vanished.
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
