import { Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'
import { SCALE, spring, transition } from '@/lib/motion'

import { focusRing } from './rac'

/** Where a step sits relative to the one the analyst is on. */
export type StepState = 'complete' | 'current' | 'upcoming'

interface StepperContextValue {
  activeStep: number
  setActiveStep: (step: number) => void
  orientation: 'horizontal' | 'vertical'
}

interface StepItemContextValue {
  step: number
  state: StepState
  isDisabled: boolean
}

const StepperContext = createContext<StepperContextValue | null>(null)
const StepItemContext = createContext<StepItemContextValue | null>(null)

/** The stepper a part is inside. Throws outside one. */
export function useStepper(): StepperContextValue {
  const ctx = useContext(StepperContext)
  if (!ctx) throw new Error('a stepper part was rendered outside <Stepper>')
  return ctx
}

/** The step a part is inside. Throws outside one. */
export function useStepItem(): StepItemContextValue {
  const ctx = useContext(StepItemContext)
  if (!ctx) throw new Error('a step part was rendered outside <StepperItem>')
  return ctx
}

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface StepperLook {
  /** Which way the steps run. Vertical stacks the separator between them. */
  orientation?: 'horizontal' | 'vertical'
}

export interface StepperProps extends React.ComponentProps<'div'>, StepperLook {
  /** The step to start on, when the stepper holds its own state. 1-based. */
  defaultValue?: number
  /** The current step, when the caller holds the state. 1-based. */
  value?: number
  /** Called with the step number a trigger asked for. */
  onValueChange?: (value: number) => void
}

/**
 * A numbered path through a task, one step at a time.
 */
export function Stepper({
  defaultValue = 1,
  value,
  onValueChange,
  orientation = 'horizontal',
  className,
  ...props
}: StepperProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const activeStep = value ?? uncontrolled

  const setActiveStep = useCallback(
    (step: number) => {
      if (value === undefined) setUncontrolled(step)
      onValueChange?.(step)
    },
    [value, onValueChange],
  )

  const ctx = useMemo(
    () => ({ activeStep, setActiveStep, orientation }),
    [activeStep, setActiveStep, orientation],
  )

  return (
    <StepperContext.Provider value={ctx}>
      <div
        data-slot="stepper"
        data-orientation={orientation}
        // **`w-full` only when horizontal.** A vertical stepper is a rail
        // beside a body, and a full-width rail in a flex row pushes the body
        // clean out of the viewport. A caller cannot correct that from the
        // outside either: `cn` merges by property, so a `shrink-0` passed in
        // never conflicts with a width.
        className={cn(orientation === 'horizontal' && 'w-full', className)}
        {...props}
      />
    </StepperContext.Provider>
  )
}

const stepperNav = tv({
  base: 'group/stepper-nav flex list-none',
  variants: {
    orientation: {
      horizontal: 'w-full flex-row items-center',
      vertical: 'flex-col',
    },
  },
})

/** The ordered list the steps sit in. */
export function StepperNav({ className, ...props }: React.ComponentProps<'ol'>) {
  const { orientation } = useStepper()
  return (
    <ol
      data-slot="stepper-nav"
      data-orientation={orientation}
      className={cn(stepperNav({ orientation }), className)}
      {...props}
    />
  )
}

export interface StepperItemProps extends React.ComponentProps<'li'> {
  /** This step's 1-based number. */
  step: number
  /** Mark the step done regardless of where the active step is. */
  completed?: boolean
  /** Refuse the trigger's press and dim the step. */
  disabled?: boolean
}

/** One step, and the state every part inside it reads. */
export function StepperItem({
  step,
  completed = false,
  disabled = false,
  className,
  ...props
}: StepperItemProps) {
  const { activeStep } = useStepper()
  const state: StepState =
    completed || step < activeStep ? 'complete' : step === activeStep ? 'current' : 'upcoming'

  const ctx = useMemo(
    () => ({ step, state, isDisabled: disabled }),
    [step, state, disabled],
  )

  return (
    <StepItemContext.Provider value={ctx}>
      <li
        data-slot="stepper-item"
        data-state={state}
        className={cn(
          'group/step flex items-center justify-center gap-2 not-last:flex-1',
          'group-data-[orientation=vertical]/stepper-nav:flex-col',
          'group-data-[orientation=vertical]/stepper-nav:items-start',
          disabled && 'opacity-50',
          className,
        )}
        {...(state === 'current' ? { 'aria-current': 'step' as const } : {})}
        {...props}
      />
    </StepItemContext.Provider>
  )
}

const stepperTrigger = tv({
  extend: focusRing,
  base: [
    'inline-flex items-center gap-2.5 rounded-md text-left outline-0',
    'focus-visible:outline-2 disabled:pointer-events-none',
  ],
})

/** The pressable part of a step. Give it an indicator and a title. */
export function StepperTrigger({ className, onClick, ...props }: React.ComponentProps<'button'>) {
  const { setActiveStep } = useStepper()
  const { step, state, isDisabled } = useStepItem()

  return (
    <button
      type="button"
      data-slot="stepper-trigger"
      data-state={state}
      disabled={isDisabled}
      className={cn(stepperTrigger(), className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setActiveStep(step)
      }}
      {...props}
    />
  )
}

const stepperIndicator = tv({
  base: [
    // No `overflow-hidden`: the current step's ring is drawn just outside the
    // disc, and a clip would take it.
    'relative flex size-6 shrink-0 items-center justify-center',
    'rounded-full text-xs transition-colors',
  ],
  variants: {
    state: {
      // **Done is quieter than doing.** The two used to resolve to the same
      // ground, the same ink and the same title weight, so a path with three
      // steps behind it drew three discs identical to the one the analyst was
      // standing on. A finished step is history and the tick is what says so.
      complete: 'bg-primary/15 text-primary',
      current: 'bg-primary text-on-primary',
      upcoming: 'bg-accent text-on-accent',
    },
  },
})

/** The step's number, replaced by a tick once the step is complete. */
export function StepperIndicator({
  className,
  children,
  ...props
}: React.ComponentProps<'span'>) {
  const { step, state } = useStepItem()

  return (
    <span
      data-slot="stepper-indicator"
      data-state={state}
      className={cn(stepperIndicator({ state }), className)}
      {...props}
    >
      {/* **The ring fades where it is rather than flying between discs.** The
          travel belongs to the line: a mark that slid along the path would race
          the fill it is supposed to be following, and two things moving between
          the same two points read as one thing that stuttered. So the ring
          settles on the step being worked and the connector carries the
          movement. */}
      <AnimatePresence initial={false}>
        {state === 'current' && (
          <motion.span
            key="ring"
            aria-hidden
            data-slot="stepper-ring"
            initial={{ opacity: 0, scale: SCALE.glyph }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: SCALE.glyph }}
            transition={transition.base}
            className="pointer-events-none absolute -inset-[3px] rounded-full ring-2 ring-primary/35"
          />
        )}
      </AnimatePresence>
      {state === 'complete' ? (
        <Check aria-hidden className="size-3.5" />
      ) : (
        (children ?? step)
      )}
    </span>
  )
}

/** The step's name. Renders a `span`, so a trigger stays one accessible name. */
export function StepperTitle({ className, ...props }: React.ComponentProps<'span'>) {
  const { state } = useStepItem()
  return (
    <span
      data-slot="stepper-title"
      data-state={state}
      className={cn(
        'text-sm leading-none font-medium',
        state === 'upcoming' ? 'text-ink-muted' : 'text-ink',
        className,
      )}
      {...props}
    />
  )
}

/** One line under the title, saying what the step asks for. */
export function StepperDescription({ className, ...props }: React.ComponentProps<'span'>) {
  const { state } = useStepItem()
  return (
    <span
      data-slot="stepper-description"
      data-state={state}
      className={cn('block text-sm text-ink-muted', className)}
      {...props}
    />
  )
}

/**
 * The rule between two steps.
 */
export function StepperSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  const { step, state } = useStepItem()
  const { activeStep, orientation } = useStepper()
  // **Progress, not the neighbouring step's state.** A disc says whether a step
  // is done; a line says how far along the path the analyst has come, and the
  // two part company the moment `completed` marks a step out of order. Keyed to
  // `complete` the rule *after* a forced step filled while the one before it did
  // not, which reads as having walked past a step nobody has reached.
  const filled = step < activeStep

  return (
    <div
      aria-hidden
      data-slot="stepper-separator"
      data-state={state}
      className={cn(
        'relative m-0.5 overflow-hidden rounded-sm bg-muted',
        'group-data-[orientation=horizontal]/stepper-nav:h-0.5',
        'group-data-[orientation=horizontal]/stepper-nav:flex-1',
        'group-data-[orientation=vertical]/stepper-nav:ms-3',
        'group-data-[orientation=vertical]/stepper-nav:h-12',
        'group-data-[orientation=vertical]/stepper-nav:w-0.5',
        className,
      )}
      {...props}
    >
      <motion.span
        data-slot="stepper-separator-fill"
        className="absolute inset-0 origin-top-left rounded-sm bg-primary"
        initial={false}
        animate={
          orientation === 'vertical'
            ? { scaleY: filled ? 1 : 0 }
            : { scaleX: filled ? 1 : 0 }
        }
        // `spring.fill`, the token the progress bar's own fill takes: progress
        // arrives in discrete jumps and a spring is what turns those into one
        // movement rather than a series of steps.
        transition={spring.fill}
      />
    </div>
  )
}

export {
  stepperNav as stepperNavVariants,
  stepperTrigger as stepperTriggerVariants,
  stepperIndicator as stepperIndicatorVariants,
}
