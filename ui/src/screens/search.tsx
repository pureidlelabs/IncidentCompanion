import { Search as SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Case } from '@/api/model'
import { EmptyState } from '@/components/blocks/empty-state'
import { Section } from '@/components/blocks/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SearchField } from '@/components/ui/search-field'

import { searchCase } from '@/lib/case-search'

/**
 * Everything in the case that mentions what you typed, grouped by the table it
 * came from.
 *
 * Three rules decide what matches, and the palette uses the same ones: matching
 * runs over displayed values, every whitespace-separated term must match, and a
 * hit records which fields matched so the result explains itself without
 * opening the row.
 *
 * **No API call.** The case is already loaded, so the search is a pure function
 * over it and a keystroke costs nothing.
 *
 * A group's own door leads to the table it names, which is navigation this
 * screen does not hold: `onOpenSection` is what carries it, and without one
 * the door is drawn refused rather than drawn and inert.
 */
export interface SearchScreenProps {
  /** The case to search. */
  kase: Case | undefined
  /** What the box opens with. */
  query?: string
  /** Opens the table a group of hits came from, by its case field key. */
  onOpenSection?: ((section: string) => void) | undefined
  /**
   * The case is still being read.
   *
   * Nothing is drawn while this holds: a read that has not returned is not
   * an answer, and an ungated pending state searches another case entirely.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

/** A long value collapsed to one line, so a note does not take the whole card. */
const CLAMP = 90

function clamp(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length <= CLAMP ? collapsed : `${collapsed.slice(0, CLAMP - 1)}\u2026`
}

/** `eventSource` as `Event source`, with the acronyms this case uses kept. */
const LABELS: Readonly<Record<string, string>> = {
  url: 'URL',
  upn: 'UPN',
  hash: 'Hash',
  technique: 'ATT&CK technique',
}

function fieldLabel(name: string): string {
  const known = LABELS[name]
  if (known !== undefined) return known
  const words = name
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase()
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

export function SearchScreen({
  kase,
  query = '',
  onOpenSection,
  busy = false,
  problem,
  onRetry,
}: SearchScreenProps) {
  const [text, setText] = useState(query)
  const groups = useMemo(() => (kase ? searchCase(kase, text) : []), [kase, text])
  const total = groups.reduce((sum, group) => sum + group.hits.length, 0)
  const searched = text.trim() !== ''

  return (
    <Section
      title="Search this case"
      meta={
        searched ? (
          <Badge variant="outlined" size="xs">
            {`${String(total)} ${total === 1 ? 'match' : 'matches'}`}
          </Badge>
        ) : undefined
      }
      blurb="Every table of this case, matched on the values you can see rather than on stored ids."
      toolbar={
        <SearchField
          aria-label="Search this case"
          placeholder="Hostname, address, account or a phrase"
          value={text}
          onChange={setText}
          className="max-w-md"
        />
      }
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
    >
      {!searched ? (
        <EmptyState
          icon={SearchIcon}
          title="Nothing searched yet"
          detail="Type above to search the timeline, the assets and every other table in this case."
        />
      ) : total === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No matches"
          detail={`Nothing in this case mentions every word in "${text.trim()}".`}
          action={
            <Button
              variant="outline"
              onPress={() => {
                setText('')
              }}
            >
              Clear the search
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink-muted">
                  {group.label} &#xB7; {group.hits.length}
                </h2>
                {/* `-my-1 py-1`: a link button keeps its line box, which
                    measured 18px against the 24px target floor. */}
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto -my-1 px-0 py-1"
                  isDisabled={!onOpenSection}
                  {...(onOpenSection
                    ? {
                        onPress: () => {
                          onOpenSection(group.key)
                        },
                      }
                    : {})}
                >
                  {`Open ${group.label}`}
                </Button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {group.hits.map((hit) => (
                  <li
                    key={`${hit.section}:${hit.id}`}
                    className="rounded-md border border-border bg-card px-3 py-2"
                  >
                    <p className="truncate text-sm font-medium" title={hit.title}>
                      {clamp(hit.title)}
                    </p>
                    {hit.matched.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {hit.matched
                          .map((one) => `${fieldLabel(one.field)}: ${clamp(one.value)}`)
                          .join(' \u00b7 ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
