/**
 * What an indicator value looks like it should be, as advice rather than a rule.
 *
 * `network-indicator.ts` checks a value's *length* and nothing about its
 * shape, so kind `ipv6` accepts anything non-empty and `port` accepts any
 * string of sixteen characters or fewer. That is deliberate and stays:
 * refusing a value an analyst is holding pushes it somewhere the case cannot
 * see. What this adds is a sentence under the field.
 */
import { withoutInvisibles } from './invisible.lists.js'
import type { IndicatorType } from './vocabularies.js'

/** Strict dotted-quad, octet-validated - the same shape `defang.ts` matches. */
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

/**
 * Labels and a final one that is not numeric, so a bare IPv4 is not a domain.
 */
const DOMAIN = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+\p{L}{2,63}\.?$/iu

/** A scheme, then anything. The path is not this module's business. */
const URL_ = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i

/** One hextet: what sits between two colons in an IPv6 address. */
const HEXTET = /^[0-9a-f]{1,4}$/i

/** How many hextets a full IPv6 address carries. */
const HEXTETS = 8

/**
 * Whether the value is a plausible IPv6 address.
 */
function looksLikeIpv6(value: string): boolean {
  // A zone index - `fe80::1%eth0` - names the interface a link-local address
  // is reached through, and is part of the address as an analyst holds it.
  const [address, zone, ...extra] = value.split('%')
  if (extra.length > 0 || zone === '') return false

  const halves = (address ?? '').split('::')
  if (halves.length > 2) return false
  const compressed = halves.length === 2

  let count = 0
  for (const [index, half] of halves.entries()) {
    if (half === '') continue
    const groups = half.split(':')
    for (const [at, group] of groups.entries()) {
      // **An IPv4 tail is two hextets and only ever last.** `::ffff:192.0.2.1`
      // is how a v4-mapped address is written, and reading the dots as a
      // malformed hextet is what makes a real address draw a complaint.
      const last = index === halves.length - 1 && at === groups.length - 1
      if (last && IPV4.test(group)) {
        count += 2
        continue
      }
      if (!HEXTET.test(group)) return false
      count += 1
    }
  }

  // Compression stands for at least one omitted hextet, so a compressed
  // address carrying all eight is written wrong rather than short.
  return compressed ? count < HEXTETS : count === HEXTETS
}

/**
 * A host with the port an analyst pasted alongside it removed.
 */
function withoutPort(value: string): string {
  return value.replace(/:\d{1,5}$/, '')
}

const SHAPES: Readonly<
  Record<IndicatorType, { looksRight: (value: string) => boolean; noun: string }>
> = {
  ipv4: { looksRight: (value) => IPV4.test(value), noun: 'an IPv4 address' },
  ipv6: { looksRight: looksLikeIpv6, noun: 'an IPv6 address' },
  domain: { looksRight: (value) => DOMAIN.test(withoutPort(value)), noun: 'a domain' },
  url: { looksRight: (value) => URL_.test(value), noun: 'a URL' },
}

/**
 * Whether the value has been rendered unclickable.
 */
function defanged(value: string): boolean {
  return value.includes('[.]') || value.includes('(.)') || value.includes('[:]') || /^hxxp/i.test(value)
}

/** The lowest and highest port a service can be on. */
const PORTS = { first: 1, last: 65535 } as const

/** One sentence per field, keyed by the field it is about. Empty when nothing is worth saying. */
export type Advice = Readonly<Record<string, string>>

/**
 * What to tell an analyst about the indicator they are typing.
 */
export function adviseIndicator(row: {
  /**
   * **The column is `type`, and the field descriptors beside it spell their
   * control kind `kind`** - which is what a reader skimming `network-
   * indicator.ts` sees first.
   */
  type?: string | undefined
  value?: string | undefined
  port?: string | undefined
}): Advice {
  const said: Record<string, string> = {}

  // **Judged as it will be stored, not as it was pasted.** The column strips
  // the characters nobody can see; advising on the raw draft tells an analyst
  // their correct address is malformed, over a character they cannot find and
  // the store is about to remove anyway. -> `pasted.ts`
  const value = withoutInvisibles(row.value ?? '').trim()
  const shape = SHAPES[row.type as IndicatorType] as
    | { looksRight: (value: string) => boolean; noun: string }
    | undefined
  if (value !== '' && shape && !defanged(value) && !shape.looksRight(value)) {
    said['value'] = `This does not look like ${shape.noun}.`
  }

  const port = withoutInvisibles(row.port ?? '').trim()
  if (port !== '') {
    // **Digits, not `Number`.** `443e2` and `0x1bb` both survive `Number()` as
    // finite values in range, and neither is a port.
    const digits = /^\d+$/.test(port)
    const asNumber = Number(port)
    if (!digits || asNumber < PORTS.first || asNumber > PORTS.last) {
      said['port'] = `A port is a number from ${String(PORTS.first)} to ${String(PORTS.last)}.`
    }
  }

  return said
}
