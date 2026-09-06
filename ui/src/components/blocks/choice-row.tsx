import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { cn } from '@/lib/cn'

export interface Choice {
  title: string
  /** One line under the title. A consequence, never a rationale. */
  detail?: string | undefined
  icon?: LucideIcon | undefined
  /** Where it goes. A row that navigates is a link, so it can be middle-clicked. */
  to?: string | undefined
  /** What it does. Mutually exclusive with `to`. */
  onSelect?: (() => void) | undefined
  /** Draw a rule above this row: it is a different kind of thing. */
  apart?: boolean | undefined
  /** A word qualifying the choice, beside its title. */
  chip?: string | undefined
  /** What `ChoicePicker` reports when this one is picked. Unused by `ChoiceRow`. */
  value?: string | undefined
}

/**
 * The inside of a choice: its glyph, its title and the line under it.
 *
 * Shared by the door and the picker card, so the two are one drawing.
 */
function ChoiceBody({
  choice,
  card,
  titleId,
  detailId,
}: {
  choice: Choice
  card: boolean
  titleId: string
  detailId: string
}) {
  const Icon = choice.icon
  return (
    <>
      {Icon && (
        // The glyph takes its own square, so a run of rows has one left edge
        // whether or not every row has an icon.
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md bg-muted text-ink-muted transition-colors group-hover/choice:bg-background',
            card ? 'size-10' : 'size-9',
          )}
        >
          <Icon aria-hidden className={card ? 'size-5' : 'size-4.5'} />
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span id={titleId} className="font-medium text-ink text-sm">
            {choice.title}
          </span>
          {choice.chip !== undefined && (
            <Badge variant="soft" size="xs" uppercase={false}>
              {choice.chip}
            </Badge>
          )}
        </span>
        {choice.detail && (
          <span id={detailId} className="text-xs leading-relaxed text-ink-muted">
            {choice.detail}
          </span>
        )}
      </span>
    </>
  )
}

/**
 * A way forward, offered as a row you read rather than a button you scan.
 *
 * - A `to` renders a router `Link`, so the row can be middle-clicked; an
 *   `onSelect` renders a `button`.
 * - The accessible name is the title alone, through `aria-labelledby`, and the
 *   line under it is the description.
 * - `row` and `card` are the same choice at two densities; a card takes the
 *   height of its taller sibling.
 */
export function ChoiceRow({
  choice,
  shape = 'row',
  className,
}: {
  choice: Choice
  /** `row` down a column, `card` across a grid. */
  shape?: 'row' | 'card' | undefined
  className?: string | undefined
}) {
  const titleId = useId()
  const detailId = useId()

  const card = shape === 'card'
  // A choice with neither a route nor a handler leads nowhere. It is still
  // drawn -- an operator who cannot see a door cannot tell a feature that is
  // unconfigured from one that moved -- but it is refused rather than left as
  // a control that takes a tab stop and swallows the press.
  const inert = choice.to === undefined && choice.onSelect === undefined
  const skin = cn(
    'group/choice flex w-full gap-3 rounded-md border border-input bg-card text-left',
    'transition-colors hover:bg-accent hover:text-on-accent',
    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'disabled:pointer-events-none disabled:opacity-60',
    card ? 'h-full items-start px-4 py-3.5' : 'items-center p-2.5',
    className,
  )

  const body = (
    <ChoiceBody choice={choice} card={card} titleId={titleId} detailId={detailId} />
  )

  const wiring = {
    'data-slot': 'choice-row',
    'aria-labelledby': titleId,
    ...(choice.detail === undefined ? {} : { 'aria-describedby': detailId }),
    className: skin,
  }

  if (choice.to !== undefined) {
    return (
      <Link {...wiring} to={choice.to}>
        {body}
      </Link>
    )
  }

  return (
    <button {...wiring} type="button" disabled={inert} onClick={choice.onSelect}>
      {body}
    </button>
  )
}

/**
 * A run of choices, with a rule wherever one is a different kind of thing.
 *
 * - Never a rule before the first row.
 * - `columns={2}` draws cards across a grid, where `apart` has nowhere to go
 *   and is ignored.
 * - `children` are drawn after the rows: a footnote, a secondary way out.
 * - An empty `choices` renders nothing, children included.
 */
export function ChoiceRows({
  choices,
  columns = 1,
  className,
  children,
}: {
  choices: readonly Choice[]
  /** How many fit across. The screen decides, since it knows its own width. */
  columns?: 1 | 2 | undefined
  className?: string | undefined
  children?: ReactNode
}) {
  if (choices.length === 0) return null

  if (columns === 2) {
    return (
      <div
        data-slot="choice-rows"
        data-columns="2"
        className={cn('grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2', className)}
      >
        {choices.map((choice) => (
          <ChoiceRow key={choice.title} choice={choice} shape="card" />
        ))}
        {children}
      </div>
    )
  }

  return (
    <div data-slot="choice-rows" className={cn('flex w-full flex-col gap-1.5', className)}>
      {choices.map((choice, at) => (
        <div key={choice.title} className="contents">
          {choice.apart && at > 0 && (
            <hr data-slot="choice-rows-rule" className="my-1.5 border-border" />
          )}
          <ChoiceRow choice={choice} />
        </div>
      ))}
      {children}
    </div>
  )
}

/**
 * A pick-one grid of the same cards: choose one, and it stays chosen.
 *
 * - Holds `value` as the choice's `value`, falling back to its `title`.
 * - The grid is a single child of the group, since the kit's `RadioGroup`
 *   stacks whatever it is given.
 * - The card is a `div` with a handler: a `label` forwards no click to a
 *   button, and a button around the radio would nest one control in another.
 * - The keyboard path is the radio group's own, so the card takes no tab stop.
 */
export function ChoicePicker({
  choices,
  value,
  onValueChange,
  label,
  columns = 3,
  className,
}: {
  choices: Choice[]
  value: string
  onValueChange: (next: string) => void
  /** Names the set for a screen reader; the visible heading is the caller's. */
  label: string
  columns?: 2 | 3 | undefined
  className?: string | undefined
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onChange={(next) => {
        onValueChange(next)
      }}
      {...(className === undefined ? {} : { className })}
    >
      <div
        className={cn(
          'grid grid-cols-1 items-stretch gap-3',
          columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {choices.map((choice) => (
          <PickerCard
            key={choice.value ?? choice.title}
            choice={choice}
            chosen={(choice.value ?? choice.title) === value}
          />
        ))}
      </div>
    </RadioGroup>
  )
}

function PickerCard({ choice, chosen }: { choice: Choice; chosen: boolean }) {
  const titleId = useId()
  const detailId = useId()
  const value = choice.value ?? choice.title
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-slot="choice-row"
      onClick={() => {
        choice.onSelect?.()
      }}
      className={cn(
        'group/choice flex h-full w-full cursor-pointer items-start gap-3 rounded-md border bg-card px-4 py-3.5 text-left',
        'transition-colors hover:bg-accent hover:text-on-accent',
        chosen ? 'border-primary bg-primary/5' : 'border-input',
      )}
    >
      <ChoiceBody choice={choice} card titleId={titleId} detailId={detailId} />
      {/* Last in the row and pushed right: the mark saying which one is
          standing, read after the thing it marks. */}
      <span className="ml-auto shrink-0">
        <Radio
          value={value}
          aria-labelledby={titleId}
          {...(choice.detail === undefined ? {} : { 'aria-describedby': detailId })}
        />
      </span>
    </div>
  )
}
