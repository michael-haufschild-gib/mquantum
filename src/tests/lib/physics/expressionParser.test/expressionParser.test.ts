/**
 * Tests for the safe mathematical expression parser.
 *
 * @module tests/lib/physics/expressionParser
 */

import { describe, expect, it } from 'vitest'

import { parseExpression } from '@/lib/physics/expressionParser'

describe('parseExpression', () => {
  function evalExpr(expr: string, coords: number[]): number {
    const result = parseExpression(expr)
    if (!result.success) throw new Error(`Parse failed: ${result.error} at ${result.position}`)
    return result.evaluate(coords)
  }

  describe('arithmetic', () => {
    it('evaluates constants', () => {
      expect(evalExpr('42', [])).toBe(42)
      expect(evalExpr('3.14', [])).toBeCloseTo(3.14)
    })

    it('evaluates basic arithmetic', () => {
      expect(evalExpr('2 + 3', [])).toBe(5)
      expect(evalExpr('10 - 4', [])).toBe(6)
      expect(evalExpr('3 * 4', [])).toBe(12)
      expect(evalExpr('15 / 3', [])).toBe(5)
    })

    it('respects operator precedence', () => {
      expect(evalExpr('2 + 3 * 4', [])).toBe(14)
      expect(evalExpr('(2 + 3) * 4', [])).toBe(20)
    })

    it('handles exponentiation (right-associative)', () => {
      expect(evalExpr('2^3', [])).toBe(8)
      expect(evalExpr('2^3^2', [])).toBe(512) // 2^(3^2) = 2^9 = 512
    })

    it('handles unary minus', () => {
      expect(evalExpr('-5', [])).toBe(-5)
      expect(evalExpr('-(2+3)', [])).toBe(-5)
      expect(evalExpr('2 * -3', [])).toBe(-6)
    })
  })

  describe('variables', () => {
    it('reads axis variables by index', () => {
      expect(evalExpr('x', [7])).toBe(7)
      expect(evalExpr('y', [0, 3])).toBe(3)
      expect(evalExpr('z', [0, 0, 5])).toBe(5)
    })

    it('evaluates multi-variable expressions', () => {
      expect(evalExpr('x + y', [1, 2])).toBe(3)
      expect(evalExpr('x * y + z', [2, 3, 1])).toBe(7)
    })

    it('returns 0 for unset variables', () => {
      expect(evalExpr('z', [1])).toBe(0)
    })
  })

  describe('constants', () => {
    it('evaluates pi', () => {
      expect(evalExpr('pi', [])).toBeCloseTo(Math.PI)
    })

    it('evaluates e', () => {
      expect(evalExpr('e', [])).toBeCloseTo(Math.E)
    })
  })

  describe('functions', () => {
    it('evaluates sin/cos', () => {
      expect(evalExpr('sin(0)', [])).toBeCloseTo(0)
      expect(evalExpr('cos(0)', [])).toBeCloseTo(1)
      expect(evalExpr('sin(pi/2)', [])).toBeCloseTo(1)
    })

    it('evaluates exp/sqrt/abs/log', () => {
      expect(evalExpr('exp(0)', [])).toBe(1)
      expect(evalExpr('sqrt(9)', [])).toBe(3)
      expect(evalExpr('abs(-5)', [])).toBe(5)
      expect(evalExpr('log(e)', [])).toBeCloseTo(1)
      expect(evalExpr('ln(e)', [])).toBeCloseTo(1)
    })

    it('evaluates binary functions', () => {
      expect(evalExpr('max(3, 7)', [])).toBe(7)
      expect(evalExpr('min(3, 7)', [])).toBe(3)
      expect(evalExpr('pow(2, 10)', [])).toBe(1024)
    })
  })

  describe('physics potentials', () => {
    it('harmonic: 0.5 * (x^2 + y^2)', () => {
      expect(evalExpr('0.5 * (x^2 + y^2)', [3, 4])).toBe(12.5)
    })

    it('double well: (x^2 - 1)^2', () => {
      expect(evalExpr('(x^2 - 1)^2', [0])).toBe(1)
      expect(evalExpr('(x^2 - 1)^2', [1])).toBe(0)
      expect(evalExpr('(x^2 - 1)^2', [-1])).toBe(0)
    })

    it('Coulomb-like: -1 / sqrt(x^2 + y^2 + 0.01)', () => {
      const r2 = 3 * 3 + 4 * 4 + 0.01
      expect(evalExpr('-1 / sqrt(x^2 + y^2 + 0.01)', [3, 4])).toBeCloseTo(-1 / Math.sqrt(r2))
    })
  })

  describe('error handling', () => {
    it('rejects empty expression', () => {
      const result = parseExpression('')
      expect(result.success).toBe(false)
    })

    it('rejects unknown identifiers', () => {
      const result = parseExpression('foo + 1')
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain('Unknown')
    })

    it('rejects blocked identifiers', () => {
      const result = parseExpression('eval(1)')
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain('Forbidden')
    })

    it('rejects constructor access', () => {
      const result = parseExpression('constructor')
      expect(result.success).toBe(false)
    })

    it('rejects wrong argument count', () => {
      const result = parseExpression('sin(1, 2)')
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain('expects 1')
    })

    it('rejects mismatched parentheses', () => {
      const result = parseExpression('(x + 1')
      expect(result.success).toBe(false)
    })

    it('provides error position', () => {
      const result = parseExpression('x + @')
      expect(result.success).toBe(false)
      if (!result.success) expect(result.position).toBeGreaterThan(0)
    })

    it('rejects prototype pollution attempts', () => {
      expect(parseExpression('__proto__').success).toBe(false)
      expect(parseExpression('prototype').success).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles division by zero gracefully (returns Infinity)', () => {
      expect(evalExpr('1 / 0', [])).toBe(Infinity)
      expect(evalExpr('-1 / 0', [])).toBe(-Infinity)
    })

    it('handles deeply nested parentheses', () => {
      expect(evalExpr('((((((1))))))', [])).toBe(1)
    })

    it('handles whitespace-only after valid expression', () => {
      expect(evalExpr('42   ', [])).toBe(42)
    })

    it('treats r as the 9th axis variable (index 8)', () => {
      // AXIS_LABELS = ['x','y','z','w','v','u','t','s','r','q','p']
      // r is at index 8, so coords[8] is read
      const coords = [0, 0, 0, 0, 0, 0, 0, 0, 42]
      expect(evalExpr('r', coords)).toBe(42)
    })

    it('handles scientific notation', () => {
      expect(evalExpr('1e3', [])).toBe(1000)
      expect(evalExpr('2.5e-2', [])).toBeCloseTo(0.025)
      expect(evalExpr('1E10', [])).toBe(1e10)
    })

    it('handles leading decimal point', () => {
      expect(evalExpr('.5', [])).toBeCloseTo(0.5)
      expect(evalExpr('.5 + .5', [])).toBeCloseTo(1.0)
    })

    it('handles unary plus', () => {
      expect(evalExpr('+5', [])).toBe(5)
      expect(evalExpr('+(2+3)', [])).toBe(5)
    })

    it('handles chained unary minus', () => {
      expect(evalExpr('--5', [])).toBe(5)
      expect(evalExpr('---5', [])).toBe(-5)
    })

    it('0^0 returns 1 (Math.pow convention)', () => {
      expect(evalExpr('0^0', [])).toBe(1)
    })

    it('negative base with fractional exponent returns NaN', () => {
      expect(evalExpr('(-2)^0.5', [])).toBeNaN()
    })

    it('sqrt of negative returns NaN (not throw)', () => {
      expect(evalExpr('sqrt(-1)', [])).toBeNaN()
    })

    it('log of zero returns -Infinity', () => {
      expect(evalExpr('log(0)', [])).toBe(-Infinity)
    })
  })

  describe('security: injection and sandboxing', () => {
    it('rejects all blocked identifiers', () => {
      const blocked = [
        'eval',
        'function',
        'constructor',
        'prototype',
        '__proto__',
        'window',
        'document',
        'global',
        'process',
        'require',
        'import',
        'this',
        'self',
        'globalThis',
      ]
      for (const ident of blocked) {
        const result = parseExpression(ident)
        expect(result.success, `should reject '${ident}'`).toBe(false)
      }
    })

    it('rejects function-call syntax on blocked identifiers', () => {
      expect(parseExpression('eval(1)').success).toBe(false)
      expect(parseExpression('require(1)').success).toBe(false)
      expect(parseExpression('import(1)').success).toBe(false)
    })

    it('rejects unknown function calls', () => {
      const result = parseExpression('alert(1)')
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain('Unknown function')
    })

    it('rejects string literals and quotes', () => {
      expect(parseExpression('"hello"').success).toBe(false)
      expect(parseExpression("'hello'").success).toBe(false)
    })

    it('rejects semicolons and statement separators', () => {
      expect(parseExpression('1; 2').success).toBe(false)
    })

    it('rejects assignment operators', () => {
      expect(parseExpression('x = 5').success).toBe(false)
    })

    it('rejects template literal backticks', () => {
      expect(parseExpression('`hello`').success).toBe(false)
    })

    it('rejects square bracket property access', () => {
      expect(parseExpression('x[0]').success).toBe(false)
    })

    it('rejects dot property access', () => {
      expect(parseExpression('x.toString').success).toBe(false)
    })

    it('compiled evaluator is a pure function (no side effects on repeated calls)', () => {
      const result = parseExpression('x + y')
      if (!result.success) throw new Error('Parse failed')

      const coords = [3, 4]
      const r1 = result.evaluate(coords)
      const r2 = result.evaluate(coords)
      const r3 = result.evaluate(coords)
      expect(r1).toBe(r2)
      expect(r2).toBe(r3)
      expect(r1).toBe(7)
      // Coords should not be mutated
      expect(coords).toEqual([3, 4])
    })
  })

  describe('stress and boundary inputs', () => {
    it('handles very long valid expression without crashing', () => {
      // 100 terms: x + x + x + ... (100 times)
      const expr = Array(100).fill('x').join(' + ')
      expect(evalExpr(expr, [1])).toBe(100)
    })

    it('rejects extremely long garbage input', () => {
      const garbage = 'a'.repeat(10000)
      const result = parseExpression(garbage)
      expect(result.success).toBe(false)
    })

    it('handles expression with all supported functions', () => {
      // Compose a valid expression using many functions
      const expr =
        'sin(x) + cos(y) + tan(z) + exp(0) + sqrt(4) + abs(-1) + log(e) + ln(e) + tanh(0) + cosh(0) + sinh(0)'
      const result = evalExpr(expr, [0, 0, 0])
      // sin(0)=0, cos(0)=1, tan(0)=0, exp(0)=1, sqrt(4)=2, abs(-1)=1, log(e)=1, ln(e)=1, tanh(0)=0, cosh(0)=1, sinh(0)=0
      expect(result).toBeCloseTo(8)
    })

    it('handles expression with all 11 axis variables', () => {
      const expr = 'x + y + z + w + v + u + t + s + r + q + p'
      const coords = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      expect(evalExpr(expr, coords)).toBe(66)
    })

    it('rejects axis labels beyond the supported dimension contract', () => {
      const result = parseExpression('o')
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain('Unknown identifier')
    })

    it('handles deeply nested function calls', () => {
      expect(evalExpr('sin(cos(sin(cos(0))))', [])).toBeCloseTo(Math.sin(Math.cos(Math.sin(1))))
    })

    it('preserves associativity: a - b - c = (a - b) - c', () => {
      expect(evalExpr('10 - 3 - 2', [])).toBe(5) // (10-3)-2=5, not 10-(3-2)=9
    })

    it('preserves associativity: a / b / c = (a / b) / c', () => {
      expect(evalExpr('24 / 4 / 2', [])).toBe(3) // (24/4)/2=3, not 24/(4/2)=12
    })

    it('exponentiation is right-associative: a^b^c = a^(b^c)', () => {
      // 2^3^2 = 2^9 = 512, NOT (2^3)^2 = 64
      expect(evalExpr('2^3^2', [])).toBe(512)
    })

    it('multiplication binds tighter than addition', () => {
      expect(evalExpr('1 + 2 * 3 + 4', [])).toBe(11)
    })

    it('exponentiation binds tighter than multiplication', () => {
      expect(evalExpr('2 * 3^2', [])).toBe(18) // 2 * 9 = 18
    })

    // Standard math: exponentiation binds tighter than unary minus.
    // -3^2 = -(3^2) = -9, matching Mathematica, Wolfram, Python.
    it('unary minus has lower precedence than exponentiation: -3^2 = -9', () => {
      expect(evalExpr('-3^2', [])).toBe(-9)
    })

    it('exponent with negative base in parens: (-3)^2 = 9', () => {
      expect(evalExpr('(-3)^2', [])).toBe(9)
    })

    it('exponent with negative exponent: 2^-3 = 0.125', () => {
      expect(evalExpr('2^-3', [])).toBeCloseTo(0.125)
    })

    it('handles pi * e correctly', () => {
      expect(evalExpr('pi * e', [])).toBeCloseTo(Math.PI * Math.E)
    })
  })
})
