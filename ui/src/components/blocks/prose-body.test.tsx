/**
 * **Every test here is about a write that must not happen.**
 *
 * "Does typing work" is not in here. It is the library's, and it is the one
 * thing that cannot fail quietly.
 *
 * ## What this tier can see, measured rather than assumed
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/core'

import { ProseChannel } from '@/api/proseSync'
import { ProseBody } from './prose-body'
import { blockItems } from './prose-slash'

const BODY = 'The operator was inside the estate for **six days**.'

/** Renders, and hands back the live editor the way a screen would hold it. */
function open(props: Partial<React.ComponentProps<typeof ProseBody>> = {}) {
  let editor: Editor | null = null
  const view = render(
    <ProseBody
      value={BODY}
      label="Executive summary"
      onReady={(live) => { editor = live }}
      {...props}
    />,
  )
  return { view, editor: () => editor! }
}

/** The document field these cases write into. `table:row:column`. */
const FIELD = 'reports:00000000-0000-0000-0000-000000000000:document'

describe('a prose body only writes when it was written in', () => {
  it('commits once the text actually changed', async () => {
    const onCommit = vi.fn()
    const { editor } = open({ onCommit })

    editor().commands.focus('end')
    editor().commands.insertContent(' Confirmed.')
    editor().commands.blur()

    await waitFor(() => expect(onCommit).toHaveBeenCalled())
    const written = onCommit.mock.calls[0]?.[0] as string
    expect(written).toContain('Confirmed.')
    // Still markdown, not HTML: the column and the export both read it.
    expect(written).toContain('**six days**')
  })

  it('leaves nothing to save after a discard', async () => {
    // **The half that bites, isolated here because the browser tier cannot see
    // it.** Restoring the text while leaving the edit flagged means the *next*
    // blur writes the discarded draft back, one interaction later, where nobody
    // connects the two. In `e2e/` the discarded text equals the saved text, so
    // the stray write is a no-op on screen and the test passes either way -
    // measured: dropping `touched.current = false` left all six green there.
    const onCommit = vi.fn()
    const { editor } = open({ onCommit })

    editor().commands.focus('end')
    editor().commands.insertContent(' NONSENSE')
    editor().view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await waitFor(() => {
      expect(screen.getByLabelText('Executive summary').textContent)
        .not.toContain('NONSENSE')
    })

    editor().commands.focus('end')
    editor().commands.blur()
    await waitFor(() => expect(editor().isFocused).toBe(false))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('takes a new value from outside while you are not in it', async () => {
    const { view } = open()
    view.rerender(<ProseBody value="Replaced by another session." label="Executive summary" />)
    await waitFor(() => {
      expect(screen.getByLabelText('Executive summary').textContent)
        .toContain('Replaced by another session.')
    })
  })

  it('refuses to take one while you are typing in it', () => {
    // A refetch lands every time the window regains focus. Overwriting a
    // focused editor deletes a sentence mid-word, which is worse than showing
    // text that is a few seconds stale.
    let editor: Editor | null = null
    const view = render(
      <ProseBody value={BODY} label="Executive summary"
        onReady={(live) => { editor = live }} />)

    editor!.commands.focus('end')
    editor!.commands.insertContent(' MINE')

    view.rerender(
      <ProseBody value="From elsewhere." label="Executive summary"
        onReady={(live) => { editor = live }} />)

    expect(screen.getByLabelText('Executive summary').textContent).toContain('MINE')
    expect(screen.getByLabelText('Executive summary').textContent)
      .not.toContain('From elsewhere.')
  })
})

/**
 * A shared body: what the document model can answer about live prose.
 */
describe('a shared body', () => {
  /** A link that is never up. Nothing is sent, and nothing needs to be. */
  const deadLink = () => ({
    connected: false,
    send: () => { /* the link is never up */ },
    subscribe: () => () => { /* nothing to unsubscribe */ },
    onConnected: (listener: (up: boolean) => void) => {
      listener(false)
      return () => { /* nothing to unwatch */ }
    },
  })

  const channelFor = () =>
    new ProseChannel(deadLink(), 'report_blocks:b1:body')

  it('never puts the row markdown into a shared document', () => {
    // **The rule has no exception.** Electing one client to seed a cold
    // section is unnecessary now that the server can write a Yjs document, so
    // the text is in the document before
    // the editor is built and a body that inserted it as well would double the
    // section. Two independent inserts are not a conflict a CRDT resolves.
    const channel = channelFor()
    render(<ProseBody value={BODY} label="Executive summary"
      sync={{ channel, status: 'ready', field: FIELD }} />)

    expect(screen.getByLabelText('Executive summary').textContent)
      .not.toContain('six days')
    channel.destroy()
  })

  it('keeps the analyst on the caret once the editor has mounted', () => {
    // **`CollaborationCaret` writes its own `user` option into awareness** when
    // its ProseMirror view initialises, and that option defaults to
    // `{ name: null, color: null }`. Configured with a `provider` alone it
    // therefore overwrites the identity the channel set, and every peer draws
    // the caret as `User: 2654252565` - `y-tiptap`'s fallback for a nameless
    // user. Nothing warns; the caret is correct apart from being anonymous.
    const channel = new ProseChannel(deadLink(), 'report_blocks:b1:body', {
      user: { name: 'r.okonkwo' },
    })
    render(<ProseBody value="" label="Executive summary"
      sync={{ channel, status: 'ready', field: FIELD }} />)

    const local = channel.awareness.getLocalState() as { user?: { name?: string } }
    expect(local.user?.name).toBe('r.okonkwo')
    channel.destroy()
  })

  it('ignores a value that moved underneath it', () => {
    // The opposite of the single-writer rule above, and for the same reason
    // that one exists: here the *document* is authoritative and the row is its
    // projection, so writing the row back would delete whatever the other
    // analyst typed since the last save - and again on their every save.
    //
    // **Starts from a body nothing has typed into**, so this isolates the rule
    // it names. Seeding first also passes, and passes for the
    // wrong reason: `setContent` marks the document touched, so the
    // single-writer guard catches the second value and the collaborative one
    // is never reached. Measured - removing the collaborative guard left that
    // version of this test green.
    const channel = channelFor()
    const view = render(<ProseBody value="" label="Executive summary"
      sync={{ channel, status: 'ready', field: FIELD }} />)

    view.rerender(<ProseBody value="From elsewhere." label="Executive summary"
      sync={{ channel, status: 'ready', field: FIELD }} />)

    expect(screen.getByLabelText('Executive summary').textContent)
      .not.toContain('From elsewhere.')
    channel.destroy()
  })
})

/**
 * The two menus, held to what a document model can answer about them.
 */
const TABLE = [
  '| Indicator | Kind |',
  '| --- | --- |',
  '| 185.62.190.4 | IPv4 |',
].join('\n')

/** A body with the caret inside a table, which is what draws the table menu. */
async function inATable() {
  let editor: Editor | null = null
  render(<ProseBody value={TABLE} label="Indicators"
    onReady={(live) => { editor = live }} />)
  editor!.commands.focus('end')
  editor!.commands.setTextSelection(5)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Table' })).toBeTruthy())
  return editor!
}

describe('the insert menu', () => {
  /** Opens the `/` menu the way a keystroke does, and hands back the editor. */
  async function slashOpen() {
    let editor: Editor | null = null
    render(<ProseBody value="" label="Executive summary"
      slashItems={() => blockItems()} onReady={(live) => { editor = live }} />)
    editor!.commands.focus('end')
    editor!.commands.insertContent('/')
    await waitFor(() => expect(screen.getByText('Bulleted list')).toBeTruthy())
    return editor!
  }

  it('does not take the document over when it opens', async () => {
    // **The overlay is non-modal.** A modal one hides the
    // rest of the page from assistive tech, locks the document's scroll and
    // focuses itself on mount -- and the caret has to stay in the prose or the
    // next keystroke lands in the menu instead of the query. All three are
    // observable here, and which of them a reader meets first depends on the
    // reader, so all three are asserted.
    await slashOpen()

    expect(screen.getByRole('textbox', { name: 'Executive summary' })).toBeTruthy()
    expect(screen.getByLabelText('Executive summary').getAttribute('aria-hidden')).toBe(null)
    expect(document.documentElement.style.overflow).not.toBe('hidden')
    // jsdom gives a contenteditable no real focus, so this is the half that is
    // observable: the menu did not take focus off the document either.
    expect(document.activeElement?.closest('[data-slot="popover"]')).toBe(null)
  })

  it('moves the highlight from the editor keymap, and Escape closes it', async () => {
    const editor = await slashOpen()
    const press = (key: string) => {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }

    // The list is flat and the cursor is an index into it, so the highlight is
    // the only thing saying where Enter would land.
    expect(document.querySelector('[aria-current="true"]')?.textContent)
      .toContain('Subhead')
    press('ArrowDown')
    await waitFor(() => {
      expect(document.querySelector('[aria-current="true"]')?.textContent)
        .toContain('Minor head')
    })
    press('ArrowUp')
    await waitFor(() => {
      expect(document.querySelector('[aria-current="true"]')?.textContent)
        .toContain('Subhead')
    })

    press('Escape')
    await waitFor(() => expect(screen.queryByText('Bulleted list')).toBe(null))
  })
})

describe('the table menu', () => {
  it('offers each axis behind a submenu the keyboard can open and close', async () => {
    const user = userEvent.setup()
    await inATable()
    await user.click(screen.getByRole('button', { name: 'Table' }))

    // The axis rows are the menu; their verbs are not, until one is opened.
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Row' })).toBeTruthy())
    expect(screen.queryByRole('menuitem', { name: 'Insert row below' })).toBe(null)

    await user.keyboard('{ArrowDown}{ArrowRight}')
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Insert row below' })).toBeTruthy()
    })

    // Escape closes the submenu and leaves the menu it opened from standing.
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Insert row below' })).toBe(null)
    })
    expect(screen.getByRole('menuitem', { name: 'Row' })).toBeTruthy()
  })

  it('runs a verb against the document rather than merely closing', async () => {
    // **A menu row that fires nothing renders, highlights and closes exactly
    // like one that works** -- which is what `menu-item-fires.test.tsx` exists
    // for, and what two vendor swaps shipped twice. So press it and read the
    // document back.
    const user = userEvent.setup()
    const editor = await inATable()
    await user.click(screen.getByRole('button', { name: 'Table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete table' }))

    await waitFor(() => expect(editor.isActive('table')).toBe(false))
  })

  // Named for the verb rather than for the structure: the submenu itself is
  // the test above, and this one stays green against a flattened menu -- what
  // it holds is that a row two surfaces deep still reaches the document.
  it('runs a verb reached through an axis row', async () => {
    const user = userEvent.setup()
    const editor = await inATable()
    const rows = () => editor.getHTML().match(/<tr/g)?.length ?? 0
    const before = rows()

    await user.click(screen.getByRole('button', { name: 'Table' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Row' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Insert row below' }))

    await waitFor(() => expect(rows()).toBe(before + 1))
  })
})
