/**
 * **The Library rail led to three refusals, and each looked like a fault.**
 *
 * A pane drawing the application's refused-write card is how the demo says "not
 * here", which is right for a screen with nothing to show a single visitor -
 * Accounts, Administration, the install log. The library is not one of those:
 * it ships with content, every install has it from the moment it is installed,
 * and a visitor refused it reads the absence as the demo being broken rather
 * than as a boundary somebody drew.
 *
 * These are written against the two ways serving it goes wrong quietly: a
 * route matching the first segment alone, which answers the editor's own path
 * with a listing it cannot read, and an unknown slug answered with something
 * rather than refused.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { handle } from './handler'
import { freshState, type DemoState } from './state'

let state: DemoState

beforeEach(() => {
  state = freshState()
})

/** The half of a listing these read, plus the refusal's own empty body. */
interface Answered {
  slug?: string
  entries?: { label: string; description: string; canEdit: boolean; origin: string }[]
}

const read = async (path: string) => {
  const answer = await handle(state, `/api${path}`, {})
  const text = await answer.text()
  return {
    status: answer.status,
    body: text === '' ? {} : (JSON.parse(text) as Answered),
  }
}

describe('the demo library', () => {
  it('answers each kind the rail offers', async () => {
    for (const slug of ['templates', 'report-layouts', 'report-snippets']) {
      const { status, body } = await read(`/library/${slug}`)
      expect(status, slug).toBe(200)
      expect(body.slug, slug).toBe(slug)
      expect(body.entries?.length ?? 0, `${slug} holds entries`).toBeGreaterThan(0)
    }
  })

  it('gives every entry the second line the pane draws', async () => {
    const { body } = await read('/library/report-layouts')

    expect(body.entries?.filter((one) => one.description.trim() === '')).toEqual([])
  })

  it('refuses a slug no library answers to', async () => {
    // Answered rather than refused, a typo draws an empty pane, which is the
    // picture of a library that exists and holds nothing.
    expect((await read('/library/nonesuch')).status).toBe(404)
  })

  it('refuses the editor rather than answering it with the listing', async () => {
    // A route matching the first segment alone hands the editor a listing. It
    // cannot read one, so it draws an empty form: a write screen over content
    // that was never loaded. Which refusal it is is the demo's own business -
    // what this holds is that it is one, and that it carries no entries.
    const { status, body } = await read('/library/templates/phishing/editor')

    expect(status).toBeGreaterThanOrEqual(400)
    expect(body.entries).toBeUndefined()
  })

  it('offers no entry for editing, because every one of them ships', async () => {
    const { body } = await read('/library/templates')

    expect(body.entries?.every((one) => !one.canEdit && one.origin === 'built-in')).toBe(true)
  })
})
