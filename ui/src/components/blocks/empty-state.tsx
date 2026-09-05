import type { LucideIcon } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

import { Button, ButtonLink } from '@/components/ui/button'
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { IconStack } from '@/components/ui/icon-stack'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/cn'

/** One way into an empty screen. Renders as a link when `to` is set, a button when `onSelect` is. */
export interface EmptyOffer {
  label: string
  icon?: LucideIcon | undefined
  /** One line under the label. */
  hint?: string | undefined
  /** Ignored when `to` is set. */
  onSelect?: (() => void) | undefined
  /** A route. Takes precedence over `onSelect`. */
  to?: string | undefined
  /** Draw a rule before this offer. Ignored on the first. */
  apart?: boolean | undefined
}

/**
 * Empty state for a list or a pane.
 *
 * Composition: `Empty > EmptyMedia + EmptyTitle + EmptyDescription + EmptyActions`.
 *
 * - `action` takes one way in, `offers` takes two or more. Passing both renders both.
 * - Nothing renders filled; `Button variant="outline"` throughout.
 * - Offers are absent rather than empty when `offers` is `[]`.
 */
export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
  offers,
  offerShape = 'inline',
  bounded = false,
  className,
}: {
  icon?: LucideIcon | undefined
  title: string
  /** One line under the title. */
  detail?: string | undefined
  /** A single control. Use `offers` for two or more. */
  action?: ReactNode | undefined
  /** Two or more ways in, as tiles. */
  offers?: readonly EmptyOffer[]
  /** `inline` wraps the tiles in a row; `stack` fills the width, one per line. */
  offerShape?: 'inline' | 'stack' | undefined
  /** Draw a dashed panel and centre it at `max-w-md`. Sets `Empty`'s `inset`. */
  bounded?: boolean | undefined
  className?: string | undefined
}) {
  const ways = offers ?? []
  const stacked = offerShape === 'stack'

  return (
    <Empty
      inset={bounded}
      // `justify-start`: `Empty` centres in whatever height its container gives
      // it, which differs per screen.
      className={cn('justify-start pt-10', bounded && 'mx-auto max-w-md', className)}
    >
      {Icon && (
        // `illustration` suppresses `EmptyMedia`'s own disc; `IconStack` draws one.
        <EmptyMedia variant="illustration">
          <IconStack>
            <Icon aria-hidden className="size-5" />
          </IconStack>
        </EmptyMedia>
      )}
      <EmptyTitle>{title}</EmptyTitle>
      {detail && <EmptyDescription>{detail}</EmptyDescription>}
      {action && <EmptyActions>{action}</EmptyActions>}
      {ways.length > 0 && (
        <EmptyActions
          data-slot="empty-offers"
          data-shape={offerShape}
          className={cn(
            stacked
              ? 'w-full max-w-md flex-col items-stretch'
              : // Wider than `EmptyDescription`'s `max-w-sm`, which is a measure for prose.
                'max-w-2xl items-stretch justify-center',
          )}
        >
          {ways.map((offer, at) => (
            <Fragment key={offer.label}>
              {offer.apart && at > 0 && (
                <Separator
                  data-slot="empty-offers-rule"
                  orientation={stacked ? 'horizontal' : 'vertical'}
                  className={stacked ? 'my-1' : 'mx-1 h-auto self-stretch'}
                />
              )}
              <Offer offer={offer} stacked={stacked} />
            </Fragment>
          ))}
        </EmptyActions>
      )}
    </Empty>
  )
}

/** One offer tile. `ButtonLink` when `to` is set, `Button` otherwise. */
function Offer({ offer, stacked }: { offer: EmptyOffer; stacked: boolean }) {
  const Icon = offer.icon

  const body = (
    <>
      {Icon && <Icon aria-hidden className="size-4 shrink-0 text-ink-muted" />}
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="font-medium text-ink">{offer.label}</span>
        {offer.hint && <span className="text-2xs text-ink-muted">{offer.hint}</span>}
      </span>
    </>
  )

  // `h-auto` overrides the kit size, whose heights are single-line; a tile with
  // a hint is two lines. `min-h` keeps it on the control scale.
  const skin = cn(
    'inline-flex h-auto min-h-control-md items-center gap-2.5 bg-card px-3 py-1.5 text-left text-xs',
    stacked && 'w-full justify-start',
  )

  if (offer.to !== undefined) {
    return (
      <ButtonLink data-slot="empty-offer" variant="outline" href={offer.to} className={skin}>
        {body}
      </ButtonLink>
    )
  }

  // Spread rather than pass: `exactOptionalPropertyTypes` refuses an explicit
  // `undefined` for React Aria's `onPress`.
  //
  // **An offer with neither is drawn refused rather than pressable.** A tile
  // that looks like a door and opens nothing costs the reader a press to find
  // out, every time; an absent one costs nothing.
  return (
    <Button
      data-slot="empty-offer"
      variant="outline"
      className={skin}
      isDisabled={!offer.onSelect}
      {...(offer.onSelect ? { onPress: offer.onSelect } : {})}
    >
      {body}
    </Button>
  )
}
