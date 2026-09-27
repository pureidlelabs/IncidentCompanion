/**
 * The compliance record answered against what the analyst read: alone over a
 * link slower than their typing, and with another analyst's answer landing
 * first.
 *
 * No module is mocked: the real container, hooks and request layer against a
 * model of the server that applies the version rule, trims text as the server
 * does, and answers after a real delay.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'
import { ComplianceContainer } from '@/app/case/ComplianceContainer'
import { casePath } from '@/components/blocks/case-paths'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { regimesFixture } from '@/fixtures/regimes'
import { specsWire } from '@/fixtures/specs'

/** The address a request was sent to, whatever form the caller gave it in. */
const urlOf = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : input.toString()
/** The JSON body a request carried, or nothing. */
const bodyOf = (init?: RequestInit) => (typeof init?.body === 'string' ? init.body : '')

const ID = campaignCase.id
let latency = 60

let row: Record<string, unknown>
let sent: { body: Record<string, unknown>; status: number }[]

const camel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const json = (status: number, body: unknown) =>
  new Promise<Response>((done) =>
    setTimeout(() => {
      done(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }, latency),
  )

function server(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input)
  const method = init?.method ?? 'GET'
  if (url === '/api/specs') return json(200, specsWire)
  if (url === '/api/regimes') return json(200, regimesFixture)
  if (url === `/api/cases/${ID}/compliance/verdict`) return json(200, { regimes: [] })
  if (url === `/api/cases/${ID}/compliance` && method === 'GET') return json(200, row)
  if (url === `/api/cases/${ID}/compliance` && method === 'PATCH') {
    const body = JSON.parse(bodyOf(init)) as Record<string, unknown>
    const { version, ...rest } = body
    if (version !== row.version) {
      sent.push({ body, status: 409 })
      return json(409, { message: 'Someone else wrote this first.', currentVersion: row.version })
    }
    const stored = Object.fromEntries(
      Object.entries(rest).map(([key, value]) => [
        camel(key),
        typeof value === 'string' ? value.trim() : value,
      ]),
    )
    row = { ...row, ...stored, version: (row.version as number) + 1 }
    sent.push({ body, status: 200 })
    return json(200, row)
  }
  return json(404, { message: `unmodelled ${method} ${url}` })
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [{ path: '/cases/:caseId/:section', element: <ComplianceContainer /> }],
    {
      initialEntries: [casePath(ID, 'compliance')],
    },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

async function openCard(user: ReturnType<typeof userEvent.setup>, title: string) {
  const fold = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[data-fold="${title}"]`)
    if (!found) throw new Error(`no ${title} card yet`)
    return found
  })
  if (fold.getAttribute('aria-expanded') === 'false') await user.click(fold)
}

const settle = () => new Promise((done) => setTimeout(done, latency * 10))

beforeEach(() => {
  row = JSON.parse(JSON.stringify(campaignCompliance)) as Record<string, unknown>
  row.version = 3
  row.financialImpact = ''
  row.financialLossEur = null
  sent = []
  setTransport(server)
  setSession({ userId: 'u-a', username: 'analyst-a' })
})

afterEach(() => {
  setTransport((input, init) => fetch(input, init))
})

describe('a compliance answer typed alone', () => {
  it.each([
    [20, 60, 'loss'],
    [120, 150, 'loss'],
    [15, 20, 'revenue loss'],
  ])(
    'is stored as typed, once, when the field is left (keys every %ims, %ims each way)',
    async (gap, oneWay, text) => {
      latency = oneWay
      const user = userEvent.setup({ delay: gap })
      mount()
      await openCard(user, 'Incident facts')
      const field = await screen.findByRole<HTMLInputElement>('textbox', {
        name: 'Financial impact',
      })

      await user.type(field, text)
      await user.tab()
      await settle()
      await waitFor(
        () => {
          expect({
            sent: sent.map((one) => [one.body.financial_impact, one.status]),
            stored: row.financialImpact,
            shown: field.value,
            bands: screen.queryAllByRole('group', { name: /changed/ }).length,
          }).toEqual({ sent: [[text, 200]], stored: text, shown: text, bands: 0 })
        },
        { timeout: 10_000 },
      )
    },
  )

  it('stores a figure as typed, not the first digits of it', async () => {
    latency = 100
    const user = userEvent.setup({ delay: 120 })
    mount()
    await openCard(user, 'Incident facts')
    const field = await screen.findByRole<HTMLInputElement>('spinbutton', {
      name: 'Direct financial loss (EUR)',
    })

    await user.type(field, '250000')
    await user.tab()
    await settle()
    await waitFor(
      () => {
        expect({
          sent: sent.map((one) => [one.body.financial_loss_eur, one.status]),
          stored: row.financialLossEur,
        }).toEqual({
          sent: [[250000, 200]],
          stored: 250000,
        })
      },
      { timeout: 10_000 },
    )
  })

  it('shows the stored form of an answer once the field is left', async () => {
    latency = 30
    const user = userEvent.setup()
    mount()
    await openCard(user, 'Incident facts')
    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Financial impact' })

    await user.type(field, '  padded  ')
    await user.tab()
    await settle()
    await waitFor(
      () => {
        expect({ stored: row.financialImpact, shown: field.value }).toEqual({
          stored: 'padded',
          shown: 'padded',
        })
      },
      { timeout: 10_000 },
    )
  })
})

describe('a compliance answer another analyst stored first', () => {
  it('is not stored over theirs, and both values are shown above the cards', async () => {
    latency = 30
    const user = userEvent.setup()
    mount()
    await openCard(user, 'Incident facts')
    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Financial impact' })
    await user.type(field, 'Mine')

    // Stored by another session, and not yet announced to this one.
    row = { ...row, financialImpact: 'Theirs', version: (row.version as number) + 1 }
    await user.tab()
    await settle()
    await waitFor(
      () => {
        expect({
          sent: sent.map((one) => one.status),
          stored: row.financialImpact,
          shown: field.value,
          band:
            screen.queryByRole('group', { name: 'Another analyst changed Financial impact' })
              ?.textContent ?? '',
        }).toEqual({
          sent: [409],
          stored: 'Theirs',
          shown: 'Mine',
          band: expect.stringContaining('Theirs'),
        })
      },
      { timeout: 10_000 },
    )
  })
})
