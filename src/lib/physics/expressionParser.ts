/**
 * Safe Mathematical Expression Parser
 *
 * Recursive-descent parser for evaluating V(x₁,...,xₙ) expressions
 * for user-defined quantum potentials. No eval(), no Function constructor.
 *
 * Supports: +, -, *, /, ^, (), unary minus
 * Functions: sin, cos, tan, exp, sqrt, abs, log, ln, tanh, cosh, sinh, atan2, min, max
 * Constants: pi, e
 * Variables: x, y, z, w, v, u, t, s, r, q, p (matching axis labels)
 * Special: r = sqrt(sum(x_i^2)) computed from all active dimensions
 *
 * @module lib/physics/expressionParser
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of parsing an expression */
export type ParseResult =
  | { success: true; evaluate: (coords: number[]) => number }
  | { success: false; error: string; position: number }

/** AST node types */
type ASTNode =
  | { type: 'number'; value: number }
  | { type: 'variable'; index: number }
  | { type: 'radial' }
  | { type: 'unary'; op: '-'; operand: ASTNode }
  | { type: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: ASTNode; right: ASTNode }
  | { type: 'call'; name: string; args: ASTNode[] }

/** Token types */
type Token =
  | { type: 'number'; value: number; pos: number }
  | { type: 'ident'; name: string; pos: number }
  | { type: 'op'; op: string; pos: number }
  | { type: 'lparen'; pos: number }
  | { type: 'rparen'; pos: number }
  | { type: 'comma'; pos: number }
  | { type: 'eof'; pos: number }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p'] as const

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
}

const UNARY_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'exp',
  'sqrt',
  'abs',
  'log',
  'ln',
  'tanh',
  'cosh',
  'sinh',
  'asin',
  'acos',
  'atan',
  'floor',
  'ceil',
  'sign',
])

const BINARY_FUNCTIONS = new Set(['atan2', 'min', 'max', 'pow'])

const BLOCKED_IDENTS = new Set([
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
])

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const WHITESPACE = /^[\s]+/
const NUMBER_RE = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*/
const OPERATORS = new Set(['+', '-', '*', '/', '^'])
const SINGLE_CHAR_TOKENS: Record<string, Token['type']> = {
  '(': 'lparen',
  ')': 'rparen',
  ',': 'comma',
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    // Whitespace
    const wsMatch = WHITESPACE.exec(input.slice(i))
    if (wsMatch) {
      i += wsMatch[0].length
      continue
    }

    // Number
    const numMatch = NUMBER_RE.exec(input.slice(i))
    if (numMatch) {
      tokens.push({ type: 'number', value: parseFloat(numMatch[0]), pos: i })
      i += numMatch[0].length
      continue
    }

    // Identifier
    const idMatch = IDENT_RE.exec(input.slice(i))
    if (idMatch) {
      tokens.push({ type: 'ident', name: idMatch[0], pos: i })
      i += idMatch[0].length
      continue
    }

    const ch = input[i]!

    // Operators
    if (OPERATORS.has(ch)) {
      tokens.push({ type: 'op', op: ch, pos: i })
      i++
      continue
    }

    // Single-character tokens
    const singleType = SINGLE_CHAR_TOKENS[ch]
    if (singleType) {
      tokens.push({ type: singleType, pos: i } as Token)
      i++
      continue
    }

    // Unknown character
    tokens.push({ type: 'op', op: ch, pos: i })
    i++
  }

  tokens.push({ type: 'eof', pos: input.length })
  return tokens
}

// ---------------------------------------------------------------------------
// Parser (Precedence Climbing)
// ---------------------------------------------------------------------------

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token {
    return this.tokens[this.pos]!
  }

  private advance(): Token {
    return this.tokens[this.pos++]!
  }

  private expect(type: string): Token {
    const t = this.peek()
    if (t.type !== type) {
      throw new ParseError(`Expected ${type}, got ${t.type}`, t.pos)
    }
    return this.advance()
  }

  parse(): ASTNode {
    const node = this.parseExpression()
    const t = this.peek()
    if (t.type !== 'eof') {
      throw new ParseError(
        `Unexpected token '${(t as { op?: string; name?: string }).op ?? (t as { name?: string }).name ?? t.type}'`,
        t.pos
      )
    }
    return node
  }

  // Expression: additive level
  private parseExpression(): ASTNode {
    let left = this.parseTerm()
    while (
      (this.peek().type === 'op' && (this.peek() as { op: string }).op === '+') ||
      (this.peek() as { op: string }).op === '-'
    ) {
      const t = this.peek()
      if (t.type !== 'op') break
      const op = (t as { op: string }).op
      if (op !== '+' && op !== '-') break
      this.advance()
      const right = this.parseTerm()
      left = { type: 'binary', op: op as '+' | '-', left, right }
    }
    return left
  }

  // Term: multiplicative level
  private parseTerm(): ASTNode {
    let left = this.parseUnary()
    while (true) {
      const t = this.peek()
      if (
        t.type === 'op' &&
        ((t as { op: string }).op === '*' || (t as { op: string }).op === '/')
      ) {
        const op = (t as { op: string }).op as '*' | '/'
        this.advance()
        const right = this.parseUnary()
        left = { type: 'binary', op, left, right }
      } else {
        break
      }
    }
    return left
  }

  // Unary: - prefix (lower precedence than ^, so -x^2 = -(x^2))
  private parseUnary(): ASTNode {
    const t = this.peek()
    if (t.type === 'op' && (t as { op: string }).op === '-') {
      this.advance()
      const operand = this.parseUnary()
      return { type: 'unary', op: '-', operand }
    }
    if (t.type === 'op' && (t as { op: string }).op === '+') {
      this.advance()
      return this.parseUnary()
    }
    return this.parseExponent()
  }

  // Exponent: right-associative ^, higher precedence than unary minus
  private parseExponent(): ASTNode {
    const base = this.parsePrimary()
    const t = this.peek()
    if (t.type === 'op' && (t as { op: string }).op === '^') {
      this.advance()
      const exp = this.parseUnary() // right side allows unary minus (2^-3)
      return { type: 'binary', op: '^', left: base, right: exp }
    }
    return base
  }

  // Primary: numbers, variables, functions, parenthesized expressions
  private parsePrimary(): ASTNode {
    const t = this.peek()

    // Number literal
    if (t.type === 'number') {
      this.advance()
      return { type: 'number', value: (t as { value: number }).value }
    }

    // Parenthesized expression
    if (t.type === 'lparen') {
      this.advance()
      const inner = this.parseExpression()
      this.expect('rparen')
      return inner
    }

    // Identifier: variable, constant, or function
    if (t.type === 'ident') {
      const name = (t as { name: string }).name
      this.advance()

      // Security check
      if (BLOCKED_IDENTS.has(name)) {
        throw new ParseError(`Forbidden identifier '${name}'`, t.pos)
      }

      // Function call
      if (this.peek().type === 'lparen') {
        this.advance() // consume '('
        const args: ASTNode[] = []
        if (this.peek().type !== 'rparen') {
          args.push(this.parseExpression())
          while (this.peek().type === 'comma') {
            this.advance()
            args.push(this.parseExpression())
          }
        }
        this.expect('rparen')

        if (UNARY_FUNCTIONS.has(name)) {
          if (args.length !== 1) {
            throw new ParseError(`${name}() expects 1 argument, got ${args.length}`, t.pos)
          }
          return { type: 'call', name, args }
        }
        if (BINARY_FUNCTIONS.has(name)) {
          if (args.length !== 2) {
            throw new ParseError(`${name}() expects 2 arguments, got ${args.length}`, t.pos)
          }
          return { type: 'call', name, args }
        }
        throw new ParseError(`Unknown function '${name}'`, t.pos)
      }

      // Constant
      if (name in CONSTANTS) {
        return { type: 'number', value: CONSTANTS[name]! }
      }

      // Variable
      const axisIndex = AXIS_LABELS.indexOf(name as (typeof AXIS_LABELS)[number])
      if (axisIndex >= 0) {
        return { type: 'variable', index: axisIndex }
      }

      throw new ParseError(`Unknown identifier '${name}'`, t.pos)
    }

    throw new ParseError(`Unexpected token`, t.pos)
  }
}

class ParseError extends Error {
  constructor(
    message: string,
    public position: number
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

// ---------------------------------------------------------------------------
// Math function lookup tables (typed, no unsafe casts)
// ---------------------------------------------------------------------------

const UNARY_MATH_FNS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  asinh: Math.asinh,
  acosh: Math.acosh,
  atanh: Math.atanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
}

const BINARY_MATH_FNS: Record<string, (x: number, y: number) => number> = {
  pow: Math.pow,
  atan2: Math.atan2,
  min: Math.min,
  max: Math.max,
  hypot: Math.hypot,
}

function lookupUnaryMathFn(name: string): ((x: number) => number) | undefined {
  return UNARY_MATH_FNS[name]
}

function lookupBinaryMathFn(name: string): ((x: number, y: number) => number) | undefined {
  return BINARY_MATH_FNS[name]
}

// ---------------------------------------------------------------------------
// AST Evaluator Compiler
// ---------------------------------------------------------------------------

function compileAST(node: ASTNode): (coords: number[]) => number {
  switch (node.type) {
    case 'number': {
      const v = node.value
      return () => v
    }
    case 'variable': {
      const idx = node.index
      return (coords) => coords[idx] ?? 0
    }
    case 'radial':
      return (coords) => {
        let sum = 0
        for (let i = 0; i < coords.length; i++) sum += coords[i]! * coords[i]!
        return Math.sqrt(sum)
      }
    case 'unary': {
      const fn = compileAST(node.operand)
      return (coords) => -fn(coords)
    }
    case 'binary': {
      const l = compileAST(node.left)
      const r = compileAST(node.right)
      switch (node.op) {
        case '+':
          return (c) => l(c) + r(c)
        case '-':
          return (c) => l(c) - r(c)
        case '*':
          return (c) => l(c) * r(c)
        case '/':
          return (c) => l(c) / r(c)
        case '^':
          return (c) => Math.pow(l(c), r(c))
      }
      break
    }
    case 'call': {
      const argFns = node.args.map(compileAST)
      const name = node.name
      if (argFns.length === 1) {
        const a = argFns[0]!
        const mathFn = lookupUnaryMathFn(name)
        if (!mathFn) throw new Error(`Unknown function: ${name}`)
        return (c) => mathFn(a(c))
      }
      if (argFns.length === 2) {
        const a = argFns[0]!
        const b = argFns[1]!
        const mathFn = lookupBinaryMathFn(name)
        if (!mathFn) throw new Error(`Unknown function: ${name}`)
        return (c) => mathFn(a(c), b(c))
      }
      break
    }
  }
  throw new Error('Unreachable')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a mathematical expression and return a compiled evaluator.
 *
 * @param expression - Mathematical expression string (e.g., "0.5 * (x^2 + y^2)")
 * @returns Parse result with evaluate function on success, or error details on failure
 *
 * @example
 * ```ts
 * const result = parseExpression('0.5 * (x^2 + y^2)')
 * if (result.success) {
 *   const V = result.evaluate([1.0, 2.0, 0.0])  // V(1,2,0) = 2.5
 * }
 * ```
 */
export function parseExpression(expression: string): ParseResult {
  try {
    const tokens = tokenize(expression)
    const parser = new Parser(tokens)
    const ast = parser.parse()
    const evaluate = compileAST(ast)
    return { success: true, evaluate }
  } catch (err) {
    if (err instanceof ParseError) {
      return { success: false, error: err.message, position: err.position }
    }
    return { success: false, error: String(err), position: 0 }
  }
}
