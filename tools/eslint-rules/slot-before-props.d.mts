/**
 * The rule is plain `.mjs` so eslint can load it without a build step, and its
 * own test imports it -- which the client's *build* typechecks, unlike
 * `tsc --noEmit`. Without this the bundle fails on an implicit `any` while the
 * editor stays green, which is the shape of failure that reaches a landing.
 */
import type { Rule } from 'eslint'

declare const rule: Rule.RuleModule
export default rule
