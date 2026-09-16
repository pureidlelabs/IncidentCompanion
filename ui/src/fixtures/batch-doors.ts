import { batchCreatable } from '@/api/useBatchCreatableCollections'
import catalogue from '@/demo/catalogue/collections.json'

/**
 * The tables a batch may be written to, as the demo install serves them.
 *
 * Reduced by the query's own function from the catalogue the demo answers
 * `GET /api/collections` with, so a story asserts a shape an install serves
 * rather than a list somebody typed beside it.
 */
export const batchDoorsFixture = batchCreatable(catalogue)
