/**
 * Hook for detecting any active parameter sweep.
 *
 * Consolidates sweep status checks across coordinateEntanglement,
 * monitoringSweep, and quantumnessAtlas stores. Use this to disable
 * controls that should be locked during any sweep.
 *
 * @module hooks/useAnySweepRunning
 */

import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useMonitoringSweepStore } from '@/stores/monitoringSweepStore'
import { useQuantumnessAtlasStore } from '@/stores/quantumnessAtlasStore'

/**
 * Returns true if any parameter sweep is currently running.
 *
 * @returns Whether any sweep (entanglement, monitoring, or atlas) is active
 */
export function useAnySweepRunning(): boolean {
  const entanglement = useCoordinateEntanglementStore((s) => s.sweepStatus === 'running')
  const monitoring = useMonitoringSweepStore((s) => s.status === 'running')
  const atlas = useQuantumnessAtlasStore((s) => s.status === 'running')
  return entanglement || monitoring || atlas
}
