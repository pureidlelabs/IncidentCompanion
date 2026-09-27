/**
 * The Evidence add door, and the file that is optional inside it.
 *
 * **One door, and the file is a choice inside the dialog.** A menu of kinds --
 * *Upload a file...* against *Record without a file* -- asks the analyst which
 * kind of record this is before they have started, and the empty state's own
 * promise that "a record can be added before the file is collected" is what
 * that would contradict.
 *
 * Written from the attacks on the optionality, which is the half a screenshot
 * cannot check:
 *
 * - **A record saves with no file**, and reads as promised. A drop zone that
 *   became required would fail nothing else here.
 * - **A record saved with one reads as collected** and keeps the filename. The
 *   state is derived from `storedAt`, never stored, so a zone that took the
 *   file and wrote nothing looks identical until the row is read back.
 * - **One file, not many.** An evidence row stores a singular
 *   `originalFilename`; a second would silently be dropped.
 * - **The file does not outlive its dialog.** One left behind attaches itself
 *   to the next record, which is a wrong artefact reading as a correct one.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { keys } from '@/api/queryKeys'
import { setSession } from '@/api/session'
import { useEvidenceUpload } from '@/api/useEvidenceUpload'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EvidenceScreen } from './evidence'

/** A file the picker will take. Content is never read; the metadata is. */
function someFile(name = 'wks-fin01-kape.zip'): File {
  return new File(['PK'], name, { type: 'application/zip' })
}

/** The one add door. Named, so a second one reappearing fails here. */
function addDoor(): HTMLElement {
  return screen.getByRole('button', { name: /add record/i })
}

/** The dialog's file input, which `FileTrigger` renders. */
function filePicker(): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!found) throw new Error('the add dialog offers no way to choose a file')
  return found
}

function rowFor(name: string): HTMLElement {
  const found = screen
    .getAllByRole('row')
    .find((row) => within(row).queryByText(name) !== null)
  if (!found) throw new Error(`no row for ${name}`)
  return found
}

async function record(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText(/^name/i), name)
  await user.click(within(dialog).getByRole('button', { name: /^create$/i }))
}

describe('one add door, with the file optional inside it', () => {
  it('offers exactly one way in, and no menu of kinds', () => {
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)
    expect(screen.getAllByRole('button', { name: /add record/i })).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: /record without a file/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /upload a file/i })).toBeNull()
  })

  it('carries a drop zone inside the dialog', async () => {
    const user = userEvent.setup()
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)
    await user.click(addDoor())
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /choose a file/i })).not.toBeNull()
  })

  /** The one the whole shape exists for. */
  it('saves a record with no file, and reads it as promised', async () => {
    const user = userEvent.setup()
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)
    await user.click(addDoor())
    await record(user, 'DC-02 event log export')

    expect(screen.queryByRole('dialog'), 'the dialog refused a record with no file').toBeNull()
    const row = rowFor('DC-02 event log export')
    expect(within(row).getByText('promised')).toBeTruthy()
  })

  it('reads a record that arrived with a file as collected', async () => {
    const user = userEvent.setup()
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)
    await user.click(addDoor())
    await user.upload(filePicker(), someFile())
    await record(user, 'DC-02 memory image')

    const row = rowFor('DC-02 memory image')
    expect(
      within(row).queryByText('collected'),
      'the file was taken and nothing was written from it',
    ).not.toBeNull()
  })

  /** An evidence row is one artefact: `originalFilename` is singular. */
  it('takes one file, not a set', async () => {
    const user = userEvent.setup()
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)
    await user.click(addDoor())
    expect(filePicker().multiple, 'the picker offers to attach more than one file').toBe(false)
  })

  /**
   * A file left behind is a wrong artefact on a real record, and every part of
   * the screen says the record is correct.
   */
  it('does not carry a file over into the next record', async () => {
    const user = userEvent.setup()
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(addDoor())
    await user.upload(filePicker(), someFile())
    await record(user, 'First record')

    await user.click(addDoor())
    await record(user, 'Second record')

    expect(within(rowFor('First record')).queryByText('collected')).not.toBeNull()
    expect(
      within(rowFor('Second record')).queryByText('promised'),
      'the second record inherited the first record file',
    ).not.toBeNull()
  })

  /**
   * The isolating case, and it was owed: mutating either clear on its own left
   * the test above green, because a create closes the dialog and the add door
   * clears it again on the way in. The path only one of them covers is a
   * cancelled add followed by a row's pencil -- `edit` clears nothing, so a
   * file abandoned in the add dialog would attach itself to an existing
   * record and flip it to collected.
   */
  it('does not carry an abandoned file onto a row being edited', async () => {
    const user = userEvent.setup()
    render(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(addDoor())
    await user.upload(filePicker(), someFile())
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }))

    const row = rowFor('WKS-FIN01 KAPE triage')
    await user.click(within(row).getByRole('button', { name: /in full$/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^save$/i }))

    expect(
      within(rowFor('WKS-FIN01 KAPE triage')).queryByText('promised'),
      'a file abandoned in the add dialog was attached to an edited row',
    ).not.toBeNull()
  })
})

describe('attaching the bytes to the record just made', () => {
  const CASE = 'DEMO-CAMPAIGN'

  /** The record POST answers first; `bytes` answers the attach. Headers are built as `fetch` builds them. */
  function upload(bytes: Response) {
    const named: (string | null)[] = []
    const fetchMock = vi.fn<typeof fetch>((_url, init) => {
      if (fetchMock.mock.calls.length === 1) {
        return Promise.resolve(new Response(JSON.stringify({ id: 'ev-new' }), { status: 200 }))
      }
      named.push(new Headers(init?.headers).get('x-original-filename'))
      return Promise.resolve(bytes)
    })
    vi.stubGlobal('fetch', fetchMock)
    setSession({ userId: 'u-analyst', username: 'analyst' })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const hook = renderHook(() => useEvidenceUpload(CASE), { wrapper })
    const invalidated = () => invalidate.mock.calls.map(([options]) => JSON.stringify(options?.queryKey))
    return { hook, named, invalidated }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refreshes the list when the bytes fail after the record landed', async () => {
    const { hook, invalidated } = upload(new Response(JSON.stringify({ error: 'store down' }), { status: 500 }))

    act(() => {
      hook.result.current.mutate({ file: someFile(), fields: { name: 'DC-02 memory image' } })
    })
    await waitFor(() => expect(hook.result.current.isError).toBe(true))

    expect(invalidated()).toContain(JSON.stringify(keys.collection(CASE, 'evidence')))
    expect(invalidated()).toContain(JSON.stringify(keys.case(CASE)))
  })

  it('sends a non-Latin-1 filename percent-encoded, which the server decodes', async () => {
    const { hook, named } = upload(new Response(JSON.stringify({ id: 'ev-new' }), { status: 200 }))

    act(() => {
      hook.result.current.mutate({ file: someFile('\u65E5\u672C\u8A9E.pdf'), fields: { name: 'Scan' } })
    })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))

    expect(named).toEqual(['%E6%97%A5%E6%9C%AC%E8%AA%9E.pdf'])
  })
})
