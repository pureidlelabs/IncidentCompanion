/**
 * A row of the roster reaches the server, on every pane that draws one.
 *
 * The row menu offered Enable and Disable and both called a handler that
 * updated React state, so the row moved to `disabled`, nothing was written, the
 * analyst went on signing in, and a refresh put the row back. A control that
 * reports a change it did not make is worse than one that is missing: an
 * administrator cutting somebody off believes they have. -> #794
 *
 * **Both panes, because one table is drawn twice.** The Accounts pane and the
 * Administration pane compose the same `AccountTable`, and fixing one of them
 * leaves the defect intact one pane over -- where it looks identical and is
 * reached by the same press.
 *
 * **Asserted on the request, not on the row.** The row moving is exactly what
 * the defect did; what separates a write from a repaint is whether anything
 * left the browser.
 *
 * **What this does not cover:** what the server does with the write, which is
 * `server/test/analyst-privilege.test.ts` and the accounts controller's own
 * cases.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stub = vi.hoisted(() => {
  /** The real one's shape, less the getters no reporter on this path reads. */
  class ApiError extends Error {
    readonly fieldErrors: readonly unknown[] = []
    constructor(
      readonly status: number,
      message: string,
      readonly body: unknown,
    ) {
      super(message)
      this.name = 'ApiError'
    }
  }
  return { ApiError }
})

const sent = vi.hoisted(() => ({
  reads: [] as string[],
  writes: [] as { path: string; body: unknown }[],
  /** What the next write answers with. Null is the ordinary accepted write. */
  answer: null as { status: number; message: string; body: unknown } | null,
}))

vi.mock('@/api/client', () => ({
  ApiError: stub.ApiError,
  request: (path: string, init?: { method?: string; body?: unknown }) => {
    if (init?.method === 'POST') {
      sent.writes.push({ path, body: init.body })
      if (sent.answer) {
        const { status, message, body } = sent.answer
        return Promise.reject(new stub.ApiError(status, message, body))
      }
      return Promise.resolve({ ok: true, messages: [['Done.', 'positive']] })
    }
    sent.reads.push(path)
    if (path.startsWith('/install/policy')) {
      return Promise.resolve({ settings: {}, bounds: {} })
    }
    return Promise.resolve({
      accounts: [
        {
          username: 'nina@example.test',
          displayName: 'Nina',
          role: 'analyst',
          state: 'active',
          tone: 'positive',
          disabled: false,
          you: false,
        },
        // The administrator reading the pane. Their own row is the one every
        // verb here is wrong on, and the server is what says which row it is.
        {
          username: 'ada@example.test',
          displayName: 'Ada',
          role: 'admin',
          state: 'active',
          tone: 'positive',
          disabled: false,
          you: true,
        },
      ],
      roles: ['analyst', 'admin'],
      defaultRole: 'analyst',
    })
  },
}))

const { AccountsPaneView, AdministrationPaneView } = await import('./panes')
const { toastQueue } = await import('@/components/blocks/notify')

/** Every sentence the pane raised, however it was raised. */
const raised = vi.spyOn(toastQueue, 'add')

function titles(): string[] {
  return raised.mock.calls.map(([one]) => (one as { title?: string }).title ?? '')
}

function draw(Pane: typeof AccountsPaneView = AccountsPaneView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Pane onPane={() => undefined} userMenu={null} onAbout={() => undefined} />
    </QueryClientProvider>,
  )
}

async function drawn() {
  draw()
  await vi.waitFor(() => {
    expect(screen.getByText('nina@example.test')).toBeInTheDocument()
  })
}

async function pressRow(item: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
}

async function pressSweep() {
  await userEvent.click(screen.getByRole('button', { name: /end every session/i }))
  await userEvent.click(
    await screen.findByRole('button', { name: /^end every session$/i, hidden: false }),
  )
}

/** Every control that writes, and how it is pressed. */
const CONTROLS: readonly (readonly [string, () => Promise<void>])[] = [
  ['Disable', () => pressRow(/disable/i)],
  ['End sessions', () => pressRow(/end sessions/i)],
  ['a role row', () => pressRow(/make administrator/i)],
  ['End every session', pressSweep],
]

/**
 * The pane's own count line, which is the roster as it is drawn.
 *
 * The probe for *the row did not move*: the line names a disabled account only
 * when there is one and counts administrators, so a disable or a role change
 * that took would change it.
 */
function rosterLine(): string {
  return screen.getByText(/\d+ accounts?/).textContent
}

/** What the mocked read serves, so a moved roster is a changed line. */
const SERVED = '2 accounts \u00B7 1 administrator'

beforeEach(() => {
  sent.reads.length = 0
  sent.writes.length = 0
  sent.answer = null
  raised.mockClear()
})

describe('the Accounts pane', () => {
  it('sends a write when an administrator disables an account', async () => {
    draw()
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /disable/i }))

    await vi.waitFor(() => {
      expect(
        sent.writes.map((one) => one.path),
        'the row changed on screen and nothing was written',
      ).toEqual(['/accounts/nina%40example.test/disable'])
    })
  })

  /**
   * *An administrator MUST be able to end a session* -- and the route has
   * existed with nothing to press it. Asserted on the request for the reason
   * above: a control that ends no session looks the same from the row.
   */
  it('sends a write when an administrator ends an account\'s sessions', async () => {
    draw()
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /end sessions/i }))

    await vi.waitFor(() => {
      expect(sent.writes.map((one) => one.path)).toEqual([
        '/accounts/nina%40example.test/sessions/end',
      ])
    })
  })

  /**
   * **A role is the reach an account has**, so changing one is the write an
   * administrator makes least often and can least afford to have silently not
   * happen. One item per role the server named, this row's own excepted.
   */
  it('sends a write when an administrator changes a role', async () => {
    draw()
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /make administrator/i }))

    await vi.waitFor(() => {
      expect(sent.writes).toEqual([
        { path: '/accounts/nina%40example.test/role', body: { role: 'admin' } },
      ])
    })
  })

  /**
   * *An administrator MUST be able to end every session at once.*
   *
   * **Confirmed before it runs**, because it signs the administrator out with
   * everybody else -- a control whose cost lands on the person pressing it owes
   * them the sentence first.
   */
  it('asks before ending every session, and writes only once confirmed', async () => {
    draw()
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /end every session/i }))
    expect(sent.writes, 'the sweep ran before anybody confirmed it').toEqual([])

    await userEvent.click(
      await screen.findByRole('button', { name: /^end every session$/i, hidden: false }),
    )

    await vi.waitFor(() => {
      expect(sent.writes.map((one) => one.path)).toEqual(['/accounts/sessions/end'])
    })
  })

  /**
   * **A row action's only recovery is the sentence.** The query is invalidated
   * whether the write landed or not, so a refusal nobody says leaves the row
   * snapping back to what is stored with nothing to tell the administrator
   * their change did not take -- which is the phantom this file exists for,
   * one layer down.
   *
   * The two arrive by different routes and each is its own case: a 422 is
   * answered as `Written` *data* by `postWritten`, where a 403 throws.
   */
  it.each(CONTROLS)('says what the server refused, pressing %s', async (_name, press) => {
    sent.answer = {
      status: 422,
      message: 'Refused.',
      body: {
        ok: false,
        messages: [['You cannot do that to the account you are signed in with.', 'negative']],
      },
    }
    await drawn()
    await press()

    await vi.waitFor(() => {
      expect(titles()).toContain('You cannot do that to the account you are signed in with.')
    })
    expect(rosterLine(), 'the refused write moved the roster anyway').toBe(SERVED)
  })

  it.each(CONTROLS)('says a refusal that is not a sentence, pressing %s', async (_name, press) => {
    sent.answer = { status: 403, message: 'Administrators only.', body: null }
    await drawn()
    await press()

    await vi.waitFor(() => {
      expect(titles().join(' ')).toMatch(/was not saved/)
    })
    expect(rosterLine(), 'the refused write moved the roster anyway').toBe(SERVED)
  })

  /**
   * The count line is the probe because the row follows the server: a disable
   * the server refused must leave the pane counting what is stored, and the
   * line names a disabled account only when there is one.
   */
  it('leaves the roster as the server serves it when a write is refused', async () => {
    sent.answer = { status: 422, message: 'Refused.', body: { ok: false, messages: [['No.', 'negative']] } }
    await drawn()
    await pressRow(/disable/i)

    await vi.waitFor(() => {
      expect(titles()).toContain('No.')
    })
    expect(rosterLine()).toBe(SERVED)
  })

  /**
   * **Every verb on the row is one an administrator performs on somebody
   * else.** On their own row each is a different kind of wrong -- the server
   * refuses the disable, the role change succeeds and takes the pane with it,
   * and ending the sessions signs them out mid-act -- and the row can say none
   * of it, because the account it is about is the one reading it.
   *
   * Asserted against the same menu on another row, so a menu that simply drew
   * nothing would not pass.
   */
  it('offers an administrator none of these verbs on their own row', async () => {
    await drawn()

    await userEvent.click(screen.getByRole('button', { name: /more for Ada/i }))
    const mine = await screen.findAllByRole('menuitem')
    expect(mine.map((one) => one.textContent)).toEqual(['Copy Ada', 'Reset password\u2026'])

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    await vi.waitFor(() => {
      expect(screen.getAllByRole('menuitem').map((one) => one.textContent)).toEqual([
        'Copy Nina',
        'Reset password\u2026',
        'Make administrator',
        'End sessions',
        'Disable\u2026',
      ])
    })
  })

  /**
   * The row offers a role by the word the server writes into its own sentence
   * -- *nina@example.test is now an administrator* -- rather than by the token
   * the wire carries.
   */
  it('names a role the way the sentence that confirms it does', async () => {
    await drawn()

    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((one) => one.textContent)).toContain('Make administrator')
  })
})

/**
 * *An administrator MUST be able to disable an account* -- and this pane draws
 * the same table, reached live through `PickerRoute`. Its handler flipped the
 * row in React state and nothing else, so the row moved here and the install
 * never heard, which is the defect above with a different pane around it.
 */
describe('the Administration pane', () => {
  it('sends a write when an administrator disables an account', async () => {
    draw(AdministrationPaneView)
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /disable/i }))

    await vi.waitFor(() => {
      expect(
        sent.writes.map((one) => one.path),
        'the row changed on screen and nothing was written',
      ).toEqual(['/accounts/nina%40example.test/disable'])
    })
  })

  it('says what the server refused', async () => {
    sent.answer = {
      status: 422,
      message: 'Refused.',
      body: { ok: false, messages: [['You cannot disable your own account.', 'negative']] },
    }
    draw(AdministrationPaneView)
    await vi.waitFor(() => {
      expect(screen.getByText('nina@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /disable/i }))

    await vi.waitFor(() => {
      expect(titles()).toContain('You cannot disable your own account.')
    })

    // This pane has no count line, so the row's own menu is the probe: a
    // re-added local mirror would have moved the row to `disabled` and the
    // menu would offer Enable.
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: /more for Nina/i }))
    expect(
      (await screen.findAllByRole('menuitem')).map((one) => one.textContent),
    ).toContain('Disable\u2026')
  })

  it('offers an administrator none of the row\'s verbs on their own row', async () => {
    draw(AdministrationPaneView)
    await vi.waitFor(() => {
      expect(screen.getByText('ada@example.test')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /more for Ada/i }))
    const mine = await screen.findAllByRole('menuitem')
    expect(mine.map((one) => one.textContent)).toEqual(['Copy Ada', 'Reset password\u2026'])
  })
})
