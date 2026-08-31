import { adviseIndicator, type Advice } from '@contract/indicator-shape'
import { adviseMalware } from '@contract/malware-shape'

import type { CollectionName } from './model'

export type { Advice }

/**
 * What to tell an analyst about the draft they are typing, short of refusing it.
 *
 * **Not `problemsIn`, and the two answer different questions.** That one
 * parses the server's own schemas and says what the write would be *refused*
 * on; this says what looks wrong about a value the write will accept.
 *
 * **Advice never reaches the server.** Nothing here is sent, nothing here
 * gates the submit, and the schemas are untouched: a wrong-looking value is
 * still written, because an analyst holding a half-redacted address or a value
 * straight off a vendor console is doing their job, and a form that refuses it
 * puts that value somewhere the case cannot see.
 *
 * **A dispatch rather than a rule engine, and it stays one at two arms.** Two
 * collections carry a field whose *shape* is predictable: an indicator, where
 * the kind predicts the value, and a malware sample's hash, which is hex at one
 * of four lengths. Nothing else here has that relationship - a hostname,
 * an account name and a filename are all things an analyst legitimately writes
 * however they like, and a rule firing on correct input is how a warning gets
 * ignored. Generalising for two cases is how a third gets a worse home.
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
