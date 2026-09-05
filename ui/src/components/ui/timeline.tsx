import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { cn } from '@/lib/cn'

interface TimelineContextValue {
  activeStep: number
  setActiveStep: (step: number) => void
}

const TimelineContext = createContext<TimelineContextValue | null>(null)

/** Throws outside a `Timeline`, rather than rendering items that cannot know their state. */
function useTimeline(): TimelineContextValue {
  const value = useContext(TimelineContext)
  if (value === null) throw new Error('Timeline parts must be used inside a Timeline')
  return value
}

export interface TimelineProps extends React.ComponentProps<'div'> {
  /** Uncontrolled active step. 1-based. */
  defaultValue?: number
  /** Controlled active step. 1-based. */
  value?: number
  onValueChange?: (value: number) => void
  /** Vertical runs down the page; horizontal runs across it. */
  orientation?: 'horizontal' | 'vertical'
}

/**
 * A run of events on a line, each marked done or not.
 */
export function Timeline({
  defaultValue = 1,
  value,
  onValueChange,
  orientation = 'vertical',
  className,
  ...props
}: TimelineProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const activeStep = value ?? uncontrolled

  const setActiveStep = useCallback(
    (step: number) => {
      if (value === undefined) setUncontrolled(step)
      onValueChange?.(step)
    },
    [value, onValueChange],
  )

  const context = useMemo(() => ({ activeStep, setActiveStep }), [activeStep, setActiveStep])

  return (
    <TimelineContext.Provider value={context}>
      <div
        data-slot="timeline"
        data-orientation={orientation}
        className={cn(
          'group/timeline flex',
          orientation === 'horizontal' ? 'w-full flex-row' : 'flex-col',
          className,
        )}
        {...props}
      />
    </TimelineContext.Provider>
  )
}

export interface TimelineItemProps extends React.ComponentProps<'div'> {
  /** This item's 1-based position. */
  step: number
}

/** One event. Carries `data-completed` once the active step reaches it. */
export function TimelineItem({ step, className, ...props }: TimelineItemProps) {
  const { activeStep } = useTimeline()
  const completed = step <= activeStep

  return (
    <div
      data-slot="timeline-item"
      {...(completed ? { 'data-completed': '' } : {})}
      className={cn(
        'group/timeline-item relative flex flex-1 flex-col gap-0.5',
        'group-data-[orientation=vertical]/timeline:ms-8',
        'group-data-[orientation=vertical]/timeline:not-last:pb-6',
        'group-data-[orientation=horizontal]/timeline:mt-8',
        'group-data-[orientation=horizontal]/timeline:not-last:pe-8',
        className,
      )}
      {...props}
    />
  )
}

/** The row holding the mark, the date and the title. */
export function TimelineHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="timeline-header" className={cn(className)} {...props} />
}

/** The dot on the line. Filled once its item is complete. Decorative. */
export function TimelineIndicator({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      data-slot="timeline-indicator"
      className={cn(
        'absolute size-4 rounded-full border-2 border-primary/20 bg-background',
        'group-data-completed/timeline-item:border-primary',
        'group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:top-0',
        'group-data-[orientation=vertical]/timeline:-translate-x-1/2',
        'group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:left-0',
        'group-data-[orientation=horizontal]/timeline:-translate-y-1/2',
        className,
      )}
      {...props}
    />
  )
}

/** The line between one mark and the next. Coloured where the run is complete. */
export function TimelineSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      data-slot="timeline-separator"
      className={cn(
        'absolute bg-primary/20 group-data-completed/timeline-item:bg-primary',
        'group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:top-4',
        'group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem)] group-data-[orientation=vertical]/timeline:w-0.5',
        'group-data-[orientation=vertical]/timeline:-translate-x-1/2',
        'group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:left-4',
        'group-data-[orientation=horizontal]/timeline:h-0.5 group-data-[orientation=horizontal]/timeline:w-[calc(100%-1rem)]',
        'group-data-[orientation=horizontal]/timeline:-translate-y-1/2',
        className,
      )}
      {...props}
    />
  )
}

/** When it happened. Renders a `time`; pass `dateTime` for a machine-readable stamp. */
export function TimelineDate({ className, ...props }: React.ComponentProps<'time'>) {
  return (
    <time
      data-slot="timeline-date"
      className={cn('mb-1 block text-xs font-medium text-ink-muted', className)}
      {...props}
    />
  )
}

/** What happened, in a few words. */
export function TimelineTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="timeline-title"
      className={cn('text-sm font-semibold text-ink', className)}
      {...props}
    />
  )
}

/** The detail under the title. */
export function TimelineContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timeline-content"
      className={cn('text-sm text-ink-muted', className)}
      {...props}
    />
  )
}
