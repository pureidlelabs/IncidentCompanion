import { afterEach, describe, expect, it } from 'vitest'

import {
  CONNECTION_KEY,
  clearConnection,
  loadConnection,
  saveConnection,
} from './connectionConfig'

afterEach(() => {
  window.localStorage.clear()
})

describe('the connection config', () => {
  it('round-trips what was entered', () => {
    saveConnection({ tenantId: 't', clientId: 'c' })
    expect(loadConnection()).toEqual({ tenantId: 't', clientId: 'c' })
  })

  it('reads blanks when nothing was stored', () => {
    expect(loadConnection()).toEqual({ tenantId: '', clientId: '' })
  })

  it('reads blanks from hand-edited or half-written JSON', () => {
    // The store is hand-editable and survives a build that wrote another
    // shape; an `undefined` reaching an input turns it uncontrolled, which
    // React reports as a warning and the analyst sees as a field that stops
    // accepting text.
    window.localStorage.setItem(CONNECTION_KEY, '{"tenantId": 12, "clientId"')
    expect(loadConnection()).toEqual({ tenantId: '', clientId: '' })
    window.localStorage.setItem(CONNECTION_KEY, '{"tenantId": "t"}')
    expect(loadConnection()).toEqual({ tenantId: 't', clientId: '' })
  })

  it('stores nothing under any other key', () => {
    saveConnection({ tenantId: 't', clientId: 'c' })
    expect(Object.keys(window.localStorage)).toEqual([CONNECTION_KEY])
    clearConnection()
    expect(window.localStorage.getItem(CONNECTION_KEY)).toBeNull()
  })
})
