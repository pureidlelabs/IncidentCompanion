/**
 * `/api/library/:slug` - every library the picker offers, through one
 * controller, because they differ only in what their payload holds.
 *
 * There is no `reload` route: the store is a table and this app is its only
 * writer. -> `db/schema/library.ts`
 *
 * **An entry has two names: `name` is slug-shaped and `label` is not.** The
 * name is what a URL carries and what a case create names to seed from, so a
 * space or a slash in it breaks a route; the label is what a person reads and
 * may say anything. That split is why `keyFor` exists.
 */
import { ApiBody } from '@nestjs/swagger'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
  Put,
  UseGuards,
} from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'
import { AuthGuard, Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { z } from 'zod'

import {
  editorDocument,
  messagesFrom,
  payloadFrom,
  withRow,
  withoutRow,
  type EditorValue,
  type WrittenMessage,
} from './editor.js'
import { editorDocumentSchema } from './editor.js'
import { kindOf, type LibraryKind } from './kinds.js'
import {
  LibraryAppliedDto,
  LibraryDocumentDto,
  type LibraryApplied,
  type LibraryDocument,
} from './document.js'
import { LibraryService } from './library.service.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { libraryRowSchema } from './library.service.js'
import { writtenSchema, type Written } from '../domain/written.js'
import { AdminOnly } from '../auth/admin-only.js'

/**
 * What the editor form submits.
 *
 * **`values` is the whole state, every time.** The form posts what it is
 * holding rather than a diff, because add-row and remove-row are re-renders of
 * unsaved work - there is nothing to diff them against.
 */
const editorActionSchema = z
  .object({
    action: z.enum(['save', 'add_row', 'remove_row']),
    section: z.string().max(64).optional(),
    index: z.int().nonnegative().optional(),
    values: z
      .array(z.object({ key: z.string().max(200), value: z.string().max(8000) }))
      .max(2000)
      .default([]),
  })
  .strict()

class EditorActionDto extends createZodDto(editorActionSchema) {}

/**
 * A new entry's own fields, distinct from its payload.
 *
 * **One field from the analyst, and the key is derived.** The dialog asks for
 * a name and nothing else; demanding a separate lower-case slug puts a second
 * question on screen whose answer is a function of the first, and getting it
 * wrong is a 400 on a form with one input.
 *
 * `startFrom` is a *name* in this same library, or absent for an empty one.
 */
const createSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional(),
    startFrom: z.string().trim().max(64).optional(),
  })
  .strict()

class LibraryCreateDto extends createZodDto(createSchema) {}

/**
 * A label to a key: lower case, digits and dashes.
 *
 * **Falls back to a stamp rather than to the empty string.** A label of only
 * punctuation slugifies to nothing, and a row keyed on `''` is one an analyst
 * cannot address; `entry-<n>` is ugly and addressable, which is the right way
 * round for a name nobody types.
 */
function keyFor(label: string, taken: ReadonlySet<string>): string {
  const stem =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'entry'

  if (!taken.has(stem)) return stem
  for (let n = 2; ; n += 1) {
    const next = `${stem}-${String(n)}`.slice(0, 64)
    if (!taken.has(next)) return next
  }
}

/**
 * A library, as its screen draws it.
 *
 * **The kind's own labels travel with the rows.** The screen has to name a
 * "case template" or a "report layout" in its heading and its New button, and
 * a client that hardcoded those would be enumerating the registry - which the
 * drop-in rule forbids.
 */
export const libraryListingSchema = z.object({
  slug: z.string(),
  noun: z.string().describe('What one of these is called, singular, for the screen to say.'),
  /**
   * **Nullable, which the compiler caught rather than the schema's author.**
   * A kind that cannot be authored has no New button to label, so this is
   * absent rather than empty - and a client rendering `''` would draw one
   * with no words in it.
   */
  newLabel: z.string().nullable(),
  allowBlank: z.boolean().describe('Whether a New may start from nothing.'),
  entries: z.array(libraryRowSchema),
  problems: z
    .array(z.string())
    .describe('Always empty. A table has no unparseable rows; the client maps over it regardless.'),
  startOptions: z.array(z.object({ value: z.string(), label: z.string() })),
})

class LibraryListingDto extends createZodDto(libraryListingSchema) {}

class WrittenDto extends createZodDto(writtenSchema) {}

class EditorDocumentDto extends createZodDto(editorDocumentSchema) {}

/**
 * What an editor action answers with: the outcome, and the form redrawn.
 *
 * **The document comes back with the refusal**, not only with success. The
 * form is server-rendered, so a refused save that answered a sentence alone
 * would leave the screen holding values the server has already rejected and
 * no way to show which field was wrong.
 */
const editorResultSchema = writtenSchema.extend({ editor: editorDocumentSchema })

type EditorResult = z.infer<typeof editorResultSchema>

class EditorResultDto extends createZodDto(editorResultSchema) {}

@UseGuards(AuthGuard)
@Controller('api/library')
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly activity: InstallActivityService,
  ) {}

  /**
   * **An unknown slug is a 404 naming what is served.** The client asks for
   * whatever its pane declares, so a typo there is otherwise an empty list that
   * reads as an empty library.
   */
  private kind(slug: string): LibraryKind {
    const kind = kindOf(slug)
    if (!kind) {
      throw new NotFoundException(
        `No library "${slug}". This install serves: ${this.library.slugs().join(', ')}.`,
      )
    }
    return kind
  }

  /**
   * `GET /api/library/{slug}/document` - this kind, as a file for git.
   *
   * **Not the listing.** The listing is for a screen and carries what a screen
   * needs: permissions, an origin word, a noun. This carries what another
   * install needs, and nothing that differs between installs - no id, no
   * timestamps - so two identical libraries produce identical files.
   */
  @Get(':slug/document')
  @ZodResponse({
    status: 200,
    type: LibraryDocumentDto,
    description: 'This library as a document, ready to commit and to apply elsewhere.',
  })
  async document(@Param('slug') slug: string): Promise<LibraryDocument> {
    this.kind(slug)
    return this.library.exportKind(slug)
  }

  /**
   * `PUT /api/library/{slug}` - make this kind match the document.
   *
   * Administrator only: a document's `disabledBuiltins` turns a shipped entry
   * off install-wide, which the per-entry routes cannot do. Refuses a document
   * whose own `kind` disagrees with the URL.
   */
  @AdminOnly()
  @Put(':slug')
  @ZodResponse({
    status: 200,
    type: LibraryAppliedDto,
    description: 'Applies a library document, replacing this kind and nothing else.',
  })
  async apply(
    @Param('slug') slug: string,
    @Body() body: LibraryDocumentDto,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<LibraryApplied> {
    const kind = this.kind(slug)
    if (body.kind !== kind.slug) {
      throw new UnprocessableEntityException(
        `This document is for "${body.kind}" and the address says "${kind.slug}".`,
      )
    }

    /**
     * **A library with no payload schema refuses a document, exactly as it
     * refuses a New.** Validating only where a schema exists makes the one
     * kind without one the one kind nothing checks: an entry of any shape is
     * written with a 200, and the route serving that kind then answers 500 on
     * every case until somebody removes the row. `create` refuses that kind
     * with a sentence, and this door has to refuse it too.
     */
    const schema = kind.payload
    if (!schema) {
      throw new BadRequestException(`A ${kind.noun} cannot be written here yet.`)
    }

    /**
     * **Every payload is checked against the kind before anything is written.**
     * The transaction would roll a bad one back, but the refusal names the
     * entry rather than the transaction - an operator applying forty snippets
     * needs to know which one is wrong.
     */
    for (const entry of body.entries) {
      const verdict = schema.safeParse(entry.payload)
      if (!verdict.success) {
        throw new UnprocessableEntityException(
          `"${entry.name}" is not a valid ${kind.noun}: ${verdict.error.issues[0]?.message ?? 'refused'}`,
        )
      }
    }

    const applied = await this.library.applyKind(slug, body)
    await this.activity.libraryKindReplaced(
      { session, headers: request.headers, request },
      slug,
      body.entries.length,
      body.disabledBuiltins?.length ?? 0,
    )
    return applied
  }

  @Get(':slug')
  @ZodResponse({
    status: 200,
    type: LibraryListingDto,
    description: 'Everything this library holds, and what its screen calls one of them.',
  })
  async listing(@Param('slug') slug: string) {
    const kind = this.kind(slug)
    return {
      slug: kind.slug,
      noun: kind.noun,
      newLabel: kind.newLabel,
      allowBlank: kind.allowBlank,
      entries: await this.library.list(slug),
      /**
       * **Present and empty, always.** A table has no unparseable rows, and
       * the client maps over this unconditionally.
       */
      problems: [],
      /**
       * What a New offers to start from. Blank leads where the library allows
       * one, and its value is the empty string - the same "nothing chosen" the
       * create route reads, so no sentinel can collide with an entry named
       * `blank`.
       *
       * `listOffered`, where `entries` above is `list`: a disabled built-in
       * stays on the pane and leaves the menus.
       */
      startOptions: [
        ...(kind.allowBlank ? [{ value: '', label: 'Blank' }] : []),
        ...(await this.library.listOffered(slug)).map((row) => ({
          value: row.name,
          label: row.label,
        })),
      ],
    }
  }

  @Post(':slug')
  @ApiBody({
    type: LibraryCreateDto,
    description: 'A label for the new entry, and which existing one to start it from.',
  })
  @ZodResponse({
    status: 200,
    type: WrittenDto,
    description: 'A sentence for the analyst, and the name it was given.',
  })
  async create(@Param('slug') slug: string, @Body() body: unknown): Promise<Written> {
    const kind = this.kind(slug)
    if (!kind.payload) {
      throw new BadRequestException({
        message: `A ${kind.noun} cannot be written here yet.`,
      })
    }

    const parsed = createSchema.safeParse(body ?? {})
    if (!parsed.success) {
      throw new UnprocessableEntityException({ message: 'Validation failed', errors: parsed.error.issues })
    }
    const { label, description, startFrom } = parsed.data

    /**
     * **Blank is the schema's own defaults, not an empty object literal.** The
     * shape decides what an empty checklist is; writing `{}` here would be a
     * second answer that drifts the first time a field is added.
     */
    let source: unknown = {}
    if (startFrom) {
      const from = await this.library.entry(slug, startFrom)
      if (!from) throw new NotFoundException(`No ${kind.noun} "${startFrom}" to start from.`)
      source = from.payload
    }
    const shape = kind.payload.safeParse(source)
    if (!shape.success) {
      throw new UnprocessableEntityException({ message: 'Validation failed', errors: shape.error.issues })
    }

    const taken = new Set((await this.library.list(slug)).map((row) => row.name))
    const name = keyFor(label, taken)

    await this.library.create(slug, {
      name,
      label,
      ...(description === undefined ? {} : { description }),
      payload: shape.data as Record<string, unknown>,
    })
    return { ok: true, messages: [[`${label} added.`, 'positive']] }
  }

  /**
   * The structured editor for one entry - and the only way to *read* a
   * built-in's contents.
   *
   * **Served for a built-in as well, with `canEdit: false`.** The maintainer asked
   * for a way to preview a shipped template; refusing the document to anything
   * that cannot be written means the only way to see what a built-in contains
   * is to duplicate it first, which leaves a copy behind for a look.
   */
  @Get(':slug/:name/editor')
  @ZodResponse({
    status: 200,
    type: EditorDocumentDto,
    description: 'The structured editor for one entry, and the only way to read a built-in.',
  })
  async editor(@Param('slug') slug: string, @Param('name') name: string) {
    const kind = this.kind(slug)
    const row = await this.entryOr404(slug, name)
    if (!kind.payload) {
      throw new NotFoundException(
        `Entries in "${slug}" cannot be edited on this server yet: it has no payload to describe.`,
      )
    }
    return editorDocument({
      schema: kind.payload as z.ZodObject,
      kind: kind.slug,
      name: row.name,
      title: row.label,
      subtitle: row.builtin ? 'Built-in' : 'Yours',
      blurb: row.description,
      values: (row.payload ?? {}),
      canEdit: !row.builtin,
    })
  }

  /**
   * Save the entry, or re-render the form with a row added or removed - one
   * route for three actions, because all three answer with the same document.
   * Add and remove write nothing.
   *
   * A refusal is 422 carrying the document, which is what
   * `useLibraryEditorAction` reads through `ApiError.body`, and it carries the
   * analyst's own edit rather than what is stored.
   */
  @Post(':slug/:name/editor')
  @ApiBody({ type: EditorActionDto, description: 'The whole form state, and which action to take on it.' })
  @ZodResponse({
    status: 200,
    type: EditorResultDto,
    description: 'What the action did, and the form as it now stands.',
  })
  async editorAction(
    @Param('slug') slug: string,
    @Param('name') name: string,
    @Body() body: unknown,
  ): Promise<EditorResult> {
    const kind = this.kind(slug)
    const row = await this.entryOr404(slug, name)
    if (!kind.payload) {
      throw new NotFoundException(`Entries in "${slug}" cannot be edited on this server yet.`)
    }
    const schema = kind.payload as z.ZodObject
    const submitted = editorActionSchema.safeParse(body ?? {})
    if (!submitted.success) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: submitted.error.issues,
      })
    }
    const action = submitted.data

    const render = (values: readonly EditorValue[], messages: WrittenMessage[]) =>
      editorDocument({
        schema,
        kind: kind.slug,
        name: row.name,
        title: row.label,
        subtitle: row.builtin ? 'Built-in' : 'Yours',
        blurb: row.description,
        values: payloadFrom(values),
        canEdit: !row.builtin,
        messages,
      })

    if (action.action === 'add_row' || action.action === 'remove_row') {
      const section = action.section ?? ''
      const shape = editorDocument({
        schema,
        kind: kind.slug,
        name: row.name,
        title: row.label,
        subtitle: '',
        blurb: '',
        values: {},
        canEdit: !row.builtin,
      }).sections.find((one) => one.key === section)
      if (!shape) {
        throw new BadRequestException(`No section "${section}" in a ${kind.noun}.`)
      }
      const next =
        action.action === 'add_row'
          ? withRow(action.values, section, shape.specs)
          : withoutRow(action.values, section, action.index ?? -1)
      return { ok: true, messages: [], editor: render(next, []) }
    }

    // **Refused before the write, and the refusal is the row's own property.**
    // A built-in never becomes editable, so saying so here is clearer than a
    // silent no-op from the `where` clause below.
    if (row.builtin) {
      throw new UnprocessableEntityException({
        ok: false,
        messages: [['A built-in is duplicated rather than edited.', 'negative']],
        editor: render(action.values, [
          ['A built-in is duplicated rather than edited.', 'negative'],
        ]),
      })
    }

    const candidate = schema.safeParse(payloadFrom(action.values))
    if (!candidate.success) {
      const messages = messagesFrom(candidate.error)
      throw new UnprocessableEntityException({
        ok: false,
        messages,
        editor: render(action.values, messages),
      })
    }

    await this.library.update(slug, name, candidate.data)
    return {
      ok: true,
      messages: [[`Saved ${row.label}.`, 'positive']],
      editor: render(action.values, []),
    }
  }

  /** The row, or a 404 naming what was asked for. */
  private async entryOr404(slug: string, name: string) {
    const row = await this.library.entry(slug, name)
    if (!row) throw new NotFoundException(`No ${slug} entry called "${name}".`)
    return row
  }

  @Delete(':slug/:name')
  @ZodResponse({
    status: 200,
    type: WrittenDto,
    description: 'A sentence confirming what was removed.',
  })
  async remove(@Param('slug') slug: string, @Param('name') name: string): Promise<Written> {
    const kind = this.kind(slug)
    const existing = await this.library.entry(slug, name)
    if (!existing) throw new NotFoundException(`No ${kind.noun} "${name}".`)
    /**
     * **A built-in is refused rather than silently kept.** The delete is
     * already scoped to non-built-ins in SQL, so without this the route would
     * answer "deleted" and the row would still be there.
     */
    if (existing.builtin) {
      throw new BadRequestException({
        message: `"${existing.label}" ships with the app. Duplicate it instead.`,
      })
    }
    await this.library.remove(slug, name)
    return { ok: true, messages: [[`${existing.label} removed.`, 'positive']] }
  }
}
