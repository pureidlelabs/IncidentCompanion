/**
 * **What the analyst chose is checked here, not at the route.**
 *
 * `JSON.parse(...) as PackUpload` was an assertion rather than a check, so a
 * package-lock, a settings export and an array of strings were all valid JSON
 * and all reached the server -- coming back as a 422 naming body fields the
 * analyst never typed. Each refusal below is about the file they picked.
 *
 * **What this does not cover:** that a pack the checks pass is one this
 * install can print. Whether a key is one the app has a place for is the
 * server's, measured against its own key set. -> #664
 */
import { describe, expect, it } from 'vitest'

import { ApiError } from './client'
import { packFromFile, type PackUpload } from './languages'

const asFile = (body: string) => new File([body], 'pack.json', { type: 'application/json' })
const pack = (over: Record<string, unknown> = {}) =>
  asFile(
    JSON.stringify({
      code: 'de',
      label: 'Deutsch',
      strings: { 'heading.evidence': 'Beweise' },
      ...over,
    }),
  )

/** The refusal, or a failure naming what got through instead. */
async function refusalOf(file: File): Promise<ApiError> {
  let taken: PackUpload | undefined
  try {
    taken = await packFromFile(file)
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error(`that file was taken as a pack rather than refused: ${JSON.stringify(taken)}`)
}

describe('a file offered as a language pack', () => {
  it('passes a pack through carrying only what the route takes', async () => {
    const taken = await packFromFile(pack({ installedAt: '2026-01-01', coverage: 1 }))

    expect(taken).toEqual({
      code: 'de',
      label: 'Deutsch',
      strings: { 'heading.evidence': 'Beweise' },
    })
  })

  it.each([
    ['is not JSON at all', asFile('notes, not a pack'), /not JSON/i],
    ['is a JSON array', asFile('["de", "Deutsch"]'), /not a language pack/i],
    ['is a bare JSON string', asFile('"Deutsch"'), /not a language pack/i],
    ['names no code', pack({ code: undefined }), /no language code/i],
    ['names an empty code', pack({ code: '' }), /no language code/i],
    ['names no language', pack({ label: undefined }), /names no language/i],
    ['carries no strings', pack({ strings: undefined }), /no strings/i],
    ['carries strings as a list', pack({ strings: ['Beweise'] }), /no strings/i],
    [
      'carries a string that is a number',
      pack({ strings: { 'heading.evidence': 7 } }),
      /not text/i,
    ],
  ])('is refused where it %s', async (_what, file, says) => {
    const refusal = await refusalOf(file)

    expect(refusal.status).toBe(422)
    expect(refusal.message).toMatch(says)
  })

  /**
   * **The read is what has to be bounded, not the request.** `file.text()`
   * pulls the whole file into the tab before anything can look at it, so a
   * video chosen by mistake freezes the screen where a refusal belongs -- and
   * the route never hears about it either way.
   */
  it('is refused where it is far larger than any pack, without being read', async () => {
    const refusal = await refusalOf(
      new File(['x'.repeat(2 * 1024 * 1024)], 'holiday.mp4', { type: 'application/json' }),
    )

    expect(refusal.status).toBe(422)
    expect(refusal.message).toMatch(/too large/i)
  })
})
