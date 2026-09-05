import { FileText } from 'lucide-react'

import type { Case, Report, ReportBlock } from '@/api/model'
import { EmptyState } from '@/components/blocks/empty-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { WRITTEN_KINDS, factsFor, hasProse, headingIsFinal, headingOf, isFrozen } from './report-shape'

/**
 * The document that leaves, and it is two different things.
 *
 * **A sent report previews its own frozen copy**, which is what was written at
 * the moment it left - re-rendering it from the case would compose a document
 * from facts that have since changed.
 *
 * **A live report previews the rendered file**, which is the bytes the server
 * writes and the analyst downloads. This tier has no server, so it says that
 * rather than drawing a page that looks like the export and is not it.
 *
 * **The export door is parked with it.** Every route out is an `<a download>`
 * against a rendered file, so a menu here would offer three formats and hand
 * over nothing - and a control that answers a press with nothing is the one
 * thing a screen being judged for its design must not have.
 */
export function ReportPreviewPane({
  report,
  blocks,
  kase,
  live,
}: {
  report: Report
  blocks: readonly ReportBlock[]
  kase: Case
  live: Readonly<Record<string, string>>
}) {
  const frozen = isFrozen(report)

  if (blocks.length === 0) {
    return (
      <div className="px-4 py-6">
        <EmptyState
          icon={FileText}
          title="Nothing to render"
          detail="This report has no sections, so the export would produce a cover page and nothing else."
        />
      </div>
    )
  }

  if (!frozen) {
    return (
      <div className="flex flex-col gap-3 px-4 py-4">
        <Alert variant="info">
          <AlertTitle>The rendered file is not drawn here</AlertTitle>
          <AlertDescription>
            The export is written by the server and read back as a file, so this gallery has no
            bytes to show. Compose beside the page for what the document is shaping up as.
          </AlertDescription>
        </Alert>
        <div className="flex min-h-64 flex-1 items-center justify-center rounded-md border border-dashed border-border">
          <p className="max-w-prose px-6 text-center text-sm text-ink-muted">
            {sectionSentence(blocks.length)} The file carries the case as it stands at the moment
            it is rendered.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <Alert variant="info">
        <AlertTitle>This is the copy that was sent</AlertTitle>
        <AlertDescription>
          It was frozen when it left, so it shows the case as it stood then rather than as it
          stands now.
        </AlertDescription>
      </Alert>
      <article className="mx-auto flex w-full max-w-prose flex-col gap-5 rounded-md border border-border bg-card p-5">
        {blocks.map((block, at) => (
          <section key={block.id} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="w-5 shrink-0 text-right text-2xs text-ink-muted tabular-nums">
                {at + 1}
              </span>
              <h2 className="min-w-0 text-lg font-semibold">{headingOf(block)}</h2>
              {!headingIsFinal(block) && (
                <span className="shrink-0 text-2xs font-normal text-ink-muted">
                  heading not final
                </span>
              )}
            </div>
            <div className="pl-7">
              {WRITTEN_KINDS.includes(block.kind) ? (
                hasProse(block) && (live[block.id] ?? '') !== '' ? (
                  <p className="text-sm leading-relaxed">{live[block.id]}</p>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-ink-muted">
                    Nothing was written here.
                  </p>
                )
              ) : (
                <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-ink-muted">
                  {headingOf(block)} - built from the case when the report was sent
                  {factsFor(block.kind, kase) === ''
                    ? '.'
                    : `, from ${factsFor(block.kind, kase)}.`}
                </p>
              )}
            </div>
          </section>
        ))}
      </article>
    </div>
  )
}

/** `9 sections` as a sentence, since the count leads it. */
function sectionSentence(count: number): string {
  return `${String(count)} section${count === 1 ? '' : 's'} would be rendered.`
}
