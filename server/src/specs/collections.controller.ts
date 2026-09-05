/**
 * `GET /api/collections` - which tables exist, and which take a batch.
 */
import { Controller, Get } from '@nestjs/common'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { COLLECTION_SCHEMAS, IMPORTABLE } from '../domain/collections.js'
import { eventWriteSchema } from '../domain/entities/timeline.js'

/**
 * **`evidence` takes no batch, and it is not an oversight.**
 */
const NO_BATCH = new Set(['evidence'])

/**
 * Collections that mount a bulk route without appearing in `COLLECTION_SCHEMAS`.
 */
const BULK_WITHOUT_A_SINGLE_SCHEMA = new Set(['timeline'])

/**
 * **Derived, not written again.**
 */
const COLLECTIONS: Record<string, z.ZodObject> = {
  ...COLLECTION_SCHEMAS,
  timeline: eventWriteSchema,
}

/**
 * **Keyed by collection name, so it is a record rather than a list.**
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
