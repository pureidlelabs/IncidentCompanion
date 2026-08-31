/**
 * **Whether a section counts as written, decided here because only here can be.**
 *
 * Python kept a written block's text in a `body` column, so the client asked
 * the question with a string check. This backend keeps it in a CRDT keyed by
 * block id and the row carries no copy -- so the client read `undefined` and
 * marked every section of every draft empty. Measured on screen 2026-08-12: a
 * report whose own header counted three written sections listed all three as
 * empty in the rail beside them.
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

  /** Text nested under a list or a heading still counts. */
  it('finds text below the top level', () => {
    const document_ = doc()
    writeProse(document_, 'b', '- one\n- two')
    expect(hasProse(document_, 'b')).toBe(true)
  })
})
