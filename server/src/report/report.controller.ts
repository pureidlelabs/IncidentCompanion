/**
 * The two documents the report screens read before they can draw anything:
 * install-level, so neither names a case.
 *
 * The report's rows are ordinary collections served by
 * `entities.controller.ts`; what is here is the vocabulary those screens are
 * assembled from.
 */
import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'

import { BLANK_LAYOUT, blockKindGroups } from './block-kinds.js'
import { LibraryService } from '../library/library.service.js'
import { reportSnippetSchema } from '../library/kinds.js'
import { LanguageService } from './language.service.js'
import { EN_KEYS } from './document/packs.js'
import { ReportLifecycleService, type MissingSection } from './lifecycle.service.js'
import { ReportRenderService } from './render.service.js'
import { pageRuler, type PageRuler } from './document/pdf.js'
import { CaseAccessGuard } from '../access/case-access.guard.js'
import { REPORT_STAGES, TLP_LABELS } from '../domain/entities/report.js'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { readStamp } from '../domain/field-spec.js'
import {
  BlockKindsDto,
  ReportLayoutsDto,
  ReportSnippetsDto,
  type BlockKinds,
  type ReportLayouts,
  type ReportSnippets,
} from './views.js'





/** The pack's heading keys, which is what a section can be titled by. */
const HEADING_KEYS = EN_KEYS.filter((key) => key.startsWith('heading.'))

/**
 * What a layout's chip says for one block.
 *
 * **A literal wins, then the pack, then the kind.** A key the pack has no entry
 * for resolves to itself -- `heading.exec_summary` on a chip is the key leaking
 * onto a screen, so the kind is what shows instead. The document makes the same
 * choice; this is the screen's copy of it, and the only one the client sees.
 */
function labelFor(
  block: { kind: string; heading?: string; headingKey?: string },
  t: (key: string) => string,
): string {
  if (block.heading) return block.heading
  if (block.headingKey) {
    const resolved = t(block.headingKey)
    if (resolved !== block.headingKey) return resolved
  }
  /**
   * **The kind, through the pack, exactly as the document titles it.**
   * Prettifying the slug instead is always English, so a layout chip in the New
   * report dialog reads "Exec card" where the document it describes prints
   * "Samenvatting". -> `document/resolve.ts`
   */
  const derived = t(`heading.${block.kind}`)
  if (derived !== `heading.${block.kind}`) return derived
  return block.kind.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase())
}

/**
 * What the report lifecycle routes answer with.
 *
 * **`sentAt` is a string here and a `Date` in the service**, which is the split
 * `readStamp` exists for: the column hands back a Date and the document has to
 * publish a string.
 */
const missingSectionSchema = z.object({ kind: z.string(), heading: z.string() })

class MissingSectionsDto extends createZodDto(
  z.object({ id: z.uuid(), missing: z.array(missingSectionSchema) }),
) {}
class PageRulerDto extends createZodDto(
  z.object({
    pages: z.int(),
    sections: z.array(z.object({ index: z.int(), heading: z.string(), page: z.int() })),
  }),
) {}
class SentDto extends createZodDto(
  z.object({ id: z.uuid(), sentAt: readStamp(), sections: z.int() }),
) {}
class SupersededDto extends createZodDto(
  z.object({ id: z.uuid(), superseded: z.uuid(), blocks: z.int() }),
) {}
class RestoredDto extends createZodDto(
  z.object({ id: z.uuid(), restored: z.array(missingSectionSchema) }),
) {}

@Controller('api')
export class ReportController {
  constructor(
    private readonly library: LibraryService,
    private readonly languages: LanguageService,
    private readonly lifecycle?: ReportLifecycleService,
    private readonly render?: ReportRenderService,
  ) {}

  /**
   * The reusable paragraphs the `/` menu offers, in the report's language.
   *
   * A drop-in directory rather than a constant, so empty is an ordinary answer.
   * A snippet carries its own translations - an untranslated one answers in
   * English and *says* `language: 'en'`, so the menu can mark it rather than
   * passing English prose off as a translation.
   *
   * `problems` names drop-ins that would not load. It is served empty rather
   * than omitted, because the client dereferences it.
   */
  @Get('report-snippets')
  @ZodResponse({
    status: 200,
    type: ReportSnippetsDto,
    description: 'The snippet menu, in the asked-for language where one exists.',
  })
  async snippets(@Query('lang') lang?: string): Promise<ReportSnippets> {
    const asked = (lang ?? '').trim() || 'en'
    const rows = await this.library.listWithPayload('report-snippets')

    return {
      snippets: rows.map((row) => {
        /**
         * **Parsed, not cast.** Read as a hand-written shape, this took
         * `translations` for a map after the schema had made it rows: every
         * lookup missed, every Dutch row served English prose, and `languages`
         * answered with the array's own indices. A cast is an assertion the
         * typechecker believes, and the payload is the one value on this route
         * that another file owns.
         */
        const payload = reportSnippetSchema.parse(row.payload ?? {})
        const translations = payload.translations
        const carried = translations.map((one) => one.language)
        // **Falls back rather than answering nothing.** A menu row missing its
        // body inserts an empty paragraph, which reads as the snippet being
        // broken rather than untranslated.
        const chosen = translations.find((one) => one.language === asked)
        const language = chosen ? asked : 'en'
        return {
          name: row.name,
          label: chosen?.label ?? row.label,
          // **`slot`, not `group`.** Python called it a group; the schema this
          // server stores calls it a slot, and reading the old name filed all
          // 56 entries under the empty string.
          group: payload.slot ?? '',
          hint: chosen?.hint ?? payload.hint ?? '',
          body: chosen?.body ?? payload.body ?? '',
          builtin: row.origin === 'built-in',
          language,
          languages: carried.length > 0 ? carried : ['en'],
        }
      }),
      problems: [],
    }
  }

  /**
   * What this report's layout requires and it no longer holds.
   *
   * **Empty is the ordinary answer**, and the caller shows nothing rather than
   * a reassurance - a document that is not short should say nothing about its
   * completeness. -> `lifecycle.service.ts`
   */
  @UseGuards(CaseAccessGuard)
  @Get('cases/:caseId/reports/:id/missing-sections')
  @ZodResponse({ status: 200, type: MissingSectionsDto, description: 'Required sections the draft still lacks.' })
  async missingSections(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ id: string; missing: MissingSection[] }> {
    return { id, missing: await this.lifecycle!.missingSections(caseId, id) }
  }

  /**
   * Where the painter breaks the pages, section by section.
   *
   * **The heaviest read this screen makes**, because the whole PDF is laid out
   * to answer it - pagination depends on every preceding section's height, so
   * there is no cheaper derivation. A sent report is measured against its
   * frozen tree, the same document the file would be painted from.
   * -> `document/pdf.ts`
   */
  @UseGuards(CaseAccessGuard)
  @Get('cases/:caseId/reports/:id/page-ruler')
  @ZodResponse({ status: 200, type: PageRulerDto, description: 'The page each section starts on.' })
  async pageRuler(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('lang') lang?: string,
  ): Promise<PageRuler> {
    // **The ruler is given the images too.** It paginates by laying the whole
    // document out, so one built without them omits every figure and reports
    // page breaks the delivered PDF does not have.
    const { document_, images } = await this.render!.render(caseId, id, lang)
    return pageRuler(document_, images)
  }

  /**
   * Mark a report sent, freezing the document as it stands.
   *
   * **Irreversible, and the client says so before it calls.** There is no
   * unlock route and there is not meant to be one - a filed document is
   * superseded, never edited. -> `lifecycle.service.ts`
   *
   * A second send answers **409**, not a re-freeze: the recorded document is
   * the one that left.
   */
  @UseGuards(CaseAccessGuard)
  @Post('cases/:caseId/reports/:id/send')
  @ZodResponse({ status: 201, type: SentDto, description: 'The report was frozen and stamped as sent.' })
  @HttpCode(200)
  async send(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Session() session: UserSession,
    @Query('lang') lang?: string,
  ) {
    return this.lifecycle!.send(caseId, id, session.user.id, lang)
  }

  /**
   * Mint the successor to a report, one step along the stage cascade.
   *
   * **201, because the answer is a new document** - the client's next move is
   * to open the id it gets back.
   */
  @UseGuards(CaseAccessGuard)
  @Post('cases/:caseId/reports/:id/supersede')
  @ZodResponse({ status: 201, type: SupersededDto, description: 'The successor draft, and what it carried over.' })
  async supersede(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Session() session: UserSession,
  ) {
    return this.lifecycle!.supersede(caseId, id, session.user.id)
  }

  /**
   * Add back the sections this report's layout requires and it no longer holds.
   *
   * **Idempotent, so the client offers it without tracking state** - a second
   * call restores nothing and says so with an empty list.
   */
  @UseGuards(CaseAccessGuard)
  @Post('cases/:caseId/reports/:id/restore-sections')
  @ZodResponse({ status: 201, type: RestoredDto, description: 'The required sections put back.' })
  @HttpCode(200)
  async restoreSections(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Session() session: UserSession,
  ) {
    return this.lifecycle!.restoreSections(caseId, id, session.user.id)
  }

  /**
   * Every section a report can hold, grouped.
   *
   * `lang` is accepted and answered in English whatever it says: the labels are
   * app chrome. Refusing an unknown language would take the menu away from an
   * analyst whose report is not in English.
   */
  @Get('report-block-kinds')
  @ZodResponse({
    status: 200,
    type: BlockKindsDto,
    description: 'Every section a report can hold, grouped as the insert menu draws them.',
  })
  blockKinds(@Query('lang') _lang?: string): BlockKinds {
    return { groups: blockKindGroups() }
  }

  /**
   * Everything the New report form offers, in one document - one request
   * because one screen reads all of it.
   *
   * Layouts come from the library, so an analyst's own file appears without a
   * code change. **The blank layout is appended here rather than by the
   * client**, which is what keeps the list non-empty: the form picks
   * `layouts[0]` and disables Create while that is undefined, so an empty list
   * is a dialog that can be filled in and never submitted.
   */
  @Get('report-layouts')
  @ZodResponse({
    status: 200,
    type: ReportLayoutsDto,
    description: 'Everything the New report form offers, in one document.',
  })
  async layouts(@Query('lang') lang?: string): Promise<ReportLayouts> {
    /**
     * **The client has always sent `?lang` and this route ignored it.** So a
     * Dutch report asked for Dutch section headings and was served English
     * ones: the pack reached the exported file and never the screen, which is
     * why switching the language looked like it did nothing.
     */
    const asked = (lang ?? '').trim() || 'en'
    const [layouts, t] = await Promise.all([
      this.library.listWithPayload('report-layouts'),
      this.languages.translatorFor(asked),
    ])

    return {
      layouts: [
        ...layouts.map((row) => {
          const payload = (row.payload ?? {}) as {
            blocks?: { kind: string; heading?: string; headingKey?: string }[]
            requiresFeature?: string
          }
          return {
            name: row.name,
            label: row.label,
            // The row's own column, which a built-in is seeded with and an
            // analyst's drop-in may leave empty - a card with no line under
            // its title is the shape that handles.
            summary: row.description,
            builtin: row.origin === 'built-in',
            // Whether the layout is a regulatory one, which is what decides
            // whether a stage applies to it. Declared by the layout itself.
            nis2: payload.requiresFeature === 'nis2',
            /**
             * **Described, not named.** This served bare kind strings while the
             * client drew `block.kind` and `block.label` for each one, so every
             * chip in the New report dialog rendered empty.
             */
            blocks: (payload.blocks ?? []).map((block, position) => ({
              kind: block.kind,
              position,
              heading: block.heading ?? '',
              headingKey: block.headingKey ?? '',
              label: labelFor(block, t),
            })),
          }
        }),
        // Last, so a real layout is what the form lands on when there is one.
        {
          name: BLANK_LAYOUT,
          label: 'Blank',
          summary: 'No sections. Start from nothing and add what the case needs.',
          builtin: true,
          nis2: false,
          blocks: [],
        },
      ],
      // **A leading empty entry on both**, because "no stage" and "unmarked"
      // are real choices rather than the absence of one - a select with no
      // empty member makes the first option the default by accident.
      stages: ['', ...REPORT_STAGES],
      tlp: ['', ...TLP_LABELS],
      /**
       * **Read from what this install stores, never listed here.** A list
       * named here renders a pack perfectly on `?lang=nl` while leaving it
       * unchoosable in the one control an analyst has, and a list derived from
       * a compiled-in literal makes adding a language a rebuild. Uploading one
       * is the whole of adding a language. -> `language.service.ts`
       */
      languages: await this.languages.list(),
      headings: HEADING_KEYS.map((key) => ({ key, label: t(key) })).filter(
        (pair) => pair.label !== pair.key,
      ),
    }
  }
}
