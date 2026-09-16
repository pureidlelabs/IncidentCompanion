/**
 * Which status a refusal carries, decided once so the whole door agrees.
 *
 * | | |
 * | --- | --- |
 * | **400** | JSON that does not parse; a path parameter of the wrong shape (`ParseUUIDPipe`); a header that is missing or malformed |
 * | **422** | a body that parsed and failed its schema, a query that failed its own, and a write refused for a reason the analyst can act on |
 *
 * **A query is refused like a body and for the same reason.** A route binding
 * `@Query()` to a schema is validated by the pipe below, so a parameter outside
 * what it permits is read and refused rather than unreadable -- and the refusal
 * carries the field, which is the half a status cannot say.
 *
 * The client unwraps a 422 specifically, to show its sentence beside the
 * control that caused it.
 */
import { UnprocessableEntityException } from '@nestjs/common'
import { createZodValidationPipe } from 'nestjs-zod'
import type { ZodError } from 'zod'

import { refusedBody } from '../domain/refusal.js'

/**
 * The global body validator.
 *
 * **`strictSchemaDeclaration` is left off deliberately.** Several routes take
 * `@Body() body: unknown` and parse by hand - the archive export and the
 * account writes, where the refusal has to carry a sentence rather than a tree
 * - and turning it on makes those a 500 at request time rather than a compile
 * error.
 */
export const ValidationPipe = createZodValidationPipe({
  // The hook is typed `(error: unknown)`, so the narrowing happens here rather
  // than in the signature.
  createValidationException: (error: unknown) =>
    new UnprocessableEntityException(refusedBody(error as ZodError)),
})
