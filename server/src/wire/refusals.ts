/**
 * Which status a refusal carries, decided once so the whole door agrees.
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
 */
export const ValidationPipe = createZodValidationPipe({
  // The hook is typed `(error: unknown)`, so the narrowing happens here rather
  // than in the signature.
  createValidationException: (error: unknown) =>
    new UnprocessableEntityException(refusedBody(error as ZodError)),
})
