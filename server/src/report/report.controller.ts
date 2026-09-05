/**
 * The two documents the report screens read before they can draw anything:
 * install-level, so neither names a case.
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
   */
  const derived = t(`heading.${block.kind}`)
  if (derived !== `heading.${block.kind}`) return derived
  return block.kind.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase())
}

/**
 * What the report lifecycle routes answer with.
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
         * **Parsed, not cast.**
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
   */
  @Get('report-layouts')
  @ZodResponse({
    status: 200,
    type: ReportLayoutsDto,
    description: 'Everything the New report form offers, in one document.',
  })
  async layouts(@Query('lang') lang?: string): Promise<ReportLayouts> {
    /**
     * **The client has always sent `?lang` and this route ignored it.**
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
             * **Described, not named.**
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
       * **Read from what this install stores, never listed here.**
       */
      languages: await this.languages.list(),
      headings: HEADING_KEYS.map((key) => ({ key, label: t(key) })).filter(
        (pair) => pair.label !== pair.key,
      ),
    }
  }
}
