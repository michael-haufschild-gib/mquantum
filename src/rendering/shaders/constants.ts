/**
 * Shared Visual Constants
 *
 * Centralized constants for visual rendering settings to ensure
 * consistency across PolytopeRenderer, and
 * other rendering components.
 *
 * @see docs/prd/enhanced-visuals-rendering-pipeline.md
 */

// ============================================================================
// Material Properties
// ============================================================================

/**
 * Default emissive intensity for vertex/point rendering.
 * Provides a subtle glow effect without overwhelming the base color.
 */
export const DEFAULT_EMISSIVE_INTENSITY = 0.2

/**
 * Default roughness for MeshStandardMaterial.
 * Higher values create a more matte appearance.
 */
export const DEFAULT_MATERIAL_ROUGHNESS = 0.6

/**
 * Default metalness for MeshStandardMaterial.
 * Low value for non-metallic appearance while maintaining some reflectivity.
 */
export const DEFAULT_MATERIAL_METALNESS = 0.1

// ============================================================================
// Vertex/Point Size Constants
// ============================================================================

/**
 * Base vertex size as a factor of the store's vertex size setting.
 * Store value (1-10) is divided by this to get actual 3D scale.
 * Example: vertexSize=4 in store → 4/100 = 0.04 in 3D space.
 */
export const VERTEX_SIZE_DIVISOR = 100

/**
 * Default base vertex size when no store value is available.
 * This matches the default store value (4) divided by VERTEX_SIZE_DIVISOR.
 */
export const DEFAULT_BASE_VERTEX_SIZE = 0.04

// ============================================================================
// Density Scaling Constants
// ============================================================================

/**
 * Vertex count threshold below which no density scaling is applied.
 * Objects with fewer vertices than this render at full vertex size.
 */
export const DENSITY_SCALING_THRESHOLD = 16

/**
 * Reference vertex count for density scaling calculation.
 * Used as the base in the scaling formula: (count/BASE)^EXPONENT
 */
export const DENSITY_SCALING_BASE = 8

/**
 * Exponent for density scaling calculation.
 * Lower values create more gradual size reduction for dense geometries.
 */
export const DENSITY_SCALING_EXPONENT = 0.35

/**
 * Minimum scale factor for density scaling.
 * Prevents vertices from becoming too small to see.
 */
export const DENSITY_SCALING_MIN = 0.15

// ============================================================================
// Scale Constants
// ============================================================================

/**
 * Default scale for polytope generation.
 * Vertices are generated in the range [-DEFAULT_SCALE, DEFAULT_SCALE] per axis.
 */
export const DEFAULT_POLYTOPE_SCALE = 1.0

/**
 * Default radius for point cloud generation.
 * Matches DEFAULT_POLYTOPE_SCALE for visual consistency.
 */
export const DEFAULT_POINT_CLOUD_RADIUS = 1.0

/**
 * Default radius for Clifford torus generation.
 * This is the radius of the containing sphere (S³).
 */
export const DEFAULT_CLIFFORD_RADIUS = 1.0

// ============================================================================
// Point/Vertex Shader Constants
// ============================================================================

/**
 * Scale factor for perspective-correct point sizing.
 * Used in vertex shader: gl_PointSize = uPointSize * (PERSPECTIVE_POINT_SCALE / -mvPosition.z)
 * Higher values create larger points at the same camera distance.
 */
export const PERSPECTIVE_POINT_SCALE = 300.0

// ============================================================================
// Fragment Shader Math Constants
// ============================================================================

/**
 * Small epsilon value for division safety in shaders.
 * Prevents division by zero in weight normalization.
 */
export const SHADER_EPSILON = 0.001

/**
 * Minimum distance for attenuation calculations.
 * Prevents singularities at zero distance.
 */
export const MIN_DISTANCE_ATTENUATION = 0.0001

/**
 * Fresnel effect power exponent.
 * Controls the sharpness of rim lighting falloff.
 */
export const FRESNEL_POWER = 3.0

/**
 * Rim lighting base factor (minimum rim contribution).
 * Combined with NdotL modulation for smooth rim effect.
 */
export const RIM_BASE_FACTOR = 0.3

/**
 * Rim lighting NdotL modulation factor.
 * Controls how much light direction affects rim visibility.
 */
export const RIM_NDOTL_FACTOR = 0.7

// ============================================================================
// Face Rendering Constants
// ============================================================================
// NOTE: Face rendering defaults (color, opacity, specular settings) are
// centralized in @/stores/appearanceStore.ts to avoid duplicate/conflicting values.
// Import defaults from appearanceSlice for face color, opacity, specular settings.

// ============================================================================
// Normal Calculation Strategy Constants
// ============================================================================

/**
 * Minimum dimension for screen-space normal calculation (dFdx/dFdy).
 *
 * Below this threshold: Geometry-based normals computed in vertex shader
 * from neighbor vertex data. Accurate but requires 9 attribute slots and
 * 3x N-D transforms per vertex.
 *
 * At or above threshold: Screen-space normals computed in fragment shader
 * via dFdx/dFdy derivatives. Faster (67% fewer transforms, 67% less memory)
 * but may have minor 1-2 pixel edge artifacts at face boundaries.
 *
 * NOTE: Modulation (breathing animation) is disabled when using screen-space
 * normals to ensure stable normal computation.
 *
 * Set to 3 for testing worst-case visual artifacts.
 * Recommended production value: 7 (based on performance/quality tradeoff).
 *
 * Performance impact for hypercubes:
 * - 7D (1,344 triangles): Saves 8,064 transforms, 323 KB/frame
 * - 11D (56,320 triangles): Saves 337,920 transforms, 13.5 MB/frame
 */
export const SCREEN_SPACE_NORMAL_MIN_DIMENSION = 5
