import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

import {
  gutterWidth,
  highlightCode,
  resolveLanguage,
  toPlainLines,
  type CodeLine,
} from './code-block-highlight'
import { CopyButton } from './copy-button'

export interface CodeBlockProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** The text, verbatim. What the copy control puts on the clipboard. */
  code: string
  /**
   * `kql`, `powershell`, `bash` or `json`, or one of their aliases -- `kusto`,
   * `ps1`, `sh`, `jsonc`. Anything else renders as plain text.
   */
  language?: string
  /** What this block is: a filename, a host, where the excerpt came from. */
  label?: ReactNode
  /** Draw the copy control. */
  copy?: boolean
  /** Draw a line-number gutter. It stays put while the code scrolls sideways. */
  lineNumbers?: boolean
  /** Names the scroll region for a screen reader. Falls back to the label, then the language. */
  'aria-label'?: string
}

/** A line's runs, or a single space so an empty line still has a line's height. */
function Line({ tokens }: { tokens: CodeLine }) {
  if (tokens.length === 0) return <span className="block"> </span>
  return (
    <span className="block">
      {tokens.map((token, index) => (
        <span key={index} {...(token.color === undefined ? {} : { style: { color: token.color } })}>
          {token.content}
        </span>
      ))}
    </span>
  )
}

/**
 * A read-only block of code or log text, syntax-coloured from this app's tokens.
 *
 * **The first paint is always plain**, and the colour arrives when the grammar
 * has loaded -- nothing shiki ships is in the initial bundle, so the first
 * highlighted block on a page fetches an engine and a grammar. An unknown
 * language, a paste past `MAX_HIGHLIGHT_LINES`, and a grammar that throws all
 * stay on that plain rendering rather than failing.
 *
 * **The block scrolls sideways; the page does not.** A 2,000-character line is
 * the normal shape of a pasted command, and wrapping it would break the
 * indentation that makes a log excerpt readable. The `<pre>` is a focusable
 * `region`, which is what lets a keyboard reach the scroll.
 *
 * Copy takes `code` rather than what is on screen, so what lands on the
 * clipboard is byte-identical to what was passed in.
 */
export function CodeBlock({
  code,
  language,
  label,
  copy = true,
  lineNumbers = false,
  className,
  'aria-label': ariaLabel,
  ...props
}: CodeBlockProps) {
  const grammar = resolveLanguage(language)
  /**
   * The highlight is keyed on what it was made from, so a `code` change shows
   * the new source plainly on the very next render rather than the old
   * source's colours until the grammar pass resolves. Resetting the state
   * inside the effect would do the same thing one paint later, and a paint
   * showing the previous block is the defect.
   */
  const key = `${grammar ?? ''}\u0000${code}`
  const [highlighted, setHighlighted] = useState<{ key: string; lines: CodeLine[] } | null>(null)
  const plain = useMemo(() => toPlainLines(code), [code])
  const lines = highlighted?.key === key ? highlighted.lines : plain

  useEffect(() => {
    if (grammar === undefined) return undefined
    let current = true
    void highlightCode(code, grammar).then((next) => {
      if (current) setHighlighted({ key, lines: next })
    })
    return () => {
      current = false
    }
  }, [key, code, grammar])

  const name = ariaLabel ?? (typeof label === 'string' ? label : undefined) ?? grammar ?? 'Code'
  const gutter = gutterWidth(lines.length)

  return (
    <div
      data-slot="code-block"
      className={cn('overflow-hidden rounded-lg border border-border', className)}
      {...props}
    >
      <div className="flex h-control-md items-center justify-between gap-2 border-b border-border bg-muted px-3">
        {/* The same weight as a field's label, which is what this is. At
            `text-xs font-medium` it was the largest, heaviest text in the
            panel -- a label outweighing the code it names. */}
        <span className="truncate text-micro tracking-micro text-ink-muted uppercase">
          {label ?? grammar}
        </span>
        {copy ? <CopyButton value={code} /> : null}
      </div>
      <pre
        role="region"
        // A scrollable region must be reachable by keyboard, which is what
        // `tabindex` on a `region` is for. The rule reads it as a static
        // element made focusable for no reason.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={name}
        data-slot="code-block-scroll"
        className="overflow-x-auto bg-(--code-background) py-2 font-mono text-data leading-normal text-(--code-foreground) outline-ring/60 -outline-offset-2 focus-visible:outline-2"
      >
        <code className="block w-fit min-w-full">
          {lines.map((tokens, index) => (
            <span key={index} className="flex">
              {lineNumbers ? (
                <span
                  aria-hidden
                  style={{ minWidth: gutter }}
                  className="sticky left-0 shrink-0 self-stretch bg-(--code-background) pr-3 pl-3 text-right tabular-nums text-ink-muted select-none"
                >
                  {index + 1}
                </span>
              ) : null}
              <span className={cn('min-w-0 grow', lineNumbers ? 'pr-3' : 'px-3')}>
                <Line tokens={tokens} />
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
