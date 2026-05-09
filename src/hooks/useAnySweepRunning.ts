/**
 * Hook for detecting any active parameter sweep.
 *
 * Consolidates sweep status checks across coordinateEntanglement,
 * monitoringSweep, SRMT, and quantumnessAtlas stores. Use this to
 * disable controls that should be locked during any sweep.
 *
 * @module hooks/useAnySweepRunning
 */

import { useAndersonSweepStore } from '@/stores/andersonSweepStore'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useMonitoringSweepStore } from '@/stores/monitoringSweepStore'
import { useQuantumnessAtlasStore } from '@/stores/quantumnessAtlasStore'
import { useSrmtSweepStore } from '@/stores/srmtSweepStore'

/**
 * Returns true if any parameter sweep is currently running.
 *
 * @returns Whether any sweep (Anderson, entanglement, monitoring, SRMT, or atlas) is active
 */
export function useAnySweepRunning(): boolean {
  const anderson = useAndersonSweepStore((s) => s.status === 'running')
  const entanglement = useCoordinateEntanglementStore((s) => s.sweepStatus === 'running')
  const monitoring = useMonitoringSweepStore((s) => s.status === 'running')
  const atlas = useQuantumnessAtlasStore((s) => s.status === 'running')
  const srmt = useSrmtSweepStore((s) => s.status === 'running')
  return anderson || entanglement || monitoring || atlas || srmt
}
