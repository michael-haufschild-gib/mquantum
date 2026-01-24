declare module 'mdimension-core' {
  /**
   * Initialize the WASM module
   * @returns Promise that resolves when WASM is initialized
   */
  export default function init(): Promise<void>

  /**
   * Initialize panic hook for better error logging
   */
  export function start(): void

  /**
   * Log a greeting to the console
   * @param name
   */
  export function greet(name: string): void

  /**
   * Add two numbers (sanity check)
   * @param a - First number
   * @param b - Second number
   * @returns Sum of a and b
   */
  export function add_wasm(a: number, b: number): number

  /**
   * Compute convex hull of N-dimensional points.
   * Returns flat array of triangle vertex indices.
   * @param flat_vertices Flat array of coordinates
   * @param dimension Dimension of points
   * @returns Flat array of triangle vertex indices
   */
  export function compute_convex_hull_wasm(
    flat_vertices: Float64Array,
    dimension: number
  ): Uint32Array

  /**
   * Wythoff configuration object
   */
  export interface WythoffConfigWasm {
    symmetry_group: string
    preset: string
    dimension: number
    scale: number
    custom_symbol?: boolean[]
  }

  /**
   * Result from Wythoff generation.
   * Note: serde_wasm_bindgen returns plain JS arrays, not TypedArrays.
   * The worker wraps these in TypedArrays for zero-copy transfer.
   */
  export interface PolytopeResultWasm {
    /** Flat array of vertex coordinates (plain JS array from serde) */
    vertices: number[]
    /** Flat array of edge indices [v0, v1, v0, v1, ...] (plain JS array from serde) */
    edges: number[]
    /** Flat array of face indices (triangulated) [v0, v1, v2, ...] (plain JS array from serde) */
    faces: number[]
    /** Dimension of the polytope */
    dimension: number
    /** Warning messages from generation */
    warnings: string[]
  }

  /**
   * Result from root system generation.
   */
  export interface RootSystemResultWasm {
    /** Flat array of vertex coordinates */
    vertices: number[]
    /** Flat array of edge indices [v0, v1, v0, v1, ...] */
    edges: number[]
    /** Dimension of the root system */
    dimension: number
    /** Number of vertices generated */
    vertex_count: number
    /** Number of edges generated */
    edge_count: number
  }

  /**
   * Generate Wythoff polytope geometry in WASM.
   * @param config - Wythoff configuration
   * @returns Generated polytope result
   */
  export function generate_wythoff_wasm(config: WythoffConfigWasm): PolytopeResultWasm

  /**
   * Detect faces of a polytope in WASM.
   * @param flat_vertices Flat array of vertex coordinates
   * @param flat_edges Flat array of edge indices (required for 'triangles' method)
   * @param dimension Dimension of vertices
   * @param method Detection method: 'convex-hull' or 'triangles'
   * @returns Flat array of triangle indices [v0, v1, v2, v0, v1, v2, ...]
   */
  export function detect_faces_wasm(
    flat_vertices: Float64Array,
    flat_edges: Uint32Array,
    dimension: number,
    method: string
  ): Uint32Array

  /**
   * Build KNN edges connecting each point to its k nearest neighbors.
   * @param flat_points Flat array of point coordinates [p0_d0, p0_d1, ..., p1_d0, ...]
   * @param dimension Dimensionality of each point
   * @param k Number of nearest neighbors to connect
   * @returns Flat array of edge indices [e0_v0, e0_v1, e1_v0, e1_v1, ...]
   */
  export function build_knn_edges_wasm(
    flat_points: Float64Array,
    dimension: number,
    k: number
  ): Uint32Array

  /**
   * Build edges connecting vertices at minimum nonzero distance.
   * Used for root systems and mathematically structured point sets.
   * @param flat_vertices Flat array of vertex coordinates
   * @param dimension Dimensionality of each vertex
   * @param epsilon_factor Tolerance factor for distance matching (e.g., 0.01 for 1%)
   * @returns Flat array of edge indices [e0_v0, e0_v1, e1_v0, e1_v1, ...]
   */
  export function build_short_edges_wasm(
    flat_vertices: Float64Array,
    dimension: number,
    epsilon_factor: number
  ): Uint32Array

  /**
   * Generate a complete root system with vertices and edges.
   * @param root_type Type of root system: "A", "D", or "E8"
   * @param dimension Ambient dimension
   * @param scale Scale factor for the roots
   * @returns Complete root system result with vertices and edges
   */
  export function generate_root_system_wasm(
    root_type: string,
    dimension: number,
    scale: number
  ): RootSystemResultWasm

  // ============================================================================
  // Animation Operations (Hot Path - 60 FPS)
  // ============================================================================

  /**
   * Composes multiple rotations from plane names and angles.
   * This is the high-performance WASM version for animation loops.
   * @param dimension The dimensionality of the space
   * @param plane_names Array of plane names (e.g., ["XY", "XW", "ZW"])
   * @param angles Array of rotation angles in radians (same length as plane_names)
   * @returns Flat rotation matrix (dimension × dimension) as Float64Array
   */
  export function compose_rotations_wasm(
    dimension: number,
    plane_names: string[],
    angles: Float64Array | number[]
  ): Float64Array

  /**
   * Projects n-dimensional vertices to 3D positions using perspective projection.
   * Writes directly into output for Three.js buffer updates.
   * @param flat_vertices Flat array of vertex coordinates
   * @param dimension Dimensionality of each vertex
   * @param projection_distance Distance from projection plane (default: 4.0)
   * @returns Flat array of 3D positions as Float32Array [x0, y0, z0, x1, y1, z1, ...]
   */
  export function project_vertices_wasm(
    flat_vertices: Float64Array,
    dimension: number,
    projection_distance: number
  ): Float32Array

  /**
   * Projects edge pairs to 3D positions for LineSegments2 geometry.
   * Each edge is 6 floats: [x1, y1, z1, x2, y2, z2].
   * @param flat_vertices Flat array of vertex coordinates
   * @param dimension Dimensionality of each vertex
   * @param flat_edges Flat array of edge indices [start0, end0, start1, end1, ...]
   * @param projection_distance Distance from projection plane
   * @returns Flat array of edge positions
   */
  export function project_edges_wasm(
    flat_vertices: Float64Array,
    dimension: number,
    flat_edges: Uint32Array,
    projection_distance: number
  ): Float32Array

  /**
   * Multiplies a matrix by a vector.
   * @param matrix Flat n×n matrix (row-major)
   * @param vector Input vector of length n
   * @param dimension Matrix/vector dimension
   * @returns Result vector of length n
   */
  export function multiply_matrix_vector_wasm(
    matrix: Float64Array,
    vector: Float64Array,
    dimension: number
  ): Float64Array

  // ============================================================================
  // Phase 2: Matrix and Vector Operations
  // ============================================================================

  /**
   * Multiplies two square matrices: C = A × B
   * @param a First matrix (n×n, row-major)
   * @param b Second matrix (n×n, row-major)
   * @param dimension Matrix dimension
   * @returns Result matrix (n×n, row-major)
   */
  export function multiply_matrices_wasm(
    a: Float64Array,
    b: Float64Array,
    dimension: number
  ): Float64Array

  /**
   * Computes the dot product of two vectors: a · b = Σ(a[i] * b[i])
   * @param a First vector
   * @param b Second vector
   * @returns The scalar dot product
   */
  export function dot_product_wasm(a: Float64Array, b: Float64Array): number

  /**
   * Computes the magnitude (length) of a vector: ||v|| = √(Σ(v[i]²))
   * @param v Input vector
   * @returns The magnitude of the vector
   */
  export function magnitude_wasm(v: Float64Array): number

  /**
   * Normalizes a vector to unit length: v̂ = v / ||v||
   * @param v Input vector
   * @returns Unit vector in the same direction
   */
  export function normalize_vector_wasm(v: Float64Array): Float64Array

  /**
   * Subtracts two vectors element-wise: c = a - b
   * @param a First vector
   * @param b Second vector
   * @returns The difference vector
   */
  export function subtract_vectors_wasm(a: Float64Array, b: Float64Array): Float64Array
}
