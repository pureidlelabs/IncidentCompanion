/**
 * How a query parameter reaches the reference.
 *
 * `@nestjs/swagger` builds a parameter from every `@Query('name')` it finds and
 * marks it **required**, because the `?` that makes it optional is on the
 * handler's own parameter and nothing carries that to runtime. So a route happy
 * without one published it as one a caller must send, and a client generated
 * from the document sent it.
 */
import { applyDecorators } from '@nestjs/common'
import { ApiQuery } from '@nestjs/swagger'

/**
 * Publish these query parameters as optional, by name.
 *
 * The names are the wire's, so they match the `@Query('...')` beside them
 * rather than the binding in the signature -- which is not always the same
 * word. Their descriptions are not written here: `openapi.prose.ts` fills one
 * per name for every operation that takes it.
 *
 * `test/a-required-parameter-is-required.test.ts` is what holds this level with
 * the routes, by leaving each published parameter out and refusing a 200.
 */
export function OptionalQuery(...names: readonly string[]): MethodDecorator {
  return applyDecorators(...names.map((name) => ApiQuery({ name, required: false })))
}
