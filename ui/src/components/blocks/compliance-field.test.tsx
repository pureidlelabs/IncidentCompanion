/**
 * The two vocabularies the compliance screen cannot draw as a column, and what
 * has to survive drawing them another way.
 *
 * The claim under every case here is one thing: **a value the analyst chose
 * comes back unchanged**. A control that reads well and stores the wrong set
 * is worse than the column it replaced, and the served vocabularies carry
 * three traps for exactly that - four options whose visible text after
 * grouping is the same four words, one option that carries no stem at all, and
 * a stem spelled with a capital in one of its eleven members.
 *
 * Nothing here names a country code or a root cause: the shape is read off
 * what was served, so the tests build their own vocabularies where the point
 * is a threshold, and use the served one where the point is the served data.
 */
import { render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ComplianceRecord } from '@/api/compliance'
import type { ComplianceFieldSpec } from '@/api/specs'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'

import { optionShape } from './compliance-answers'
import { ComplianceControl } from './compliance-field'

/** One served compliance field, by the name the parsed document gives it. */
function served(name: string): ComplianceFieldSpec {
  const field = specsFixture.compliance.forms.ALL_FIELDS?.fields.find((one) => one.name === name)
  if (field === undefined) throw new Error(`no served field named ${name}`)
  return field
}

/** A field whose options are made up, so a threshold is tested on its own terms. */
function invented(options: readonly string[], extra: Partial<ComplianceFieldSpec> = {}): ComplianceFieldSpec {
  return {
    name: 'affectedMemberStates',
    label: 'Invented',
    kind: 'multi_csv',
    join: ',',
    options,
    ...extra,
  }
}

/**
 * The control, wired to state the way the screen wires it.
 *
 * **Feeding the answer back is the point.** An uncontrolled render reads the
 * same record on every click, so a second tick is computed against a stale set
 * and the test cannot tell a control that stores what was chosen from one that
 * stores only the last thing chosen.
 */
function draw(spec: ComplianceFieldSpec, record: Partial<ComplianceRecord> = {}) {
  const onSet = vi.fn()

  function Harness() {
    const [held, setHeld] = useState<ComplianceRecord>({ ...campaignCompliance, ...record })
    return (
      <ComplianceControl
        spec={spec}
        record={held}
        onSet={(name, value) => {
          onSet(name, value)
          setHeld((was) => ({ ...was, [name]: value }))
        }}
      />
    )
  }

  render(<Harness />)
  return onSet
}

/** The last set this control asked to store. */
function stored(onSet: ReturnType<typeof vi.fn>): unknown {
  return onSet.mock.calls.at(-1)?.[1]
}

const CODES = 'affectedMemberStates'
const DETAILED = 'doraRootCauseDetailed'

describe('the shape of a served vocabulary', () => {
  it('reads a set of short codes as compact', () => {
    expect(optionShape(served(CODES)).kind).toBe('compact')
  })

  /**
   * The attack: a short *value* carrying a long served label is a column, not
   * a chip four characters wide with fifteen characters in it. Keying on the
   * value rather than on what is drawn is the mistake this catches.
   */
  it('reads the label, not the value, when deciding a set is short', () => {
    const spec = invented(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI'], {
      optionLabels: {
        AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CY: 'Cyprus', CZ: 'Czechia',
        DE: 'Germany', DK: 'Denmark', EE: 'Estonia', ES: 'Spain', FI: 'Finland',
      },
    })
    expect(optionShape(spec).kind).toBe('column')
  })

  it('leaves a handful of short codes as a column', () => {
    expect(optionShape(invented(['AT', 'BE', 'BG', 'CY'])).kind).toBe('column')
  })

  it('groups a vocabulary whose options share a stem', () => {
    const shape = optionShape(served(DETAILED))
    expect(shape.kind).toBe('grouped')
    if (shape.kind !== 'grouped') return
    expect(shape.groups.map((group) => group.stem)).toEqual([
      'malicious actions',
      'process failure',
      'system failure',
      'human error',
      'external event',
      '',
    ])
  })

  /** Every served option is offered exactly once, under exactly one stem. */
  it('loses no served option to the grouping', () => {
    const spec = served(DETAILED)
    const shape = optionShape(spec)
    if (shape.kind !== 'grouped') throw new Error('expected a grouped vocabulary')
    const offered = shape.groups.flatMap((group) => group.options.map((one) => one.value))
    expect([...offered].sort()).toEqual([...(spec.options ?? [])].sort())
  })

  /**
   * The attack: one option with a colon in it is not a hierarchy. A vocabulary
   * that grouped on a single stem would say the stem once and leave every
   * other option under a heading it does not have.
   */
  it('refuses to group on a stray colon', () => {
    const shape = optionShape(
      invented([
        'ransomware: crypto-locker',
        'denial of service',
        'phishing',
        'insider misuse',
        'supply chain compromise',
      ]),
    )
    expect(shape.kind).toBe('column')
  })

  /**
   * The attack the stray-colon case cannot make: two real stems, and a
   * vocabulary that is mostly not a hierarchy. The count of stems says group;
   * the proportion carrying one says the parents are an aside.
   */
  it('refuses to group when most of the vocabulary carries no stem', () => {
    const shape = optionShape(
      invented([
        'alpha: one', 'alpha: two', 'beta: three', 'beta: four',
        'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
      ]),
    )
    expect(shape.kind).toBe('column')
  })

  /** Two stems over four options is a hierarchy; two over two says nothing twice. */
  it('refuses to group when every stem holds one option', () => {
    expect(optionShape(invented(['alpha: one', 'beta: two'])).kind).toBe('column')
    expect(
      optionShape(invented(['alpha: one', 'alpha: two', 'beta: three', 'beta: four'])).kind,
    ).toBe('grouped')
  })
})

describe('a compact set of codes', () => {
  it('offers every served option without a column of checkboxes', () => {
    const spec = served(CODES)
    draw(spec)
    const set = screen.getByRole('grid', { name: spec.label })
    expect(within(set).getAllByRole('row')).toHaveLength(spec.options?.length ?? 0)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('stores what was chosen in the served order, whatever order it was chosen in', async () => {
    const user = userEvent.setup()
    const onSet = draw(served(CODES))

    await user.click(screen.getByRole('row', { name: 'NL' }))
    await user.click(screen.getByRole('row', { name: 'BE' }))

    expect(stored(onSet)).toEqual(['BE', 'NL'])
  })

  /** Choose, clear, choose again: the same three codes come back. */
  it('survives a clear and a re-choose', async () => {
    const user = userEvent.setup()
    const onSet = draw(served(CODES), { affectedMemberStates: ['BE', 'DE', 'NL'] })

    for (const code of ['BE', 'DE', 'NL']) await user.click(screen.getByRole('row', { name: code }))
    expect(stored(onSet)).toEqual([])

    for (const code of ['NL', 'DE', 'BE']) await user.click(screen.getByRole('row', { name: code }))
    expect(stored(onSet)).toEqual(['BE', 'DE', 'NL'])
  })

  it('draws what is already chosen as chosen', () => {
    draw(served(CODES), { affectedMemberStates: ['BE', 'NL'] })
    expect(screen.getByRole('row', { name: 'BE' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('row', { name: 'AT' })).toHaveAttribute('aria-selected', 'false')
  })
})

describe('a grouped vocabulary', () => {
  it('offers every served option exactly once', () => {
    const spec = served(DETAILED)
    draw(spec)
    expect(screen.getAllByRole('checkbox')).toHaveLength(spec.options?.length ?? 0)
  })

  /**
   * The stem is what the grouping saves: said once, not on all eleven rows -
   * and lifting it off the row may not take it off the answer's name, which is
   * all a screen reader has.
   */
  it('says a stem once, draws the detail alone, and keeps the whole name', () => {
    draw(served(DETAILED))
    expect(screen.getAllByText('process failure')).toHaveLength(1)
    expect(screen.getByText('omission')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'human error: omission' }),
    ).toBeInTheDocument()
  })

  /**
   * The attack, and the reason a detail may not be a key: four served options
   * read `other (please specify)` once their stem is lifted off them.
   */
  it('tells two options apart when their details are identical', async () => {
    const user = userEvent.setup()
    const spec = served(DETAILED)
    const onSet = draw(spec)

    await user.click(
      screen.getByRole('checkbox', { name: 'system failure: other (please specify)' }),
    )
    expect(stored(onSet)).toEqual(['system failure: other (please specify)'])
  })

  /** One served option carries no stem at all, and it is still an answer. */
  it('keeps an option that shares no stem', async () => {
    const user = userEvent.setup()
    const spec = served(DETAILED)
    const stray = (spec.options ?? []).filter((one) => !one.includes(': '))
    expect(stray).toHaveLength(1)

    const onSet = draw(spec)
    await user.click(screen.getByRole('checkbox', { name: stray[0] ?? '' }))
    expect(stored(onSet)).toEqual(stray)
  })

  it('survives a clear and a re-choose', async () => {
    const user = userEvent.setup()
    const spec = served(DETAILED)
    const chosen = [
      'malicious actions: fraudulent actions',
      'human error: omission',
      'external event: third-party failures',
    ]
    const onSet = draw(spec, { doraRootCauseDetailed: chosen })

    for (const one of chosen) await user.click(screen.getByRole('checkbox', { name: one }))
    expect(stored(onSet)).toEqual([])

    for (const one of [...chosen].reverse()) {
      await user.click(screen.getByRole('checkbox', { name: one }))
    }
    expect(stored(onSet)).toEqual(
      (spec.options ?? []).filter((one) => chosen.includes(one)),
    )
  })
})

describe('a vocabulary with neither shape', () => {
  it('keeps the plain column, with the whole label on each row', () => {
    const spec = served('gdprCircumstances')
    draw(spec)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(spec.options?.length ?? 0)
    expect(screen.getByRole('checkbox', { name: 'Loss of confidentiality' })).toBeInTheDocument()
  })
})
