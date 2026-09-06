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
 * **`id` is the seeded case's**, so opening a demo is a link rather than a
 * `POST` that builds one. The demos are rebuilt at server start, so there is
 * nothing to build and nothing to refuse an analyst who cannot write.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface DemoCase {
  /** The seeded case, to link into. */
  id: string
  /** The human reference, as against the uuid above it. */
  reference: string
  customer: string
  title: string
  /** The incident class. Never restates `scale`. */
  scenario: string
  scale: string
  /** A key the client resolves to an icon. Never a class name or a URL: the
   *  server has no idea what this client draws with. */
  glyph: string
  summary: string
}

export function useDemos(): UseQueryResult<DemoCase[]> {
  return useQuery({
    queryKey: keys.demos(),
    queryFn: () => request<DemoCase[]>('/demos'),
  })
}
