import { type ReactNode } from 'react'

import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/cn'

export interface WizardStep {
  /** Matched against `current`. */
  key: string
  label: string
  /** One line under the label. */
  hint?: string | undefined
}

/**
 * A stepped task: the rail, the current step's body, and the row that moves between them.
 *
 * - Steps are read-only. `StepperItem` is `disabled`, so the rail reports
 *   progress and the `actions` row is what advances it.
 * - Step state is derived from `current`; nothing passes `completed`.
 * - `busy` swaps the active step's number for a spinner and nothing else.
 * - `vertical` puts the rail beside the body; `horizontal` puts it above.
 */
export function Wizard({
  steps,
  current,
  orientation = 'horizontal',
  label,
  busy = false,
  actions,
  children,
  className,
}: {
  steps: readonly WizardStep[]
  /** The `key` of the step being shown. Unmatched shows no step as current. */
  current: string
  orientation?: 'horizontal' | 'vertical' | undefined
  /** Names the rail for a screen reader. */
  label: string
  /** Spins the active step's indicator. */
  busy?: boolean | undefined
  /** The row that advances and retreats. Absent renders no row. */
  actions?: ReactNode | undefined
  children: ReactNode
  className?: string | undefined
}) {
  const at = steps.findIndex((step) => step.key === current)
  const vertical = orientation === 'vertical'

  const rail = (
    <Stepper
      value={at + 1}
      orientation={orientation}
      aria-label={label}
      className={vertical ? 'shrink-0' : ''}
    >
      <StepperNav className={vertical ? 'flex-col items-start gap-0' : ''}>
        {steps.map((step, index) => (
          <StepperItem key={step.key} step={index + 1} disabled>
            <StepperTrigger>
              <StepperIndicator>
                {/* The kit's spinner rather than a glyph of this block's own:
                    one implementation, guarded in one place, and one size
                    ladder. `aria-hidden` because the step's own title is beside
                    it and says which step is working. */}
                {busy && index === at ? (
                  <Spinner size="sm" aria-hidden />
                ) : (
                  index + 1
                )}
              </StepperIndicator>
              <span className="flex flex-col items-start text-left">
                <StepperTitle>{step.label}</StepperTitle>
                {step.hint !== undefined && <StepperDescription>{step.hint}</StepperDescription>}
              </span>
            </StepperTrigger>
            {index < steps.length - 1 && <StepperSeparator />}
          </StepperItem>
        ))}
      </StepperNav>
    </Stepper>
  )

  return (
    <div className={cn('flex min-h-0 flex-col gap-4', className)}>
      <div className={cn('flex min-h-0 flex-1', vertical ? 'gap-6' : 'flex-col gap-4')}>
        {rail}
        <div className="flex min-h-0 flex-1 flex-col gap-4">{children}</div>
      </div>
      {actions !== undefined && (
        <div className="flex shrink-0 items-center justify-end gap-2">{actions}</div>
      )}
    </div>
  )
}
