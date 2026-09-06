/**
 * Getting a case's data out: one table as CSV, and the indicators across three
 * tables as a feed. One module because they share the writer, and its escaping
 * must not exist twice.
 *
 * Columns come from the Drizzle table through `getTableColumns`, never a
 * hand-written list, so a new column exports with nothing to remember.
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
 *
 * **A count rather than the rows.** A file can carry thousands, and the screen
 * refetches the collection anyway - echoing them back doubles the payload to
 * say something the next read says better.
 */
export const importedSchema = z.object({
  added: z.number().int().describe('Rows created. Zero is a valid answer for a file with only a header.'),
  /**
   * **Reported rather than folded into `added`.** An import that says only how
   * many it wrote looks the same whether the file held 40 new rows or 12 new
   * and 28 the case already had - and the second is what the analyst needs to
   * see before they go looking for rows that are not missing.
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
   * One collection as CSV. `.csv` is part of the path segment rather than a
   * query parameter, because the suffix is what makes the browser name the
   * downloaded file sensibly.
   *
   * The collection is validated against the registry: it reaches SQL as a
   * table lookup, so an unknown name is a 400.
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
     * names.** `getTableColumns` keys by the TypeScript property - `caseId` -
     * while every other wire this app has speaks snake_case, and an import has
     * to parse what an export wrote. A header of `caseId` beside a client that
     * sends `case_id` is one spelling too many.
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
   * Add rows from a CSV. The `text/csv` body is read off the stream - Nest is
   * bootstrapped `bodyParser: false` and its bridge re-adds JSON only - and
   * capped while reading, not after.
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
     * **`skip` unless the analyst said otherwise, and an unknown value is
     * refused rather than defaulted.** Silently reading `?onDuplicate=replaces`
     * as skip would answer a question the analyst thought they had settled.
     */
    if (onDuplicate !== undefined && onDuplicate !== 'skip' && onDuplicate !== 'replace') {
      throw new BadRequestException({
        message: `onDuplicate is skip or replace, not ${onDuplicate}.`,
      })
    }

    // **The URL segment is checked rather than asserted.** It goes on to
    // `COLLECTION_SCHEMAS[collection]!` and `TABLES[collection]` inside
    // `fromCsv` as a bare string, so an unchecked name fails as a TypeError
    // deep inside the parse -- a 500 where the honest answer is that there is
    // no such collection.
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
   *
   * `tlp` is refused on a format that cannot carry it, rather than ignored.
   */
  @Get('indicators')
  async indicators(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Res({ passthrough: true }) response: { type(value: string): unknown },
    /**
     * **`format` on the wire, `fmt` in here.** Binding the internal name is what
     * makes `?format=stix` unread: the STIX export serves CSV, and
     * `?format=stix&tlp=amber` answers 400 saying *"Format csv carries no TLP
     * marking"* - the message naming the wrong format is the only tell. A test
     * that calls this method passes the value in and cannot see it.
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
     * `text/html`.** A STIX bundle served as HTML renders in a browser instead
     * of downloading, and an automation reading `content-type` to decide how
     * to parse it is told the wrong thing.
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
   *
   * The cast is Drizzle's: a table held as a value in `TABLES` has no
   * per-column typing left, so the column is reached by name.
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
