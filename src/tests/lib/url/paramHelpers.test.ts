import { describe, expect, it } from 'vitest'

import {
  parseBoolParam,
  parseEnumParam,
  parseFloatParam,
  parseFloatParamSci,
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

  it('parses scientific floats and clamps only valid finite tokens', () => {
    const params = new URLSearchParams(
      'small=1e-3&big=2.5E%2B10&neg=-3E2&nan=NaN&inf=Infinity&junk=1e-3ms'
    )

    expect(parseFloatParamSci(params, 'small', 0, 1)).toBeCloseTo(0.001)
    expect(parseFloatParamSci(params, 'big', 0, 100)).toBe(100)
    expect(parseFloatParamSci(params, 'neg', -500, 0)).toBe(-300)
    expect(parseFloatParamSci(params, 'nan', 0, 1)).toBeUndefined()
    expect(parseFloatParamSci(params, 'inf', 0, 1)).toBeUndefined()
    expect(parseFloatParamSci(params, 'junk', 0, 1)).toBeUndefined()
    expect(parseFloatParamSci(params, 'missing', 0, 1)).toBeUndefined()
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

  it('setFloatParam drops NaN and ±Infinity so the round-trip stays symmetric with parseFloatParam', () => {
    const params = new URLSearchParams()

    setFloatParam(params, 'nan', Number.NaN)
    setFloatParam(params, 'pos_inf', Number.POSITIVE_INFINITY)
    setFloatParam(params, 'neg_inf', Number.NEGATIVE_INFINITY)
    setFloatParam(params, 'kept', 1.5, false, 3)

    expect(params.has('nan')).toBe(false)
    expect(params.has('pos_inf')).toBe(false)
    expect(params.has('neg_inf')).toBe(false)
    expect(params.get('kept')).toBe('1.500')

    // Confirm the parser would have rejected what the emitter dropped.
    const malicious = new URLSearchParams('nan=NaN&pos_inf=Infinity&neg_inf=-Infinity')
    expect(parseFloatParam(malicious, 'nan', -10, 10)).toBeUndefined()
    expect(parseFloatParam(malicious, 'pos_inf', -10, 10)).toBeUndefined()
    expect(parseFloatParam(malicious, 'neg_inf', -10, 10)).toBeUndefined()
  })

  it('setIntParam drops non-integer floats and NaN/Infinity', () => {
    const params = new URLSearchParams()

    setIntParam(params, 'pi', 3.14)
    setIntParam(params, 'nan', Number.NaN)
    setIntParam(params, 'inf', Number.POSITIVE_INFINITY)
    setIntParam(params, 'neg_int', -7)
    setIntParam(params, 'zero', 0)

    expect(params.has('pi')).toBe(false)
    expect(params.has('nan')).toBe(false)
    expect(params.has('inf')).toBe(false)
    expect(params.get('neg_int')).toBe('-7')
    expect(params.get('zero')).toBe('0')
  })
})
