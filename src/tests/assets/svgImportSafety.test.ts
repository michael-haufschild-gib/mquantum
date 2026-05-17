/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..')
const SRC_ROOT = resolve(ROOT, 'src')
const ASSET_ROOT = resolve(SRC_ROOT, 'assets')
const TEST_ROOT = resolve(SRC_ROOT, 'tests')
const SVG_ASSET_IMPORT_RE = /['"][^'"]*assets\/(icons|exporter)\/([^'"]+\.svg)(\?react)?['"]/g
const UNSAFE_SVG_RE =
  /<!DOCTYPE|xmlns:xlink|<script|<foreignObject|\son\w+=|javascript:|(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)|url\(\s*["']?(?:https?:|\/\/|data:)|(?:fill|stroke)=["']#000(?:000)?["']|(?:fill|stroke)\s*:\s*#000(?:000)?/i
const CURRENT_COLOR_PAINT_RE =
  /(?:fill|stroke)=["']currentColor["']|(?:fill|stroke)\s*:\s*currentColor/i

interface SvgAssetImport {
  asset: string
  isReactComponent: boolean
}

function walkSvgAssetFiles(dir: string, prefix: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name)
    const assetPath = `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      walkSvgAssetFiles(fullPath, assetPath, out)
    } else if (entry.name.endsWith('.svg')) {
      out.push(assetPath)
    }
  }
  return out
}

function isWithinDir(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (path !== '' && !path.startsWith('..') && !isAbsolute(path))
}

function walkProductionSourceFiles(dir: string, out: string[] = []): string[] {
  if (isWithinDir(TEST_ROOT, dir)) {
    return out
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      walkProductionSourceFiles(fullPath, out)
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts') &&
      !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)
    ) {
      out.push(fullPath)
    }
  }
  return out
}

function collectSvgAssetImports(): SvgAssetImport[] {
  const imports = new Map<string, SvgAssetImport>()
  for (const file of walkProductionSourceFiles(SRC_ROOT)) {
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

  it('derive asset ownership from production source files only', () => {
    const productionFiles = walkProductionSourceFiles(SRC_ROOT)

    expect(productionFiles.length).toBeGreaterThan(0)
    expect(productionFiles.some((file) => isWithinDir(TEST_ROOT, file))).toBe(false)
    expect(productionFiles.some((file) => /\.(test|spec)\.(ts|tsx)$/.test(file))).toBe(false)
  })

  it('do not keep unreferenced SVGs in icon and exporter pools', () => {
    const assets = ['icons', 'exporter'].flatMap((prefix) =>
      walkSvgAssetFiles(resolve(ASSET_ROOT, prefix), prefix)
    )
    const importedAssetNames = new Set(importedAssets.map(({ asset }) => asset))

    expect(assets.filter((asset) => !importedAssetNames.has(asset))).toEqual([])
  })

  it('do not carry active content, legacy external references, or hard-coded black paint', () => {
    expect(importedAssets.length).toBeGreaterThan(0)

    for (const { asset } of importedAssets) {
      const source = readFileSync(resolve(ASSET_ROOT, asset), 'utf8')
      expect(source, asset).not.toMatch(UNSAFE_SVG_RE)
    }
  })

  it('treats modern href and CSS url external references as unsafe SVG content', () => {
    const unsafeSamples = [
      '<image href="https://example.com/pixel.png" />',
      '<use href="//example.com/sprite.svg#icon" />',
      '<rect style="fill: url(https://example.com/pattern.svg#p)" />',
      '<image href="data:image/svg+xml;base64,PHN2Zy8+" />',
    ]

    for (const source of unsafeSamples) {
      expect(source).toMatch(UNSAFE_SVG_RE)
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
