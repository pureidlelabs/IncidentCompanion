/**
 * Analysts writing a report through the booted app: HTTP as the browser sends
 * it, and prose over a real case socket.
 */
import * as encoding from 'lib0/encoding'
import { WebSocket } from 'ws'
import { writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'

import type { Harness, Persona } from './app-harness.js'

export type Call = (path: string, method?: string, body?: unknown) => Promise<Response>

/** Requests as `who`, under `/api`. */
export function caller(harness: Harness, who: Persona): Call {
  return (path, method = 'GET', body) =>
    fetch(`${harness.base}/api${path}`, {
      method,
      headers: { cookie: who.cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`)
  return (await response.json()) as T
}

export async function aCase(call: Call, title: string): Promise<string> {
  return (await json<{ id: string }>(await call('/cases', 'POST', { title }))).id
}

export interface Block {
  id: string
  version: number
  reportId: string
  position: number
  kind: string
  heading: string
  headingKey: string
}

/** A draft report holding one written block per heading, in that order. */
export async function aDraft(
  call: Call,
  caseId: string,
  headings: readonly string[],
): Promise<{ id: string; blocks: Block[] }> {
  const { id } = await json<{ id: string }>(
    await call(`/cases/${caseId}/reports`, 'POST', { label: `Draft ${String(Date.now())}` }),
  )
  const blocks: Block[] = []
  for (const [position, heading] of headings.entries()) {
    blocks.push(
      await json<Block>(
        await call(`/cases/${caseId}/report_blocks`, 'POST', { reportId: id, heading, position, kind: 'written' }),
      ),
    )
  }
  return { id, blocks }
}

export async function blocksOf(call: Call, caseId: string, reportId: string): Promise<Block[]> {
  const all = await json<Block[]>(await call(`/cases/${caseId}/report_blocks`))
  return all.filter((block) => block.reportId === reportId).sort((a, b) => a.position - b.position)
}

/** One paragraph appended to `fragment`, as the sync update frame an editor sends. */
export function typed(doc: Y.Doc, fragment: string, text: string): string {
  let update: Uint8Array | null = null
  const take = (bytes: Uint8Array) => {
    update = bytes
  }
  doc.on('update', take)
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  doc.getXmlFragment(fragment).push([paragraph])
  doc.off('update', take)
  const encoder = encoding.createEncoder()
  writeUpdate(encoder, update!)
  return Buffer.from(encoding.toUint8Array(encoder)).toString('base64')
}

/** The text of a stored or live document's fragment. */
export function textOf(bytes: Uint8Array | null, fragment: string): string {
  const doc = new Y.Doc()
  if (bytes) Y.applyUpdate(doc, bytes)
  return JSON.stringify(doc.getXmlFragment(fragment).toJSON())
}

export interface Frame {
  type?: string
  field?: string
  reason?: string
  sentAt?: string
  update?: string
  scopes?: string[]
}

/** An analyst's case socket, admitted and listening. */
export class Live {
  readonly frames: Frame[] = []

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (raw) => {
      this.frames.push(JSON.parse((raw as Buffer).toString()) as Frame)
    })
    socket.on('error', () => {})
  }

  static async open(harness: Harness, who: Persona, caseId: string): Promise<Live> {
    const socket = new WebSocket(`${harness.base.replace('http://', 'ws://')}/api/cases/${caseId}/live`, {
      headers: { cookie: who.cookie, origin: harness.base },
    })
    const live = new Live(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve())
      socket.once('unexpected-response', (_q, res) => reject(new Error(`refused ${String(res.statusCode)}`)))
    })
    await live.until((frame) => frame.type === 'presence')
    return live
  }

  send(frame: Record<string, unknown>): void {
    this.socket.send(JSON.stringify(frame))
  }

  /** Waits for a frame matching `wanted`, failing after `ms`. */
  async until(wanted: (frame: Frame) => boolean, ms = 5000): Promise<Frame> {
    const deadline = Date.now() + ms
    for (;;) {
      const found = this.frames.find(wanted)
      if (found) return found
      if (Date.now() > deadline) throw new Error(`no such frame in ${JSON.stringify(this.frames.map((f) => f.type))}`)
      await new Promise((wake) => setTimeout(wake, 20))
    }
  }

  /** Opens `field` and waits for the server's answer, so later frames apply to a held document. */
  async openField(field: string, doc: Y.Doc): Promise<void> {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, 0)
    encoding.writeVarUint8Array(encoder, Y.encodeStateVector(doc))
    this.send({ type: 'prose.sync', field, update: Buffer.from(encoding.toUint8Array(encoder)).toString('base64') })
    await this.until((frame) => frame.type === 'prose.sync' && frame.field === field)
  }

  close(): Promise<void> {
    if (this.socket.readyState === this.socket.CLOSED) return Promise.resolve()
    return new Promise((resolve) => {
      this.socket.once('close', () => resolve())
      this.socket.close()
      setTimeout(resolve, 2000)
    })
  }
}
