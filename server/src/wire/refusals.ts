/**
 * Which status a refusal carries, decided once so the whole door agrees.
 *
 * | | |
 * | --- | --- |
 * | **400** | JSON that does not parse; a path parameter of the wrong shape (`ParseUUIDPipe`); a header that is missing or malformed |
 * | **422** | a body that parsed and failed its schema, and a write refused for a reason the analyst can act on |
 *
 * The client unwraps a 422 specifically, to show its sentence beside the
 * control that caused it.
 */
import { UnprocessableEntityException } from '@nestjs/common'
import { createZodValidationPipe } from 'nestjs-zod'
import type { ZodError } from 'zod'
import { treeifyError } from 'zod'

/** The body every schema refusal carries, whichever route raised it. */
export function refusedBody(error: ZodError): { message: string; errors: unknown } {
  return { message: 'Validation failed', errors: treeifyError(error) }
}

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
