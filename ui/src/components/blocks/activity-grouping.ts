import type { ActivityEntry } from '@/api/activity'

/**
 * How the activity feed groups, words and dates what it draws.
 *
 * **No primitive, so no kit.** Grouping, wording and relative time are the
 * block's whole judgement, and they are the part a rendering test cannot see.
 * They live here so the feed and its tests read one model.
 */

/** Several writes by one analyst, close together, read as one line. */
export interface ActivityGroup {
  /** The newest entry's `seq`, so a caller can ask what is new since. */
  seq: number
  by: string
  at: number
  entity: string
  /** Every field touched across the group, in first-seen order and deduplicated. */
  fields: string[]
  /** How many writes the group folds together. */
  writes: number
  op: string
}

/**
 * How close two writes must be to read as one action, in seconds.
 */
const TOGETHER = 60

/**
 * Fold a feed into the lines a reader sees.
 *
 * Consecutive entries by the same analyst, on the same collection, with the
 * same operation, within `TOGETHER` seconds, become one group. Exported for
 * its own test: this is the whole of the block's judgement, and it is the part
 * a rendering test cannot see.
 */
export function groupActivity(entries: readonly ActivityEntry[]): ActivityGroup[] {
  const groups: ActivityGroup[] = []
  for (const entry of entries) {
    const open = groups.at(-1)
    const joins =
      open?.by === entry.by &&
      open.entity === entry.entity &&
      open.op === entry.op &&
      // The feed is newest first, so the open group is the later one.
      open.at - entry.at <= TOGETHER

    if (joins) {
      open.writes += 1
      // `at` stays the newest, which is what the group is timestamped by.
      for (const field of entry.fields) {
        if (!open.fields.includes(field)) open.fields.push(field)
      }
      continue
    }

    groups.push({
      seq: entry.seq,
      by: entry.by,
      at: entry.at,
      entity: entry.entity,
      op: entry.op,
      writes: 1,
      fields: [...entry.fields],
    })
  }
  return groups
}

/**
 * What one group says it did.
 */
export function wordingFor(group: ActivityGroup, nameFor?: (entity: string) => string): string {
  const where = nameFor?.(group.entity) ?? group.entity
  if (group.op === 'insert') {
    return group.writes === 1 ? `added to ${where}` : `added ${String(group.writes)} to ${where}`
  }
  if (group.op === 'delete') {
    return group.writes === 1
      ? `removed from ${where}`
      : `removed ${String(group.writes)} from ${where}`
  }
  const count = group.fields.length
  if (count === 0) return `changed ${where}`
  if (count <= 3) return `changed ${group.fields.join(', ')} in ${where}`
  return `changed ${String(count)} fields in ${where}`
}

/**
 * How long ago, in the shortest form that is still true.
 */
export function agoFrom(at: number, now: number): string {
  const seconds = Math.floor(now / 1000) - at
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${String(hours)}h`
  return `${String(Math.round(hours / 24))}d`
}
