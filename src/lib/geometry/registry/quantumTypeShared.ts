/**
 * Shared registry fragments used by multiple user-facing quantum type entries.
 */

export const SHARED_RENDERING = {
  supportsFaces: true,
  supportsEdges: true,
  supportsPoints: false,
  renderMethod: 'raymarch' as const,
  faceDetection: 'none' as const,
  requiresRaymarching: true,
  supportsEmission: true,
}

export const SLICE_ANIMATION = {
  name: 'Slice Animation',
  description: 'Animate through higher-dimensional slices (4D+ only)',
  enabledByDefault: false,
  minDimension: 4,
  enabledKey: 'sliceAnimationEnabled',
  params: {
    sliceSpeed: {
      min: 0.01,
      max: 0.1,
      default: 0.02,
      step: 0.01,
      label: 'Speed',
      description: 'Speed of slice movement',
    },
    sliceAmplitude: {
      min: 0.1,
      max: 1.0,
      default: 0.3,
      step: 0.05,
      label: 'Amplitude',
      description: 'How far the slice moves in each extra dimension',
    },
  },
}

export const QUALITY_PRESETS = ['draft', 'standard', 'high', 'ultra']

export const DEFAULT_ANALYTIC_COLOR_ALGORITHM = 'radialDistance'
export const DEFAULT_COMPUTE_COLOR_ALGORITHM = 'phaseDensity'

export const BELL_SERIALIZABLE_PARAMS = [
  'bell_at',
  'bell_ap',
  'bell_apt',
  'bell_app',
  'bell_bt',
  'bell_bp',
  'bell_bpt',
  'bell_bpp',
  'bell_v',
  'bell_eta',
  'bell_an',
  'bell_bax',
  'bell_bay',
  'bell_baz',
  'bell_bbx',
  'bell_bby',
  'bell_bbz',
  'bell_m',
  'bell_lhv',
  'bell_n',
  'bell_tpf',
  'bell_seed',
] as const
