/**
 * Where the demo's case survives a reload: one document in IndexedDB.
 *
 * Per browser and never shared, so one published demo gives every visitor their
 * own case to write into and `reset()` hands them a clean one back.
 */
import { freshState, type DemoState } from './state'

const DATABASE = 'incidentcompanion.demo'
const STORE = 'state'
const KEY = 'case'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'))
  })
}

async function transact<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = act(database.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('demo store write failed'))
    })
  } finally {
    database.close()
  }
}

/**
 * The stored case, or a fresh one.
 *
 * Storage denied - private mode, blocked site data - falls through to a fresh
 * case rather than an error: the demo then works for the visit and forgets on
 * reload.
 */
export async function load(): Promise<DemoState> {
  try {
    const stored = await transact<DemoState | undefined>(
      'readonly',
      (store) => store.get(KEY) as IDBRequest<DemoState | undefined>,
    )
    return stored ?? freshState()
  } catch {
    return freshState()
  }
}

export async function save(state: DemoState): Promise<void> {
  try {
    await transact('readwrite', (store) => store.put(state, KEY))
  } catch {
    /* a demo that cannot persist still runs; the visit is what matters */
  }
}

/** A report field's document, as the loopback socket last saved it. */
export async function loadProse(field: string): Promise<string | null> {
  try {
    const stored = await transact<string | undefined>(
      'readonly',
      (store) => store.get(`prose:${field}`) as IDBRequest<string | undefined>,
    )
    return stored ?? null
  } catch {
    return null
  }
}

export async function saveProse(field: string, encoded: string): Promise<void> {
  try {
    await transact('readwrite', (store) => store.put(encoded, `prose:${field}`))
  } catch {
    /* a demo that cannot persist still runs */
  }
}

/**
 * Throw the visitor's writes away and start from the seeded case.
 *
 * The whole store, since the reports' documents sit beside the case under
 * their own keys and a reset that kept them would hand back a fresh case
 * with last visit's prose in it.
 */
export async function reset(): Promise<DemoState> {
  try {
    await transact('readwrite', (store) => store.clear())
  } catch {
    /* nothing stored is the state this asks for */
  }
  return freshState()
}
