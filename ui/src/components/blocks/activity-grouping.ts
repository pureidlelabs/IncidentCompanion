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
 *
 * **A minute, because that is what a single edit looks like from outside.** An
 * analyst correcting three fields on one row produces three entries a few
 * seconds apart, and three lines saying the same thing is what makes a feed
 * unreadable. Longer than this and two genuinely separate visits merge.
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
 *
 * **The row is named by its collection, not by a label**, and that is a limit
 * of the feed rather than a choice: `change_feed` records which table and which
 * id, never a title, so a row that has since been deleted still reads
 * correctly. The fields carry the specificity a name would have.
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
 *
 * **Seconds are "just now".** A feed that counts them makes the reader watch a
 * number rather than read a list, and the entry is a minute old by the time
 * anybody has finished the sentence.
 *
 * **That first branch is also what handles a clock disagreeing with the
 * server**, and it is the only thing that does. A `Math.max(0, ...)` on the
 * difference stood here until a break-verify removed it and every test stayed
 * green: a negative age is below 45 by construction, so the clamp could never
 * change an answer. The test named for it covers this branch instead.
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
