import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  findUntrackedImportViolations,
  isTrackedImportSourceFile,
  stripImportQuery,
  tryResolve,
} from '../../../scripts/check-untracked-imports.js'

const ROOT = resolve('/repo')

function repoPath(path) {
  return resolve(ROOT, path)
}

describe('check-untracked-imports', () => {
  it('strips Vite query suffixes before resolving imports', () => {
    expect(stripImportQuery('@/assets/icons/new.svg?react')).toBe('@/assets/icons/new.svg')
    expect(stripImportQuery('./worker.ts?worker&inline')).toBe('./worker.ts')
  })

  it('resolves queried SVG imports to the underlying asset path', () => {
    const existing = new Set([repoPath('src/assets/icons/new.svg')])

    expect(
      tryResolve(
        '@/assets/icons/new.svg?react',
        repoPath('src/components/IconButton.tsx'),
        (path) => existing.has(path),
        ROOT
      )
    ).toBe(repoPath('src/assets/icons/new.svg'))
  })

  it('resolves Vite root-absolute /src imports', () => {
    const existing = new Set([repoPath('src/assets/icons/new.svg')])

    expect(
      tryResolve(
        '/src/assets/icons/new.svg?url',
        repoPath('src/components/IconButton.tsx'),
        (path) => existing.has(path),
        ROOT
      )
    ).toBe(repoPath('src/assets/icons/new.svg'))
  })

  it('flags tracked source files that import untracked SVG assets', () => {
    const files = new Map([
      [
        repoPath('src/components/IconButton.tsx'),
        "import NewIcon from '@/assets/icons/new.svg?react'\nexport { NewIcon }\n",
      ],
    ])
    const existing = new Set([...files.keys(), repoPath('src/assets/icons/new.svg')])

    expect(
      findUntrackedImportViolations({
        root: ROOT,
        trackedFiles: ['src/components/IconButton.tsx'],
        untrackedFiles: ['src/assets/icons/new.svg'],
        readFile: (path) => files.get(path),
        exists: (path) => existing.has(path),
      })
    ).toEqual([
      {
        file: 'src/components/IconButton.tsx',
        specifier: '@/assets/icons/new.svg?react',
        resolvedTo: 'src/assets/icons/new.svg',
      },
    ])
  })

  it('flags tracked source files that import untracked assets via /src absolute paths', () => {
    const files = new Map([
      [
        repoPath('src/components/IconButton.tsx'),
        "import iconUrl from '/src/assets/icons/new.svg?url'\nexport { iconUrl }\n",
      ],
    ])
    const existing = new Set([...files.keys(), repoPath('src/assets/icons/new.svg')])

    expect(
      findUntrackedImportViolations({
        root: ROOT,
        trackedFiles: ['src/components/IconButton.tsx'],
        untrackedFiles: ['src/assets/icons/new.svg'],
        readFile: (path) => files.get(path),
        exists: (path) => existing.has(path),
      })
    ).toEqual([
      {
        file: 'src/components/IconButton.tsx',
        specifier: '/src/assets/icons/new.svg?url',
        resolvedTo: 'src/assets/icons/new.svg',
      },
    ])
  })

  it('flags static-string dynamic imports that resolve to untracked source files', () => {
    const files = new Map([
      [
        repoPath('src/App.tsx'),
        "const Panel = lazy(() => import('@/components/Panels/LazyPanel'))\n",
      ],
    ])
    const existing = new Set([...files.keys(), repoPath('src/components/Panels/LazyPanel.tsx')])

    expect(
      findUntrackedImportViolations({
        root: ROOT,
        trackedFiles: ['src/App.tsx'],
        untrackedFiles: ['src/components/Panels/LazyPanel.tsx'],
        readFile: (path) => files.get(path),
        exists: (path) => existing.has(path),
      })
    ).toEqual([
      {
        file: 'src/App.tsx',
        specifier: '@/components/Panels/LazyPanel',
        resolvedTo: 'src/components/Panels/LazyPanel.tsx',
      },
    ])
  })

  it('flags side-effect imports that resolve to untracked assets', () => {
    const files = new Map([[repoPath('src/main.tsx'), "import './index.css'\n"]])
    const existing = new Set([...files.keys(), repoPath('src/index.css')])

    expect(
      findUntrackedImportViolations({
        root: ROOT,
        trackedFiles: ['src/main.tsx'],
        untrackedFiles: ['src/index.css'],
        readFile: (path) => files.get(path),
        exists: (path) => existing.has(path),
      })
    ).toEqual([
      {
        file: 'src/main.tsx',
        specifier: './index.css',
        resolvedTo: 'src/index.css',
      },
    ])
  })

  it('flags new URL worker and asset references that resolve to untracked files', () => {
    const files = new Map([
      [
        repoPath('src/lib/workerFactory.ts'),
        "export const workerUrl = new URL('../workers/render.worker.ts', import.meta.url)\n",
      ],
    ])
    const existing = new Set([...files.keys(), repoPath('src/workers/render.worker.ts')])

    expect(
      findUntrackedImportViolations({
        root: ROOT,
        trackedFiles: ['src/lib/workerFactory.ts'],
        untrackedFiles: ['src/workers/render.worker.ts'],
        readFile: (path) => files.get(path),
        exists: (path) => existing.has(path),
      })
    ).toEqual([
      {
        file: 'src/lib/workerFactory.ts',
        specifier: '../workers/render.worker.ts',
        resolvedTo: 'src/workers/render.worker.ts',
      },
    ])
  })

  it('treats root config and script files as clean-clone import sources', () => {
    expect(isTrackedImportSourceFile('vitest.config.ts')).toBe(true)
    expect(isTrackedImportSourceFile('vitest.config.stryker.ts')).toBe(true)
    expect(isTrackedImportSourceFile('playwright.benchmark.config.ts')).toBe(true)
    expect(isTrackedImportSourceFile('eslint.config.js')).toBe(true)
    expect(isTrackedImportSourceFile('scripts/check-untracked-imports.js')).toBe(true)
    expect(isTrackedImportSourceFile('package.json')).toBe(false)
  })

  it('flags tracked root config files that import untracked config helpers', () => {
    const files = new Map([
      [
        repoPath('vitest.config.ts'),
        "import { svgReactPlugin } from './vite.shared'\nexport default svgReactPlugin()\n",
      ],
    ])
    const existing = new Set([...files.keys(), repoPath('vite.shared.ts')])

    expect(
      findUntrackedImportViolations({
        root: ROOT,
        trackedFiles: ['vitest.config.ts'],
        untrackedFiles: ['vite.shared.ts'],
        readFile: (path) => files.get(path),
        exists: (path) => existing.has(path),
      })
    ).toEqual([
      {
        file: 'vitest.config.ts',
        specifier: './vite.shared',
        resolvedTo: 'vite.shared.ts',
      },
    ])
  })
})
