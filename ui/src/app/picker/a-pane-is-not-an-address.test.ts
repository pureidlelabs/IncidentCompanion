/**
 * What a typed `/<pane>` reaches, which is the picker rather than the pane.
 *
 * Not the guard. What refuses the reads behind a hidden pane is the server,
 * whatever is typed. -> `server/test/analyst-privilege.test.ts`
 */
import { matchRoutes } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { router } from '@/app/routes'
import { PICKER_PANES } from '@/components/blocks/picker-panes'

const last = (path: string) => matchRoutes(router.routes, path)?.at(-1)

const redirect = (path: string): string | undefined =>
  (last(path)?.route.element as ReactElement<{ to?: string }> | undefined)?.props.to

describe('a typed picker address', () => {
  // `cases` is the picker's own address, so it redirects nowhere.
  it.each(PICKER_PANES.filter((pane) => pane !== 'cases'))(
    'sends /%s to the picker rather than to the pane',
    (pane) => {
      expect(redirect(`/${pane}`)).toBe('/cases')
    },
  )

  it('reads a pane name under it as a case id', () => {
    expect(last('/cases/health')?.params).toEqual({ caseId: 'health' })
  })
})
