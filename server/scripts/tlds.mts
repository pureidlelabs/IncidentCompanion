/**
 * Rewrite `server/src/report/document/tlds.ts` from IANA's list of root-zone top-level domains.
 *
 * Run from `server/` with `npm run refresh:tlds`; it fetches over the network and overwrites the file.
 */
import { writeFileSync } from 'node:fs'

const SOURCE = 'https://data.iana.org/TLD/tlds-alpha-by-domain.txt'
const TARGET = new URL('../src/report/document/tlds.ts', import.meta.url)

const answer = await fetch(SOURCE)
if (!answer.ok) throw new Error(`${SOURCE} answered ${String(answer.status)}`)
const lines = (await answer.text()).split('\n')

const version = /^# Version (\d+)/.exec(lines[0] ?? '')?.[1]
if (!version) throw new Error(`${SOURCE} carries no version line`)
const names = lines
  .filter((line) => line.trim() !== '' && !line.startsWith('#'))
  .map((line) => line.trim().toLowerCase())

writeFileSync(
  TARGET,
  `/** Every top-level domain in the root zone, ASCII form. Written by \`server/scripts/tlds.mts\` from <${SOURCE}>. */
export const ROOT_ZONE_VERSION = '${version}'
export const ROOT_ZONE_COUNT = ${String(names.length)}
export const ROOT_ZONE: readonly string[] = [
${names.map((name) => `  '${name}',`).join('\n')}
]
`,
)
console.log(`root zone ${version}: ${String(names.length)} domains`)
