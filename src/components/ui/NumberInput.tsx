import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Input, InputProps } from './Input'

/** Props for the {@link NumberInput} component. Extends {@link InputProps} with numeric constraints. */
export interface NumberInputProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  precision?: number
}

/** Formats a number for display, trimming trailing zeros. */
function formatNumericValue(num: number, precision: number): string {
  return Number(num)
    .toFixed(precision)
    .replace(/\.?0+$/, '')
}

/** Handles revert logic when the user's input is empty or an invalid expression. */
function revertOnInvalid(
  trimmedInput: string,
  currentValue: number,
  precision: number,
  errorTimerRef: React.MutableRefObject<number | null>,
  setLocalValue: (v: string) => void,
  setError: (e: string | null) => void
): void {
  // Empty input — revert silently
  if (trimmedInput === '') {
    setLocalValue(formatNumericValue(currentValue, precision))
    setError(null)
    return
  }

  // Invalid expression — show error and revert after delay
  setError('Invalid expression')
  if (errorTimerRef.current !== null) {
    clearTimeout(errorTimerRef.current)
  }
  errorTimerRef.current = window.setTimeout(() => {
    setLocalValue(formatNumericValue(currentValue, precision))
    setError(null)
    errorTimerRef.current = null
  }, 1500)
}

const DECIMAL_TOKEN_PATTERN = /^(?:\d+\.?\d*|\.\d+)$/
const WHITESPACE = /\s/
const DIGIT_OR_DOT = /[0-9.]/
const OPERATORS = '+-*/()%'

/** Reads a numeric literal starting at position `i`, returning the parsed number and new index. */
function readNumber(expr: string, start: number): { value: number; end: number } | null {
  let numStr = ''
  let i = start
  while (i < expr.length && DIGIT_OR_DOT.test(expr.charAt(i))) {
    numStr += expr.charAt(i)
    i++
  }
  if (!DECIMAL_TOKEN_PATTERN.test(numStr)) return null
  const value = parseFloat(numStr)
  if (isNaN(value)) return null
  return { value, end: i }
}

/**
 * Tokenizes a math expression into numbers, operators, and parentheses.
 * @param expr - Expression string to tokenize
 * @returns Array of tokens or null if invalid
 */
function tokenize(expr: string): (string | number)[] | null {
  const tokens: (string | number)[] = []
  let i = 0

  while (i < expr.length) {
    const char = expr.charAt(i)

    if (WHITESPACE.test(char)) {
      i++
      continue
    }

    if (OPERATORS.includes(char)) {
      tokens.push(char)
      i++
      continue
    }

    if (DIGIT_OR_DOT.test(char)) {
      const result = readNumber(expr, i)
      if (!result) return null
      tokens.push(result.value)
      i = result.end
      continue
    }

    return null
  }

  return tokens
}

/**
 * Safe recursive descent parser for math expressions.
 * Handles: +, -, *, /, %, parentheses, and unary minus.
 * Grammar:
 *   expr   -> term (('+' | '-') term)*
 *   term   -> factor (('*' | '/' | '%') factor)*
 *   factor -> '-'? primary
 *   primary-> number | '(' expr ')'
 * @param tokens - Tokenized math expression
 * @returns Parsed numeric result or null if invalid
 */
function parseTokens(tokens: (string | number)[]): number | null {
  let pos = 0

  function peek(): string | number | undefined {
    return tokens[pos]
  }

  function consume(): string | number | undefined {
    return tokens[pos++]
  }

  function parseExpr(): number | null {
    let left = parseTerm()
    if (left === null) return null

    while (peek() === '+' || peek() === '-') {
      const op = consume()
      const right = parseTerm()
      if (right === null) return null
      left = op === '+' ? left + right : left - right
    }

    return left
  }

  function parseTerm(): number | null {
    let left = parseFactor()
    if (left === null) return null

    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume()
      const right = parseFactor()
      if (right === null) return null
      if (op === '*') left = left * right
      else if (op === '/') {
        if (right === 0) return null // Avoid division by zero
        left = left / right
      } else left = left % right
    }

    return left
  }

  function parseFactor(): number | null {
    // Handle unary minus
    if (peek() === '-') {
      consume()
      const val = parsePrimary()
      if (val === null) return null
      return -val
    }
    // Handle unary plus (just skip it)
    if (peek() === '+') {
      consume()
    }
    return parsePrimary()
  }

  function parsePrimary(): number | null {
    const token = peek()

    // Number
    if (typeof token === 'number') {
      consume()
      return token
    }

    // Parenthesized expression
    if (token === '(') {
      consume() // consume '('
      const result = parseExpr()
      if (result === null) return null
      if (peek() !== ')') return null
      consume() // consume ')'
      return result
    }

    return null
  }

  const result = parseExpr()

  // Ensure all tokens were consumed
  if (pos !== tokens.length) return null

  return result
}

/**
 * Safely parses and evaluates a math expression without using eval() or new Function().
 * Supports: numbers, +, -, *, /, %, parentheses, and constants (pi, tau, e).
 * @param expression - Math expression string
 * @returns Evaluated result or null if invalid
 */
function parseExpression(expression: string): number | null {
  try {
    // Replace constants (case insensitive, whole words only)
    let expr = expression
      .replace(/\bpi\b/gi, Math.PI.toString())
      .replace(/\btau\b/gi, (Math.PI * 2).toString())
      .replace(/\be\b/gi, Math.E.toString())

    const tokens = tokenize(expr)
    if (!tokens || tokens.length === 0) return null

    const result = parseTokens(tokens)
    if (result === null || !isFinite(result) || isNaN(result)) return null

    return result
  } catch {
    return null
  }
}

export const NumberInput: React.FC<NumberInputProps> = React.memo(
  ({
    value,
    onChange,
    min = -Infinity,
    max = Infinity,
    step = 1,
    precision = 3,
    onBlur,
    onKeyDown: externalOnKeyDown,
    ref: externalRef,
    ...props
  }: NumberInputProps & { ref?: React.Ref<HTMLInputElement> }) => {
    const [localValue, setLocalValue] = useState(value.toString())
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const [isFocused, setIsFocused] = useState(false)
    const errorTimerRef = useRef<number | null>(null)

    // Cleanup error timer on unmount
    useEffect(() => {
      const ref = errorTimerRef
      return () => {
        if (ref.current !== null) {
          clearTimeout(ref.current)
        }
      }
    }, [])

    useEffect(() => {
      // Only update local value when not focused to allow typing without snapping
      if (!isFocused) {
        const syncValueTimer = window.setTimeout(() => {
          setLocalValue(formatNumericValue(value, precision))
        }, 0)
        return () => clearTimeout(syncValueTimer)
      }
      return undefined
    }, [value, precision, isFocused])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value)
      setError(null)
    }, [])

    const handleFocus = useCallback(() => {
      setIsFocused(true)
    }, [])

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false)
        const parsed = parseExpression(localValue)

        if (parsed !== null) {
          const clamped = Math.min(Math.max(parsed, min), max)
          onChange(clamped)
          setLocalValue(formatNumericValue(clamped, precision))
          setError(null)
        } else {
          revertOnInvalid(
            localValue.trim(),
            value,
            precision,
            errorTimerRef,
            setLocalValue,
            setError
          )
        }

        if (onBlur) onBlur(e)
      },
      [localValue, min, max, onChange, precision, value, onBlur]
    )

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
        externalOnKeyDown?.(e)
      },
      [externalOnKeyDown]
    )

    const handleIncrement = useCallback(() => {
      onChange(Math.min(value + step, max))
    }, [onChange, value, step, max])

    const handleDecrement = useCallback(() => {
      onChange(Math.max(value - step, min))
    }, [onChange, value, step, min])

    const mergedRef = useCallback(
      (element: HTMLInputElement | null) => {
        inputRef.current = element
        if (typeof externalRef === 'function') externalRef(element)
        else if (externalRef)
          (externalRef as React.MutableRefObject<HTMLInputElement | null>).current = element
      },
      [externalRef]
    )

    return (
      <Input
        {...props}
        ref={mergedRef}
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        error={error || props.error}
        rightIcon={
          <div className="flex flex-col gap-[1px]">
            <button
              type="button"
              className="h-2 w-3 hover:bg-[var(--bg-active)] rounded-sm flex items-center justify-center"
              onClick={handleIncrement}
              tabIndex={-1}
              aria-label="Increment"
            >
              <svg width="6" height="4" viewBox="0 0 8 4" fill="currentColor">
                <path d="M4 0L8 4H0L4 0Z" />
              </svg>
            </button>
            <button
              type="button"
              className="h-2 w-3 hover:bg-[var(--bg-active)] rounded-sm flex items-center justify-center"
              onClick={handleDecrement}
              tabIndex={-1}
              aria-label="Decrement"
            >
              <svg width="6" height="4" viewBox="0 0 8 4" fill="currentColor">
                <path d="M4 4L0 0H8L4 4Z" />
              </svg>
            </button>
          </div>
        }
      />
    )
  }
)

NumberInput.displayName = 'NumberInput'
