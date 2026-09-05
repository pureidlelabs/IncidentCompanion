/**
 * Every field the reference describes is a field the schema has.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { FORM_SCHEMAS } from '../src/specs/specs.controller.js'

/**
 * `serialise` emits an array, and a section divider is an entry with no `name`.
 * Only the named entries describe a field.
 */
interface Served {
  forms: Record<string, { collection: string; fields: { name?: string }[] }>
}

const describedBy = (form: Served['forms'][string] | undefined) =>
  new Set((form?.fields ?? []).map((one) => one.name).filter((one): one is string => Boolean(one)))

/**
 * Fields a form deliberately does not offer, and why.
 */
const WITHHELD: Readonly<Record<string, readonly string[]>> = {
  EVENT_FIELDS: ['kind'],
  TIMELINE_ACTION_FIELDS: ['kind'],
}

let harness: Harness | null = null
let admin: Persona
let served: Served | null = null

describe.skipIf(!(await bootable()))('the reference this install serves', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const answer = await fetch(`${harness.base}/api/specs`, { headers: { cookie: admin.cookie } })
    expect(answer.status, 'the reference did not answer a signed-in caller').toBe(200)
    served = (await answer.json()) as Served
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('describes every form the install declares, and no other', () => {
    expect(
      Object.keys(served!.forms).sort(),
      'the reference describes a different set of forms than the install declares',
    ).toEqual(Object.keys(FORM_SCHEMAS).sort())
  })

  it.each(Object.keys(FORM_SCHEMAS))('%s describes no field its schema does not have', (name) => {
    const shape = new Set(Object.keys(FORM_SCHEMAS[name]!.schema.shape))
    expect(shape.size, `${name} has no fields, so this asserts nothing`).toBeGreaterThan(0)

    const invented = [...describedBy(served!.forms[name])].filter((field) => !shape.has(field)).sort()

    expect(
      invented,
      `${name} describes fields the schema does not have, which is a reference written in ` +
        'by hand rather than derived',
    ).toEqual([])
  })

  it.each(Object.keys(FORM_SCHEMAS))('%s leaves out no field its schema has', (name) => {
    const described = describedBy(served!.forms[name])
    const withheld = new Set(WITHHELD[name] ?? [])
    const missing = Object.keys(FORM_SCHEMAS[name]!.schema.shape)
      .filter((field) => !described.has(field) && !withheld.has(field))
      .sort()

    expect(
      missing,
      `${name} has fields the reference does not describe, so an analyst is told the form ` +
        'is smaller than it is',
    ).toEqual([])
  })
})
