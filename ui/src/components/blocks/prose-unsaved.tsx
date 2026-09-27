import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom'
import type * as Y from 'yjs'

import { plainText } from '@contract/prose-fields'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'

import type { ProseChannel } from '@/api/proseSync'

/**
 * What a document says while the install holds its words unsaved: a banner
 * with the text to copy, a dialog once the words are given up, and a dialog
 * before the analyst leaves with them unsaved. Locks nothing.
 *
 * One per document, beside `ProseRefusal`.
 */
export function ProseUnsaved({ channel }: { channel: ProseChannel | null }) {
  return channel === null ? null : <Unsaved channel={channel} />
}

function Unsaved({ channel }: { channel: ProseChannel }) {
  const unsaved = useSyncExternalStore(channel.watchUnsaved, () => channel.unsaved)
  const held = unsaved !== null
  // Read from the document only while the words are unsaved.
  const followText = useCallback(
    (changed: () => void) => {
      if (!held) return () => undefined
      channel.doc.on('update', changed)
      return () => channel.doc.off('update', changed)
    },
    [channel, held],
  )
  const text = useSyncExternalStore(followText, () => (held ? textOf(channel.doc) : ''))
  const [closed, setClosed] = useState(false)
  const inDataRouter = useContext(UNSAFE_DataRouterContext) !== null

  useEffect(() => {
    if (unsaved === null) return undefined
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  if (unsaved === null) return null
  // In a dialog, keeping the words is the emphasised action.
  const copy = (emphasised: boolean) => (
    <CopyButton
      value={text}
      variant={emphasised ? 'default' : 'outline'}
      // A dialog's footer buttons are one height.
      {...(emphasised ? { size: 'default' as const } : {})}
    >
      Copy the text
    </CopyButton>
  )
  return (
    <>
      <Alert variant="warning" role="status" className="mb-3">
        <AlertTitle>
          {unsaved === 'lost' ? 'This text can no longer be saved' : 'Not saved yet'}
        </AlertTitle>
        <AlertDescription>
          {unsaved === 'lost'
            ? 'The install could not store it and has stopped trying. What is on screen is the copy that is left.'
            : 'The last save of this text failed. The install holds what was written while somebody has it open, and tries again. You can keep writing.'}
          <div className="mt-2">{copy(false)}</div>
        </AlertDescription>
      </Alert>
      <Dialog
        isOpen={unsaved === 'lost' && !closed}
        onOpenChange={(open) => {
          if (!open) setClosed(true)
        }}
      >
        <DialogHeader title="This text can no longer be saved" />
        <DialogBody>
          <p className="text-sm">
            The install could not store it and has stopped trying. Copy it before you leave this
            screen.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onPress={() => setClosed(true)}>
            Close
          </Button>
          {copy(true)}
        </DialogFooter>
      </Dialog>
      {inDataRouter && <LeaveGuard copy={copy(true)} />}
    </>
  )
}

/** Asks before a route change takes the analyst away from words the install holds unsaved. */
function LeaveGuard({ copy }: { copy: ReactNode }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname,
  )
  return (
    <Dialog isOpen={blocker.state === 'blocked'} isDismissable={false}>
      <DialogHeader title="Leave with the text unsaved?" />
      <DialogBody>
        <p className="text-sm">
          The install holds it only while somebody has it open. If you are the last, it is given up
          when you leave. Copy it first to keep it.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onPress={() => blocker.proceed?.()}>
          Leave
        </Button>
        <Button variant="outline" onPress={() => blocker.reset?.()}>
          Stay
        </Button>
        {copy}
      </DialogFooter>
    </Dialog>
  )
}

/** Every section's words, a blank line between them. */
function textOf(doc: Y.Doc): string {
  return [...doc.share.keys()]
    .map((name) => plainText(doc.getXmlFragment(name)))
    .filter((words) => words !== '')
    .join('\n\n')
}
