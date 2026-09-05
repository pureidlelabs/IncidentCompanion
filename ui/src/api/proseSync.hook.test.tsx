/**
 * Two sections of one report, which is every report an analyst writes.
 *
 * **`proseSync.test.ts` exercises `ProseChannel` against a fake server and
 * never mounts the hook**, and that is exactly where the defect lived: the
 * shared entry held one status callback, belonging to whichever component
 * created the channel. A report's sections are separate subtrees sharing one
 * document, and React flushes their effects in one pass -- so the second
 * onwards acquired while the socket was still opening, were told `opening`
 * once, and were never told again. `settled` stayed false, the editor was
 * never built, and a nine-section report drew one writable body and eight
 * loading skeletons for as long as it was open.
 */
import { act, renderHook } from '@testing-library/react'
import * as encoding from 'lib0/encoding'
import type * as caseSocket from './caseSocket'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeSyncStep1 } from 'y-protocols/sync'
import * as Y from 'yjs'

/** One link, as the case socket is: both sections' channels ride it. */
const listeners = new Set<(message: Record<string, unknown>) => void>()
const link = {
  send: () => {
    /* the stub link swallows what the hook sends; nothing reads it back */
  },
  subscribe: (listener: (message: Record<string, unknown>) => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  onConnected: (listener: (up: boolean) => void) => {
    listener(true)
    return () => {
      /* nothing to unsubscribe from on a stub */
    }
  },
}

vi.mock('./caseSocket', async (importOriginal) => ({
  ...(await importOriginal<typeof caseSocket>()),
  acquireLink: () => link,
  releaseLink: () => {
    /* the stub link is shared and outlives every test */
  },
}))

const { base64, useProseSync } = await import('./proseSync')

const DOC = 'reports:r1:document'

beforeEach(() => {
  listeners.clear()
  // The hook opens no channel without one, so without this the whole test
  // asserts the read-only path instead of the shared one.
  ;// Presence, not behaviour: the hook only checks that the constructor exists.
  ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = class Stub {
    close() {
      /* never opened */
    }
  }
})

/** The answer the server sends once, to whoever is listening. */
function serverAnswers(): void {
  const encoder = encoding.createEncoder()
  writeSyncStep1(encoder, new Y.Doc())
  const message = {
    type: 'prose.sync',
    field: DOC,
    update: base64.encode(encoding.toUint8Array(encoder)),
  }
  for (const listener of [...listeners]) listener(message)
}

describe('two sections of one report', () => {
  it('both leave opening when the document answers', () => {
    const first = renderHook(() => useProseSync('case-1', DOC))
    const second = renderHook(() => useProseSync('case-1', DOC))

    act(() => {
      serverAnswers()
    })

    expect(first.result.current.settled).toBe(true)
    // The one that matters: it acquired while the socket was still opening.
    expect(second.result.current.settled).toBe(true)
  })

  /**
   * The second-order half: a single listener belonging to the section that
   * opened the channel leaves the survivors deaf when it unmounts.
   */
  it('keeps telling the rest after the first section goes', () => {
    const first = renderHook(() => useProseSync('case-1', DOC))
    const second = renderHook(() => useProseSync('case-1', DOC))
    first.unmount()

    act(() => {
      serverAnswers()
    })

    expect(second.result.current.settled).toBe(true)
  })
})
