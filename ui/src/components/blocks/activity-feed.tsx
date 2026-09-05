import type { ActivityEntry } from '@/api/activity'
import { PersonAvatar } from '@/components/blocks/presence'
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
} from '@/components/ui/timeline'
import {
  agoFrom,
  groupActivity,
  wordingFor,
  type ActivityGroup,
} from '@/components/blocks/activity-grouping'
import { cn } from '@/lib/cn'

export { agoFrom, groupActivity, wordingFor }
export type { ActivityGroup }

/**
 * What has been written to a case, newest first.
 *
 * The grouping, wording and relative-time helpers come from
 * `blocks/activity-feed` rather than being copied.
 *
 * - Consecutive writes by one analyst to one entity within 60s become one entry.
 * - Steps run backwards, so every entry reads as complete.
 * - An empty feed renders one line, not an empty timeline.
 * - `now` is passed in; nothing here reads the clock.
 */
export function ActivityFeed({
  entries,
  nameFor,
  now,
  className,
}: {
  entries: readonly ActivityEntry[]
  /** Turns an entity key into the analyst's word for it. Falls back to the key. */
  nameFor?: ((entity: string) => string) | undefined
  /** Milliseconds, for the relative stamps. */
  now: number
  className?: string | undefined
}) {
  const groups = groupActivity(entries)

  if (groups.length === 0) {
    return (
      <p className={cn('px-1 py-6 text-center text-xs text-ink-muted', className)}>
        Nothing has been written to this case yet.
      </p>
    )
  }

  return (
    <Timeline value={groups.length} className={className}>
      {groups.map((group, index) => (
        <TimelineItem
          key={group.seq}
          step={groups.length - index}
          className="group-data-[orientation=vertical]/timeline:ms-10"
        >
          <TimelineHeader>
            {/* Runs from under the disc to the next one; the kit's own offsets
                assume a 16px indicator and this one is 24px. */}
            {/* Not on the last entry: a rule below the oldest write has nothing
                to connect it to and reads as a stub. */}
            {index < groups.length - 1 && (
              <TimelineSeparator
                className={cn(
                  'group-data-[orientation=vertical]/timeline:-left-6',
                  'group-data-[orientation=vertical]/timeline:top-7',
                  'group-data-[orientation=vertical]/timeline:h-[calc(100%-1.75rem)]',
                  // `--border`, not the kit's completed `--primary`. A feed is
                  // not a progress run: every entry here is a write that
                  // already happened, so the kit's done colour applies to all
                  // of them and paints a full-strength primary rule down the
                  // page. The line is joining marks, not marking progress.
                  'bg-border group-data-completed/timeline-item:bg-border',
                )}
              />
            )}
            <TimelineIndicator className="size-6 overflow-hidden rounded-full border-none bg-transparent group-data-[orientation=vertical]/timeline:-left-6">
              <PersonAvatar person={{ name: group.by, you: false }} className="size-6 text-[10px]" />
            </TimelineIndicator>
            <TimelineDate className="text-2xs">{agoFrom(group.at, now)}</TimelineDate>
          </TimelineHeader>
          <TimelineContent className="text-xs">
            <span className="font-medium text-ink">{group.by}</span>{' '}
            <span className="text-ink-muted">{wordingFor(group, nameFor)}</span>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  )
}
