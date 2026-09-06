import { describe, expect, it } from 'vitest'

import { COMMANDS } from '@/lib/shortcut-registry'

import { aDialogIsOpen, chordFires, isTypingTarget, type ChordEvent } from './chords'

function press(key: string, held: Partial<ChordEvent> = {}): ChordEvent {
  return { key, mod: false, shift: false, alt: false, ...held }
}

describe('chordFires', () => {
  it('fires a plain letter and refuses it with a modifier', () => {
    expect(chordFires({ key: 'n' }, press('n'))).toBe(true)
    expect(chordFires({ key: 'n' }, press('n', { mod: true }))).toBe(false)
    expect(chordFires({ key: 'n' }, press('n', { alt: true }))).toBe(false)
  })

  /**
   * The browser reports `Q` for Shift+Q, so the letter alone would match a
   * shifted press and close the case on `q`.
   */
  it('tells a letter from its shifted self, in both directions', () => {
    expect(chordFires({ key: 'q', shift: true }, press('Q', { shift: true }))).toBe(true)
    expect(chordFires({ key: 'q', shift: true }, press('q'))).toBe(false)
    expect(chordFires({ key: 'q' }, press('Q', { shift: true }))).toBe(false)
  })

  /**
   * `?` is Shift+/ on a US layout and unshifted elsewhere. Pinning shift here
   * makes the help key work on one keyboard and not another.
   */
  it('ignores shift for a key that is not a letter', () => {
    expect(chordFires({ key: '?' }, press('?', { shift: true }))).toBe(true)
    expect(chordFires({ key: '?' }, press('?'))).toBe(true)
    expect(chordFires({ key: '/' }, press('/'))).toBe(true)
  })

  it('requires the modifier the chord asks for', () => {
    expect(chordFires({ key: 'k', mod: true }, press('k', { mod: true }))).toBe(true)
    expect(chordFires({ key: 'k', mod: true }, press('k'))).toBe(false)
  })

  /**
   * Two commands answering one keypress is the defect a section-scoped chord
   * looks like -- the dispatcher takes the first, and which one that is
   * depends on declaration order rather than on what is on screen.
   */
  it('leaves no keypress in the registry firing two commands', () => {
    const presses: ChordEvent[] = COMMANDS.flatMap((command) =>
      command.chords.map((chord) =>
        press(chord.key, { mod: chord.mod ?? false, shift: chord.shift ?? false }),
      ),
    )
    for (const event of presses) {
      const fired = COMMANDS.filter((command) =>
        command.chords.some((chord) => chordFires(chord, event)),
      )
      expect(fired.map((one) => one.id)).toHaveLength(1)
    }
  })
})

describe('isTypingTarget', () => {
  it('gives the keyboard to anything that types, and to nothing else', () => {
    const cell = document.createElement('div')
    cell.setAttribute('contenteditable', 'true')
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('button'))).toBe(true)
    expect(isTypingTarget(cell)).toBe(true)
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })

  /**
   * **The attack: a widget that re-dispatches what you type.** React Aria's
   * `Autocomplete` sends each keystroke on to the row it is highlighting so the
   * list can act on it, so the document's own listener is handed a
   * `div[role="option"]` while the caret sits in a text box. A guard reading
   * only the target answers false and every letter fires its chord, so typing
   * `case` into the omnibox runs the `a` command and opens a dialog.
   */
  it('gives the keyboard to the caret when the event names something else', () => {
    // **The live document, not a detached one.** `focus()` moves nothing in a
    // document nobody is rendering, so `activeElement` stays `body` and the
    // attack cannot be posed at all.
    const box = document.createElement('input')
    const row = document.createElement('div')
    row.setAttribute('role', 'option')
    document.body.append(box, row)
    try {
      box.focus()
      expect(document.activeElement, 'the fixture owes a focused box').toBe(box)
      expect(isTypingTarget(row)).toBe(true)
    } finally {
      box.remove()
      row.remove()
    }
  })

  it('leaves the keyboard to the document when nothing has the caret', () => {
    const row = document.createElement('div')
    row.setAttribute('role', 'option')
    document.body.append(row)
    try {
      expect(isTypingTarget(row)).toBe(false)
    } finally {
      row.remove()
    }
  })
})

describe('aDialogIsOpen', () => {
  it('is true only while a dialog is in the document', () => {
    const doc = document.implementation.createHTMLDocument()
    expect(aDialogIsOpen(doc)).toBe(false)
    const modal = doc.createElement('div')
    modal.setAttribute('role', 'dialog')
    doc.body.append(modal)
    expect(aDialogIsOpen(doc)).toBe(true)
    modal.remove()
    expect(aDialogIsOpen(doc)).toBe(false)
  })

  it('counts a destructive confirm, which carries the other role', () => {
    const doc = document.implementation.createHTMLDocument()
    const confirm = doc.createElement('div')
    confirm.setAttribute('role', 'alertdialog')
    doc.body.append(confirm)
    expect(aDialogIsOpen(doc)).toBe(true)
  })
})
