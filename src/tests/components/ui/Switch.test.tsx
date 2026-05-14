import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

import { Switch } from '@/components/ui/Switch'

const PROJECT_ROOT = cwd()
const SOURCE_ROOT = join(PROJECT_ROOT, 'src')

function listTsxFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...listTsxFiles(fullPath))
      continue
    }
    if (fullPath.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

function findSwitchesMissingAccessibleName(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const findings: string[] = []

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile)
      if (tag === 'Switch') {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute)
        const attrNames = new Set(attrs.map((attr) => attr.name.getText(sourceFile)))
        if (!attrNames.has('label') && !attrNames.has('ariaLabel')) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          )
          findings.push(`${filePath.replace(`${PROJECT_ROOT}/`, '')}:${line + 1}:${character + 1}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

describe('Switch', () => {
  it('calls onCheckedChange when clicked', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(<Switch checked={false} onCheckedChange={onCheckedChange} label="Toggle me" />)

    expect(screen.getByText('Toggle me')).toBeInTheDocument()
    expect(screen.getByRole('switch')).not.toBeChecked()

    await user.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('is non-interactive when disabled', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Switch
        checked={false}
        onCheckedChange={onCheckedChange}
        ariaLabel="Disabled switch"
        disabled
      />
    )

    const el = screen.getByRole('switch', { name: 'Disabled switch' })
    expect(el).toBeDisabled()

    await user.click(el)
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('supports an accessible name without visible label text', () => {
    render(<Switch checked={false} onCheckedChange={vi.fn()} ariaLabel="Enable export crop" />)

    expect(screen.getByRole('switch', { name: 'Enable export crop' })).toBeInTheDocument()
  })

  it('keeps every project Switch instance accessible by name', () => {
    const findings = listTsxFiles(SOURCE_ROOT).flatMap(findSwitchesMissingAccessibleName)

    expect(findings).toEqual([])
  })
})
