/**
 * The rail offers what the account may use.
 *
 * Three of the five System panes are served entirely by `@AdminOnly`
 * controllers. Report languages is not: its `@Get()` is open and only the
 * upload and the delete are admin, which is why this asks per pane.
 */
import { describe, expect, it } from 'vitest'

import { PICKER_GROUPS, panesFor, type PickerPane } from './picker-panes'

const named = (groups: ReturnType<typeof panesFor>): PickerPane[] =>
  groups.flatMap((group) => group.rows.map((row) => row.pane))

describe('the picker rail', () => {
  it('offers an administrator every pane', () => {
    expect(named(panesFor({ admin: true }))).toEqual(
      PICKER_GROUPS.flatMap((group) => group.rows.map((row) => row.pane)),
    )
  })

  it('does not offer an analyst a pane every route of which refuses them', () => {
    const offered = named(panesFor({ admin: false }))

    expect(offered).not.toContain('accounts')
    expect(offered).not.toContain('activity')
    expect(offered).not.toContain('administration')
    // What the install is made of, rather than what a case holds: both of
    // Health's routes are `@AdminOnly()`, and the row was kept when they were
    // not. -> `server/test/analyst-privilege.test.ts`
    expect(offered).not.toContain('health')
  })

  it('still offers an analyst the panes they may read', () => {
    const offered = named(panesFor({ admin: false }))

    // Its list is an open `@Get()`; only the upload and the delete are admin.
    expect(offered).toContain('languages')
    // And nothing outside the System group moved.
    expect(offered).toContain('cases')
    expect(offered).toContain('reports')
  })

  it('drops a group left with no rows rather than drawing its heading', () => {
    for (const group of panesFor({ admin: false })) {
      expect(group.rows.length, group.label).toBeGreaterThan(0)
    }
  })
})
