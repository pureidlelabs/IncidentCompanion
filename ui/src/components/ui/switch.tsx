import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import {
  SwitchButton,
  SwitchField,
  Text,
  composeRenderProps,
  type SwitchFieldProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { spring } from '@/lib/motion'

/** The pressable row: the track, then the label. `SwitchButton` renders a `<label>`. */
const row = tv({
  base: 'group flex items-center gap-2 text-sm transition-colors select-none',
  variants: {
    isDisabled: { true: 'opacity-50' },
  },
})

/**
 * The track. It carries the focus ring, so a keyboard focus rings the control.
 *
 * `border-transparent` rather than padding: the ring lands on the border, and a
 * padded track would leave the ring a step away from the handle it surrounds.
 *
 * **The throw is `justify-content`, not a translate.** The track flips between
 * `justify-start` and `justify-end` and the handle is a layout-animated
 * `motion` element, so the distance is measured from the two boxes rather than
 * declared - which is what the handle's `translate-x-[calc(100%-2px)]` used to
 * be, and it had to be re-derived for every track width.
 * -> https://motion.dev/examples/react-base-switch
 */
const track = tv({
  base: [
    'inline-flex shrink-0 items-center rounded-full border border-transparent',
    'outline-none transition-colors',
  ],
  variants: {
    size: {
      sm: 'h-3.5 w-6',
      md: 'h-4.5 w-8',
    },
    isSelected: {
      false: 'justify-start bg-input dark:bg-input/80 group-pressed:border-ring',
      true: 'justify-end bg-primary forced-colors:bg-[Highlight]',
    },
    isFocusVisible: { true: 'border-ring ring-3 ring-ring/50' },
    isDisabled: { true: 'border-border forced-colors:border-[GrayText]' },
  },
  defaultVariants: { size: 'md' },
})

/**
 * The handle. It carries no transform and no `transition-*`: its position comes
 * from the track's `justify-content`, and Motion measures the move.
 *
 * A Tailwind `transition-transform` here would fight the layout animation for
 * the same property and read as a stutter.
 * -> https://motion.dev/docs/react-layout-animations
 */
const handle = tv({
  base: 'pointer-events-none block rounded-full bg-background ring-0',
  variants: {
    size: {
      sm: 'size-3',
      md: 'size-4',
    },
    isSelected: {
      false: 'dark:bg-ink',
      true: 'dark:bg-on-primary forced-colors:bg-[HighlightText]',
    },
  },
  defaultVariants: { size: 'md' },
})

// Spelled out, not derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the docs page loses the prop.
export interface SwitchLook {
  /** Track height: 14px or 18.4px. */
  size?: 'sm' | 'md'
}

export interface SwitchProps extends SwitchFieldProps, SwitchLook {
  /** The label, beside the track. Without one, pass `aria-label`. */
  children?: ReactNode
  /** One line under the switch. */
  description?: string | undefined
}

/**
 * A setting that takes effect the moment it moves.
 *
 * Announces as `role="switch"`. Takes `isSelected`/`onChange`, not `checked`;
 * disable with `isDisabled`. Use a `Checkbox` where the change applies on
 * submit instead.
 */
export function Switch({ size, children, description, ...props }: SwitchProps) {
  return (
    <SwitchField data-slot="switch" {...props} className="group flex flex-col gap-1">
      <SwitchButton
        className={composeRenderProps(props.className, (className, renderProps) =>
          row({ ...renderProps, className }),
        )}
      >
        {composeRenderProps(children, (resolved, renderProps) => (
          <>
            <span className={track({ ...renderProps, size })}>
              <motion.span
                layout
                transition={spring.control}
                data-slot="switch-handle"
                className={handle({ ...renderProps, size })}
              />
            </span>
            {resolved}
          </>
        ))}
      </SwitchButton>
      {description === undefined ? null : (
        <Text slot="description" className="ms-10 text-sm text-ink-muted">
          {description}
        </Text>
      )}
    </SwitchField>
  )
}
