/**
 * **Whether a section counts as written, decided here because only here can be.**
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { fragmentFor, hasProse } from './prose-fields.js'
import { writeProse } from './prose-authoring.js'

const doc = () => new Y.Doc({ gc: false })

describe('whether a block has been written in', () => {
  it('says so when there is prose', () => {
    const document_ = doc()
    writeProse(document_, 'b', 'A macro-enabled phishing email led to a ransomware incident.')
    expect(hasProse(document_, 'b')).toBe(true)
  })

  it('says no for a block nobody has opened', () => {
    expect(hasProse(doc(), 'never-touched')).toBe(false)
  })

  /**
   * **An empty paragraph is what an editor leaves behind.**
   */
  it('treats a paragraph holding only whitespace as empty', () => {
    const document_ = doc()
    const fragment = fragmentFor(document_, 'b')
    const paragraph = new Y.XmlElement('paragraph')
    const text = new Y.XmlText()
    text.insert(0, '   \n  ')
    paragraph.insert(0, [text])
    fragment.insert(0, [paragraph])

    expect(hasProse(document_, 'b')).toBe(false)
  })

  /**
   * **One block's prose does not answer for another's.**
   */
  it('answers per block, not per document', () => {
    const document_ = doc()
    writeProse(document_, 'written-one', 'Something.')
    expect(hasProse(document_, 'written-one')).toBe(true)
    expect(hasProse(document_, 'the-other')).toBe(false)
  })

  /** Text nested under a list or a heading still counts. */
  it('finds text below the top level', () => {
    const document_ = doc()
    writeProse(document_, 'b', '- one\n- two')
    expect(hasProse(document_, 'b')).toBe(true)
  })
})
