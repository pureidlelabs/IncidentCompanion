import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { entityTiers } from '@/api/dialogLayout'
import { formSpec, type FormSpec } from '@/api/specs'
import { EntityDialog } from '@/components/blocks/entity-dialog'
import { specsFixture } from '@/fixtures/specs'

/**
 * What the identity plate does at the two shapes the served specs take.
 *
 * The forms are read off `specs.json` rather than hand-written, so a schema
 * that stops declaring `tier` moves these cases rather than leaving them
 * asserting a shape nothing serves. `withTier` and `withoutTier` are asserted
 * non-empty, or a rename passes this file by drawing nothing on both sides.
 */
const named = Object.keys(specsFixture.forms)
const withTier = named.filter(
  (name) => entityTiers(formSpec(specsFixture, name)).identity.length > 0,
)
const withoutTier = named.filter(
  (name) => entityTiers(formSpec(specsFixture, name)).identity.length === 0,
)

function open(form: FormSpec) {
  render(
    <EntityDialog
      open
      onOpenChange={() => undefined}
      title="A form"
      form={form}
      onCreate={() => undefined}
    />,
  )
}

describe('the identity plate', () => {
  it('has both shapes to test', () => {
    expect(withTier.length).toBeGreaterThan(0)
    expect(withoutTier.length).toBeGreaterThan(0)
  })

  it.each(withoutTier)('draws nothing at all for %s, which declares no tier', (name) => {
    open(formSpec(specsFixture, name))
    expect(screen.queryByLabelText('Identity')).toBeNull()
  })

  it.each(withTier)('draws the plate for %s, holding every identity field', (name) => {
    const form = formSpec(specsFixture, name)
    open(form)

    const plate = screen.getByLabelText('Identity')
    // The plate's own ground, which is the whole of what an empty one drew.
    expect(plate.className).toContain('border')
    for (const field of entityTiers(form).identity) {
      expect(plate.textContent).toContain(field.label)
    }
  })
})
