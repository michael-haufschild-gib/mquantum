/**
 * Topological sort for render graph pass ordering.
 *
 * Uses Kahn's algorithm with priority tie-breakers for deterministic
 * execution order among independent passes.
 *
 * @module rendering/webgpu/graph/topologicalSort
 */

import { logger } from '@/lib/logger'

import type { WebGPURenderPass } from '../core/types'

/**
 * Compute topologically-sorted pass execution order.
 *
 * @param passes - Map of pass ID to pass instance
 * @returns Sorted array of pass IDs respecting producer→consumer dependencies
 */
export function computePassOrder(passes: Map<string, WebGPURenderPass>): string[] {
  // Build output → producers lookup. Multiple passes may write the same
  // target sequentially (for example overlays compositing into scene-render),
  // so consumers must wait for every producer except themselves.
  const outputToPasses = new Map<string, string[]>()

  for (const [id, pass] of passes) {
    if (!pass.config.outputs || !Array.isArray(pass.config.outputs)) {
      logger.error(`WebGPURenderGraph: Pass '${id}' has invalid outputs:`, pass.config.outputs)
      continue
    }
    for (const output of pass.config.outputs) {
      const producers = outputToPasses.get(output.resourceId)
      if (producers) {
        producers.push(id)
      } else {
        outputToPasses.set(output.resourceId, [id])
      }
    }
  }

  const sortByPriority = (a: string, b: string): number => {
    const passA = passes.get(a)
    const passB = passes.get(b)
    const prioA = passA?.config.priority ?? 0
    const prioB = passB?.config.priority ?? 0
    if (prioA !== prioB) return prioA - prioB
    return a.localeCompare(b)
  }

  // Build in-degree graph
  const dependents = new Map<string, Set<string>>()
  const indegree = new Map<string, number>()

  for (const passId of passes.keys()) {
    dependents.set(passId, new Set())
    indegree.set(passId, 0)
  }

  for (const [id, pass] of passes) {
    if (!pass.config.inputs || !Array.isArray(pass.config.inputs)) {
      logger.error(`WebGPURenderGraph: Pass '${id}' has invalid inputs:`, pass.config.inputs)
      continue
    }
    for (const input of pass.config.inputs) {
      const producers = outputToPasses.get(input.resourceId)
      if (!producers) continue

      for (const producer of producers) {
        if (producer === id) continue

        const producerDependents = dependents.get(producer)
        if (!producerDependents) continue

        if (producerDependents.has(id)) continue
        producerDependents.add(id)
        indegree.set(id, (indegree.get(id) ?? 0) + 1)
      }
    }
  }

  // Kahn's algorithm
  const readyQueue: string[] = []
  for (const [passId, degree] of indegree.entries()) {
    if (degree === 0) readyQueue.push(passId)
  }
  readyQueue.sort(sortByPriority)

  const sorted: string[] = []
  while (readyQueue.length > 0) {
    const nextPassId = readyQueue.shift()!
    sorted.push(nextPassId)

    const nextDependents = dependents.get(nextPassId)
    if (!nextDependents) continue
    for (const dependentId of nextDependents) {
      const nextDegree = (indegree.get(dependentId) ?? 0) - 1
      indegree.set(dependentId, nextDegree)
      if (nextDegree === 0) {
        readyQueue.push(dependentId)
        readyQueue.sort(sortByPriority)
      }
    }
  }

  if (sorted.length !== passes.size) {
    const sortedSet = new Set(sorted)
    const remaining = [...passes.keys()].filter((id) => !sortedSet.has(id))
    throw new Error(
      `WebGPURenderGraph: Dependency cycle detected among passes: [${remaining.join(', ')}]. ` +
        `Sorted ${sorted.length} of ${passes.size} passes before cycle.`
    )
  }

  return sorted
}
