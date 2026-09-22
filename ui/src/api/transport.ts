/**
 * What actually goes to the network, so the demo build can answer instead.
 *
 * The API client and the auth client both send through it. A substitute
 * stands in for `fetch` rather than for `request`, which keeps the client's
 * refusal mapping, wire conversion and dead-session drop on one path: a demo that returned parsed bodies would be a second client, and the
 * two would disagree about a 422 first.
 *
 * Set through a function rather than read from `import.meta.env` here, so the
 * demo's handler and its seeded case reach the bundle only through the dynamic
 * import in `main.tsx` that the demo build alone takes.
 */
let transport: typeof fetch = (input, init) => fetch(input, init)

export function setTransport(substitute: typeof fetch): void {
  transport = substitute
}

/** One request through whichever transport is set, looked up per call. */
export const send: typeof fetch = (input, init) => transport(input, init)
