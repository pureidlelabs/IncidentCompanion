/**
 * A service whose every method is called as `who`: how a test below the HTTP
 * layer says whose request it stands in for. -> `src/db/scope.ts`
 *
 * `who` may be read off each call's arguments, for a service that is handed
 * the analyst it acts for.
 */
import { actingAs } from '../src/db/scope.js'

export function as<T extends object>(who: string | ((args: unknown[]) => string), service: T): T {
  return new Proxy(service, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) =>
        actingAs(typeof who === 'function' ? who(args) : who, () =>
          (value as (...given: unknown[]) => unknown).apply(target, args),
        )
    },
  })
}
