import { switcherRows } from '@/components/blocks/case-frame'
import { sessionRows as productSessionRows } from '@/components/blocks/session-menu'

/**
 * The rail's two menus, for the stories that draw a rail.
 *
 * Here rather than in one story file because three of them draw the same rail:
 * `RailHeader`, `RailUser` and the composed `AppShell`. Written twice, the
 * shell went on showing an older menu after the block's own story had moved on.
 *
 * **The rows are the product's; the sample is what they are called with.**
 * They were written out again here, and both copies drifted -- which is the
 * thing the gallery exists to make impossible. Both blocks still take their
 * menu from the caller, since what signing out does is not a block's
 * business, and that is what these no-op callbacks stand in for.
 */

/**
 * What the case switcher offers, built from the product's own rows.
 *
 * **A sample of the cases, never a second copy of the rows.** Written out
 * again here, this drifted furthest: the gallery offered *Rename* and *Case
 * settings* rows the app has never drawn.
 */
export const caseSwitcherRows = switcherRows(
  'Northwind Freight',
  [
    { id: '0448', reference: 'INC-0448' },
    { id: '0449', reference: 'INC-0449' },
  ],
  () => undefined,
)

/**
 * The signed-in analyst's own menu, built from the product's own rows.
 *
 * **A sample of the callbacks, never a second copy of the rows.** Written out
 * again here, this drifted: the gallery went on saying *Appearance* after the
 * app renamed the section *Ground*, and advertised a shift-command-Q on *Sign out*
 * that no chord in the registry produces. The block takes what signing out
 * does from its caller, which is what the sample supplies.
 */
export const sessionRows = productSessionRows(
  'analyst@example.test',
  'system',
  () => undefined,
  () => undefined,
  () => undefined,
  () => undefined,
)
