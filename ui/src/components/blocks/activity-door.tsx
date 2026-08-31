import { HistoryIcon } from 'lucide-react'
import { useState } from 'react'

import type { ActivityEntry } from '@/api/activity'
import { Button } from '@/components/ui/button'
import { DialogTrigger } from '@/components/ui/dialog'
import { Popover } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'

import { ActivityFeed } from './activity-feed'

/**
 * What has been written to the case, behind a button in the header.
 *
 * The feed itself is `ActivityFeed`; this decides where it lives and when it is
 * read. Moving the door changes nothing in the feed, and rearranging the feed
 * changes nothing here.
 *
 * `entries` arrive as a prop: a container binds the query and draws nothing, so
 * a story passes a fixture roster and the app passes what the route served.
 */
export function ActivityDoor({
  entries,
  nameFor,
  seen,
  defaultOpen = false,
}: {
  entries: readonly ActivityEntry[]
  /** Turns an entity key into the analyst's word for it. Falls back to the key. */
  nameFor?: ((entity: string) => string) | undefined
  /**
   * The newest `seq` the analyst has already been shown.
   *
   * Absent means nothing is marked, which is the state a case opened for the
   * first time is in - a mark on every write it has ever had says nothing.
   */
  seen?: number | undefined
  /** Opens the panel on mount, for a story that wants the feed on screen. */
  defaultOpen?: boolean
}) {
  /**
   * The clock the feed's relative stamps are read against, taken when the
   * panel opens.
   *
   * `Date.now()` during render is impure - React may render twice and is
   * entitled to a different answer - and opening the panel is the only moment
   * the figure is looked at. No timer: an hour count redrawn every second
   * spends a wake-up a second to move a digit every sixty.
   *
   * A panel that is open at mount never fires `onOpenChange`, so it seeds from
   * the initialiser instead - which runs once, unlike the render body. Without
   * it every stamp in an already-open panel reads `just now`.
   */
  const [now, setNow] = useState(() => (defaultOpen ? Date.now() : 0))
  /** What the analyst has been shown, once they have opened it themselves. */
  const [read, setRead] = useState<number | undefined>(seen)

  const newest = entries.reduce((high, one) => Math.max(high, one.seq), 0)
  const unseen = read !== undefined && newest > read

  return (
    <DialogTrigger
      defaultOpen={defaultOpen}
      onOpenChange={(open) => {
        if (!open) return
        setNow(Date.now())
        setRead(newest)
      }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        data-testid="activity-door"
        // The state is in the name as well as in the dot: a mark that is
        // colour and position alone is one a screen reader cannot report, and
        // this is the only thing on the header saying the case moved.
        aria-label={unseen ? 'Case activity, new since you last looked' : 'Case activity'}
        className="relative"
      >
        <HistoryIcon aria-hidden />
        {unseen && (
          <span
            data-testid="activity-dot"
            aria-hidden
            // Ringed in the header's own ground, so the dot reads as sitting
            // on the button rather than touching the glyph behind it.
            className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background"
          />
        )}
      </Button>
      <Popover className="w-80">
        <ScrollArea className="max-h-96 px-3 py-3">
          <ActivityFeed
            entries={entries}
            now={now}
            {...(nameFor === undefined ? {} : { nameFor })}
          />
        </ScrollArea>
      </Popover>
    </DialogTrigger>
  )
}
