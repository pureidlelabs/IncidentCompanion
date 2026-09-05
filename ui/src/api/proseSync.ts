/**
 * A Yjs document for one prose field, over the case socket.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { useEffect, useMemo, useState } from 'react'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate }
  from 'y-protocols/awareness'
import { readSyncMessage, writeSyncStep1, writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'

import { acquireLink, releaseLink, type CaseLink, type Message } from './caseSocket'

/** Marks a transaction as arriving from the wire, so it is not sent back. */
export const REMOTE = Symbol('remote')

/**
 * Where the field is, and **the editor may not write until it is not
 * `opening`**.
 */
export type SyncStatus = 'opening' | 'ready' | 'refused'

const base64 = {
  encode(bytes: Uint8Array): string {
    // Chunked: `String.fromCharCode(...bytes)` throws on a document of any
    // size, and a report section reaches tens of kilobytes easily.
    let binary = ''
    const CHUNK = 0x8000
    for (let at = 0; at < bytes.length; at += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
    }
    return btoa(binary)
  },
  decode(text: string): Uint8Array | null {
    try {
      const binary = atob(text)
      const bytes = new Uint8Array(binary.length)
      for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at)
      return bytes
    } catch {
      // A frame this build cannot read is dropped, exactly as the server
      // drops one it cannot decode. Throwing here would take the roster down
      // with it -- the whole socket shares one listener list.
      return null
    }
  },
}

export { base64 }

export interface ProseChannelOptions {
  /** Drawn on the remote caret. */
  user?: { name: string; color?: string }
  /** Told whenever the status changes. */
  onStatus?: (status: SyncStatus) => void
}

/**
 * One field's document, its carets, and the traffic for both.
 */
export class ProseChannel {
  /**
   * **`gc: false`, and it cannot be decided later.**
   */
  readonly doc = new Y.Doc({ gc: false })
  readonly awareness: Awareness
  status: SyncStatus = 'opening'

  /**
   * When the report was filed, as the server named it, once it has refused a
   * frame.
   */
  refusedAt: string | null = null

  /**
   * **Public because `CollaborationCaret` has to be handed the same object.**
   */
  readonly user: { name: string; color?: string } | null

  private readonly stops: (() => void)[] = []
  private done = false

  constructor(
    private readonly link: CaseLink,
    private readonly field: string,
    private readonly options: ProseChannelOptions = {},
  ) {
    this.user = options.user ?? null
    this.awareness = new Awareness(this.doc)
    // **Set unconditionally, even to `null`.** A client that has never
    // written a local state sits at clock 0, and `applyAwarenessUpdate`
    // admits a client it has not seen only when the incoming clock is
    // *greater* than the zero it assumes - so an update from an untouched
    // awareness is silently discarded by every receiver, and that analyst has
    // no caret anywhere. Writing the field once takes the clock to 1.
    this.awareness.setLocalStateField('user', options.user ?? null)

    this.stops.push(link.subscribe((message) => { this.receive(message) }))
    this.stops.push(link.onConnected((up) => {
      if (!up) return
      // **Re-sent on every connect, not just the first.** The server has no
      // memory of which fields this socket had open, so after a drop it would
      // never answer -- and a reconnecting client that skipped this would sit
      // on a document that stopped receiving anyone else's edits. A state
      // vector is also the right thing to send after a gap: it says what this
      // client has, so the answer is only what it missed.
      this.hello()
      // **And say who we are again.** The identity is set in this constructor,
      // which routinely runs before the socket is up -- the awareness update
      // it fires is dropped, and the other analyst gets a caret with no name
      // on it until this client next moves the cursor. After a reconnect it is
      // worse: everyone else has already removed us.
      this.announce()
    }))

    this.doc.on('update', this.onLocalUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
  }

  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    // Not what we just applied from the wire: the server has it already, so
    // echoing makes a round trip per keystroke per client and grows with the
    // number of tabs.
    if (origin === REMOTE || this.done) return
    this.send(writeUpdate, update)
  }

  /** Tell the server what this client has, and let it answer the difference. */
  private hello(): void {
    this.send(writeSyncStep1, this.doc)
  }

  /**
   * Encode one `y-protocols` sync message and put it on the wire.
   */
  private send<T>(
    write: (encoder: encoding.Encoder, value: T) => void,
    value: T,
  ): void {
    const encoder = encoding.createEncoder()
    write(encoder, value)
    this.link.send({
      type: 'prose.sync',
      field: this.field,
      update: base64.encode(encoding.toUint8Array(encoder)),
    })
  }

  private onAwarenessUpdate = (
    changed: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === REMOTE || this.done) return
    const clients = [...changed.added, ...changed.updated, ...changed.removed]
    this.link.send({
      type: 'prose.awareness',
      field: this.field,
      update: base64.encode(encodeAwarenessUpdate(this.awareness, clients)),
    })
  }

  private receive(message: Message): void {
    if (message.field !== this.field) return
    const kind = message.type

    /**
     * **Terminal, and checked before anything else.**
     */
    if (kind === 'prose.refused') {
      this.refusedAt = typeof message.sentAt === 'string' ? message.sentAt : null
      this.settle('refused')
      return
    }
    if (this.status === 'refused') return

    if (kind === 'prose.sync') {
      const bytes = typeof message.update === 'string'
        ? base64.decode(message.update) : null
      if (!bytes) return
      const reply = encoding.createEncoder()
      try {
        readSyncMessage(decoding.createDecoder(bytes), reply, this.doc, REMOTE)
      } catch {
        // A frame this build cannot read is dropped, exactly as the server
        // drops one it cannot decode. Throwing would take the roster down
        // with it - the whole socket shares one listener list.
        return
      }
      // **Only when there is something to say.** `readSyncMessage` writes into
      // the encoder for a step 1 and leaves it empty for everything else, so
      // this check is what stops every applied update answering with a
      // one-byte message.
      if (encoding.length(reply) > 0) {
        this.link.send({
          type: 'prose.sync',
          field: this.field,
          update: base64.encode(encoding.toUint8Array(reply)),
        })
      }
      // **Settled by the first answer, whatever it carried.** An empty
      // document and a full one are both answers; what the editor waits for is
      // to know nothing more is in flight.
      this.settle('ready')
      return
    }

    if (kind === 'prose.awareness') {
      const bytes = typeof message.update === 'string'
        ? base64.decode(message.update) : null
      if (!bytes) return
      const known = this.awareness.getStates().size
      applyAwarenessUpdate(this.awareness, bytes, REMOTE)
      // **A client we had not seen gets told about us, unprompted.** Carets
      // are never stored, so there is nothing for a joiner to be handed - it
      // learns who is here only from what people send while it is listening,
      // and everyone already here has no other reason to speak. Bounded: the
      // reply only fires when the roster grew, so two clients settle after one
      // exchange rather than answering each other for ever.
      if (this.awareness.getStates().size > known) this.announce()
    }
  }

  /** Tell the others this client's own caret and name. */
  private announce(): void {
    if (this.done) return
    this.link.send({
      type: 'prose.awareness',
      field: this.field,
      update: base64.encode(
        encodeAwarenessUpdate(this.awareness, [this.doc.clientID])),
    })
  }

  private settle(status: SyncStatus): void {
    if (this.status === status) return
    this.status = status
    this.options.onStatus?.(status)
  }

  destroy(): void {
    if (this.done) return
    // **Nothing is flushed here any more.** The server applied every update as
    // it arrived and owns persisting the document, so a closing tab has
    // nothing the record is missing.
    //
    // **The goodbye goes out while this is still a live channel.** Clearing
    // the local state fires the ordinary awareness handler, which sends a
    // removal the other clients apply - and `awareness.destroy()` does the
    // same thing too late to be sent, because by then the handler is off and
    // the socket subscription is gone. Without this a closed tab leaves a
    // cursor in the text until the others time it out.
    this.awareness.setLocalState(null)

    this.done = true
    this.doc.off('update', this.onLocalUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    for (const stop of this.stops) stop()
    this.awareness.destroy()
    this.doc.destroy()
  }
}

/**
 * Everyone in one document shares one channel.
 */
const shared = new Map<
  string,
  {
    channel: ProseChannel
    holders: number
    /**
     * **Every holder, not the one that opened it.**
     */
    listeners: Set<(status: SyncStatus) => void>
  }
>()

function acquireDocument(
  caseId: string,
  docKey: string,
  user: { name: string; color?: string } | undefined,
  onStatus: (status: SyncStatus) => void,
): ProseChannel {
  const key = `${caseId}/${docKey}`
  const held = shared.get(key)
  if (held) {
    held.holders += 1
    held.listeners.add(onStatus)
    // **Told the current status immediately.** A section mounting into a
    // document that settled minutes ago would otherwise wait for an event that
    // has already happened and never build its editor.
    onStatus(held.channel.status)
    return held.channel
  }

  const listeners = new Set<(status: SyncStatus) => void>([onStatus])
  const link: CaseLink = acquireLink(caseId, (url) => new WebSocket(url))
  const channel = new ProseChannel(link, docKey, {
    ...(user ? { user } : {}),
    // `settle` has already written `channel.status`; this only fans it out.
    onStatus: (status) => {
      for (const listener of [...listeners]) listener(status)
    },
  })
  shared.set(key, { channel, holders: 1, listeners })
  return channel
}

function releaseDocument(
  caseId: string,
  docKey: string,
  onStatus: (status: SyncStatus) => void,
): void {
  const key = `${caseId}/${docKey}`
  const held = shared.get(key)
  if (!held) return
  held.listeners.delete(onStatus)
  // **`holders`, not `listeners.size`.** A Set dedupes, so two sections that
  // happened to pass the same function identity would tear the channel down
  // one release early.
  held.holders -= 1
  if (held.holders > 0) return
  shared.delete(key)
  held.channel.destroy()
  releaseLink(caseId)
}

/**
 * The channel for one *document*, opened and torn down with the component.
 */
export function useProseSync(
  caseId: string,
  docKey: string,
  user?: { name: string; color?: string },
): { channel: ProseChannel | null; status: SyncStatus; settled: boolean } {
  const [status, setStatus] = useState<SyncStatus>('opening')

  // The user is read once, when the channel is built: it names the caret, and
  // rebuilding the document because a colour changed would drop the session.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the fields are the dependency, not the object
  const identity = useMemo(() => user, [user?.name, user?.color])

  const [channel, setChannel] = useState<ProseChannel | null>(null)

  useEffect(() => {
    // No case, no field, or no `WebSocket` (jsdom has none): the body stays
    // the ordinary single-writer one rather than opening a channel to nothing.
    if (!caseId || !docKey || typeof WebSocket === 'undefined') return undefined
    const live = acquireDocument(caseId, docKey, identity, setStatus)
    // **A second render, on purpose.** `react-hooks/set-state-in-effect`
    // is refusing the cascade, and the cascade is the feature: the channel
    // is an imperative object with a lifecycle, it cannot exist before the
    // effect runs, and `settled` below keeps the editor from being built
    // until it does. Building one and swapping it when the channel lands
    // costs a rebuild, a blank flash, and a class of bug where anything
    // guarded "once" is spent by the instance being thrown away.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChannel(live)
    return () => {
      setChannel(null)
      setStatus('opening')
      releaseDocument(caseId, docKey, setStatus)
    }
  }, [caseId, docKey, identity])

  /**
   * **Is the mode decided?** Not "is it live" - a field that will never have a
   * channel (no case, no `WebSocket`) is decided too, as single-writer.
   */
  const possible = Boolean(caseId) && Boolean(docKey)
    && typeof WebSocket !== 'undefined'
  const settled = !possible || (channel !== null && status !== 'opening')

  return { channel, status, settled }
}
