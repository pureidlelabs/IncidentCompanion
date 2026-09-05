import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { LabelledSeparator } from '@/components/ui/separator'
import { cn } from '@/lib/cn'

/** One identity provider this install will accept a sign-in from. */
export interface SsoProvider {
  /** Stable across renders; the value handed back to `onChoose`. */
  id: string
  /** On the button, after `Continue with`. */
  name: string
  /** The provider's own mark, drawn at 16px. */
  mark?: ReactNode | undefined
  /** Without it the button is drawn disabled. */
  onChoose?: (() => void) | undefined
}

export interface SsoSignInProps {
  providers: readonly SsoProvider[]
  /** The word set into the rule under the providers. */
  divider?: string | undefined
  /** Drawn under the rule instead of it, when the install offers no password. */
  soleMeans?: boolean | undefined
  className?: string | undefined
}

/**
 * The providers an install will take a sign-in from, over the rule that
 * separates them from the password form.
 *
 * Draws the rule itself rather than leaving it to the screen: the gap above
 * and below it is the only thing saying the two are alternatives rather than
 * steps, and a screen that forgets it stacks a provider button on a username
 * field with nothing between them.
 *
 * `soleMeans` is the install with no local passwords at all. The rule goes,
 * because there is nothing on the other side of it.
 */
export function SsoSignIn({
  providers,
  divider = 'or',
  soleMeans = false,
  className,
}: SsoSignInProps) {
  if (providers.length === 0) return null

  return (
    <div data-slot="sso-sign-in" className={cn('flex w-full flex-col gap-3', className)}>
      {providers.map((provider) => (
        <Button
          key={provider.id}
          variant="outline"
          size="lg"
          className="w-full justify-center gap-2"
          isDisabled={provider.onChoose === undefined}
          {...(provider.onChoose ? { onPress: provider.onChoose } : {})}
        >
          {provider.mark}
          Continue with {provider.name}
        </Button>
      ))}
      {soleMeans ? null : <LabelledSeparator spacing="sm">{divider}</LabelledSeparator>}
    </div>
  )
}

/**
 * Microsoft's four squares, inline.
 *
 * Brand hex rather than a token: the mark is the same four colours on every
 * ground, and a themed one is a different company's logo.
 */
export function EntraMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" focusable="false">
      <rect x="0" y="0" width="7" height="7" fill="#f25022" />
      <rect x="9" y="0" width="7" height="7" fill="#7fba00" />
      <rect x="0" y="9" width="7" height="7" fill="#00a4ef" />
      <rect x="9" y="9" width="7" height="7" fill="#ffb900" />
    </svg>
  )
}

/** The provider this product is asked for by name. */
export const ENTRA: SsoProvider = {
  id: 'entra',
  name: 'Microsoft Entra ID',
  mark: <EntraMark />,
}
