import '@testing-library/jest-dom'
// Polyfill IndexedDB for happy-dom test environment
import 'fake-indexeddb/auto'
// Custom domain-specific matchers (WGSL, quantum physics, vectors)
import './matchers'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Note: mdimension-core WASM module is mocked via alias in vitest.config.ts
// The alias points to src/tests/__mocks__/mdimension-core.ts
// ── Focused mock modules ──
// Each module is self-contained and can be imported individually by tests
// that need direct access to mock internals.
import { installAudioMock } from './__mocks__/audio'
import { installDOMMocks } from './__mocks__/dom'
import { installWebGLMock } from './__mocks__/webgl'
import { installWebGPUMock } from './__mocks__/webgpu'

// Re-export for tests that need direct access to WebGPU mock internals
export { mockWebGPU } from './__mocks__/webgpu'

// ── Install all mocks ──
installDOMMocks()
installWebGLMock()
installWebGPUMock()
installAudioMock()

// ── Cleanup after each test case ──
afterEach(() => {
  cleanup()
})
