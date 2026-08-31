import type { ComponentProps } from 'react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

/** One key on a keyboard, as it appears in a shortcut. */
const kbd = tv({
  base: [
    'pointer-events-none inline-flex w-fit shrink-0 items-center justify-center gap-1',
    'rounded-sm bg-muted font-sans font-medium text-ink-muted select-none',
    '[&_svg:not([class*=size-])]:size-3',
  ],
  variants: {
    size: {
      sm: 'h-4 min-w-4 px-1 text-2xs',
      md: 'h-5 min-w-5 px-1 text-xs',
    },
  },
  defaultVariants: { size: 'sm' },
})

/** Which keyboard the shortcut is being read on. */
export type KbdPlatform = 'mac' | 'pc'

/** A key whose printing differs between keyboards. */
export type KbdKeyName =
  | 'mod'
  | 'ctrl'
  | 'alt'
  | 'shift'
  | 'meta'
  | 'enter'
  | 'backspace'
  | 'delete'
  | 'escape'
  | 'tab'
  | 'up'
  | 'down'
  | 'left'
  | 'right'

// macOS prints the modifiers as glyphs; every other keyboard spells them.
// `mod` is the platform's own accelerator - Command on a Mac, Control
// elsewhere - which is the one a shortcut usually means.
const keyLabels: Record<KbdKeyName, Record<KbdPlatform, string>> = {
  mod: { mac: '\u2318', pc: 'Ctrl' },
  ctrl: { mac: '\u2303', pc: 'Ctrl' },
  alt: { mac: '\u2325', pc: 'Alt' },
  shift: { mac: '\u21E7', pc: 'Shift' },
  meta: { mac: '\u2318', pc: 'Win' },
  enter: { mac: '\u23CE', pc: 'Enter' },
  backspace: { mac: '\u232B', pc: 'Backspace' },
  delete: { mac: '\u2326', pc: 'Delete' },
  escape: { mac: '\u238B', pc: 'Esc' },
  tab: { mac: '\u21E5', pc: 'Tab' },
  up: { mac: '\u2191', pc: '\u2191' },
  down: { mac: '\u2193', pc: '\u2193' },
  left: { mac: '\u2190', pc: '\u2190' },
  right: { mac: '\u2192', pc: '\u2192' },
}

// Detection rather than a prop, because a shortcut printed on screen has to
// match the keyboard in front of the analyst; `platform` overrides it only so
// a story or a doc page can show both.
function detectPlatform(): KbdPlatform {
  if (typeof navigator === 'undefined') return 'pc'
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mac' : 'pc'
}

const runtimePlatform: KbdPlatform = detectPlatform()

/** How a named key prints on one keyboard. `Kbd`'s `keyName` renders this. */
export function kbdKeyLabel(keyName: KbdKeyName, platform: KbdPlatform = runtimePlatform): string {
  return keyLabels[keyName][platform]
}

// Spelled out rather than derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the prop vanishes from the docs page.
export interface KbdLook {
  /** Cap height. `sm` sits inside a line of body text. */
  size?: 'sm' | 'md'
}

export interface KbdProps extends ComponentProps<'kbd'>, KbdLook {
  /** A key that prints differently per keyboard. Renders the right form and replaces `children`. */
  keyName?: KbdKeyName
  /** Which keyboard to print for. Defaults to the one this browser is running on. */
  platform?: KbdPlatform
}

/** A key cap. Write the key as the analyst reads it on their keyboard. */
export function Kbd({ size, keyName, platform, className, children, ...props }: KbdProps) {
  const resolved = platform ?? runtimePlatform
  const label = keyName === undefined ? children : kbdKeyLabel(keyName, resolved)
  return (
    <kbd
      data-slot="kbd"
      {...props}
      data-platform={keyName === undefined ? undefined : resolved}
      className={kbd({ size, className })}
    >
      {label}
    </kbd>
  )
}

export type KbdGroupProps = ComponentProps<'div'>

/** A chord: several caps, kept on one line. */
export function KbdGroup({ className, ...props }: KbdGroupProps) {
  return (
    <div
      data-slot="kbd-group"
      {...props}
      className={cn(
        'inline-flex items-center gap-1 text-2xs text-ink-muted',
        className,
      )}
    />
  )
}

export { kbd as kbdVariants }
