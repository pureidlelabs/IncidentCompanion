/**
 * Every key the editor answers, on Cmd/.
 */

import { useEffect } from 'react'

import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog'
import { KEY_GROUPS, PROSE_KEYS, keyLabel } from './prose-keys'

export function ProseShortcuts({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      // **`form`, not `finder`.** A finder is a *fixed* 520px box, right for
      // a list you scroll while typing at it and wrong for a reference sheet
      // you scan: twenty-four keys in two columns needed a scroller to reach
      // the last five, in a dialog with a viewport of room behind it. `form`
      // caps at the viewport and otherwise takes the height its content asks
      // for.
      size="form"
    >
      <DialogHeader
        title="Keyboard"
        // Consequences, not rationale: what the two halves of the list do
        // differently is the only thing the analyst cannot see.
        description="Marked keys work wherever the caret is. The ones under Insert are typed into the sentence."
        onClose={() => { onOpenChange(false) }}
      />
      <DialogBody>
        {/* **`min-h-0 flex-1 overflow-y-auto` on the list, not the frame.**
            The frame is a height rule; a grid with no scroll of its own inside
            one simply overflows it - the list ran 400px past the card and
            painted over the page behind it. `-m-1 p-1` so a focus ring on the
            first row is not shaved by the scroller, which is what
            `DialogColumns` does for the same reason. */}
        <div
          data-slot="prose-shortcuts-list"
          className="-m-1 grid min-h-0 flex-1 gap-x-8 gap-y-4 overflow-y-auto p-1 sm:grid-cols-2"
        >
          {KEY_GROUPS.map((group) => (
            <div key={group}>
              <h4 className="mb-1 font-mono text-2xs uppercase tracking-wide text-ink-muted">
                {group}
              </h4>
              <dl className="flex flex-col">
                {PROSE_KEYS.filter((key) => key.group === group).map((key) => (
                  <div
                    key={key.keys}
                    className="flex items-baseline justify-between gap-4 border-b py-1 last:border-b-0"
                  >
                    <dt className="text-sm">{key.label}</dt>
                    <dd className="shrink-0 rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-2xs">
                      {keyLabel(key.keys)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </DialogBody>
    </Dialog>
  )
}

/**
 * Opens the sheet on Cmd/ from anywhere on the screen.
 */
export function useProseShortcuts(onToggle: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onToggle])
}
