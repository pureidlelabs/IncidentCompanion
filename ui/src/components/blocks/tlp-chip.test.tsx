/**
 * The marking's colour is the marking.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TlpChip } from './tlp-chip'
import { tlpTone } from './tlp'

describe('the TLP marking', () => {
  it('gives each level its own standard colour', () => {
    expect(tlpTone('TLP:CLEAR')).toBe('text-tlp-clear')
    expect(tlpTone('TLP:GREEN')).toBe('text-tlp-green')
    expect(tlpTone('TLP:AMBER')).toBe('text-tlp-amber')
    expect(tlpTone('TLP:RED')).toBe('text-tlp-red')
  })

  it('paints AMBER+STRICT as AMBER, which is the standard, not a shortcut', () => {
    expect(tlpTone('TLP:AMBER+STRICT')).toBe(tlpTone('TLP:AMBER'))
  })

  it('keeps a marking it has never heard of legible', () => {
    // A level added server-side reaching a client that predates it. Dropping
    // the chip or painting it in the ground colour both publish a document
    // whose marking nobody can read.
    expect(tlpTone('TLP:PUCE')).toBe('text-tlp-clear')
  })

  it('reads a level the server spelled in lower case', () => {
    // The vocabulary is a wire value, not a literal in this tree, and TLP's own
    // documents write the levels both ways. A case-sensitive lookup would drop
    // a real marking into the unknown branch.
    expect(tlpTone('tlp:red')).toBe('text-tlp-red')
  })

  it('renders the label on the standard black ground', () => {
    render(<TlpChip tlp="TLP:AMBER" />)
    const chip = screen.getByTestId('tlp-chip')
    expect(chip).toHaveTextContent('TLP:AMBER')
    expect(chip.className).toContain('bg-tlp-ground')
    expect(chip.className).toContain('text-tlp-amber')
  })

  it('shows nothing for an unmarked report', () => {
    render(<TlpChip tlp="" />)
    expect(screen.queryByTestId('tlp-chip')).not.toBeInTheDocument()
  })
})
