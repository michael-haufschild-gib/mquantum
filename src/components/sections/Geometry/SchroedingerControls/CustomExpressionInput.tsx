/**
 * Custom mathematical expression input for TDSE custom potentials.
 *
 * Extracted from TDSEPotentialControls to keep file sizes under the max-lines limit.
 *
 * @module components/sections/Geometry/SchroedingerControls/CustomExpressionInput
 */

import React, { useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { parseExpression } from '@/lib/physics/expressionParser'

const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p']

const EXPRESSION_PRESETS = [
  { label: 'Harmonic', expr: '0.5 * (x^2 + y^2)' },
  { label: 'Double well', expr: '(x^2 - 1)^2' },
  { label: 'Periodic', expr: 'cos(pi * x)^2' },
  { label: 'Coulomb', expr: '-1 / sqrt(x^2 + y^2 + 0.01)' },
]

/** Props for CustomExpressionInput. */
interface CustomExpressionInputProps {
  expression: string
  onChange: (expr: string) => void
  activeDims: number
}

/**
 * Input field with live parse validation and preset buttons for custom potential expressions.
 *
 * @param props - Component props
 * @returns React element
 */
export const CustomExpressionInput: React.FC<CustomExpressionInputProps> = React.memo(
  ({ expression, onChange, activeDims }) => {
    const [localExpr, setLocalExpr] = useState(expression)
    const parseResult = useMemo(() => parseExpression(localExpr), [localExpr])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalExpr(e.target.value)
    }, [])

    const handleBlur = useCallback(() => {
      if (parseResult.success) onChange(localExpr)
    }, [localExpr, parseResult.success, onChange])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && parseResult.success) {
          onChange(localExpr)
          ;(e.target as HTMLInputElement).blur()
        }
      },
      [localExpr, parseResult.success, onChange]
    )

    const vars = AXIS_LABELS.slice(0, activeDims).join(', ')

    return (
      <div className="space-y-2">
        <Input
          label="V(x) ="
          tooltip="Custom potential expression using variables x, y, z, etc. Supports +, -, *, /, ^, sqrt, sin, cos, exp, pi, and parentheses."
          value={localExpr}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="font-mono text-xs"
          data-testid="tdse-custom-expression"
        />
        <div className="flex items-center gap-2 text-[10px]">
          {parseResult.success ? (
            <span className="text-green-400">Valid</span>
          ) : (
            <span className="text-red-400">{parseResult.error}</span>
          )}
        </div>
        <div className="text-[10px] text-text-tertiary">Variables: {vars}</div>
        <div className="flex flex-wrap gap-1">
          {EXPRESSION_PRESETS.map((p) => (
            <Button
              key={p.label}
              variant="ghost"
              size="sm"
              onClick={() => {
                setLocalExpr(p.expr)
                onChange(p.expr)
              }}
              className="px-2 py-0.5 text-[10px]"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
    )
  }
)

CustomExpressionInput.displayName = 'CustomExpressionInput'
