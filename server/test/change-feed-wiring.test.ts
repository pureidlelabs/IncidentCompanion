/**
 * **Every service that writes announces what it wrote.**
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('a service that writes', () => {
  let harness: Harness
  let held: Record<string, boolean>

  beforeAll(async () => {
    harness = await boot()

    const { CasesService } = await import('../src/cases/cases.service.js')
    const { ComplianceService } = await import('../src/compliance/compliance.service.js')
    const { ReportLifecycleService } = await import('../src/report/lifecycle.service.js')
    const { ConflictsService } = await import('../src/collections/conflicts.service.js')

    const services: [string, never][] = [
      ['CasesService', CasesService as never],
      ['ComplianceService', ComplianceService as never],
      ['ReportLifecycleService', ReportLifecycleService as never],
      ['ConflictsService', ConflictsService as never],
    ]

    held = {}
    for (const [name, type] of services) {
      const service = harness.app.get(type)
      held[name] = Boolean(service.channel)
    }
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('holds a change feed, so what it writes reaches the other screens', () => {
    const missing = Object.entries(held)
      .filter(([, has]) => !has)
      .map(([name]) => name)
    expect(missing).toEqual([])
  })

  /** Guards the assertion above from passing on an empty set of services. */
  it('checked the services that declare one', () => {
    expect(Object.keys(held).length).toBeGreaterThanOrEqual(4)
  })
})
