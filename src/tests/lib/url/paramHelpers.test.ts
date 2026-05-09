import { describe, expect, it } from 'vitest'

import {
  parseBoolParam,
  parseEnumParam,
  parseFloatParam,
  parseIntParam,
  setBoolParam,
  setFloatParam,
  setIntParam,
  setStringParam,
} from '@/lib/url/paramHelpers'

describe('URL param helpers', () => {
  it('parses integers strictly and clamps only fully valid integer tokens', () => {
    const params = new URLSearchParams('low=-20&high=99&ok=7&float=3.0&junk=4px&exp=1e2')

    expect(parseIntParam(params, 'low', -5, 10)).toBe(-5)
    expect(parseIntParam(params, 'high', -5, 10)).toBe(10)
    expect(parseIntParam(params, 'ok', -5, 10)).toBe(7)
    expect(parseIntParam(params, 'float', -5, 10)).toBeUndefined()
    expect(parseIntParam(params, 'junk', -5, 10)).toBeUndefined()
    expect(parseIntParam(params, 'exp', -5, 10)).toBeUndefined()
    expect(parseIntParam(params, 'missing', -5, 10)).toBeUndefined()
  })

  it('rejects unsafe integers instead of silently rounding URL input', () => {
    const params = new URLSearchParams('too_big=9007199254740993')

    expect(parseIntParam(params, 'too_big', 0, Number.MAX_SAFE_INTEGER)).toBeUndefined()
  })

  it('parses decimal floats strictly while rejecting exponent and non-finite spellings', () => {
    const params = new URLSearchParams(
      'a=.5&b=-2.75&c=200&exp=1e-3&nan=NaN&inf=Infinity&junk=1.2ms'
    )

    expect(parseFloatParam(params, 'a', 0, 10)).toBe(0.5)
    expect(parseFloatParam(params, 'b', -1, 1)).toBe(-1)
    expect(parseFloatParam(params, 'c', 0, 100)).toBe(100)
    expect(parseFloatParam(params, 'exp', 0, 10)).toBeUndefined()
    expect(parseFloatParam(params, 'nan', 0, 10)).toBeUndefined()
    expect(parseFloatParam(params, 'inf', 0, 10)).toBeUndefined()
    expect(parseFloatParam(params, 'junk', 0, 10)).toBeUndefined()
  })

  it('accepts only canonical 0/1 booleans', () => {
    const params = new URLSearchParams('yes=1&no=0&word=true&blank=')

    expect(parseBoolParam(params, 'yes')).toBe(true)
    expect(parseBoolParam(params, 'no')).toBe(false)
    expect(parseBoolParam(params, 'word')).toBeUndefined()
    expect(parseBoolParam(params, 'blank')).toBeUndefined()
  })

  it('parses enum params by exact membership and preserves literal type', () => {
    const params = new URLSearchParams('mode=tdseDynamics&bad=TDSEDynamics')
    const valid = ['harmonicOscillator', 'tdseDynamics'] as const

    const mode = parseEnumParam(params, 'mode', valid)

    expect(mode).toBe('tdseDynamics')
    expect(parseEnumParam(params, 'bad', valid)).toBeUndefined()
  })

  it('emits only defined values and applies precision/omit-zero policy', () => {
    const params = new URLSearchParams()

    setBoolParam(params, 'flag', false)
    setBoolParam(params, 'missing_bool', undefined)
    setFloatParam(params, 'gain', Math.PI, false, 3)
    setFloatParam(params, 'zero_omitted', 0, true)
    setFloatParam(params, 'zero_kept', 0, false)
    setIntParam(params, 'count', 12)
    setIntParam(params, 'missing_int', undefined)
    setStringParam(params, 'label', 'a b')
    setStringParam(params, 'missing_string', undefined)

    expect(params.toString()).toBe('flag=0&gain=3.142&zero_kept=0.00&count=12&label=a+b')
  })
})
