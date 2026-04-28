import { expect } from 'vitest'

/**
 * Return the substring of `source` that holds the body of `fn name(`. Stops
 * at the next top-level `fn ` declaration or end-of-source.
 */
export function functionSlice(source: string, name: string): string {
  const start = source.indexOf(`fn ${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nfn ', start + 1)
  return next === -1 ? source.slice(start) : source.slice(start, next)
}

/**
 * Assert that each needle in `needles` occurs in `source` strictly after the
 * previous one. Used to verify shader composition order.
 */
export function expectOrdered(source: string, needles: string[]): void {
  let cursor = -1
  for (const needle of needles) {
    const found = source.indexOf(needle, cursor + 1)
    expect(found).toBeGreaterThan(cursor)
    cursor = found
  }
}
