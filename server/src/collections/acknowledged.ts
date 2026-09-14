/**
 * The bare acknowledgements both collection doors answer with.
 *
 * **One declaration each, because the published document is keyed by the class
 * name.** `@nestjs/swagger` registers a DTO under its own name, so two
 * controllers declaring the same name share one entry and the second
 * registration describes the first's route. Two classes for one shape is what
 * makes that possible, and the shape is not per-route: what a row's deletion
 * answers is what an entry's deletion answers.
 *
 * **Here rather than in `domain/`.** That directory is aliased to `@contract`
 * and compiled into the browser bundle, so a `nestjs-zod` import there puts a
 * Nest DTO class in front of `ui/package.json`'s declared surface. A tier whose
 * two controllers share a shape shares it inside the tier.
 * -> `ui/src/bundled-deps.rule.test.ts`
 *
 * The sentence a route puts on its own answer stays on its own `@ZodResponse`,
 * which is where the two differ.
 */
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** The row is gone. */
export const deletedSchema = z.object({ deleted: z.literal(true) })

export class DeletedDto extends createZodDto(deletedSchema) {}

/** Ids, in the order the route answers for. */
export const createdIdsSchema = z.object({ ids: z.array(z.uuid()) })

export class CreatedIdsDto extends createZodDto(createdIdsSchema) {}
