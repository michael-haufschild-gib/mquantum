/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..')
const SRC_ROOT = resolve(ROOT, 'src')
const ASSET_ROOT = resolve(SRC_ROOT, 'assets')
const SCANNED_ASSET_DIRS = ['icons', 'exporter'] as const
const SVG_ASSET_IMPORT_RE = /['"][^'"]*assets\/(icons|exporter)\/([^'"]+\.svg)(\?[^'"]*)?['"]/g
const BLACK_PAINT_PATTERN = String.raw`(?:#000(?:000)?(?:ff)?|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|rgb\(\s*0\s+0\s+0(?:\s*/\s*(?:1|100%))?\s*\))`
const UNSAFE_SVG_RE = new RegExp(
  [
    String.raw`<\?xml`,
    String.raw`<!DOCTYPE`,
    String.raw`xmlns:xlink`,
    String.raw`<script`,
    String.raw`<foreignObject`,
    String.raw`<image`,
    String.raw`\son\w+\s*=`,
    String.raw`(?:href|src)\s*=\s*["']\s*(?:javascript:|data:|https?:)`,
    String.raw`url\(\s*["']?(?:javascript:|data:|https?:)`,
    String.raw`(?:fill|stroke)\s*=\s*["']${BLACK_PAINT_PATTERN}["']`,
    String.raw`(?:fill|stroke)\s*:\s*${BLACK_PAINT_PATTERN}`,
  ].join('|'),
  'i'
)
const CURRENT_COLOR_PAINT_RE =
  /(?:fill|stroke)=["']currentColor["']|(?:fill|stroke)\s*:\s*currentColor/i

interface SvgAssetImport {
  asset: string
  query: string
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

function walkSvgAssetFiles(): string[] {
  const files: string[] = []

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.svg')) {
        files.push(relative(ASSET_ROOT, fullPath).replace(/\\/g, '/'))
      }
    }
  }

  for (const dir of SCANNED_ASSET_DIRS) {
    walk(resolve(ASSET_ROOT, dir))
  }

  return files.sort((a, b) => a.localeCompare(b))
}

function collectSvgAssetImports(): SvgAssetImport[] {
  const imports = new Map<string, SvgAssetImport>()
  for (const file of walkSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(SVG_ASSET_IMPORT_RE)) {
      const asset = `${match[1]!}/${match[2]!}`
      const query = match[3] ?? ''
      const isReactComponent = query === '?react'
      imports.set(`${asset}:${query}`, { asset, query, isReactComponent })
    }
  }
  return [...imports.values()].sort((a, b) => a.asset.localeCompare(b.asset))
}

describe('SVG asset imports', () => {
  let importedAssets: SvgAssetImport[]
  let svgAssets: string[]

  beforeAll(() => {
    importedAssets = collectSvgAssetImports()
    svgAssets = walkSvgAssetFiles()
  })

  it('keeps all icon and exporter SVG assets free of active content, legacy metadata, and hard-coded black paint', () => {
    expect(svgAssets.length).toBeGreaterThan(0)

    for (const asset of svgAssets) {
      const source = readFileSync(resolve(ASSET_ROOT, asset), 'utf8')
      expect(source, asset).not.toMatch(UNSAFE_SVG_RE)
    }
  })

  it('keeps icon assets colorable through currentColor paint', () => {
    const iconAssets = svgAssets.filter((asset) => asset.startsWith('icons/'))
    expect(iconAssets.length).toBeGreaterThan(0)

    for (const asset of iconAssets) {
      const source = readFileSync(resolve(ASSET_ROOT, asset), 'utf8')
      expect(source, asset).toMatch(CURRENT_COLOR_PAINT_RE)
    }
  })

  it('keeps source imports inside the scanned SVG asset set', () => {
    expect(importedAssets.length).toBeGreaterThan(0)
    const knownAssets = new Set(svgAssets)

    for (const { asset } of importedAssets) {
      expect(knownAssets.has(asset), asset).toBe(true)
    }
  })

  it('allows only URL or SVGR component imports for product SVG assets', () => {
    expect(importedAssets.length).toBeGreaterThan(0)

    for (const { asset, query } of importedAssets) {
      expect(['', '?react'], asset).toContain(query)
    }
  })

  it('captures disallowed SVG import query variants', () => {
    const source = "import rawIcon from '@/assets/" + "icons/safe.svg?raw'"
    const match = [...source.matchAll(SVG_ASSET_IMPORT_RE)][0]
    expect(match?.[1]).toBe('icons')
    expect(match?.[2]).toBe('safe.svg')
    expect(match?.[3]).toBe('?raw')
  })

  it('detects common SVG safety bypass variants', () => {
    const unsafeSamples = [
      '<svg><path fill="black" d="M0 0h1v1z"/></svg>',
      '<svg><path style="stroke: rgb(0, 0, 0)" d="M0 0h1v1z"/></svg>',
      '<svg><path fill="#000000ff" d="M0 0h1v1z"/></svg>',
      '<svg><image href="data:image/png;base64,AAA="/></svg>',
      '<svg><a href="https://example.invalid"><path fill="currentColor"/></a></svg>',
      '<svg><style>.x{background:url(https://example.invalid/a.png)}</style></svg>',
    ]

    for (const source of unsafeSamples) {
      expect(source).toMatch(UNSAFE_SVG_RE)
    }
  })
})
