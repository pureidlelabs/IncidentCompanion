import { switcherRows } from '@/components/blocks/case-frame'
import { sessionRows as productSessionRows } from '@/components/blocks/session-menu'

/**
 * The rail's two menus, for the stories that draw a rail.
 */

/**
 * What the case switcher offers, built from the product's own rows.
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
 */
export const sessionRows = productSessionRows(
  'analyst@example.test',
  'system',
  () => undefined,
  () => undefined,
  () => undefined,
  () => undefined,
)
