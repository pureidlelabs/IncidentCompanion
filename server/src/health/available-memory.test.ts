/**
 * Asserts the available-memory arithmetic against captured `/proc/meminfo`
 * and cgroup output, so the numbers do not depend on the machine running the
 * suite. Nothing here reads the real files.
 */
import { describe, expect, it } from 'vitest'

import { availableFrom, cgroupFrom } from './available-memory.js'

/** `/proc/meminfo`'s first lines on a container with 7.7 GiB. */
const LINUX = `MemTotal:        8112468 kB
MemFree:          131072 kB
MemAvailable:    4194304 kB
Buffers:           16384 kB
`

describe('what counts as memory this machine can still use', () => {
  /** The kernel states it outright, so nothing is inferred from the parts. */
  it('takes MemAvailable, which the kernel computes itself', () => {
    expect(availableFrom(LINUX)).toBe(4_194_304 * 1024)
  })

  /**
   * **A source without the figure answers null, and the caller falls back.** A
   * wrong number here is worse than the old one: it would be believed.
   */
  it('answers null rather than guessing when the source does not say', () => {
    expect(availableFrom('MemTotal: 123 kB')).toBeNull()
    expect(availableFrom('not meminfo output')).toBeNull()
  })
})

/**
 * **In a container the host's numbers describe a machine this process cannot
 * use all of.** `os.totalmem()` inside one reports the virtual machine the
 * runtime provides, which is neither the host's memory nor the container's
 * limit; `memory.max` is the figure the process is killed at, so it is the one
 * the screen has to draw.
 */
describe('what a container is actually allowed', () => {
  it('reads the limit and the usage the runtime reports', () => {
    expect(cgroupFrom('536870912\n', '1122304\n')).toEqual({
      limit: 536_870_912,
      used: 1_122_304,
    })
  })

  /**
   * **An unlimited container says `max`, literally.** Without this it parses
   * as NaN, or worse as zero, and the screen shows a service pinned against a
   * ceiling that does not exist.
   */
  it('treats an unlimited container as having no ceiling to report', () => {
    expect(cgroupFrom('max\n', '1122304\n')).toBeNull()
  })

  it('answers null on anything it cannot read as two numbers', () => {
    expect(cgroupFrom('', '')).toBeNull()
    expect(cgroupFrom('not-a-number', '10')).toBeNull()
    expect(cgroupFrom('0', '10')).toBeNull()
  })
})
