/**
 * How a refusal to write a sent report reads. The refusal itself is the
 * store's: `db/schema/store-guards.ts`.
 */
import { Catch, ConflictException, type ArgumentsHost } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'

import { SENT_REPORT_REFUSED } from '../db/schema/store-guards.js'

/**
 * One body for every refusal of a filed report, so a client can read `sentAt`
 * off any of them. The verb still differs: a restore is a repair and a patch is
 * an edit, and telling an analyst the wrong one is worse than a uniform
 * sentence.
 */
export function refusedBecauseSent(
  report: { id: string; label?: string | null; sentAt: Date },
  verb: 'edited' | 'repaired' | 're-sent',
): ConflictException {
  return new ConflictException({
    message:
      `${report.label || 'That report'} was sent at ${report.sentAt.toISOString()}. ` +
      `A sent report is superseded, not ${verb}.`,
    reportId: report.id,
    sentAt: report.sentAt.toISOString(),
  })
}

/** The store's refusal of a write to a sent report as the 409 every door answers, or undefined for any other error. */
export function sentReportRefusal(error: unknown): ConflictException | undefined {
  for (let at: unknown = error; at instanceof Object; at = (at as { cause?: unknown }).cause) {
    const { code, detail } = at as { code?: unknown; detail?: unknown }
    if (code !== SENT_REPORT_REFUSED || typeof detail !== 'string') continue
    const report = JSON.parse(detail) as { reportId: string; label: string | null; sentAt: string }
    return refusedBecauseSent({ id: report.reportId, label: report.label, sentAt: new Date(report.sentAt) }, 'edited')
  }
  return undefined
}

@Catch()
export class SentReportRefusalFilter extends BaseExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost): void {
    super.catch(sentReportRefusal(error) ?? error, host)
  }
}
