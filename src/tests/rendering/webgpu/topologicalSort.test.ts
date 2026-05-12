/**
 * Topological sort edge case tests.
 *
 * Exercises the render graph's pass ordering algorithm with
 * pathological inputs: empty graphs, single passes, diamond
 * dependencies, self-loops, and cycle detection.
 */

import { describe, expect, it, vi } from 'vitest'

import { createMockPass } from '@/tests/factories'

// Dynamic import to avoid issues with module initialization
async function getComputePassOrder() {
  const mod = await import('@/rendering/webgpu/graph/topologicalSort')
  return mod.computePassOrder
}

function passMap(...passes: ReturnType<typeof createMockPass>[]) {
  return new Map(passes.map((p) => [p.id, p]))
}

describe('computePassOrder', () => {
  it('returns empty array for empty graph', async () => {
    const computePassOrder = await getComputePassOrder()
    const result = computePassOrder(new Map())
    expect(result).toEqual([])
  })

  it('returns single pass for singleton graph', async () => {
    const computePassOrder = await getComputePassOrder()
    const pass = createMockPass({
      id: 'only-pass',
      priority: 0,
      inputs: [],
      outputs: [{ resourceId: 'out', access: 'write', binding: 0 }],
    })
    const result = computePassOrder(passMap(pass))
    expect(result).toEqual(['only-pass'])
  })

  it('respects linear chain A -> B -> C', async () => {
    const computePassOrder = await getComputePassOrder()
    const a = createMockPass({
      id: 'A',
      priority: 0,
      inputs: [],
      outputs: [{ resourceId: 'r1', access: 'write', binding: 0 }],
    })
    const b = createMockPass({
      id: 'B',
      priority: 0,
      inputs: [{ resourceId: 'r1', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'r2', access: 'write', binding: 0 }],
    })
    const c = createMockPass({
      id: 'C',
      priority: 0,
      inputs: [{ resourceId: 'r2', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'r3', access: 'write', binding: 0 }],
    })

    const result = computePassOrder(passMap(c, a, b)) // Insert in wrong order
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'))
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('C'))
  })

  it('handles diamond dependency (A -> B, A -> C, B,C -> D)', async () => {
    const computePassOrder = await getComputePassOrder()
    const a = createMockPass({
      id: 'A',
      priority: 0,
      inputs: [],
      outputs: [{ resourceId: 'r1', access: 'write', binding: 0 }],
    })
    const b = createMockPass({
      id: 'B',
      priority: 100,
      inputs: [{ resourceId: 'r1', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'r2', access: 'write', binding: 0 }],
    })
    const c = createMockPass({
      id: 'C',
      priority: 200,
      inputs: [{ resourceId: 'r1', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'r3', access: 'write', binding: 0 }],
    })
    const d = createMockPass({
      id: 'D',
      priority: 300,
      inputs: [
        { resourceId: 'r2', access: 'read', binding: 0 },
        { resourceId: 'r3', access: 'read', binding: 1 },
      ],
      outputs: [{ resourceId: 'r4', access: 'write', binding: 0 }],
    })

    const result = computePassOrder(passMap(d, c, b, a))
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'))
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('C'))
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('D'))
    expect(result.indexOf('C')).toBeLessThan(result.indexOf('D'))
  })

  it('detects dependency cycles and throws', async () => {
    const computePassOrder = await getComputePassOrder()
    // Suppress logger.error from the cycle detection warning
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const a = createMockPass({
      id: 'A',
      priority: 0,
      inputs: [{ resourceId: 'r2', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'r1', access: 'write', binding: 0 }],
    })
    const b = createMockPass({
      id: 'B',
      priority: 0,
      inputs: [{ resourceId: 'r1', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'r2', access: 'write', binding: 0 }],
    })

    expect(() => computePassOrder(passMap(a, b))).toThrow(/cycle/i)
    vi.restoreAllMocks()
  })

  it('self-referencing pass (reads own output) is ignored (not a cycle)', async () => {
    const computePassOrder = await getComputePassOrder()
    const pass = createMockPass({
      id: 'self-ref',
      priority: 0,
      inputs: [{ resourceId: 'self-out', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'self-out', access: 'write', binding: 0 }],
    })
    // The code explicitly skips self-references: `if (producer === id) continue`
    const result = computePassOrder(passMap(pass))
    expect(result).toEqual(['self-ref'])
  })

  it('uses priority as tiebreaker for independent passes', async () => {
    const computePassOrder = await getComputePassOrder()
    const passes = Array.from({ length: 5 }, (_, i) =>
      createMockPass({
        id: `pass-${i}`,
        priority: (4 - i) * 100, // Reverse order: pass-4 has lowest priority
        inputs: [],
        outputs: [{ resourceId: `out-${i}`, access: 'write', binding: 0 }],
      })
    )

    const result = computePassOrder(passMap(...passes))
    // Should be sorted by priority (ascending)
    for (let i = 0; i < result.length - 1; i++) {
      const currPrio = passes.find((p) => p.id === result[i])!.config.priority ?? 0
      const nextPrio = passes.find((p) => p.id === result[i + 1])!.config.priority ?? 0
      expect(currPrio).toBeLessThanOrEqual(nextPrio)
    }
  })

  it('uses lexicographic order as secondary tiebreaker', async () => {
    const computePassOrder = await getComputePassOrder()
    const a = createMockPass({
      id: 'alpha',
      priority: 100,
      inputs: [],
      outputs: [{ resourceId: 'o1', access: 'write', binding: 0 }],
    })
    const b = createMockPass({
      id: 'beta',
      priority: 100,
      inputs: [],
      outputs: [{ resourceId: 'o2', access: 'write', binding: 0 }],
    })

    const result = computePassOrder(passMap(b, a))
    expect(result.indexOf('alpha')).toBeLessThan(result.indexOf('beta'))
  })

  it('handles pass with external resource input (no producer in graph)', async () => {
    const computePassOrder = await getComputePassOrder()
    const pass = createMockPass({
      id: 'consumer',
      priority: 0,
      inputs: [{ resourceId: 'external-texture', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'result', access: 'write', binding: 0 }],
    })
    // external-texture has no producer — should not crash
    const result = computePassOrder(passMap(pass))
    expect(result).toEqual(['consumer'])
  })

  it('orders in-place read/write overlays after all other producers of the same resource', async () => {
    const computePassOrder = await getComputePassOrder()
    const scene = createMockPass({
      id: 'scene',
      priority: 100,
      inputs: [],
      outputs: [{ resourceId: 'scene-render', access: 'write', binding: 0 }],
    })
    const overlay = createMockPass({
      id: 'measurement-point-cloud',
      priority: 0,
      inputs: [{ resourceId: 'scene-render', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'scene-render', access: 'write', binding: 0 }],
    })
    const composite = createMockPass({
      id: 'environment-composite',
      priority: 200,
      inputs: [{ resourceId: 'scene-render', access: 'read', binding: 0 }],
      outputs: [{ resourceId: 'hdr-color', access: 'write', binding: 0 }],
    })

    const result = computePassOrder(passMap(overlay, composite, scene))

    expect(result.indexOf('scene')).toBeLessThan(result.indexOf('measurement-point-cloud'))
    expect(result.indexOf('measurement-point-cloud')).toBeLessThan(
      result.indexOf('environment-composite')
    )
  })
})
