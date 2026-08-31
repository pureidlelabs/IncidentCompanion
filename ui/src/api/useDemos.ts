/**
 * `GET /api/demos` - the picker's Demo cases pane.
 *
 * The roster is data: nothing here or in the pane names a demo, so an install
 * whose registry differs renders a different pane with no code change.
 *
 * **The endpoint survives the rewrite, and briefly did not.** It was deleted
 * on the assumption that a demo is just a case with a flag, so the pane could
 * filter the case list. It is not: `scenario`, `scale` and `glyph` describe
 * the demo as a *showcase entry* - the incident class shown as the card's
 * chip, and the glyph that stopped every card drawing the same icon - and none
 * of them is case data. Deriving from the case list drew six identical
 * unlabelled cards.
 *
 * **What did change is `id`.** Each card carries the seeded case's id, so
 * opening a demo is a link. It used to be `POST /api/demos/{id}`, which built
 * the case and returned it - the demos are rebuilt at server start now, so
 * there is nothing to build and nothing to refuse an analyst who cannot write.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface DemoCase {
  /** The seeded case, to link into. */
  id: string
  /** Python's reserved `case_id`, kept as the human reference. */
  reference: string
  customer: string
  title: string
  /** The incident class. Never restates `scale`. */
  scenario: string
  scale: string
  /** A key into the picker's own icon table - `demoGlyph`. Never a class name
   *  or a URL: the server has no idea what this client draws with. */
  glyph: string
  summary: string
}

export function useDemos(): UseQueryResult<DemoCase[]> {
  return useQuery({
    queryKey: keys.demos(),
    queryFn: () => request<DemoCase[]>('/demos'),
  })
}
