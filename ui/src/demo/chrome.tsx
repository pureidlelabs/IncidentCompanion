/**
 * What the evaluation build draws around the application: the acknowledgement
 * a first visit owes, and the strip that names the build and offers the source
 * and a reset.
 *
 * Its own React root rather than a component in the tree, so no screen has to
 * know whether it is there, and the kit rather than plain DOM, so it reads on
 * the tokens and follows the ground the visitor chose.
 *
 * **The sentence about where the work goes is the load-bearing one.** This is
 * a branded product opening on a case, so an analyst will type a real hostname
 * into it; nothing else on screen says the case never leaves the browser.
 *
 * **The source offer is the licence's**, not decoration: publishing this over
 * a network conveys it under AGPL section 13, which obliges an offer of the
 * corresponding source to the people using it.
 */
import { MotionConfig } from 'motion/react'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { AlertDialog } from '@/components/ui/alert-dialog'
import { Button, ButtonLink } from '@/components/ui/button'

import { acknowledge, wasAcknowledged } from './acknowledged'

const SOURCE = 'https://github.com/pureidlelabs/IncidentCompanion'
const SITE = 'https://incidentcompanion.com'

export interface DemoChromeProps {
  /** Whatever identifies the tree this was built from. */
  build: string
  /** Throw the visitor's writes away and start from the case as published. */
  onReset: () => void
}

/**
 * The acknowledgement, then the strip.
 *
 * Both dialogs refuse to dismiss on the scrim or Escape, which the kit's alert
 * dialog does on its own: the first because a visitor should read the one
 * sentence that matters, the second because it discards their work.
 */
export function DemoChrome({ build, onReset }: DemoChromeProps) {
  const [acknowledged, setAcknowledged] = useState(wasAcknowledged)
  const [resetting, setResetting] = useState(false)

  return (
    <>
      <AlertDialog
        isOpen={!acknowledged}
        title="This is a demo"
        consequence={
          <>
            <p>
              One worked case, opened where the analyst left it. Everything you type stays in this
              browser and clearing site data removes it. Nothing is sent anywhere.
            </p>
            <p className="mt-2">This browser remembers that you read this.</p>
          </>
        }
        confirmLabel="Understood"
        cancelLabel="Leave"
        onConfirm={() => {
          acknowledge()
          setAcknowledged(true)
        }}
        onCancel={() => {
          window.location.assign(SITE)
        }}
      />

      <AlertDialog
        isOpen={resetting}
        tone="destructive"
        title="Start again from the case as published?"
        consequence="Everything you have written in this browser is discarded."
        confirmLabel="Start again"
        onConfirm={onReset}
        onCancel={() => {
          setResetting(false)
        }}
      />

      <div
        data-part="demo-strip"
        className="fixed right-0 bottom-0 z-50 flex items-center gap-1 rounded-tl-md border-t border-l border-border bg-surface py-0.5 pr-1 pl-2.5 font-mono text-2xs text-ink-muted"
      >
        <span>{`demo \u00B7 ${build}`}</span>
        <ButtonLink variant="link" size="xs" href={SOURCE} target="_blank" rel="noreferrer">
          source
        </ButtonLink>
        <Button
          variant="link"
          size="xs"
          onPress={() => {
            setResetting(true)
          }}
        >
          reset
        </Button>
      </div>
    </>
  )
}

/** Mount it beside the application's root. */
export function mountDemoChrome(props: DemoChromeProps): void {
  const host = document.createElement('div')
  host.setAttribute('data-part', 'demo-chrome')
  document.body.append(host)
  createRoot(host).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <DemoChrome {...props} />
      </MotionConfig>
    </StrictMode>,
  )
}
