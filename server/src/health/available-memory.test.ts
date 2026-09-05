/**
 * Asserts the reclaimable-memory arithmetic against captured `vm_stat` and
 * cgroup output, so the numbers do not depend on the machine running the
 * suite. Nothing here reads the real files.
 */
import { describe, expect, it } from 'vitest'

import { availableFrom, cgroupFrom } from './available-memory.js'

/** `vm_stat`'s real output on a 16 GiB Mac with 65 MB free. */
const DARWIN = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                     3996.
Pages active:                                 261605.
Pages inactive:                               260564.
Pages speculative:                               298.
Pages throttled:                                   0.
Pages wired down:                             155053.
Pages purgeable:                                1867.
`

/** `/proc/meminfo`'s first lines on a container with 7.7 GiB. */
const LINUX = `MemTotal:        8112468 kB
MemFree:          131072 kB
MemAvailable:    4194304 kB
Buffers:           16384 kB
`

describe('what counts as memory this machine can still use', () => {
  /**
   * **Free plus what the kernel will hand back.**
   */
  it('counts reclaimable pages on macOS, not only the free ones', () => {
    const page = 16_384
    const expected = (3996 + 260_564 + 298 + 1867) * page

    expect(availableFrom('darwin', DARWIN)).toBe(expected)
    expect(availableFrom('darwin', DARWIN)).toBeGreaterThan(4 * 1024 ** 3)
  })

  /** Linux states it outright, so nothing is inferred from the parts. */
  it('takes MemAvailable on Linux, which the kernel computes itself', () => {
    expect(availableFrom('linux', LINUX)).toBe(4_194_304 * 1024)
  })

  /**
   * **An unreadable source answers null, and the caller falls back.** A wrong
   * number here is worse than the old one: it would be believed.
   */
  it('answers null rather than guessing when the source makes no sense', () => {
    expect(availableFrom('darwin', 'not vm_stat output')).toBeNull()
    expect(availableFrom('linux', 'MemTotal: 123 kB')).toBeNull()
    expect(availableFrom('win32', DARWIN)).toBeNull()
  })

  /**
   * **A page size is read from the header, never assumed.**
   */
  it('reads the page size rather than assuming one', () => {
    const fourKiB = DARWIN.replace('page size of 16384 bytes', 'page size of 4096 bytes')
    expect(availableFrom('darwin', fourKiB)).toBe(availableFrom('darwin', DARWIN)! / 4)
  })
})

/**
 * **In a container the host's numbers describe a machine this process cannot
 * use all of.**
 */
describe('what a container is actually allowed', () => {
  it('reads the limit and the usage the runtime reports', () => {
    expect(cgroupFrom('536870912\n', '1122304\n')).toEqual({
      limit: 536_870_912,
      used: 1_122_304,
    })
  })

  it('treats an unlimited container as having no ceiling to report', () => {
    expect(cgroupFrom('max\n', '1122304\n')).toBeNull()
  })

  it('answers null on anything it cannot read as two numbers', () => {
    expect(cgroupFrom('', '')).toBeNull()
    expect(cgroupFrom('not-a-number', '10')).toBeNull()
    expect(cgroupFrom('0', '10')).toBeNull()
  })
})
