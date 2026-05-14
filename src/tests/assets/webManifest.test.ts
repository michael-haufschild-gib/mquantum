/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..')
const LOGO_ROOT = resolve(ROOT, 'src/assets/logo')

interface WebManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

interface WebManifest {
  name: string
  short_name: string
  description: string
  icons: WebManifestIcon[]
}

function readManifest(): WebManifest {
  return JSON.parse(readFileSync(resolve(LOGO_ROOT, 'manifest.webmanifest'), 'utf8')) as WebManifest
}

function readPngSize(path: string): { width: number; height: number } {
  const data = readFileSync(path)
  const pngSignature = '89504e470d0a1a0a'
  expect(data.subarray(0, 8).toString('hex')).toBe(pngSignature)
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  }
}

describe('web app manifest', () => {
  it('uses current MQuantum branding', () => {
    const manifest = readManifest()

    expect(manifest.name).toBe('MQuantum - N-Dimensional Quantum Physics Visualizer')
    expect(manifest.short_name).toBe('MQuantum')
    expect(manifest.description).toBe(
      'Visualize quantum wavefunctions in 2 to 11 dimensions via WebGPU'
    )
  })

  it('references logo assets that exist at declared PNG sizes', () => {
    const manifest = readManifest()

    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      const [width, height] = icon.sizes.split('x').map((part) => Number.parseInt(part, 10))
      const filePath = resolve(LOGO_ROOT, icon.src.replace(/^\//, ''))

      expect(existsSync(filePath), icon.src).toBe(true)
      expect(readPngSize(filePath)).toEqual({ width, height })
    }
  })
})
