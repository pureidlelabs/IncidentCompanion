import type { ReactNode } from 'react'

import { AuthAtmosphere } from '@/components/blocks/auth-atmosphere'
import { AuthMasthead } from '@/components/blocks/auth-masthead'

/**
 * The frame every unauthenticated screen is drawn in: sign in, the first-run
 * claim, and the forced password change.
 */
export function AuthFrame({
  title,
  lede,
  mark,
  atmosphere,
  corner,
  children,
}: {
  title: string
  /** One line under the title, centred with the mark as the masthead's third line. */
  lede?: string | undefined
  /** The masthead's glyph, above the title. */
  mark?: ReactNode | undefined
  /**
   * What the wide pane says, over the field.
   */
  atmosphere?: ReactNode | undefined
  /** The top-right cluster: theme, an About door. Two or three icon controls. */
  corner?: ReactNode | undefined
  /** The form. */
  children: ReactNode
}) {
  return (
    <div data-slot="auth-layout" className="relative flex min-h-screen">
      <AuthAtmosphere>{atmosphere}</AuthAtmosphere>

      {/* **A fixed pane, not a half.** At `w-1/2` the pane grew with the
          window while the form inside it stayed 384px, so a wide screen spent
          the extra on padding either side of an unchanged card - 448px of it
          at 2560. Wide enough for `--field-max` plus this padding, with room
          for the setup screen's longer labels. */}
      <main className="relative z-10 flex w-full shrink-0 items-center justify-center bg-card p-6 [--auth-pane-w:30rem] lg:w-(--auth-pane-w) lg:border-l">
        <div className="w-full max-w-sm [--control-h-md:2.75rem]">
          <AuthMasthead title={title} lede={lede} mark={mark} />
          <div className="mt-9">{children}</div>
        </div>
      </main>

      {corner !== undefined && (
        <div className="absolute top-3.5 right-4 z-20 flex items-center gap-1">{corner}</div>
      )}
    </div>
  )
}
