/**
 * A read-only analyst opening a row is told so by the socket's `claim.refused`
 * frame, in the dialog holding that row.
 */
import { act, render, screen } from '@testing-library/react'
import { useMemo } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as caseSocket from '@/api/caseSocket'
import { formSpec } from '@/api/specs'
import { specsFixture } from '@/fixtures/specs'

const listeners = new Set<(message: Record<string, unknown>) => void>()
const link = {
  send: () => {
    /* the server's answer is delivered by hand below */
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

vi.mock('@/api/caseSocket', async (importOriginal) => ({
  ...(await importOriginal<typeof caseSocket>()),
  acquireLink: () => link,
  releaseLink: () => {
    /* the stub link is shared and outlives every test */
  },
}))

const { useCasePresence } = await import('@/api/presence')
const { ClaimsProvider } = await import('@/components/blocks/presence')
const { EntityDialog } = await import('@/components/blocks/entity-dialog')

beforeEach(() => {
  listeners.clear()
  // The hook opens nothing without a constructor to find.
  ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = class Stub {
    close() {
      /* never opened */
    }
  }
})

function OpenOn({ entryId }: { entryId: string }) {
  const presence = useCasePresence('case-1')
  const claims = useMemo(
    () => ({
      holderOf: presence.holderOf,
      claim: presence.claim,
      release: presence.release,
      refused: presence.refused,
      you: 'u-me',
    }),
    [presence.holderOf, presence.claim, presence.release, presence.refused],
  )
  return (
    <ClaimsProvider value={claims}>
      <EntityDialog
        open
        onOpenChange={() => undefined}
        title="Edit system"
        form={formSpec(specsFixture, 'SYSTEM_FIELDS')}
        collection="systems"
        entry={{ id: entryId }}
        onCreate={() => undefined}
      />
    </ClaimsProvider>
  )
}

function serverRefuses(table: string, id: string): void {
  act(() => {
    for (const listener of [...listeners]) {
      listener({ type: 'claim.refused', table, id, reason: 'read-only' })
    }
  })
}

describe('a refused claim', () => {
  it('says the case is read-only in the dialog holding the row', () => {
    render(<OpenOn entryId="s-1" />)
    expect(screen.queryByText('You cannot write to this case')).toBeNull()

    serverRefuses('systems', 's-1')

    expect(screen.getByText('You cannot write to this case')).toBeTruthy()
  })

  it('says nothing in a dialog holding another row', () => {
    render(<OpenOn entryId="s-2" />)

    serverRefuses('systems', 's-1')

    expect(screen.queryByText('You cannot write to this case')).toBeNull()
  })
})
