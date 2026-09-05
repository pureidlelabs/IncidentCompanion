/**
 * The characters an analyst cannot see, which a paste brings along anyway.
 */

/**
 * The invisible characters that carry no information, so removing one cannot
 * change what a value says.
 */
export const INVISIBLE =
  // eslint-disable-next-line no-control-regex -- the control characters are the point
  /[\u0000-\u001f\u007f-\u009f\u00ad\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g

/** A value with the characters nobody can see taken out. */
export function withoutInvisibles(value: string): string {
  return value.replace(INVISIBLE, '')
}
