/**
 * Sends every audit line above the cursor to the operator's destination, and
 * moves the cursor only when the destination accepted the whole batch.
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
import { JsonLogsSerializer } from '@opentelemetry/otlp-transformer'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  LoggerProvider,
  type LogRecordProcessor,
  type ReadableLogRecord,
} from '@opentelemetry/sdk-logs'
import { asc, eq, gt, lt, and } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import {
  installActivity,
  installActivityDelivery,
  type InstallActivityRow,
} from '../db/schema/install-activity.js'
import { lineOf } from './line.js'

/** Where the audit goes, or null when the install is the record. */
export const AUDIT_DESTINATION = Symbol('audit.destination')

export interface Destination {
  /** The OTLP/HTTP logs endpoint, path included. */
  url: string
  headers?: Record<string, string> | undefined
  timeoutMs?: number | undefined
}

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

/**
 * Holds what the logger emits until `send`, which posts the batch and answers
 * with how many records the destination accepted. The SDK's exporter hides a
 * partial rejection, which is why the post is made here.
 */
class Held implements LogRecordProcessor {
  private records: ReadableLogRecord[] = []

  constructor(private readonly to: Destination) {}

  onEmit(record: ReadableLogRecord): void {
    this.records.push(record)
  }

  /** Rejects on any refusal; resolves with the count the destination took. */
  async send(): Promise<number> {
    const batch = this.records
    this.records = []
    const body = JsonLogsSerializer.serializeRequest(batch)
    if (!body) throw new Error('the batch could not be serialised')
    const answer = await fetch(this.to.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.to.headers },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(this.to.timeoutMs ?? EVERY_MS),
    })
    if (!answer.ok) throw new Error(`the destination answered ${String(answer.status)}`)
    const response = JsonLogsSerializer.deserializeResponse(
      new Uint8Array(await answer.arrayBuffer()),
    )
    const rejected = response.partialSuccess?.rejectedLogRecords ?? 0
    if (rejected > 0) {
      throw new Error(`the destination rejected ${String(rejected)} of ${String(batch.length)}`)
    }
    return batch.length
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

@Injectable()
export class InstallActivityDelivery implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(InstallActivityDelivery.name)
  private readonly provider: LoggerProvider | null
  private readonly held: Held | null
  private inFlight: Promise<void> | null = null
  private stopped = false

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_DESTINATION) to: Destination | null,
  ) {
    this.held = to ? new Held(to) : null
    this.provider = this.held
      ? new LoggerProvider({
          resource: resourceFromAttributes({ 'service.name': 'incidentcompanion' }),
          processors: [this.held],
        })
      : null
  }

  /** Not awaited: a backlog must not hold the port closed. */
  onApplicationBootstrap(): void {
    void this.deliver()
  }

  @Interval(EVERY_MS)
  tick(): Promise<void> {
    return this.deliver()
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true
    await this.inFlight
    await this.provider?.shutdown()
  }

  /** The newest line the destination has, or null when the install is the record. */
  async deliveredThrough(): Promise<bigint | null> {
    if (!this.provider) return null
    return this.cursor()
  }

  /** One round, shared by whoever asks while it runs. Never throws. */
  deliver(): Promise<void> {
    if (!this.provider || this.stopped) return Promise.resolve()
    this.inFlight ??= this.round()
      .catch((why: unknown) => {
        this.log.warn(
          `audit delivery stopped for this round`,
          why instanceof Error ? why.message : String(why),
        )
      })
      .finally(() => {
        this.inFlight = null
      })
    return this.inFlight
  }

  private async round(): Promise<void> {
    const logger = this.provider!.getLogger('install-audit')
    for (;;) {
      const deliveredSeq = await this.cursor()
      const rows = await this.db
        .select()
        .from(installActivity)
        .where(gt(installActivity.seq, deliveredSeq))
        .orderBy(asc(installActivity.seq))
        .limit(BATCH)
      if (rows.length === 0 || this.stopped) return

      for (const row of rows) logger.emit(recordOf(row))
      const sent = await this.held!.send()
      if (sent !== rows.length) {
        throw new Error(`${String(sent)} of ${String(rows.length)} lines left the process`)
      }
      const newest = rows.at(-1)!.seq
      await this.db
        .update(installActivityDelivery)
        .set({ deliveredSeq: newest })
        .where(
          and(eq(installActivityDelivery.id, 1), lt(installActivityDelivery.deliveredSeq, newest)),
        )
      if (rows.length < BATCH) return
    }
  }

  private async cursor(): Promise<bigint> {
    const [row] = await this.db.select().from(installActivityDelivery)
    if (row) return row.deliveredSeq
    await this.db.insert(installActivityDelivery).values({ id: 1 }).onConflictDoNothing()
    return 0n
  }
}

function recordOf(row: InstallActivityRow): LogRecord {
  const line = lineOf(row, row.severityId, 1)
  return {
    timestamp: row.at,
    severityNumber: OTEL_SEVERITY[row.severityId] ?? SeverityNumber.INFO,
    severityText: line.severity,
    // A null on the wire arrives as an empty value; leaving the key out says the same thing.
    body: Object.fromEntries(Object.entries(line).filter(([, value]) => value !== null)),
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
