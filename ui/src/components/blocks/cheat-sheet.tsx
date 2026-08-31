import { ChordKeys } from '@/components/blocks/chord-keys'
import { Section } from '@/components/blocks/section'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/ui/frame'
import { cn } from '@/lib/cn'

import { COMMANDS, commandGroups, type Command } from '@/lib/shortcut-registry'

/**
 * Every shortcut the app can be told to run, generated from the registry.
 *
 * **Never a written list.** Every row has to be true on the screen showing it:
 * an analyst tries the key, nothing happens, and every other row loses its
 * authority. So the rows come from the registry, the caps come from `Kbd`, and
 * a command the dispatcher will not run is marked rather than quietly listed.
 *
 * **This is the sheet, not the dialog.** In the app it opens over the case; the
 * screens tier draws the surface it puts inside, because a story that opened a
 * dialog on mount would stack un-dismissably in the docs page.
 */
export interface CheatSheetProps {
  /** The registry to draw. Defaults to the app's own. */
  commands?: readonly Command[]
  /** Commands that cannot run where the sheet was opened, by id. */
  unavailable?: readonly string[]
}

export function CheatSheet({
  commands = COMMANDS,
  unavailable = [],
}: CheatSheetProps) {
  const shut = new Set(unavailable)

  return (
    <Section
      measure="form"
      title="Keyboard shortcuts"
      blurb="Keys work outside a text box; a dialog keeps them to itself."
    >
      <div className="flex flex-col gap-4">
        {commandGroups(commands).map(({ group, commands: rows }) => (
          <Frame key={group}>
            <FrameHeader>
              <FrameTitle>{group}</FrameTitle>
              <FrameDescription>
                {`${String(rows.length)} command${rows.length === 1 ? '' : 's'}`}
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="flex flex-col p-0">
              {rows.map((command) => {
                const off = shut.has(command.id) || command.parked === true
                return (
                  <div
                    key={command.id}
                    data-testid={`shortcut-${command.id}`}
                    className={cn(
                      'flex items-baseline justify-between gap-4 border-b border-border px-4 py-2.5 text-sm last:border-b-0',
                      off && 'text-ink-muted',
                    )}
                  >
                    <span className="min-w-0">{command.title}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      {off && (
                        <Badge variant="soft" size="xs">
                          {command.parked === true ? 'not built' : 'not here'}
                        </Badge>
                      )}
                      {command.chords.length === 0 ? (
                        <span className="text-2xs text-ink-muted">
                          {command.section === undefined
                            ? 'no shortcut'
                            : `on the ${command.section} toolbar`}
                        </span>
                      ) : (
                        <ChordKeys chords={command.chords} />
                      )}
                    </span>
                  </div>
                )
              })}
            </FramePanel>
          </Frame>
        ))}
      </div>
    </Section>
  )
}

/**
 * The sheet as the app opens it: over the case, dismissable, nothing to answer.
 *
 * No footer and no confirm control -- there is nothing here to decide, so Esc
 * and the scrim are the whole of the way out.
 */
export interface CheatSheetDialogProps extends CheatSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function CheatSheetDialog({ isOpen, onOpenChange, ...sheet }: CheatSheetDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="form"
      dialogProps={{ 'aria-label': 'Keyboard shortcuts' }}
    >
      <CheatSheet {...sheet} />
    </Dialog>
  )
}
