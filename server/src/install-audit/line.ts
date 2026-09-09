/** One stored row as the line a reader draws and a destination receives. */
import type { InstallActivityRow } from '../db/schema/install-activity.js'
import {
  CATEGORY_OF,
  CLASS_NAME_OF,
  metadataFor,
  nameOfActivity,
} from '../install-activity/ocsf.js'
import { SEVERITY_NAME } from '../install-activity/severity.js'
import type { ActivityLine } from './activity.controller.js'

/**
 * `severityId` is passed rather than read from the row because a reader may
 * raise it over a run; `runLength` is 1 for a line taken alone.
 */
export function lineOf(
  row: Omit<InstallActivityRow, 'retentionClass' | 'actorId'>,
  severityId: number,
  runLength: number,
): ActivityLine {
  return {
    seq: String(row.seq),
    id: row.id,
    event: row.event,
    channel: row.channel,
    categoryUid: CATEGORY_OF[row.classUid] ?? 0,
    classUid: row.classUid,
    className: CLASS_NAME_OF[row.classUid] ?? 'Unknown',
    activityId: row.activityId,
    activityName: nameOfActivity(row.classUid, row.activityId),
    typeUid: row.typeUid,
    metadata: metadataFor(row.channel),
    outcome: row.statusId === 2 ? 'failure' : 'success',
    statusId: row.statusId,
    severityId,
    severity: SEVERITY_NAME[severityId] ?? 'Informational',
    at: row.at.toISOString(),
    actorLabel: row.actorLabel,
    targetLabel: row.targetLabel,
    attributes: row.detail,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    runLength,
  }
}
