import { adviseIndicator, type Advice } from '@contract/indicator-shape'
import { adviseMalware } from '@contract/malware-shape'

import type { CollectionName } from './model'

export type { Advice }

/**
 * What to tell an analyst about the draft they are typing, short of refusing it.
 *
 * **Advice never reaches the server.** Nothing here is sent, nothing here
 * gates the submit, and the schemas are untouched: a wrong-looking value is
 * still written, because an analyst holding a half-redacted address or a value
 * straight off a vendor console is doing their job, and a form that refuses it
 * puts that value somewhere the case cannot see.
 */
export function adviceFor(
  collection: CollectionName | null | undefined,
  draft: Readonly<Record<string, unknown>>,
): Advice {
  const text = (name: string): string | undefined => {
    const held = draft[name]
    return typeof held === 'string' ? held : undefined
  }

  // Spread conditionally rather than passing `undefined`: the client compiles
  // under `exactOptionalPropertyTypes`, where an absent key and a key holding
  // `undefined` are different types.
  if (collection === 'network_indicators') {
    return adviseIndicator({
      ...(text('type') === undefined ? {} : { type: text('type') }),
      ...(text('value') === undefined ? {} : { value: text('value') }),
      ...(text('port') === undefined ? {} : { port: text('port') }),
    })
  }

  if (collection === 'malware') {
    return adviseMalware({ ...(text('hash') === undefined ? {} : { hash: text('hash') }) })
  }

  return NONE
}

const NONE: Advice = {}
