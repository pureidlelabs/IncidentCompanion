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

  /**
   * An unmodified chord fires with the focus on a button, a tab or a listbox
   * option, so one spelled `Enter`, ` ` or an arrow would eat the press that
   * works the control -- and no guard downstream can tell the two apart.
   */
  it('claims no unmodified key a focused control consumes', () => {
    const consumed = new Set([
      'enter',
      ' ',
      'escape',
      'tab',
      'home',
      'end',
      'pageup',
      'pagedown',
      'arrowup',
      'arrowdown',
      'arrowleft',
      'arrowright',
    ])
    for (const command of COMMANDS) {
      for (const chord of command.chords) {
        if (chord.mod === true) continue
        expect(consumed.has(chord.key.toLowerCase()), `${command.id} claims ${chord.key}`).toBe(
          false,
        )
      }
    }
  })
})

function element(tag: string, attributes: Record<string, string> = {}): HTMLElement {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
  return node
}

/** The row the collection is highlighting, returned rather than its parent. */
function within(collection: HTMLElement, role: string): HTMLElement {
  const row = element('div', { role })
  collection.append(row)
  return row
}

describe('isTypingTarget', () => {
  it.each([
    ['a text box', () => element('input')],
    ['a note', () => element('textarea')],
    ['a plain select', () => element('select')],
    ['an editable cell', () => element('div', { contenteditable: 'true' })],
    ['a text box by role', () => element('div', { role: 'textbox' })],
    ['a combo box', () => element('div', { role: 'combobox' })],
    ['a search box', () => element('div', { role: 'searchbox' })],
    // The spelling `ui/src/test/select.ts` pins, on the one button that types.
    ['a select trigger', () => element('button', { 'aria-haspopup': 'listbox' })],
    ['an option in an open listbox', () => within(element('div', { role: 'listbox' }), 'option')],
    ['an item in an open menu', () => within(element('div', { role: 'menu' }), 'menuitem')],
  ])('keeps the keyboard for %s', (_name, make) => {
    expect(isTypingTarget(make())).toBe(true)
  })

  /**
   * **The attack: a chord dead because the analyst pressed something.** Working
   * a control leaves the focus on it, and a dialog hands the focus back to the
   * button that opened it, so reading "has the focus" as "is being typed into"
   * leaves every chord dead most of the time.
   */
  it.each([
    ['a button', () => element('button')],
    ['a link', () => element('a', { href: '/cases' })],
    ['a tab', () => element('div', { role: 'tab' })],
    ['a checkbox', () => element('input', { type: 'checkbox' })],
    ['a plain div', () => element('div')],
  ])('leaves the keyboard to the document on %s', (_name, make) => {
    expect(isTypingTarget(make())).toBe(false)
  })

  it('answers for nothing at all', () => {
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
