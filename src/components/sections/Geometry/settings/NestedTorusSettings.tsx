import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useShallow } from 'zustand/react/shallow'

/**
 * Nested Torus settings component.
 * Hopf fibration and coupled circle structures.
 * @returns Nested torus settings controls
 */
export function NestedTorusSettings() {
  const dimension = useGeometryStore((state) => state.dimension)

  // Consolidate extended object store selectors with useShallow
  const {
    config,
    setRadius,
    setEta,
    setResolutionXi1,
    setResolutionXi2,
    setShowNestedTori,
    setNumberOfTori,
  } = useExtendedObjectStore(
    useShallow((state: ExtendedObjectState) => ({
      config: state.nestedTorus,
      setRadius: state.setNestedTorusRadius,
      setEta: state.setNestedTorusEta,
      setResolutionXi1: state.setNestedTorusResolutionXi1,
      setResolutionXi2: state.setNestedTorusResolutionXi2,
      setShowNestedTori: state.setNestedTorusShowNestedTori,
      setNumberOfTori: state.setNestedTorusNumberOfTori,
    }))
  )

  // Calculate point count
  const getPointCount = () => {
    const base = config.resolutionXi1 * config.resolutionXi2
    return config.showNestedTori && dimension === 4 ? base * config.numberOfTori : base
  }

  const pointCount = getPointCount()

  // Number of tori options for nested mode
  const numberOfToriOptions = [
    { value: '2', label: '2 tori' },
    { value: '3', label: '3 tori' },
    { value: '4', label: '4 tori' },
    { value: '5', label: '5 tori' },
  ]

  // Get dimension-specific description
  const getDescription = () => {
    switch (dimension) {
      case 4:
        return 'Hopf fibration: linked circles on S³'
      case 5:
        return 'Twisted 2-torus: T² + helix'
      case 6:
        return '3-torus (T³): three coupled circles'
      case 7:
        return 'Twisted 3-torus: T³ + helix'
      case 8:
        return 'Quaternionic Hopf: S³ fibers over S⁴'
      case 9:
        return 'Twisted 4-torus: T⁴ + helix'
      case 10:
        return '5-torus (T⁵): five coupled circles'
      case 11:
        return 'Twisted 5-torus: T⁵ + helix'
      default:
        return 'Nested torus structure'
    }
  }

  // Get appropriate label for eta slider based on dimension
  const etaLabel =
    dimension === 4 || dimension === 8
      ? `Torus Position (η = ${(config.eta / Math.PI).toFixed(2)}π)`
      : `Circle Balance (η = ${(config.eta / Math.PI).toFixed(2)}π)`

  return (
    <div className="space-y-4" data-testid="nested-torus-settings">
      {/* Mode description */}
      <div className="text-xs text-text-secondary">
        <span>{getDescription()}</span>
      </div>

      <Slider
        label="Radius"
        min={0.5}
        max={6.0}
        step={0.1}
        value={config.radius}
        onChange={setRadius}
        showValue
        data-testid="nested-radius"
      />
      <Slider
        label={etaLabel}
        min={Math.PI / 64}
        max={Math.PI / 2 - Math.PI / 64}
        step={0.01}
        value={config.eta}
        onChange={setEta}
        showValue={false}
        data-testid="nested-eta"
      />
      <Slider
        label="Resolution ξ₁"
        min={8}
        max={64}
        step={4}
        value={config.resolutionXi1}
        onChange={setResolutionXi1}
        showValue
        data-testid="nested-res-xi1"
      />
      <Slider
        label="Resolution ξ₂"
        min={8}
        max={64}
        step={4}
        value={config.resolutionXi2}
        onChange={setResolutionXi2}
        showValue
        data-testid="nested-res-xi2"
      />

      {/* Show nested tori option (4D only) */}
      {dimension === 4 && (
        <>
          <div className="flex items-center justify-between">
            <label htmlFor="show-nested-tori" className="text-sm">
              Show Nested Tori
            </label>
            <input
              id="show-nested-tori"
              type="checkbox"
              checked={config.showNestedTori}
              onChange={(e) => setShowNestedTori(e.target.checked)}
              className="h-4 w-4"
              data-testid="nested-show-multiple"
            />
          </div>
          {config.showNestedTori && (
            <Select
              label="Number of Tori"
              options={numberOfToriOptions}
              value={String(config.numberOfTori)}
              onChange={(v) => setNumberOfTori(parseInt(v, 10))}
              data-testid="nested-count"
            />
          )}
        </>
      )}

      {/* Point count and warnings */}
      <p className="text-xs text-text-secondary">
        {pointCount.toLocaleString()} points
        <span> · {(config.resolutionXi1 * config.resolutionXi2 * 2).toLocaleString()} edges</span>
      </p>
      {pointCount > 10000 && (
        <p className="text-xs text-warning">High point count may affect performance</p>
      )}
    </div>
  )
}
