import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TagsInput } from './tags-input'

/**
 * Tags, over the one comma-separated string the field actually is.
 *
 * **The contract is the CSV, not an array**, and every case here is written
 * against that: `tags` is a string on every entry schema, a list is refused
 * with 422, and handing callers an array would put the serialisation back at
 * every call site. `lib/tags.ts` owns the parsing rule.
 *
 * **The box is a `textbox`, not a `combobox`.** There is no vocabulary behind
 * this field, so nothing announces a list to open. The cases naming a role
 * here are the ones that would have gone quietly wrong the other way: a
 * control that answers to `getByRole('combobox')` and offers nothing to choose
 * reads as a picker whose list is broken.
 */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return <TagsInput label="Tags" value={value} onChange={setValue} />
}

/** The box, by the name a caller gives it. */
function box() {
  return screen.getByRole('textbox', { name: 'Tags' })
}

/**
 * Records every `key` keydown that reaches `document`, and whether the default
 * was prevented by the time it got there.
 *
 * **On `document` rather than a wrapper element**, because the surrounding
 * dialog is what the field has to keep the key away from, and a wrapper
 * inside the render tree would be a div with a key handler - which is the one
 * shape `jsx-a11y` refuses. Torn down after each test.
 */
const watching: ((event: KeyboardEvent) => void)[] = []

afterEach(() => {
  for (const listener of watching.splice(0)) document.removeEventListener('keydown', listener)
})

function watch(key: string) {
  const seen = { prevented: [] as boolean[] }
  const listener = (event: KeyboardEvent) => {
    if (event.key === key) seen.prevented.push(event.defaultPrevented)
  }
  document.addEventListener('keydown', listener)
  watching.push(listener)
  return seen
}

describe('TagsInput', () => {
  it('draws a chip per tag in the stored string', () => {
    render(<Harness initial="phishing,exfil" />)

    expect(screen.getByText('phishing')).toBeInTheDocument()
    expect(screen.getByText('exfil')).toBeInTheDocument()
  })

  /**
   * **The chips are the kit's `Tag`, not a second set.** `reference-select`
   * draws its references in the same one; a chip of this component's own beside
   * it made two designs in one form, which is the duplication the kit boundary
   * exists to refuse.
   */
  it('draws them as the kit tag', () => {
    render(<Harness initial="phishing" />)

    const chip = screen.getByText('phishing').closest('[data-slot="tag"]')
    expect(chip, 'a tag chip is not the kit Tag').not.toBeNull()
  })

  /**
   * **Named by the tag, never by position.** Two chips differing only by index
   * are indistinguishable to anyone listening. React Aria composes the name
   * from its own "Remove" plus the tag's row, so the name is `Remove exfil`
   * and it is the same shape every chip in the app carries.
   */
  it('names each remove button by the tag it removes', async () => {
    const onChange = vi.fn()
    render(<TagsInput label="Tags" value="phishing,exfil" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove exfil' }))

    expect(onChange).toHaveBeenCalledWith('phishing')
  })

  /**
   * **The chips and the box answer to different names.** Both are controls
   * inside one field, and naming the group `Tags` as well would leave
   * `getByRole` with two matches and a test picking whichever came first.
   */
  it('names the chip group apart from the box', () => {
    render(<Harness initial="phishing" />)

    expect(screen.getByRole('grid', { name: 'Chosen Tags' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Tags' })).toBeInTheDocument()
  })

  it('commits a typed tag on Enter', async () => {
    render(<Harness />)

    await userEvent.type(box(), 'phishing{Enter}')

    expect(screen.getByText('phishing')).toBeInTheDocument()
    expect(box()).toHaveValue('')
  })

  /**
   * **Enter adds a tag and nothing else.** Every caller renders this inside a
   * dialog whose default action submits, so an Enter that reaches the form
   * saves the entry on the keystroke that was meant to add a chip.
   */
  it('holds Enter back from the form around it', async () => {
    const seen = watch('Enter')
    render(<Harness />)

    await userEvent.type(box(), 'phishing{Enter}')

    expect(seen.prevented, 'Enter reached the surrounding form unprevented').toEqual([true])
  })

  /**
   * **A comma ends the tag rather than entering one.** The storage shape has a
   * single separator and no escape, so a comma inside a tag cannot survive a
   * read either way. Splitting on it is the same outcome, visibly: a pasted
   * "phishing, exfil" lands as two chips rather than one tag that reads back
   * as two.
   */
  it('ends a tag on a comma, and splits a pasted pair', async () => {
    // **The stateful harness, not a spy.** `value` is controlled, so a spy
    // that never feeds the next string back leaves the component composing
    // every commit from the same empty list - the second comma then reports
    // only the second tag, which reads as the first having been dropped.
    render(<Harness />)

    await userEvent.type(box(), 'phishing, exfil,')

    expect(screen.getByText('phishing')).toBeInTheDocument()
    expect(screen.getByText('exfil')).toBeInTheDocument()
  })

  it('says nothing when the same tag is entered twice', async () => {
    const onChange = vi.fn()
    render(<TagsInput label="Tags" value="phishing" onChange={onChange} />)

    await userEvent.type(box(), 'phishing{Enter}')

    expect(onChange).not.toHaveBeenCalled()
  })

  /**
   * **`serialiseTags` is what enforces this, not a guard in the key handler.**
   * A guard was written and break-verified: deleting it left this test green,
   * because the blank is dropped by the parse and the set comes back
   * unchanged. It was deleted rather than isolated - the clause it duplicated
   * is the one `lib/tags.ts` already owns.
   */
  it('says nothing on Enter with an empty box', async () => {
    const onChange = vi.fn()
    render(<TagsInput label="Tags" value="phishing" onChange={onChange} />)

    await userEvent.type(box(), '   {Enter}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('drops the draft on Escape rather than committing it', async () => {
    const onChange = vi.fn()
    render(<TagsInput label="Tags" value="" onChange={onChange} />)

    await userEvent.type(box(), 'half-typed{Escape}')

    expect(onChange).not.toHaveBeenCalled()
    expect(box()).toHaveValue('')
  })

  /**
   * **Escape is swallowed only while there is a draft to drop.** Every caller
   * sits in a dialog that closes on Escape, so a field that eats the key
   * unconditionally is one an analyst cannot leave by keyboard.
   */
  it('lets Escape through once the box is empty', async () => {
    const seen = watch('Escape')
    render(<Harness />)

    await userEvent.type(box(), 'half-typed{Escape}')
    expect(seen.prevented, 'Escape over a draft reached the dialog').toEqual([])

    await userEvent.type(box(), '{Escape}')
    expect(seen.prevented, 'Escape over an empty box was swallowed').toEqual([false])
  })

  /**
   * **Backspace takes the last chip, and only from an empty box.** The chips
   * sit above the box rather than inside it, so without this the analyst's way
   * back is a mouse - and with it applied one character too early, a typo
   * correction deletes a tag.
   */
  it('takes the last chip on Backspace over an empty box', async () => {
    const onChange = vi.fn()
    render(<TagsInput label="Tags" value="phishing,exfil" onChange={onChange} />)

    await userEvent.type(box(), '{Backspace}')

    expect(onChange).toHaveBeenCalledWith('phishing')
  })

  it('leaves the chips alone when Backspace has text to eat', async () => {
    const onChange = vi.fn()
    render(<TagsInput label="Tags" value="phishing,exfil" onChange={onChange} />)

    await userEvent.type(box(), 'c2{Backspace}')

    expect(onChange).not.toHaveBeenCalled()
  })

  /**
   * **`disabled`, not `isDisabled`.** Every caller spreads the id bundle
   * `Field` builds, and the gate rides in it under that spelling - React
   * Aria's own is the other one, so renaming the prop to match the primitive
   * would leave `field-control` passing a gate nothing reads and a control the
   * analyst can still type into.
   */
  it('shuts the box when the field is gated', () => {
    render(<TagsInput label="Tags" value="phishing" onChange={() => undefined} disabled />)

    expect(box()).toBeDisabled()
  })

  it('offers no remove control while the field is gated', () => {
    render(<TagsInput label="Tags" value="phishing" onChange={() => undefined} disabled />)

    const chip = screen.getByText('phishing').closest('[data-slot="tag"]')!
    expect(within(chip as HTMLElement).queryByRole('button')).toBeNull()
  })

  /**
   * **The id lands on the box, because that is what a `<label for>` points
   * at.** `Field` renders the label and hands the control an id bundle; landed
   * on the wrapper instead, the label names a div and clicking it focuses
   * nothing.
   */
  it('puts the caller ids on the box itself', () => {
    render(
      <TagsInput
        label="Tags"
        value=""
        onChange={() => undefined}
        id="entry-tags"
        aria-describedby="entry-tags-hint"
      />,
    )

    expect(box()).toHaveAttribute('id', 'entry-tags')
    expect(box()).toHaveAttribute('aria-describedby', 'entry-tags-hint')
  })
})
