/**
 * The filter block's arithmetic and its tokens, attacked rather than
 * demonstrated.
 *
 * **The claim that matters is subtraction, not addition.** Every screen could
 * already turn a filter on; what none of them could do was turn *one* off, and
 * the way that fails is silent - `Clear` under another name, dropping the two
 * decisions that were fine along with the one that was not. So every removal
 * assertion here names what has to survive as well as what has to go.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterControls } from './filter-controls'
import {
  appliedFilters,
  dropFilter,
  filterNarrowed,
  toggleFilter,
  type FilterDimension,
  type FilterSelection,
} from './filter-set'

const KIND: FilterDimension = {
  key: 'kind',
  label: 'Kind',
  options: [{ value: 'Assets' }, { value: 'Accounts' }, { value: 'Malware' }],
}

const ATTENTION: FilterDimension = {
  key: 'attention',
  label: 'Attention',
  mode: 'one',
  options: [
    { value: 'attention', label: 'Needs attention', count: 15 },
    { value: 'clear', label: 'Clear', count: 40 },
  ],
}

const CATEGORY: FilterDimension = {
  key: 'category',
  label: 'Category',
  as: 'picker',
  groupLabel: 'Data category',
  options: [{ value: 'credentials', count: 2 }, { value: 'financial records', count: 1 }],
}

describe('choosing a value', () => {
  it('adds one to a dimension that takes several', () => {
    expect(toggleFilter({}, KIND, 'Assets')).toEqual({ kind: ['Assets'] })
  })

  it('keeps the ones already on', () => {
    const on = toggleFilter({ kind: ['Assets'] }, KIND, 'Malware')
    expect(on.kind).toEqual(['Assets', 'Malware'])
  })

  it('takes one off again', () => {
    const off = toggleFilter({ kind: ['Assets', 'Malware'] }, KIND, 'Assets')
    expect(off.kind).toEqual(['Malware'])
  })

  /**
   * **`one` replaces; it does not accumulate.** The entities attention pair
   * and the activity log are mutually exclusive by meaning - a row cannot be
   * both needing attention and clear - and a selection holding both narrows to
   * nothing while the bar shows two tokens saying why.
   */
  it('replaces the value in a dimension that takes one', () => {
    const on = toggleFilter({ attention: ['attention'] }, ATTENTION, 'clear')
    expect(on.attention).toEqual(['clear'])
  })

  it('takes the single value off when it is pressed again', () => {
    const off = toggleFilter({ attention: ['clear'] }, ATTENTION, 'clear')
    expect(off.attention).toEqual([])
  })

  /** Choosing in one dimension says nothing about any other. */
  it('leaves every other dimension exactly as it was', () => {
    const on = toggleFilter({ kind: ['Assets'], attention: ['clear'] }, KIND, 'Malware')
    expect(on.attention).toEqual(['clear'])
  })
})

describe('dropping one filter', () => {
  /** The whole point of a token: this one off, the rest untouched. */
  it('leaves the other values in the same dimension on', () => {
    const left = dropFilter({ kind: ['Assets', 'Accounts', 'Malware'] }, 'kind', 'Accounts')
    expect(left.kind).toEqual(['Assets', 'Malware'])
  })

  it('leaves every other dimension on', () => {
    const left = dropFilter(
      { kind: ['Assets'], attention: ['attention'], category: ['credentials'] },
      'attention',
      'attention',
    )
    expect(left).toEqual({ kind: ['Assets'], attention: [], category: ['credentials'] })
  })

  it('does nothing to a value that was not on', () => {
    const left = dropFilter({ kind: ['Assets'] }, 'kind', 'Malware')
    expect(left.kind).toEqual(['Assets'])
  })
})

describe('whether anything is narrowing', () => {
  it('is false when nothing is chosen', () => {
    expect(filterNarrowed({})).toBe(false)
  })

  /** An emptied dimension is a key with no values, not an absent key. */
  it('is false when every dimension has been emptied', () => {
    expect(filterNarrowed({ kind: [], attention: [] })).toBe(false)
  })

  it('is true while one value is on', () => {
    expect(filterNarrowed({ kind: [], attention: ['clear'] })).toBe(true)
  })
})

describe('the tokens', () => {
  const tokens = (selection: FilterSelection) =>
    appliedFilters([KIND, ATTENTION, CATEGORY], selection, () => undefined)

  it('draws nothing while nothing is on', () => {
    expect(tokens({})).toEqual([])
  })

  /**
   * **The analyst's word, not the wire's.** The activity log stores `api` and
   * says `API`; a token reading `api` is a second vocabulary on the same bar.
   */
  it('reads an option by its label where it has one', () => {
    expect(tokens({ attention: ['attention'] })[0]?.label).toBe('Needs attention')
  })

  it('falls back to the value where the option names itself', () => {
    expect(tokens({ kind: ['Assets'] })[0]?.label).toBe('Assets')
  })

  it('carries the option`s count', () => {
    expect(tokens({ attention: ['clear'] })[0]?.count).toBe(40)
  })

  /**
   * **A filter whose chips are not on screen is the one a token is most owed.**
   * Entities hides the Kind chips at a scoped view and goes on filtering by
   * them - so a dimension offering nothing right now still tokenises what it
   * holds, or the narrowing is invisible and only `Clear` can reach it.
   */
  it('keeps a token for a value whose dimension offers no options now', () => {
    const hidden: FilterDimension = { ...KIND, options: [] }
    const out = appliedFilters([hidden], { kind: ['Assets'] }, () => undefined)
    expect(out.map((one) => one.label)).toEqual(['Assets'])
  })

  it('gives each token a key of its own', () => {
    const out = tokens({ kind: ['Assets', 'Malware'], attention: ['clear'] })
    expect(new Set(out.map((one) => one.key)).size).toBe(3)
  })

  /** Removing goes through the change handler with that one value gone. */
  it('hands back the selection without that one value', () => {
    const onChange = vi.fn()
    const out = appliedFilters([KIND], { kind: ['Assets', 'Malware'] }, onChange)
    out[0]?.onRemove()
    expect(onChange).toHaveBeenCalledWith({ kind: ['Malware'] })
  })
})

describe('the controls in the popover', () => {
  it('draws a group for each dimension that has options', () => {
    render(
      <FilterControls
        dimensions={[KIND, ATTENTION]}
        selection={{}}
        onChange={() => undefined}
      />,
    )

    expect(screen.getByText('Kind')).toBeInTheDocument()
    expect(screen.getByText('Attention')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { pressed: false }).length).toBe(5)
  })

  /**
   * **An empty group is a heading over nothing.** Evidence draws no Type row
   * when the case holds no types, and the heading alone reads as a control
   * that has stopped working.
   */
  it('draws no group for a dimension with no options', () => {
    render(
      <FilterControls
        dimensions={[KIND, { ...ATTENTION, options: [] }]}
        selection={{}}
        onChange={() => undefined}
      />,
    )

    expect(screen.queryByText('Attention')).toBeNull()
  })

  it('draws nothing at all when no dimension has options', () => {
    const { container } = render(
      <FilterControls
        dimensions={[{ ...KIND, options: [] }]}
        selection={{}}
        onChange={() => undefined}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('presses a chip through to the change handler', async () => {
    const onChange = vi.fn()
    render(
      <FilterControls dimensions={[KIND]} selection={{}} onChange={onChange} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Assets' }))

    expect(onChange).toHaveBeenCalledWith({ kind: ['Assets'] })
  })

  /** A wide case-derived dimension goes behind one trigger, not into the row. */
  it('draws a picker dimension as one trigger rather than a chip each', () => {
    render(
      <FilterControls dimensions={[CATEGORY]} selection={{}} onChange={() => undefined} />,
    )

    expect(screen.getByRole('button', { name: /Category/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /credentials/ })).toBeNull()
  })
})
