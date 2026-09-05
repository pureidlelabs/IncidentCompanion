/**
 * Every key an object literal answers for without being given one.
 *
 * **Derived, never listed.** A hand-written list is a guess at what
 * `Object.prototype` carries, and the four written by hand across this
 * repository each named a different subset. Regenerating it means a test cannot
 * be narrower than the language.
 *
 * The server's copy is `server/test/prototype-keys.ts`; the two packages share
 * no test code, and a value module under `server/src/domain` would be a wire
 * contract, which this is not.
 */
export const PROTOTYPE_KEYS: readonly string[] = Object.getOwnPropertyNames(Object.prototype)
