/**
 * Sends every audit line above the cursor to the operator's destination, and
 * moves the cursor only on the exporter's acknowledgement.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { SeverityNumber, type LogRecord } from '@opentelemetry/api-logs'
import { ExportResultCode } from '@opentelemetry/core'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  LoggerProvider,
  type LogRecordExporter,
  type LogRecordProcessor,
  type ReadableLogRecord,
} from '@opentelemetry/sdk-logs'
import { asc, eq, gt, sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import {
  installActivity,
  installActivityDelivery,
  type InstallActivityRow,
} from '../db/schema/install-activity.js'
import { lineOf } from './line.js'

/** The exporter for the operator's destination, or null when there is none. */
export const AUDIT_DESTINATION = Symbol('audit.destination')

export const BATCH = 512
export const EVERY_MS = 10_000

/** OCSF `severity_id` to OTel `SeverityNumber`, in the same order. */
const OTEL_SEVERITY: Record<number, SeverityNumber> = {
  1: SeverityNumber.INFO,
  2: SeverityNumber.INFO3,
  3: SeverityNumber.WARN,
  4: SeverityNumber.ERROR,
  5: SeverityNumber.FATAL,
  6: SeverityNumber.FATAL4,
}

/** Holds what the logger emits until `send`, which answers with the exporter's own verdict. */
class Held implements LogRecordProcessor {
  private records: ReadableLogRecord[] = []

  constructor(private readonly exporter: LogRecordExporter) {}

  onEmit(record: ReadableLogRecord): void {
    this.records.push(record)
  }

  send(): Promise<void> {
    const batch = this.records
    this.records = []
    return new Promise((resolve, reject) => {
      this.exporter.export(batch, (result) => {
        if (result.code === ExportResultCode.SUCCESS) resolve()
        else reject(result.error ?? new Error('the destination refused the batch'))
      })
    })
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return this.exporter.shutdown()
  }
}

@Injectable()
export class InstallActivityDelivery implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(InstallActivityDelivery.name)
  private readonly provider: LoggerProvider | null
  private readonly held: Held | null
  private inFlight: Promise<void> | null = null

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_DESTINATION) exporter: LogRecordExporter | null,
  ) {
    this.held = exporter ? new Held(exporter) : null
    this.provider = this.held
      ? new LoggerProvider({
          resource: resourceFromAttributes({ 'service.name': 'incidentcompanion' }),
          processors: [this.held],
        })
      : null
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.deliver()
  }

  @Interval(EVERY_MS)
  async tick(): Promise<void> {
    await this.deliver()
  }

  async onApplicationShutdown(): Promise<void> {
    await this.inFlight
    await this.provider?.shutdown()
  }

  /** The newest line the destination has, or null when the install is the record. */
  async deliveredThrough(): Promise<bigint | null> {
    if (!this.provider) return null
    return (await this.cursor()).deliveredSeq
  }

  /** One round, shared by whoever asks while it runs. Never throws. */
  deliver(): Promise<void> {
    if (!this.provider) return Promise.resolve()
    this.inFlight ??= this.round().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async round(): Promise<void> {
    const logger = this.provider!.getLogger('install-audit')
    for (;;) {
      const { deliveredSeq } = await this.cursor()
      const rows = await this.db
        .select()
        .from(installActivity)
        .where(gt(installActivity.seq, deliveredSeq))
        .orderBy(asc(installActivity.seq))
        .limit(BATCH)
      if (rows.length === 0) return

      for (const row of rows) logger.emit(recordOf(row))
      try {
        await this.held!.send()
      } catch (why) {
        await this.db
          .update(installActivityDelivery)
          .set({ stalledSince: sql`coalesce(${installActivityDelivery.stalledSince}, now())` })
          .where(eq(installActivityDelivery.id, 1))
        this.log.warn(
          `audit delivery refused, ${String(rows.length)} line(s) held from seq ${String(rows[0]!.seq)}`,
          why instanceof Error ? why.message : String(why),
        )
        return
      }
      await this.db
        .update(installActivityDelivery)
        .set({ deliveredSeq: rows.at(-1)!.seq, deliveredAt: sql`now()`, stalledSince: null })
        .where(eq(installActivityDelivery.id, 1))
      if (rows.length < BATCH) return
    }
  }

  private async cursor() {
    await this.db.insert(installActivityDelivery).values({ id: 1 }).onConflictDoNothing()
    const [row] = await this.db.select().from(installActivityDelivery)
    return row!
  }
}

function recordOf(row: InstallActivityRow): LogRecord {
  const line = lineOf(row, row.severityId, 1)
  return {
    timestamp: row.at,
    severityNumber: OTEL_SEVERITY[row.severityId] ?? SeverityNumber.INFO,
    severityText: line.severity,
    body: line,
    attributes: {
      'audit.seq': String(row.seq),
      'audit.event': row.event,
      'audit.channel': row.channel,
      'ocsf.class_uid': row.classUid,
      'ocsf.type_uid': row.typeUid,
      'ocsf.severity_id': row.severityId,
      'ocsf.status_id': row.statusId,
    },
  }
}
