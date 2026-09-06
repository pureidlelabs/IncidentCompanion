/**
 * `GET /api/cases/:caseId/report.{pdf,docx,md}` - the report, as a file.
 *
 * The URL is the one the export menu already builds -
 * `report.<format>?report=<id>&lang=<code>` - rather than a second contract for
 * the same button.
 *
 * Every format reads the document resolved once from the blocks, the case and
 * the CRDT. **A report this build cannot render in full is refused rather than
 * served short**, naming every kind, because a document missing its timeline
 * reads exactly like a case that had none.
 */
import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { ReportRenderService } from './render.service.js'
import { toMarkdown } from './document/markdown.js'
import { toPdf } from './document/pdf.js'
import { toWord } from './document/word.js'

function filename(title: string, extension: string): string {
  const stem = title.replace(/[^A-Za-z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'report'
  return `${stem}.${extension}`
}

@UseGuards(CaseAccessGuard)
@Controller('api')
export class ReportExportController {
  constructor(private readonly render: ReportRenderService) {}

  @Get('cases/:caseId/report.md')
  async markdown(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Res() response: Response,
    @Query('report') reportId?: string,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const { document_, title } = await this.resolve(caseId, reportId, lang)
    response
      .status(200)
      .type('text/markdown; charset=utf-8')
      .setHeader('content-disposition', `attachment; filename="${filename(title, 'md')}"`)
      .send(toMarkdown(document_))
  }

  @Get('cases/:caseId/report.pdf')
  async pdf(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Res() response: Response,
    @Query('report') reportId?: string,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const { document_, title, images } = await this.resolve(caseId, reportId, lang)
    const file = await toPdf(document_, images)
    response
      .status(200)
      .type('application/pdf')
      // **`inline`, unlike the other two.** A PDF is the send-ready copy an
      // analyst reads before it goes; the browser shows it rather than dropping
      // it in Downloads, and the `download` attribute on the link still saves.
      .setHeader('content-disposition', `inline; filename="${filename(title, 'pdf')}"`)
      .send(file)
  }

  @Get('cases/:caseId/report.docx')
  async word(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Res() response: Response,
    @Query('report') reportId?: string,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const { document_, title, images } = await this.resolve(caseId, reportId, lang)
    const file = await toWord(document_, images)
    response
      .status(200)
      .type('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .setHeader('content-disposition', `attachment; filename="${filename(title, 'docx')}"`)
      .send(file)
  }

  /**
   * The report as a document - frozen tree if it has been sent, else resolved.
   *
   * **A thin delegate, so `send` and these three routes cannot diverge.** The
   * freeze stores what an export would have produced; assembling it twice is
   * two chances for the artefact and the preview to differ.
   * -> `render.service.ts`
   */
  private async resolve(caseId: string, reportId?: string, lang?: string) {
    if (!reportId) {
      throw new BadRequestException('Which report? The export URL names one.')
    }
    return this.render.render(caseId, reportId, lang)
  }
}
