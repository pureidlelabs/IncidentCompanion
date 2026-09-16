/**
 * The body a schema refusal carries, in one place both sides can reach.
 *
 * **Here rather than in `wire/`, because it is vocabulary rather than
 * mechanism.** `collections/` may not import `wire/` and raises a pipe of its
 * own, which is how a second description of this body came to exist; this tier
 * is the one every folder may read, and the client reads it as `@contract`.
 *
 * Which status carries it is `wire/refusals.ts`.
 */
import type { ZodError } from 'zod'

/**
 * **The issues as Zod lists them, not a tree.** The client reads `errors` as a
 * list and answers no fields for anything else, and an issue is what carries
 * the `path` saying which field it is about.
 * -> `a-refusal-names-the-field-it-is-about.test.ts`
 */
export function refusedBody(error: ZodError): { message: string; errors: unknown } {
  return { message: 'Validation failed', errors: error.issues }
}
