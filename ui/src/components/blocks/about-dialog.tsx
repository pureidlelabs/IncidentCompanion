import type { ReactNode } from 'react'

import type { AboutInfo } from '@/api/useAbout'
import { Lockup } from '@/components/lockup'
import { AsyncBoundary } from '@/components/ui/async-boundary'
import { Dialog, DialogBody } from '@/components/ui/dialog'

/**
 * What this build is, and where to go about it.
 *
 * A dialog rather than a rail row: six unchanging facts, opened once.
 */
export interface AboutDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** The six facts, from `GET /api/about`. `AboutContainer` reads them. */
  about: AboutInfo | undefined
  /** The read is still in flight. */
  busy?: boolean | undefined
  /** What went wrong reading it, if anything. */
  problem?: Error | null | undefined
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

export function AboutDialog({ isOpen, onOpenChange, about, busy = false, problem, onRetry }: AboutDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="compact"
      dialogProps={{ 'aria-label': 'About this install' }}
    >
      <DialogBody>
        <AboutBody about={about} busy={busy} problem={problem} onRetry={onRetry} />
      </DialogBody>
    </Dialog>
  )
}

function AboutBody({
  about,
  busy,
  problem,
  onRetry,
}: Pick<AboutDialogProps, 'about' | 'busy' | 'problem' | 'onRetry'>) {
  return (
    <AsyncBoundary
      isPending={busy === true}
      isError={problem !== undefined && problem !== null}
      error={problem ?? undefined}
      {...(onRetry ? { refetch: onRetry } : {})}
      skeletonRows={4}
    >
      {about && (
        <>
          {/* The version sits under the name, not beside it: inline it
              overflowed the compact width and wrapped onto a line of its own,
              which reads as a stray value rather than as this build's
              number. */}
          <div className="mb-2">
            <Lockup size="lg" className="text-ink" />
            <span className="mt-1.5 block font-mono text-2xs font-normal text-ink-muted">
              {about.version}
            </span>
          </div>

          <p className="mb-5 text-xs text-ink-muted">
            Disaster reporting. It&rsquo;ll help you write the perfect report, not make anyone
            read it.
          </p>

          <dl className="flex flex-col">
            <Row label="Source">
              <Out href={about.repoUrl}>{about.repoUrl.replace('https://', '')}</Out>
            </Row>
            <Row label="Website">
              <Out href={about.siteUrl}>{about.siteUrl.replace('https://', '')}</Out>
            </Row>
            <Row label="Report a problem">
              <Out href={about.issuesUrl}>
                {about.issuesUrl.replace('https://github.com/', '')}
              </Out>
            </Row>
            <Row label="Built with">React &#x00B7; NestJS &#x00B7; Postgres</Row>
            <Row label="Licence">
              {/* The href is derived from the repository; the name is the
                  served `license`, which the warranty sentence also reads. */}
              <Out href={`${about.repoUrl}/blob/main/LICENSE`}>{about.license}</Out>
            </Row>
            <Row label="Copyright">{about.copyright}</Row>
          </dl>

          <p className="mt-5 text-2xs leading-relaxed text-ink-muted">
            This program comes with absolutely no warranty. It is free software, and you are
            welcome to redistribute it under the terms of {about.license}.
          </p>
        </>
      )}
    </AsyncBoundary>
  )
}

/**
 * One fact, label left and value right, separated from the next by a rule.
 *
 * Label-beside-value rather than label-over-value: six facts in a compact
 * dialog have the width for it, and stacking them would make the popup twice
 * as tall as the thing it describes.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border/60 py-2 last:border-b-0">
      <dt className="shrink-0 font-mono text-micro uppercase tracking-micro text-ink-muted">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-data">{children}</dd>
    </div>
  )
}

/**
 * A value that is also a link out.
 *
 * `min-h-6`: a standalone link in a fact row is not inside a sentence, so
 * WCAG 2.5.8's in-sentence exemption does not apply to its target.
 */
function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-6 max-w-full items-center truncate text-on-accent underline underline-offset-2"
    >
      {children}
    </a>
  )
}
