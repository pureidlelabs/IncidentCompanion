/**
 * A value an analyst pasted, with the characters nobody can see taken out.
 */
import { z } from 'zod'

import { withoutInvisibles } from './invisible.lists.js'

export { INVISIBLE, withoutInvisibles } from './invisible.lists.js'

/**
 * Wrap a string schema so a pasted value is cleaned before it is judged.
 */
export function pasted<T extends z.ZodType>(schema: T): T {
  return z.preprocess(
    (value) => (typeof value === 'string' ? withoutInvisibles(value) : value),
    schema,
  ) as unknown as T
}
