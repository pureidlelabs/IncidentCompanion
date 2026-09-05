import { beforeEach, describe, expect, it } from 'vitest'

import {
  reportBulkMissing,
  reportImportedCase,
  reportWriteFailure,
  toast,
  toastQueue,
} from './notify'

/**
 * The wording, the tone and the timeout of every raised toast.
 *
 * What it still cannot see is whether a queued toast renders, or whether a
 * screen reader reaches it. That is `notify-render.test.tsx`.
 */
beforeEach(() => {
  toastQueue.clear()
})

/** The queue caps visible toasts, so every case raises one and reads it back. */
function raised() {
  const [only] = toastQueue.visibleToasts
  if (only === undefined) throw new Error('nothing was raised')
  return only
}

describe('reportBulkMissing', () => {
  it('says nothing when every id was found', () => {
    reportBulkMissing([], 'systems')
    expect(toastQueue.visibleToasts).toHaveLength(0)
  })

  it('names the stale ids, singular for one', () => {
    reportBulkMissing(['s2'], 'systems')
    expect(raised().content.title).toBe('1 systems was no longer there.')
    expect(raised().content.tone).toBe('warning')
  })

  it('names the stale ids, plural for more than one', () => {
    reportBulkMissing(['s2', 's5'], 'systems')
    expect(raised().content.title).toBe('2 systems were no longer there.')
  })
})

describe('a refused write outlasts the others', () => {
  /**
   * **The one behaviour that survived three library moves**, and the reason it
   * is asserted rather than left to the library's default: an error is the
   * single case where the screen shows the opposite of what happened, so a
   * timeout would take the only account of a rolled-back edit with it.
   */
  it('gives an error no timeout at all', () => {
    toast.error('nope')
    expect(raised().timeout).toBeUndefined()
    expect(raised().timer).toBeUndefined()
  })

  /**
   * The other half, and the one an error-only assertion cannot make: a toast
   * that never goes away is a defect on every tone but one.
   */
  it('gives every other tone a timeout that expires', () => {
    for (const tone of ['plain', 'warning', 'success'] as const) {
      toastQueue.clear()
      const raise = tone === 'plain' ? toast : toast[tone]
      raise('something happened')
      expect(raised().timeout, `${tone} toasts never dismiss themselves`).toBeGreaterThan(0)
    }
  })

  it('draws four distinct tones', () => {
    const tones = (['plain', 'error', 'warning', 'success'] as const).map((tone) => {
      toastQueue.clear()
      const raise = tone === 'plain' ? toast : toast[tone]
      raise('something happened')
      return raised().content.tone
    })
    expect(new Set(tones).size, 'two tones map to one colour').toBe(4)
  })
})

/**
 * **`reportWriteFailure` had no test of its own** for a long time, which is
 * how three branches that read very differently to an analyst went uncovered:
 * a row somebody has *open*, a row somebody has already *written*, and a write
 * the server refused.
 */
describe('reporting a refused write', () => {
  it('draws a card, not a sentence, when the server refused the values', async () => {
    const { ApiError } = await import('@/api/client')

    reportWriteFailure(
      new ApiError(422, 'Validation failed', {
        errors: [{ path: ['value'], message: 'Too small' }],
      }),
      'Indicators',
    )

    expect(raised().content.render, 'a refusal naming fields drew a sentence').toBeTypeOf(
      'function',
    )
    expect(raised().timeout, 'a refusal an analyst has not read dismissed itself').toBeUndefined()
  })

  /**
   * **A 409 is not an error and keeps its sentence.**
   */
  it('warns rather than refusing when another analyst holds the row', async () => {
    const { ApiError } = await import('@/api/client')

    reportWriteFailure(new ApiError(409, 'Open elsewhere.', { heldBy: 'Ada' }), 'Systems')

    expect(raised().content.title).toBe('Ada has Systems open.')
    expect(raised().content.tone).toBe('warning')
    expect(raised().content.render).toBeUndefined()
  })

  it('warns that somebody saved first when the conflict names no holder', async () => {
    const { ApiError } = await import('@/api/client')

    reportWriteFailure(new ApiError(409, 'Version behind.', {}), 'Systems')

    expect(raised().content.title).toBe('Another analyst saved Systems first.')
  })

  /**
   * A thrown `TypeError` from a dropped connection reaches the same reporter as
   * a 422, and it names no fields.
   */
  it('draws the card for a failure that is not an ApiError at all', () => {
    reportWriteFailure(new TypeError('Failed to fetch'), 'Systems')

    expect(raised().content.render).toBeTypeOf('function')
    expect(raised().timeout).toBeUndefined()
  })

  /**
   * **The card is not the accessible name.**
   */
  it('gives the custom card a title to be announced by', () => {
    reportWriteFailure(new TypeError('Failed to fetch'), 'Systems')

    expect(raised().content.title).toBe('Systems was not saved.')
  })
})

describe('reportImportedCase', () => {
  it('says what arrived when the archive carried every file its rows name', () => {
    reportImportedCase({ rows: 86, missingFiles: 0 })

    expect(raised().content.title).toBe('86 rows imported.')
    expect(raised().content.tone).toBe('success')
    expect(raised().content.description).toBeUndefined()
  })

  /**
   * **The count the analyst cannot recover by looking.**
   */
  it('names the attachments the archive did not carry', () => {
    reportImportedCase({ rows: 86, missingFiles: 12 })

    expect(raised().content.title).toBe('86 rows imported.')
    expect(raised().content.description).toBe(
      '12 attachments the rows name are not in the archive.',
    )
  })

  /**
   * A handover export omits every attachment on purpose, so this is the
   * ordinary case rather than a fault: it is told as a warning, which is the
   * tone for something worth reading and not for something that went wrong.
   */
  it('tells a missing attachment as a warning rather than a failure', () => {
    reportImportedCase({ rows: 4, missingFiles: 4 })

    expect(raised().content.tone).toBe('warning')
  })

  it('speaks of one row and one attachment in the singular', () => {
    reportImportedCase({ rows: 1, missingFiles: 1 })

    expect(raised().content.title).toBe('1 row imported.')
    expect(raised().content.description).toBe(
      '1 attachment the rows name is not in the archive.',
    )
  })
})
