/**
 * **A door wears the glyph of the section it opens.**
 *
 * The file door landed on the file importer wearing the glyph the rail gives
 * the Sentinel section, so an analyst saw that glyph twice for two different
 * destinations and the tile said it went to the one it did not.
 *
 * Read off the rendered glyph rather than off the source, so an icon passed
 * through a wrapper or renamed at the import is still the one compared. The
 * `lucide-` tokens only: the tile sizes its own glyph and the bare render does
 * not, so the full class strings differ over something that is not identity.
 *
 * **What this does not reach is where a tile navigates to**, which is
 * `NewCaseContainer`'s. Pointing that at another slug leaves this green while
 * the glyph becomes confidently wrong -- so this holds the tile to a section,
 * and nothing holds the section to the route.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DOOR_LABELS, SECTIONS } from '@/components/blocks/case-sections'
import { StartCasePane } from '@/components/blocks/start-case-pane'

/** Which glyph, by the `lucide-` tokens that carry its name. */
function glyphOf(within: HTMLElement): string[] {
  const classes = within.querySelector('svg')?.getAttribute('class') ?? ''
  return classes
    .split(/\s+/)
    .filter((one) => one.startsWith('lucide-'))
    .sort()
}

function glyphOfSection(slug: string): string[] {
  const Icon = SECTIONS[slug]?.icon
  if (!Icon) throw new Error(`no section ${slug}`)
  const { container } = render(<Icon />)
  return glyphOf(container)
}

/** The tile carrying this text, as the element an analyst presses. */
function tile(label: string): HTMLElement {
  const found = screen.getByText(label).closest('button, a, [role="button"]')
  if (!found) throw new Error(`no tile for ${label}`)
  return found as HTMLElement
}

describe('the pane a case starts from', () => {
  const DOORS = ['import', 'import-sentinel'] as const

  it.each(DOORS)('draws the %s door with the glyph of the section it opens', (slug) => {
    render(
      <StartCasePane
        onBlank={() => undefined}
        onImport={() => undefined}
        onLiveSource={() => undefined}
      />,
    )

    const wanted = glyphOfSection(slug)
    expect(wanted, 'the section draws no glyph, so this compares nothing').not.toEqual([])
    expect(
      glyphOf(tile(DOOR_LABELS[slug])),
      `the ${slug} door wears a glyph that belongs to another section`,
    ).toEqual(wanted)
  })

  /**
   * Both doors are covered above only while they name different glyphs. Two
   * sections sharing one would make either case pass against the other's.
   */
  it('offers two doors that are told apart by their glyphs', () => {
    expect(glyphOfSection('import')).not.toEqual(glyphOfSection('import-sentinel'))
  })

  it('draws no Sentinel door on an install that does not import from it', () => {
    render(<StartCasePane onBlank={() => undefined} onImport={() => undefined} />)
    expect(screen.queryByText(DOOR_LABELS['import-sentinel'])).not.toBeInTheDocument()
  })
})
