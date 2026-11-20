import { type BenchFn, type BenchRunOptions, test } from 'vitest'

/** Register one independently filterable Vitest benchmark. */
export function benchmark(name: string, measure: BenchFn, options?: BenchRunOptions): void {
  test(name, async ({ bench }) => {
    await bench(name, measure).run(options)
  })
}
