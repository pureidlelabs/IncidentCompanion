/**
 * Analysts on a case socket of the booted app, writing a note's prose as the editor does.
 */
import * as encoding from 'lib0/encoding'
import { expect } from 'vitest'
import { WebSocket } from 'ws'
import { writeSyncStep1, writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'

import { signIn, type Harness, type Persona } from './app-harness.js'

export type Frame = { type?: string } & Record<string, unknown>

/** A connection to the case, with every frame it has heard. */
export interface Live {
  socket: WebSocket
  heard: Frame[]
}

export const pause = (ms: number) => new Promise((wake) => setTimeout(wake, ms))

export async function until(done: () => boolean, what: string, ms = 1_000): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end && !done();) await pause(5)
  expect(done(), what).toBe(true)
}

/** What an editor opening a document asks first: everything, since it holds nothing. */
export function asked(): string {
  const encoder = encoding.createEncoder()
  writeSyncStep1(encoder, new Y.Doc())
  return Buffer.from(encoding.toUint8Array(encoder)).toString('base64')
}

/** One analyst's keystrokes into a note, framed as the editor sends them. */
export function typed(text: string): string {
  const doc = new Y.Doc({ gc: false })
  let update: Uint8Array | null = null
  doc.on('update', (made: Uint8Array) => {
    update = made
  })
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  doc.getXmlFragment('note').push([paragraph])
  const encoder = encoding.createEncoder()
  writeUpdate(encoder, update!)
  return Buffer.from(encoding.toUint8Array(encoder)).toString('base64')
}

/** An analyst the administrator issues as `displayName`, signed in with a password of their own. */
export async function issued(
  harness: Harness,
  admin: Persona,
  displayName: string,
  email: string,
): Promise<Persona> {
  const send = async (who: Persona, path: string, body: unknown) => {
    const response = await fetch(`${harness.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: who.cookie },
      body: JSON.stringify(body),
    })
    expect(response.ok, `POST ${path} answered ${String(response.status)}`).toBe(true)
  }
  await send(admin, '/api/accounts', {
    username: email,
    displayName,
    password: 'issued-password-1234',
    role: 'analyst',
  })
  const first = await signIn(harness, email, 'issued-password-1234')
  await send(first, '/api/change-password', {
    current: 'issued-password-1234',
    password: 'their-own-password-1234',
    repeat: 'their-own-password-1234',
  })
  return signIn(harness, email, 'their-own-password-1234')
}

const syncs = (heard: Frame[]) => heard.filter((f) => f.type === 'prose.sync').length

/** Sockets on `caseId()`, each kept in `open` so the caller can terminate them. */
export function caseSocket(harness: () => Harness, caseId: () => string, open: WebSocket[]) {
  async function connect(who: Persona): Promise<Live> {
    const socket = new WebSocket(
      `${harness().base.replace('http://', 'ws://')}/api/cases/${caseId()}/live`,
      {
        headers: { cookie: who.cookie, origin: harness().origin },
      },
    )
    open.push(socket)
    const heard: Frame[] = []
    socket.on('message', (raw: Buffer) => {
      heard.push(JSON.parse(raw.toString()) as Frame)
    })
    await new Promise<void>((opened, failed) => {
      socket.once('open', () => {
        opened()
      })
      socket.once('error', failed)
    })
    await until(() => heard.some((one) => one.type === 'presence'), 'the room was never announced')
    return { socket, heard }
  }

  /** `who` holding the note open, once the server has answered the opening. */
  async function opens(who: Persona, noteId: string): Promise<Live> {
    const live = await connect(who)
    live.socket.send(
      JSON.stringify({
        type: 'prose.sync',
        field: `casenotes:${noteId}:document`,
        update: asked(),
      }),
    )
    await until(() => syncs(live.heard) > 0, 'the note never opened')
    return live
  }

  /** Types `words` over `live`, returning once `watching` has heard them, which is the server having taken them. */
  async function types(live: Live, noteId: string, words: string, watching: Live): Promise<void> {
    const before = syncs(watching.heard)
    live.socket.send(
      JSON.stringify({
        type: 'prose.sync',
        field: `casenotes:${noteId}:document`,
        update: typed(words),
      }),
    )
    await until(() => syncs(watching.heard) > before, 'the words were never taken')
  }

  return { connect, opens, types }
}
