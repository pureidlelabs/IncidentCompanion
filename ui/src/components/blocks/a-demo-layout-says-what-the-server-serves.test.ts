import { describe, expect, it } from 'vitest'

import served from '@/demo/catalogue/report-layouts.json'

import { DEMO_LAYOUTS } from './report-layouts'

/**
 * The client's own layouts say what the route answers with.
 *
 * `DEMO_LAYOUTS` is written in the client and every story runs on it, so a
 * story asserting a field is asserting a copy the client wrote itself. The
 * catalogue is generated from the server's own builtins, which makes it the
 * one artefact in this tree that can tell the two apart. -> #954
 *
 * **Names and steps, not the whole shape.** A chip label is resolved through
 * a language pack and a summary is prose an operator edits, so holding the
 * whole layout equal would go red on work that changed nothing this is about.
 */
const stages = (layouts: readonly { name: string; nis2: boolean; stage: string }[]) =>
  layouts
    .filter((one) => one.nis2)
    .map((one) => `${one.name} -> ${one.stage}`)
    .sort()

describe('a demo layout says what the server serves', () => {
  it('offers the regulatory layouts the route offers', () => {
    const fromServer = stages(served.layouts)

    expect(
      fromServer.length,
      'the catalogue carries no regulatory layout to compare',
    ).toBeGreaterThan(0)
    expect(
      stages(DEMO_LAYOUTS),
      'the client fixture and the served catalogue disagree about which step a filing is',
    ).toEqual(fromServer)
  })
})
