/**
 * Whatever an image carries beside the picture does not survive re-encoding.
 *
 * *GIVEN an image carrying material beyond the picture itself, WHEN it is
 * stored, THEN what is served carries none of it.*
 *
 * A photograph carries where it was taken, on what, and often by whom. An
 * avatar is drawn wherever the analyst is drawn, so an install that served back
 * what it was handed would publish an analyst's home coordinates to everyone
 * who can see their name.
 *
 * **The fixture is asserted to carry the marker before anything is done to
 * it.** Without that this passes on an input that never held it, which is the
 * shape a metadata test fails in: the assertion is an absence, and absence is
 * what a broken fixture produces.
 *
 * `avatar-image.test.ts` covers the sniffing and that a PNG is re-encoded at
 * all. What is here is what the re-encoding drops.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { toPng } from './avatar-image.js'

/** Distinctive enough that finding it in the output cannot be a coincidence. */
const MARKER = 'IncidentCompanionMetadataProbe'

const picture = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 0, b: 0 } } })

describe('an avatar carrying more than a picture', () => {
  it('is handed something that really does carry the marker', async () => {
    const withMetadata = await picture()
      .withExif({ IFD0: { Copyright: MARKER, Artist: MARKER } })
      .jpeg()
      .toBuffer()

    expect(
      withMetadata.includes(MARKER),
      'the fixture does not carry the marker, so finding it absent below would prove nothing',
    ).toBe(true)
  })

  it('serves back a picture with none of it', async () => {
    const withMetadata = await picture()
      .withExif({ IFD0: { Copyright: MARKER, Artist: MARKER } })
      .jpeg()
      .toBuffer()

    const served = await toPng(withMetadata)

    expect(
      served.includes(MARKER),
      'what the application serves still carries what the analyst uploaded beside the ' +
        'picture, so an avatar publishes whatever their camera recorded',
    ).toBe(false)
  })

  /**
   * The re-encoding is the mechanism, so the served bytes are also asserted to
   * be a PNG this process produced rather than the JPEG it was handed.
   */
  it('serves a PNG rather than the bytes it was given', async () => {
    const given = await picture().withExif({ IFD0: { Copyright: MARKER } }).jpeg().toBuffer()
    const served = await toPng(given)

    expect(served.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(served.equals(given)).toBe(false)
  })
})
