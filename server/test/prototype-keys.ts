/**
 * Every key an object literal answers for without being given one.
 *
 * **Derived, never listed.** A hand-written list is a guess at what
 * `Object.prototype` carries, and a guess is narrower than the language.
 * Regenerating it means a test cannot be.
 *
 * `constructor` and `__proto__` are the two that survive a `.toLowerCase()` on
 * the way in, so a lookup that lowercases its key is protected from the rest by
 * accident rather than by design.
 */
export const PROTOTYPE_KEYS: readonly string[] = Object.getOwnPropertyNames(Object.prototype)
