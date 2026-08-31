import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Field } from '@/components/ui/field'
import { VocabSelect } from './vocab-select'

/**
 * The trigger, found the way the kit draws it.
 *
 * React Aria's select trigger is a `button` carrying `aria-haspopup="listbox"`,
 * not a `combobox` - so `getByRole('combobox')` finds nothing, and the name it
 * answers to leads with the current value. Both are measured in
 * `the trigger keeps the name its field gives it`.
 */
function trigger(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[aria-haspopup="listbox"]')
  if (!found) throw new Error('no select trigger on the page')
  return found
}

/** The `data-value` of every row on the open list, in the order drawn. */
function offered(): string[] {
  return [...document.querySelectorAll('[role="option"]')].map(
    (row) => row.getAttribute('data-value') ?? '(none)',
  )
}

async function open(): Promise<void> {
  await userEvent.click(trigger())
  await screen.findByRole('listbox')
}

describe('VocabSelect draws the vocabulary it is served', () => {
  /**
   * **The rule this control exists under**: nothing enumerates the members of
   * a vocabulary, because they are served and an analyst's own value must
   * appear without a code change.
   *
   * Attacked by serving a vocabulary no product screen has ever held. A
   * component holding a list of its own would draw that list instead, or draw
   * it as well.
   */
  it('offers exactly what it is given, in the order given, and nothing else', async () => {
    render(
      <VocabSelect
        aria-label="Kind"
        value=""
        onValueChange={() => undefined}
        options={['zeta-9', 'alpha-1', 'quisling']}
        allowEmpty={false}
      />,
    )
    await open()
    expect(offered()).toEqual(['zeta-9', 'alpha-1', 'quisling'])
  })

  it('labels a row from optionLabels and falls back to the stored value', async () => {
    render(
      <VocabSelect
        aria-label="Kind"
        value=""
        onValueChange={() => undefined}
        options={['yes', 'no']}
        optionLabels={{ yes: 'Yes - a person died' }}
        allowEmpty={false}
      />,
    )
    await open()
    const rows = [...document.querySelectorAll('[role="option"]')].map((row) => row.textContent)
    expect(rows).toEqual(['Yes - a person died', 'no'])
  })

  it('shows the picked row by its label, never by the stored value', () => {
    render(
      <VocabSelect
        aria-label="Report language"
        value="en"
        onValueChange={() => undefined}
        options={['en', 'nl']}
        optionLabels={{ en: 'English', nl: 'Dutch' }}
        allowEmpty={false}
      />,
    )
    expect(trigger()).toHaveTextContent('English')
    expect(trigger()).not.toHaveTextContent('en"')
  })
})

describe('VocabSelect and the two meanings of empty', () => {
  /**
   * A served vocabulary may carry `''` as a real, labelled member - "not
   * stated" is one - and the control's own "not set" row is a different thing.
   * Offering both is two rows meaning the same on screen and one of them
   * unreachable.
   */
  it('adds its own blank row only when the vocabulary has none', async () => {
    const { unmount } = render(
      <VocabSelect aria-label="Kind" value="" onValueChange={() => undefined} options={['a']} />,
    )
    await open()
    expect(offered()).toEqual(['', 'a'])
    unmount()

    render(
      <VocabSelect
        aria-label="Kind"
        value=""
        onValueChange={() => undefined}
        options={['', 'a']}
        optionLabels={{ '': 'Not stated' }}
      />,
    )
    await open()
    expect(offered()).toEqual(['', 'a'])
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2)
  })

  it('offers no blank row when the field is required', async () => {
    render(
      <VocabSelect
        aria-label="Kind"
        value=""
        onValueChange={() => undefined}
        options={['a']}
        allowEmpty={false}
      />,
    )
    await open()
    expect(offered()).toEqual(['a'])
  })

  /**
   * The blank row is not a served member, so it needs a key of its own, and a
   * key drawn from the same alphabet as the vocabulary can be served. A
   * vocabulary whose members spell every plausible sentinel is the attack.
   */
  it('reports the empty string for its own blank row, whatever the vocabulary spells', async () => {
    const wrote = vi.fn()
    render(
      <VocabSelect
        aria-label="Kind"
        value="null"
        onValueChange={wrote}
        options={['null', 'undefined', '0', '-', '\u2014', 'blank']}
      />,
    )
    await open()
    const blank = document.querySelector<HTMLElement>('[role="option"][data-value=""]')
    expect(blank, 'the blank row is drawn').not.toBeNull()
    await userEvent.click(blank!)
    expect(wrote).toHaveBeenCalledWith('')
  })

  /** A served `''` is a value the analyst chose, and it reads as its own label. */
  it('lets a served empty-string member be picked, and draws its own label', async () => {
    const wrote = vi.fn()
    render(
      <VocabSelect
        aria-label="Kind"
        value="a"
        onValueChange={wrote}
        options={['', 'a']}
        optionLabels={{ '': 'Not stated' }}
      />,
    )
    await open()
    const row = document.querySelector<HTMLElement>('[role="option"][data-value=""]')
    expect(row).toHaveTextContent('Not stated')
    await userEvent.click(row!)
    expect(wrote).toHaveBeenCalledWith('')
  })

  /**
   * The half of the same clause the row tests cannot see.
   *
   * `''` reaches the control as both "nothing is picked" and "the analyst
   * picked the member spelled `''`", and only the vocabulary tells them apart.
   * Read as the first, a picked "Not stated" is drawn as the placeholder - the
   * field looks unanswered when it was answered, which is the one thing a
   * compliance form must not do.
   */
  it('draws a served empty-string member as its label, not as the placeholder', () => {
    render(
      <VocabSelect
        aria-label="Kind"
        value=""
        onValueChange={() => undefined}
        options={['', 'a']}
        optionLabels={{ '': 'Not stated' }}
        placeholder="Nothing picked"
      />,
    )
    expect(trigger()).toHaveTextContent('Not stated')
    expect(trigger()).not.toHaveTextContent('Nothing picked')
  })

  it('draws the placeholder, not a value, when nothing is picked', () => {
    render(
      <VocabSelect
        aria-label="Kind"
        value=""
        onValueChange={() => undefined}
        options={['a']}
        placeholder="No image"
        allowEmpty={false}
      />,
    )
    expect(trigger()).toHaveTextContent('No image')
  })
})

describe('VocabSelect renders a value as a mark when it is told how', () => {
  const paint = (option: string, label: string) => (
    <span>
      <span data-testid={`dot-${option}`} />
      {label}
    </span>
  )

  it('paints every row and the trigger, and never the blank row', async () => {
    render(
      <VocabSelect
        aria-label="Severity"
        value="high"
        onValueChange={() => undefined}
        options={['high', 'low']}
        optionLabels={{ high: 'High', low: 'Low' }}
        renderValue={paint}
      />,
    )
    // The trigger draws the mark for what is picked.
    expect(within(trigger()).getByTestId('dot-high')).toBeInTheDocument()

    await open()
    const rows = document.querySelectorAll('[role="option"]')
    expect(rows).toHaveLength(3)
    const blank = document.querySelector<HTMLElement>('[role="option"][data-value=""]')!
    // A mark beside an em dash would be marking the absence of a value.
    expect(blank.querySelector('[data-testid^="dot-"]')).toBeNull()
    for (const option of ['high', 'low']) {
      const row = document.querySelector<HTMLElement>(`[role="option"][data-value="${option}"]`)!
      expect(within(row).getByTestId(`dot-${option}`)).toBeInTheDocument()
    }
  })
})

describe('VocabSelect carries the states a field puts on it', () => {
  it('keeps the name its field gives it, rather than answering to its own value', () => {
    render(
      <Field label="Report status">
        {(ids) => (
          <VocabSelect
            {...ids}
            value="draft"
            onValueChange={() => undefined}
            options={['draft', 'final']}
            allowEmpty={false}
          />
        )}
      </Field>,
    )
    // React Aria leads the name with the current value, so the assertion is
    // that the field's label is *in* the name - not that it is the whole of it.
    expect(trigger()).toHaveAccessibleName(/Report status/)
  })

  it('refuses to open when it is disabled', async () => {
    render(
      <VocabSelect
        aria-label="Kind"
        value="a"
        onValueChange={() => undefined}
        options={['a', 'b']}
        disabled
      />,
    )
    await userEvent.click(trigger())
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('marks itself refused when the field refused the value', () => {
    render(
      <Field label="Kind" problem="Pick one.">
        {(ids) => <VocabSelect {...ids} value="" onValueChange={() => undefined} options={['a']} />}
      </Field>,
    )
    expect(document.querySelector('[data-rac][data-invalid]')).not.toBeNull()
  })

  it('is described by the field, so a refusal is announced with the control', () => {
    render(
      <Field label="Kind" hint="Served by the case template.">
        {(ids) => <VocabSelect {...ids} value="" onValueChange={() => undefined} options={['a']} />}
      </Field>,
    )
    expect(trigger()).toHaveAccessibleDescription(/Served by the case template/)
  })

  it('writes the chosen value through, and shows it once the caller stores it', async () => {
    function Held() {
      const [value, setValue] = useState('')
      return (
        <VocabSelect
          aria-label="Kind"
          value={value}
          onValueChange={setValue}
          options={['alpha', 'beta']}
          optionLabels={{ alpha: 'Alpha', beta: 'Beta' }}
        />
      )
    }
    render(<Held />)
    await open()
    await userEvent.click(document.querySelector<HTMLElement>('[data-value="beta"]')!)
    expect(trigger()).toHaveTextContent('Beta')
  })
})
