/**
 * **Whether a section counts as written, decided here because only here can be.**
 *
 * The text lives in a CRDT keyed by block id and the block row carries no
 * copy of it, so a client asking the question with a string check on a `body`
 * column reads `undefined` and marks every section of every draft empty -- a
 * report whose own header counts its written sections lists all of them as
 * empty in the rail beside it.
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
   * **An empty paragraph is what an editor leaves behind.** Somebody opens a
   * section, types nothing and moves on; the fragment is not absent, it holds a
   * paragraph with no text. Counting that as written is how a report claims to
   * be finished.
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
   * **One block's prose does not answer for another's.** They share a document,
   * so a check reading the wrong field would report every section as written
   * the moment any one of them was.
   */
  it('answers per block, not per document', () => {
    const document_ = doc()
    writeProse(document_, 'written-one', 'Something.')
    expect(hasProse(document_, 'written-one')).toBe(true)
    expect(hasProse(document_, 'the-other')).toBe(false)
  })

  it('finds text below the top level', () => {
    const document_ = doc()
    writeProse(document_, 'b', '- one\n- two')
    expect(hasProse(document_, 'b')).toBe(true)
  })
})
