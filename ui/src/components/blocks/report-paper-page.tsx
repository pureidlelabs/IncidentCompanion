import { useEffect, useRef } from 'react'

import type { Case, Report, ReportBlock } from '@/api/model'
import { markdownToHtml } from '@/components/blocks/prose-schema'

import { bandsOf, paperScrollTop, scrollerOf } from './report-paper-sync'
import { WRITTEN_KINDS, factsFor, headingOf } from './report-shape'

/**
 * The document at print size, painted from what is being typed.
 *
 * **Not Preview, and the difference is the point.** Preview is the bytes that
 * leave and cannot change until the server renders again; this paints the
 * paragraph as you write it. Where the two disagree the export is right, which
 * is why only one of them is called Preview.
 *
 * **It carries its own colours.** A document has no theme to consult, so the
 * page is white in a dark app because paper is white.
 */
export function ReportPaperPage({
  blocks,
  live,
  kase,
  report,
  here,
}: {
  blocks: readonly ReportBlock[]
  live: Readonly<Record<string, string>>
  kase: Case
  report: Report
  here: string
}) {
  const box = useRef<HTMLDivElement>(null)

  /**
   * The page follows the pane's scroll, one way.
   *
   * Nothing here writes to the pane, so there is no loop to guard against. What
   * it costs is that scrolling the page on its own is overridden at the next
   * scroll of the pane, which is what a preview does.
   */
  useEffect(() => {
    const page = box.current
    if (page === null) return
    const pane = scrollerOf(page)
    if (pane === null) return

    let queued = 0
    const follow = () => {
      queued = 0
      const ids = blocks.map((block) => block.id)
      const at = paperScrollTop(
        pane,
        bandsOf(pane, ids, sectionDomId),
        bandsOf(page, ids, paperDomId),
      )
      if (at !== null) page.scrollTop = at
    }
    // Coalesced to a frame: a trackpad fires scroll far faster than layout, and
    // reading `offsetTop` per event is a forced reflow per event.
    const onScroll = () => {
      queued ||= requestAnimationFrame(follow)
    }
    pane.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      pane.removeEventListener('scroll', onScroll)
      if (queued) cancelAnimationFrame(queued)
    }
  }, [blocks])

  // The caret still wins over the scroll: typing does not scroll the pane, so
  // writing in a section nobody scrolled to has to bring the page to it, and
  // nothing else would.
  useEffect(() => {
    if (here === '' || box.current === null) return
    const target = box.current.querySelector<HTMLElement>(`#${CSS.escape(paperDomId(here))}`)
    if (target === null) return
    const first = box.current.firstElementChild as HTMLElement | null
    box.current.scrollTop = target.offsetTop - (first?.offsetTop ?? 0) - 8
  }, [here])

  return (
    <aside
      // **Not "Paper".** That is the control's name, and the control you press
      // and the region it opens are different objects.
      aria-label="The printed page"
      className="hidden min-w-0 border-l border-border bg-muted/30 lg:block"
    >
      <div
        ref={box}
        className="sticky top-14 h-(--document-viewport-h) overflow-y-auto p-4"
      >
        <div className="mx-auto w-full max-w-[26rem] bg-paper px-8 py-9 text-paper-ink shadow-lg">
          {report.tlp !== null && (
            <div className="-mx-7 -mt-8 mb-6 bg-paper-banner py-1 text-center font-mono text-[9px] font-bold tracking-[0.16em] text-paper-banner-ink">
              {report.tlp}
            </div>
          )}
          {blocks.map((block, at) => (
            <div key={block.id} id={paperDomId(block.id)}>
              <h4 className="mt-5 flex items-baseline gap-2 border-b border-paper-accent pb-1 font-sans text-[13px] font-bold text-paper-accent first:mt-0">
                <span className="font-mono text-[11px]">{String(at + 1).padStart(2, '0')}</span>
                {headingOf(block)}
              </h4>
              {WRITTEN_KINDS.includes(block.kind) ? (
                <div
                  // The schema is the sanitiser. -> `markdownToHtml`
                  className="paper-body mt-1 text-[11.5px] leading-[1.6]"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(live[block.id] ?? '') }}
                />
              ) : (
                <p className="mt-1 rounded-sm border border-dashed border-paper-rule px-2 py-1 font-sans text-[10px] text-paper-ink-muted">
                  {factsFor(block.kind, kase) === ''
                    ? 'Written from the case at export.'
                    : `Written from the case at export, from ${factsFor(block.kind, kase)}.`}
                </p>
              )}
            </div>
          ))}
          <div className="mt-8 flex justify-between border-t border-paper-rule pt-2 font-mono text-[8px] text-paper-ink-muted">
            <span>{report.tlp ?? ''}</span>
            <span>{kase.reference}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

/**
 * The section's element in the compose column.
 *
 * `ReportPaperPage` matches this id against the one the compose column draws
 * for the same block, which is how the two panes stay level while scrolling.
 */
export function sectionDomId(id: string): string {
  return `section-${id}`
}

/** The page's copy of a section. */
function paperDomId(id: string): string {
  return `paper-${id}`
}
