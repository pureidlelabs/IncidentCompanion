import 'reflect-metadata'

import { describe, expect, it } from 'vitest'

import { CollectionsController } from './collections.controller.js'
import { ENTITY_CONTROLLERS } from '../collections/entities.controller.js'
import { TimelineController } from '../collections/timeline.controller.js'

/**
 * The collection names that genuinely mount `POST :collection/bulk`.
 *
 * **The handler carries the route metadata, not the class.** Reading
 * `Reflect.getMetadata('path', Controller)` answers the *mount point* -
 * `api/cases/:caseId/systems` - so a set built from it is the roster of
 * subclasses under another name, and no change to a route could ever move it.
 * The handlers live on `EntityReads.prototype`, so the walk has to climb.
 */
function mountPath(controller: (typeof ENTITY_CONTROLLERS)[number] | typeof TimelineController): string {
  return String(Reflect.getMetadata('path', controller) ?? '').split('/').pop() ?? ''
}

function mountsBulk(
  controller: (typeof ENTITY_CONTROLLERS)[number] | typeof TimelineController,
): boolean {
  let proto: object | null = controller.prototype
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = Object.getOwnPropertyDescriptor(proto, name)?.value as unknown
      if (typeof handler === 'function' && Reflect.getMetadata('path', handler) === 'bulk') {
        return true
      }
    }
    proto = Object.getPrototypeOf(proto) as object | null
  }
  return false
}

/**
 * **`TimelineController` is beside the generated ones, not among them.** It is
 * its own controller because the timeline's two kinds validate apart, so a
 * sweep of `ENTITY_CONTROLLERS` alone cannot see its `bulk` route at all --
 * neither that it is there nor that it is missing.
 */
const BULK_ROUTE_CONTROLLERS = [...ENTITY_CONTROLLERS, TimelineController]

const withBulkRoute = new Set(BULK_ROUTE_CONTROLLERS.filter(mountsBulk).map(mountPath))

describe('the collections listing', () => {
  /**
   * **It gates an affordance, so a wrong answer is a button that 404s** - the
   * controller's own docstring. `ImportDataSection` builds its table picker
   * from `batch_create`, so a collection advertised here without the route
   * renders a working-looking importer that answers 404.
   */
  it('advertises a batch only where a bulk route is mounted', () => {
    const listing = new CollectionsController().listing()
    const advertised = Object.entries(listing)
      .filter(([, meta]) => meta.batch_create)
      .map(([name]) => name)

    expect(advertised.length).toBeGreaterThan(0)
    const missing = advertised.filter((name) => !withBulkRoute.has(name))
    expect(missing, 'advertised as batch-creatable with no bulk route').toEqual([])
  })

  /**
   * **The other direction, which the check above cannot see.** `EvidenceController`,
   * `ReportsController` and `ReportBlocksController` all extend `EntityReads`,
   * so `POST bulk` is mounted for them - and the listing says `false` for
   * evidence and omits the other two entirely. That is a working importer the
   * Import Data screen hides.
   *
   * Recorded as a known gap rather than asserted empty: whether `NO_BATCH` is
   * policy the route should *enforce* (guard the inherited route) or a stale
   * claim (drop it) is a decision, not a repair. The list is here so the
   * decision is made against a number rather than rediscovered.
   */
  it('records which mounted bulk routes the listing does not offer', () => {
    const listing = new CollectionsController().listing()
    const unadvertised = [...withBulkRoute].filter(
      (name) => name !== undefined && listing[name]?.batch_create !== true,
    )
    expect(unadvertised.sort()).toEqual(['evidence', 'report_blocks', 'reports'])
  })

  it('still advertises the collections that do have one', () => {
    const listing = new CollectionsController().listing()
    expect(listing['systems']?.batch_create).toBe(true)
    expect(listing['timeline']?.batch_create).toBe(true)
  })
})
