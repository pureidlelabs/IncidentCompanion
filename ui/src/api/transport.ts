/**
 * What actually goes to the network, so the demo build can answer instead.
 *
 * Set by a call rather than read from `import.meta.env`, so the demo reaches only the demo bundle.
 */
let transport: typeof fetch = (input, init) => fetch(input, init)

export function setTransport(substitute: typeof fetch): void {
  transport = substitute
}

/** One request through whichever transport is set, looked up per call. */
export const send: typeof fetch = (input, init) => transport(input, init)
