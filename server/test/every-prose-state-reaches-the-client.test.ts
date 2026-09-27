/**
 * Every state the install can say about a document's unsaved words is one the
 * browser's channel reads, so the two ends cannot disagree about the vocabulary.
 */
import { describe, expect, it } from 'vitest'

import type { CaseLink, Message } from '../../ui/src/api/caseSocket.js'
import { ProseChannel } from '../../ui/src/api/proseSync.js'
import { PROSE_STATES, type ProseStateFrame } from '../src/domain/prose-state.js'

const FIELD = 'casenotes:00000000-0000-0000-0000-000000000000:document'

/** A link that delivers what the test says and sends nowhere. */
function link(): CaseLink & { deliver(message: Message): void } {
  const listeners = new Set<(message: Message) => void>()
  return {
    connected: false,
    send: () => undefined,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onConnected: () => () => undefined,
    deliver(message) {
      for (const listener of [...listeners]) listener(message)
    },
  }
}

describe('the unsaved-words vocabulary', () => {
  it.each(PROSE_STATES)('is read by the browser when the install says %s', (state) => {
    const wire = link()
    const channel = new ProseChannel(wire, FIELD)
    // From a state other than the one under test, so reading it is a change.
    const before: ProseStateFrame = { type: 'prose.state', field: FIELD, state: state === 'unsaved' ? 'lost' : 'unsaved' }
    wire.deliver({ ...before })
    let heard = 0
    channel.watchUnsaved(() => (heard += 1))

    const frame: ProseStateFrame = { type: 'prose.state', field: FIELD, state }
    wire.deliver({ ...frame })

    expect(heard).toBe(1)
    expect(channel.unsaved).toBe(state === 'saved' ? null : state)
    channel.destroy()
  })
})
