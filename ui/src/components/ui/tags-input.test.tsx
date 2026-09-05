import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TagsInput } from './tags-input'

/**
 * Tags, over the one comma-separated string the field actually is.
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
   * **The chips are the kit's `Tag`, not a second set.**
   */
  it('draws them as the kit tag', () => {
    render(<Harness initial="phishing" />)

    const chip = screen.getByText('phishing').closest('[data-slot="tag"]')
    expect(chip, 'a tag chip is not the kit Tag').not.toBeNull()
  })

  /**
   * **Named by the tag, never by position.**
   */
  it('names each remove button by the tag it removes', async () => {
    const onChange = vi.fn()
    render(<TagsInput label="Tags" value="phishing,exfil" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove exfil' }))

    expect(onChange).toHaveBeenCalledWith('phishing')
  })

  /**
   * **The chips and the box answer to different names.**
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
   * **Enter adds a tag and nothing else.**
   */
  it('holds Enter back from the form around it', async () => {
    const seen = watch('Enter')
    render(<Harness />)

    await userEvent.type(box(), 'phishing{Enter}')

    expect(seen.prevented, 'Enter reached the surrounding form unprevented').toEqual([true])
  })

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
   * **Escape is swallowed only while there is a draft to drop.**
   */
  it('lets Escape through once the box is empty', async () => {
    const seen = watch('Escape')
    render(<Harness />)

    await userEvent.type(box(), 'half-typed{Escape}')
    expect(seen.prevented, 'Escape over a draft reached the dialog').toEqual([])

    await userEvent.type(box(), '{Escape}')
    expect(seen.prevented, 'Escape over an empty box was swallowed').toEqual([false])
  })

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
   * **`disabled`, not `isDisabled`.**
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
   * **The id lands on the box, because that is what a `<label for>` points at.**
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
