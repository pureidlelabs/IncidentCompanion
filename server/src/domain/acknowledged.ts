/**
 * The bare acknowledgements more than one route answers with.
 *
 * **One declaration each, because the published document is keyed by the class
 * name.** `@nestjs/swagger` registers a DTO under its own name and nothing here
 * passes `@ApiSchema`, so two controllers declaring the same name share one
 * entry and the second registration describes the first's route. Two classes
 * for one shape is the state that makes that possible, and the shape is not
 * per-route: what a row's deletion answers is what an entry's deletion answers.
 *
 * **Only what more than one tier allowed to reach here shares.** `access`,
 * `customers` and `accounts` may not reach `domain/` at all, so their identical
 * acknowledgements are theirs to declare and to name for their own door.
 * -> `architecture.test.ts`
 *
 * The sentence a route puts on its own response stays on its own
 * `@ZodResponse`, which is where it differs. -> `domain/written.ts`, #649
 */
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** The row is gone. */
export const deletedSchema = z.object({ deleted: z.literal(true) })

export class DeletedDto extends createZodDto(deletedSchema) {}

/** What a bulk create minted, in the order the caller sent them. */
export const createdIdsSchema = z.object({ ids: z.array(z.uuid()) })

export class CreatedIdsDto extends createZodDto(createdIdsSchema) {}
