import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { cn } from '@/lib/cn'

/**
 * What an analyst who cannot produce the credential does next.
 *
 * A sentence rather than a link, because recovery here goes through an
 * administrator: there is no self-service route to send anybody to, and a
 * link drawn where none exists is worse than saying so.
 */
export type AuthFormRecovery = string

export interface AuthFormProps {
  /** The fields, and anything the caller draws above them. */
  children: ReactNode
  /** The submit's words at rest. */
  submit: string
  /** The submit's words while the exchange is in flight. */
  pending: string
  /** The exchange is in flight: the submit swaps words and shows it is working. */
  isPending?: boolean | undefined
  /** A complete form. The browser is already stopped from posting it. */
  onSubmit: () => void
  /**
   * `native` gates the submit on the platform's own validity check, so an
   * incomplete form is refused rather than advised. The kit's default is
   * advice, which marks a field and lets the submit through.
   */
  validationBehavior?: 'aria' | 'native' | undefined
  /** What to do about a credential nobody can produce, above the submit. */
  recovery?: AuthFormRecovery | undefined
  /** `roomy` is the wider rhythm a short form can afford. */
  gap?: 'normal' | 'roomy' | undefined
}

/**
 * The form an unauthenticated screen submits a credential through: a stack of
 * fields, an optional way out, and one submit that says what it is doing.
 *
 * **The browser never posts it.** Every caller here answers a submit by
 * calling a server itself, so the default action is stopped in one place
 * rather than in each screen's handler -- forgetting it reloads the page and
 * leaves every assertion about the handler passing.
 *
 * **The submit is the view's one filled control**, at the foot and after
 * everything the caller drew, so the last tab stop is the thing that acts.
 *
 * The words are all the caller's. Nothing here names a product, a route or a
 * credential.
 */
export function AuthForm({
  children,
  submit,
  pending,
  isPending = false,
  onSubmit,
  validationBehavior,
  recovery,
  gap = 'normal',
}: AuthFormProps) {
  return (
    <Form
      {...(validationBehavior === undefined ? {} : { validationBehavior })}
      className={cn('flex flex-col', gap === 'roomy' ? 'gap-5' : 'gap-4')}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {children}

      {recovery !== undefined && <p className="text-xs text-ink-muted">{recovery}</p>}

      <Button type="submit" size="lg" isPending={isPending} stateKey={isPending ? 'busy' : 'idle'}>
        {isPending ? pending : submit}
      </Button>
    </Form>
  )
}
