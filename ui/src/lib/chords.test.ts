import { describe, expect, it } from 'vitest'

import { COMMANDS } from '@/lib/shortcut-registry'

import { aDialogIsOpen, chordFires, isTypingTarget, type ChordEvent } from './chords'

/** A keypress, defaulting to nothing held. */
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
