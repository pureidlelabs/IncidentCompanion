import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Breadcrumb as AriaBreadcrumb,
  Breadcrumbs as AriaBreadcrumbs,
  type BreadcrumbsProps as AriaBreadcrumbsProps,
  type LinkProps as AriaLinkProps,
  type Key,
} from 'react-aria-components'

import { cn } from '@/lib/cn'

import { Link } from './link'

export type BreadcrumbsProps<T extends object> = AriaBreadcrumbsProps<T>

/**
 * The trail to where the analyst is.
 *
 * Renders an `<ol>`. Put it inside a `<nav aria-label="Breadcrumbs">` so it
 * announces as a navigation landmark. `onAction` is called with the pressed
 * level's `id`; the last child is the current page and is not a link.
 */
export function Breadcrumbs<T extends object>(props: BreadcrumbsProps<T>) {
  return (
    <AriaBreadcrumbs
      data-slot="breadcrumbs"
      {...props}
      className={cn(
        'flex flex-wrap items-center gap-1.5 text-sm text-ink-muted',
        props.className,
      )}
    />
  )
}

export interface BreadcrumbProps extends Omit<AriaLinkProps, 'className' | 'children' | 'id'> {
  /** The label for this level. */
  children?: ReactNode
  /** Passed to the list's `onAction` when this level is pressed. */
  id?: Key
  /** Extra classes for the row, not for the link inside it. */
  className?: string
}

/**
 * One level.
 *
 * Takes an `href` or nothing: the last breadcrumb is the current page, so it
 * loses its link styling and its trailing chevron and gains `aria-current`.
 */
export function Breadcrumb({ children, className, id, ...props }: BreadcrumbProps) {
  return (
    <AriaBreadcrumb
      data-slot="breadcrumb"
      {...(id === undefined ? {} : { id })}
      className={cn('flex items-center gap-1', className)}
    >
      {({ isCurrent }) => (
        <>
          <Link
            {...props}
            variant="muted"
            standalone
            {...(isCurrent ? { className: 'font-normal text-ink no-underline' } : {})}
          >
            {children}
          </Link>
          {isCurrent ? null : (
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
          )}
        </>
      )}
    </AriaBreadcrumb>
  )
}
