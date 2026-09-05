/**
 * Getting a case's data out: one table as CSV, and the indicators across three
 * tables as a feed.
 */
import {
  BadRequestException,
  NotFoundException,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { eq, getTableColumns } from 'drizzle-orm'

import { toCsv } from './csv.js'
import { collect, toCsvRows, toStixBundle, INDICATOR_CSV_COLUMNS, TLP_NAMES } from './indicators.js'
import { MAX_CSV_BYTES } from './csv-import.js'
import { ImportService, type ImportResult } from './import.service.js'
import { CaseAccessGuard } from '../access/case-access.guard.js'
import { CollectionService } from '../collections/collection.service.js'
import { columnOf } from '../db/column-access.js'
import { withCase } from '../db/scope.js'
import { BULK_TARGETS, TABLES, type BulkTarget } from '../collections/registry.js'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * What an import answers with: how many rows it took.
 */
export const importedSchema = z.object({
  added: z.number().int().describe('Rows created. Zero is a valid answer for a file with only a header.'),
  /**
   * **Reported rather than folded into `added`.**
   */
  skipped: z
    .number()
    .int()
    .describe('Rows whose host, account, indicator, hash or app is already in the case.'),
  replaced: z
    .number()
    .int()
    .describe('Duplicates overwritten, when the import asked to replace rather than skip.'),
  refused: z
    .number()
    .int()
    .describe(
      'Replacements another analyst had already changed or was holding open. ' +
        'Their values are in a merge review; nothing was overwritten.',
    ),
})

class ImportedDto extends createZodDto(importedSchema) {}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId')
export class ExportsController {
  constructor(
    private readonly collections: CollectionService,
    private readonly imports: ImportService,
  ) {}

  /**
   * One collection as CSV.
   */
  @Get(':collection.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  async collectionCsv(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('collection') collection: string,
  ): Promise<string> {
    const table = this.tableFor(collection)
    const rows = await this.caseRows(table, caseId)

    /**
     * **Headed with the database's own column names, not Drizzle's property
     * names.**
     */
    const columns = Object.entries(getTableColumns(table)).map(
      ([property, column]) => [property, (column as { name: string }).name] as const,
    )

    return toCsv(
      rows.map((row) => Object.fromEntries(columns.map(([property, name]) => [name, row[property]]))),
      columns.map(([, name]) => name),
    )
  }

  /**
   * Add rows from a CSV.
   */
  @ZodResponse({
    status: 201,
    type: ImportedDto,
    description: 'How many rows the file added.',
  })
  @Post(':collection.csv')
  async importCsv(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('collection') collection: string,
    @Query('onDuplicate') onDuplicate: string | undefined,
    @Req() request: AsyncIterable<Buffer>,
    @Session() session: UserSession,
  ): Promise<ImportResult> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > MAX_CSV_BYTES) {
        throw new BadRequestException({
          message: `CSV exceeds the ${MAX_CSV_BYTES / 1024 / 1024}MB import limit.`,
        })
      }
      chunks.push(chunk)
    }

    /**
     * **`skip` unless the analyst said otherwise, and an unknown value is refused
     * rather than defaulted.**
     */
    if (onDuplicate !== undefined && onDuplicate !== 'skip' && onDuplicate !== 'replace') {
      throw new BadRequestException({
        message: `onDuplicate is skip or replace, not ${onDuplicate}.`,
      })
    }

    // **The URL segment is checked rather than asserted.** It reached
    // `COLLECTION_SCHEMAS[collection]!` and `TABLES[collection as BulkTarget]`
    // as a bare string, so an unknown collection failed as a TypeError deep
    // inside the parse -- a 500 where the honest answer is that there is no
    // such collection.
    if (!(BULK_TARGETS as readonly string[]).includes(collection)) {
      throw new NotFoundException(`No collection named ${collection}.`)
    }

    return this.imports.fromCsv(
      collection as BulkTarget,
      caseId,
      Buffer.concat(chunks).toString('utf8'),
      session.user.id,
      onDuplicate ?? 'skip',
    )
  }

  /**
   * The case's indicators as a feed, in one of two shapes: `csv` is the
   * inventory and `stix` the actionable subset, which are different sets and
   * not two encodings of one. -> `indicators.ts`
   */
  @Get('indicators')
  async indicators(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Res({ passthrough: true }) response: { type(value: string): unknown },
    /**
     * **`format` on the wire, `fmt` in here.**
     */
    @Query('format') fmt = 'csv',
    @Query('tlp') tlp?: string,
  ): Promise<string> {
    if (fmt !== 'csv' && fmt !== 'stix') {
      throw new BadRequestException({ message: `No indicator format ${fmt}. Available: csv, stix.` })
    }
    if (tlp && fmt !== 'stix') {
      throw new BadRequestException({
        message: `Format ${fmt} carries no TLP marking. Formats that do: stix.`,
      })
    }
    if (tlp && !TLP_NAMES.includes(tlp.toLowerCase())) {
      throw new BadRequestException({
        message: `No TLP marking ${tlp}. Available: ${TLP_NAMES.join(', ')}.`,
      })
    }

    const found = collect(await this.indicatorSources(caseId))

    /**
     * **Set from the format, because Nest answers a returned string as
     * `text/html`.**
     */
    if (fmt === 'stix') {
      response.type('application/json')
      return JSON.stringify(toStixBundle(found, { now: new Date(), tlp }), null, 2)
    }
    response.type('text/csv')
    return toCsv(toCsvRows(found), [...INDICATOR_CSV_COLUMNS])
  }

  private async indicatorSources(caseId: string) {
    const [networkIndicators, malware, cloudApps] = await Promise.all([
      this.caseRows(TABLES['network_indicators'], caseId),
      this.caseRows(TABLES['malware'], caseId),
      this.caseRows(TABLES['cloud_apps'], caseId),
    ])
    return { networkIndicators, malware, cloudApps }
  }

  /**
   * One collection's rows, scoped to the case in SQL - a `where`, never a
   * filter after the read, since the guard only asserts that the case in the
   * URL exists.
   */
  private async caseRows(
    table: (typeof TABLES)[BulkTarget],
    caseId: string,
  ): Promise<Record<string, unknown>[]> {
    return (await withCase(this.collections.database, caseId, (tx) =>
      tx.select().from(table).where(eq(columnOf(table, 'caseId'), caseId)),
    ))
  }

  private tableFor(collection: string) {
    const table = TABLES[collection as BulkTarget]
    if (!table) {
      throw new BadRequestException({
        message: `No collection ${collection}. Exportable: ${[...BULK_TARGETS].sort().join(', ')}.`,
      })
    }
    return table
  }
}
