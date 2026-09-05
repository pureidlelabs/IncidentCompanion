import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { urlOf } from '@/test/fetchArgs'

import { setSession } from './session'
import { useUploadAvatar } from './appearance'

/**
 * **The avatar upload could not work, and no test covered it.**
 *
 * The hook posted `FormData` through `requestMultipart`, and
 * `PUT /api/appearance/avatar` reads the raw request as bytes: it splits
 * `content-type`, refuses anything outside `ALLOWED_IMAGES`, and multipart is
 * not among them - so every upload answered 400. Had it passed, sharp's first
 * bytes would have been the MIME boundary rather than an image header.
 *
 * `requestBody` already existed for exactly this shape, with a docstring
 * describing this route, and was called by nothing.
 */
const fetchMock = vi.fn<typeof fetch>()

function harness<T>(use: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(use, { wrapper })
}

beforeEach(() => {
  setSession({ id: 'analyst', name: 'An Analyst' } as never)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploading an avatar', () => {
  it('sends the bytes as the body, with the picture s own content type', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ avatarVersion: 3 }), { status: 200 }),
    )
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'me.png', { type: 'image/png' })

    const { result } = harness(() => useUploadAvatar())
    result.current.mutate(file)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const [input, init] = fetchMock.mock.calls[0]!
    expect(urlOf(input)).toContain('/appearance/avatar')

    // **`PUT`, because the route is a `@Put`.** `requestBody` posts by default,
    // which is the evidence upload's verb and not this one.
    expect(init?.method).toBe('PUT')

    // The declared type, not a multipart boundary: the route refuses anything
    // outside its allowed image list, and that list is content types.
    expect((init?.headers as Record<string, string>)['content-type']).toBe('image/png')
    // A `File` is a `Blob`; `FormData` is not, so this is the whole
    // distinction the route turns on.
    expect(init?.body).toBeInstanceOf(Blob)
    expect(init?.body).not.toBeInstanceOf(FormData)
  })

  it('reads the version the server actually answers with', async () => {
    // The server returns `avatarVersion`; the hook declared `version`, so the
    // value a caller read was always undefined.
    //
    // **This assertion is held by `tsc`, not by the run.** The body reaches the
    // caller either way - it is the declared shape that was wrong - so reading
    // `avatarVersion` here is what goes red under `tsc -b` if the hook is
    // retyped back - TS2339, on the line below. A break-verify of the type
    // alone leaves the run green.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ avatarVersion: 7 }), { status: 200 }),
    )
    const { result } = harness(() => useUploadAvatar())
    result.current.mutate(new File(['x'], 'me.png', { type: 'image/png' }))

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.avatarVersion).toBe(7)
  })
})
