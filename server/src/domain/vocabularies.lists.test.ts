import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import * as lists from './vocabularies.lists'
import * as vocabularies from './vocabularies'

const HERE = new URL('.', import.meta.url).pathname
const LIST_MODULES = readdirSync(HERE).filter(
  (name) => name.endsWith('.lists.ts') && !name.endsWith('.test.ts'),
)

describe('the zod-free vocabulary lists', () => {
  it.each(LIST_MODULES)('%s imports nothing, so the client can value-import it', (name) => {
    // **The whole point of the file.** `vocabularies.ts` imports zod, and a
    // client value-import of it puts zod and every schema in
    // `server/src/domain` into the browser bundle - which
    // `ui/tsconfig.app.json` documents as the thing that must not happen and
    // which `tsc` cannot refuse, since `vite.config.ts` aliases `@contract`
    // and zod resolves through `better-auth` regardless of what
    // `ui/package.json` declares.
    //
    // Read as text rather than reasoned about from the module object: an
    // import with no bound name still runs, and would be invisible here
    // otherwise.
    const source = readFileSync(HERE + name, 'utf8')
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\brequire\(/)
    // **`export * from` is an import**, and the two checks above cannot see
    // it -- `vocabularies.ts` two files over uses exactly that syntax. Proved
    // by mutation: appending one to a `.lists` module the client
    // value-imports left this suite green while zod and every schema beside
    // it would have shipped in the browser bundle.
    //
    // **Anchored to a statement, not to the word.** These files cite ENISA,
    // MITRE and Microsoft, and a vocabulary value can be a sentence -- a bare
    // `from` next to a quote failed the file for a comment naming its source,
    // under a test whose name is about bundling.
    expect(source).not.toMatch(/^\s*export\s*\*\s*from\b/m)
  })

  it('found the list modules rather than reporting an empty set clean', () => {
    // An `it.each` over nothing passes and prints nothing. The count is what
    // says the glob still resolves after a rename.
    expect(LIST_MODULES).toContain('vocabularies.lists.ts')
    expect(LIST_MODULES.length).toBeGreaterThan(1)
  })

  it('is re-exported whole, so nothing on the server has two places to look', () => {
    // A list that stopped being re-exported would be a second spelling for
    // every server importer, and `tsc` only catches the ones that moved.
    for (const [name, value] of Object.entries(lists)) {
      expect(vocabularies[name as keyof typeof vocabularies], name).toBe(value)
    }
    expect(Object.keys(lists).length).toBeGreaterThan(10)
  })
})
