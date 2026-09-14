/**
 * `/api/report/languages` - the packs a report may be written in.
 *
 * **A pack is JSON, not a file upload.** The route takes a parsed body, so the
 * pane reads the chosen `.json` and posts its contents; there is no multipart
 * here and no server-side parse of an arbitrary blob.
 *
 * **`coverage` and `builtin` arrive resolved.** Coverage is measured against
 * English's own key set, which only the server holds - deriving it here would
 * need the key list on the wire and would disagree the moment a string is
 * added. `builtin` is why a row has no remove control: a shipped pack comes
 * back on the next start, so removing it is a button that undoes itself.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { ApiError, request } from './client'
import { keys } from './queryKeys'

export interface LanguagePack {
  code: string
  label: string
  /** 0 to 1, against the English key set. */
  coverage: number
  /** Shipped with the app, so it cannot be removed. */
  builtin: boolean
}

export interface LanguagesView {
  languages: LanguagePack[]
  /** How many strings a complete pack carries. */
  keyCount: number
}

export interface PackUpload {
  code: string
  label: string
  strings: Record<string, string>
}

export interface Uploaded {
  language: LanguagePack
  /** Keys this app has no place for. Stored for nothing, so they are named. */
  ignored: string[]
}

const PATH = '/report/languages'

/** Bytes. Two orders of magnitude above a complete pack. */
const A_PACK_AT_MOST = 1024 * 1024

export function useLanguages(): UseQueryResult<LanguagesView> {
  return useQuery({
    queryKey: keys.reportLanguages(),
    queryFn: () => request<LanguagesView>(PATH),
  })
}

/**
 * A language pack read off a file the analyst chose.
 *
 * **Checked rather than cast.** The route takes JSON, so the file is read
 * where it was picked -- but `JSON.parse(...) as PackUpload` is an assertion,
 * not a check, and everything valid-JSON-but-not-a-pack reached the server
 * anyway. What this refuses is refused here, in words about the file; what it
 * passes is the server's to judge, and its refusal names the fields.
 *
 * @throws ApiError 422 where the bytes are not a pack this app can read.
 */
export async function packFromFile(file: File): Promise<PackUpload> {
  const refuse = (why: string): never => {
    throw new ApiError(422, why, null)
  }

  // Checked before the read, because `file.text()` pulls the whole file into
  // the tab: a video chosen by mistake freezes the screen where a refusal
  // belongs. The English pack is 7KB of source, so this is a wrong-file
  // boundary rather than a limit a real pack can approach.
  if (file.size > A_PACK_AT_MOST) {
    return refuse('That file is too large to be a language pack.')
  }

  let read: unknown
  try {
    read = JSON.parse(await file.text())
  } catch {
    return refuse('That file is not JSON, so it is not a language pack.')
  }

  if (typeof read !== 'object' || read === null || Array.isArray(read)) {
    return refuse('That file is not a language pack.')
  }
  const pack = read as Record<string, unknown>
  if (typeof pack.code !== 'string' || pack.code === '') {
    return refuse('That file names no language code.')
  }
  if (typeof pack.label !== 'string' || pack.label === '') {
    return refuse('That file names no language.')
  }
  const strings = pack.strings
  if (typeof strings !== 'object' || strings === null || Array.isArray(strings)) {
    return refuse('That file carries no strings.')
  }
  if (Object.values(strings).some((one) => typeof one !== 'string')) {
    return refuse('That file carries a string that is not text.')
  }

  return { code: pack.code, label: pack.label, strings: strings as Record<string, string> }
}

/**
 * **Invalidates rather than writing the answer in.** The response names what
 * was ignored, which the pane reports; the *list* it belongs in also carries
 * coverage the server recomputed, so patching one row in would leave the rest
 * of the table describing the upload before it happened.
 */
export function useLanguageUpload(): UseMutationResult<Uploaded, ApiError, PackUpload> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (pack: PackUpload) =>
      request<Uploaded>(PATH, { method: 'PUT', body: pack as unknown as Record<string, unknown> }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.reportLanguages() })
    },
  })
}

export function useLanguageRemove(): UseMutationResult<{ removed: string }, ApiError, string> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (code: string) =>
      request<{ removed: string }>(`${PATH}/${encodeURIComponent(code)}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.reportLanguages() })
    },
  })
}
