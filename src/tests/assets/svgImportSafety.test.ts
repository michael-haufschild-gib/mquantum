/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..')
const SRC_ROOT = resolve(ROOT, 'src')
const ASSET_ROOT = resolve(SRC_ROOT, 'assets')
const SVG_ASSET_IMPORT_RE = /['"][^'"]*assets\/(icons|exporter)\/([^'"]+\.svg)(\?react)?['"]/g
const UNSAFE_SVG_RE =
  /<!DOCTYPE|xmlns:xlink|<script|<foreignObject|\son\w+=|javascript:|(?:fill|stroke)=["']#000(?:000)?["']|(?:fill|stroke)\s*:\s*#000(?:000)?/i
const CURRENT_COLOR_PAINT_RE =
  /(?:fill|stroke)=["']currentColor["']|(?:fill|stroke)\s*:\s*currentColor/i

interface SvgAssetImport {
  asset: string
  isReactComponent: boolean
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, out)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(fullPath)
    }
  }
  return out
}

function collectSvgAssetImports(): SvgAssetImport[] {
  const imports = new Map<string, SvgAssetImport>()
  for (const file of walkSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(SVG_ASSET_IMPORT_RE)) {
      const asset = `${match[1]!}/${match[2]!}`
      const isReactComponent = match[3] === '?react'
      imports.set(`${asset}:${isReactComponent}`, { asset, isReactComponent })
    }
  }
  return [...imports.values()].sort((a, b) => a.asset.localeCompare(b.asset))
}

describe('SVG asset imports', () => {
  let importedAssets: SvgAssetImport[]

  beforeAll(() => {
    importedAssets = collectSvgAssetImports()
  })

  it('do not carry active content, legacy external references, or hard-coded black paint', () => {
    expect(importedAssets.length).toBeGreaterThan(0)

    for (const { asset } of importedAssets) {
      const source = readFileSync(resolve(ASSET_ROOT, asset), 'utf8')
      expect(source, asset).not.toMatch(UNSAFE_SVG_RE)
    }
  })

  it('keep React icon imports colorable through currentColor paint', () => {
    const reactIconAssets = importedAssets.filter(
      ({ asset, isReactComponent }) => isReactComponent && asset.startsWith('icons/')
    )
    expect(reactIconAssets.length).toBeGreaterThan(0)

    for (const { asset } of reactIconAssets) {
      const source = readFileSync(resolve(ASSET_ROOT, asset), 'utf8')
      expect(source, asset).toMatch(CURRENT_COLOR_PAINT_RE)
    }
  })
})
