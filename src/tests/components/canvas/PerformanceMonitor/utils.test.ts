import { describe, expect, it } from 'vitest'

describe('PerformanceMonitor utils', () => {
  it('formats non-finite FPS bounds as placeholders', async () => {
    const utilsModule = (await import('@/components/canvas/PerformanceMonitor/utils')) as unknown as Record<
      string,
      unknown
    >

    expect(typeof utilsModule['formatFpsBound']).toBe('function')

    const formatFpsBound = utilsModule['formatFpsBound'] as (value: number) => string

    expect(formatFpsBound(Infinity)).toBe('--')
    expect(formatFpsBound(Number.NaN)).toBe('--')
    expect(formatFpsBound(0)).toBe('0')
    expect(formatFpsBound(59.8)).toBe('60')
  })
})
