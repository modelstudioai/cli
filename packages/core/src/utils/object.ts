/**
 * Generic object-cleaning utilities.
 */

/**
 * Remove all keys whose value is `undefined` from a plain object (in-place).
 * Returns the same reference for chaining convenience.
 *
 * ```ts
 * const params = { a: 1, b: undefined };
 * stripUndefined(params); // { a: 1 }
 * ```
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}
