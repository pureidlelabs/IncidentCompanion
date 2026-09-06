/**
 * `GET /api/collections` - which tables exist, and which take a batch.
 *
 * **The field list is the schema's own keys**, never a second description of
 * them.
 *
 * **The roster below is derived from `COLLECTION_SCHEMAS`**, so a collection
 * added to `domain/collections.ts` is served here without anybody editing this
 * file.
 *
 * **The client fetches this `raw`** - the response is keyed by collection name
 * (`network_indicators`), and the camelising pass would rewrite those keys into
 * tables nothing has heard of. So `batch_create` is snake_case too, matching
 * what `collections.ts` reads.
 *
 * **It gates an affordance, so a wrong answer is a button that 404s.** The
 * batch flag is what the CSV import reads to decide whether to offer a bulk
 * write at all.
 */
import { Controller, Get } from '@nestjs/common'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { COLLECTION_SCHEMAS, IMPORTABLE } from '../domain/collections.js'
import { eventWriteSchema } from '../domain/entities/timeline.js'

/**
 * **`evidence` takes no batch, and it is not an oversight.** Its rows describe
 * bytes on disk - a hash and a path that a create computes rather than accepts
 * - so a batch door would mint records claiming files nobody uploaded.
 *
 * The only entry here, because it is the only one that is *policy*. A
 * collection with no bulk route at all falls out of `IMPORTABLE` below without
 * being named.
 */
const NO_BATCH = new Set(['evidence'])

/**
 * Collections that mount a bulk route without appearing in `COLLECTION_SCHEMAS`.
 *
 * **One entry, and it earns the exception.** The timeline is absent from that
 * registry because its two kinds validate apart, and this route read that
 * absence as "no bulk route" -- which was true until `timeline.controller.ts`
 * mounted `POST bulk` for the importer that had been posting to it. The listing
 * is what the Import Data screen offers, so a false here is the feature staying
 * hidden with the route in place.
 *
 * **Held by driving the routes, not by matching this list against another
 * one.** `test/timeline-bulk.test.ts` and the agreement case in
 * `collections.controller.test.ts` post to every collection this file
 * advertises and refuse a 404.
 */
const BULK_WITHOUT_A_SINGLE_SCHEMA = new Set(['timeline'])

/**
 * **Derived, not written again.** `COLLECTION_SCHEMAS` is every collection the
 * registry gives a single row schema - the nine this route served by hand - and
 * the timeline is added beside it because it is addressable and readable even
 * though its two kinds validate apart. Writing the roster here made this the
 * eighth copy of it, and the copies drift silently.
 */
const COLLECTIONS: Record<string, z.ZodObject> = {
  ...COLLECTION_SCHEMAS,
  timeline: eventWriteSchema,
}

/**
 * **Keyed by collection name, so it is a record rather than a list.** The keys
 * are the table names a caller addresses (`network_indicators`), which is why
 * the client fetches this one raw - see the note at the top of the file.
 */
export const collectionsListingSchema = z.record(
  z.string(),
  z.object({
    fields: z.array(z.string()).describe("The schema's own keys, in declaration order."),
    batch_create: z.boolean().describe('Whether this table accepts a bulk write.'),
  }),
)

class CollectionsListingDto extends createZodDto(collectionsListingSchema) {}

@Controller('api/collections')
export class CollectionsController {
  @Get()
  @ZodResponse({
    status: 200,
    type: CollectionsListingDto,
    description: 'Which tables exist, their fields, and which take a batch.',
  })
  listing(): z.infer<typeof collectionsListingSchema> {
    return Object.fromEntries(
      Object.entries(COLLECTIONS).map(([name, schema]) => [
        name,
        {
          fields: Object.keys(schema.shape),
          // A bulk route needs a single schema to validate against, which is
          // what `IMPORTABLE` means, and then policy on top of it.
          batch_create:
            (IMPORTABLE.includes(name) || BULK_WITHOUT_A_SINGLE_SCHEMA.has(name)) &&
            !NO_BATCH.has(name),
        },
      ]),
    )
  }
}
